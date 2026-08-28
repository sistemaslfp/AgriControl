import { Injectable, inject, signal } from '@angular/core';

import { ApiService, CatalogosResponse } from '../api/api.service';
import { AppConfigService, KV } from '../config/app-config.service';
import { DatabaseService } from '../db/database.service';

/**
 * "Actualizar Maestros": descarga COMPLETA de catálogos, nunca incremental
 * (MOBIL/01-sincronizacion.md §Catálogos). Las tablas son chicas y ninguna
 * tiene updated_at.
 *
 * La escritura es transaccional: BEGIN -> DELETE + INSERT de las ocho tablas
 * -> COMMIT. Un corte de red a mitad de descarga no llega a tocar la base
 * (el fetch ocurre antes de abrir la transacción), y un fallo a mitad de
 * escritura hace ROLLBACK: la app nunca queda con catálogos a medias.
 *
 * Sin catálogos descargados los módulos de captura quedan bloqueados
 * (el menú consulta `disponibles`).
 */
@Injectable({ providedIn: 'root' })
export class CatalogService {
  private readonly database = inject(DatabaseService);
  private readonly api = inject(ApiService);
  private readonly config = inject(AppConfigService);

  /** true cuando hay al menos una finca local (proxy de "hay catálogos"). */
  readonly disponibles = signal(false);
  readonly actualizando = signal(false);

  async verificarDisponibles(): Promise<boolean> {
    const db = await this.database.abrir();
    const r = await db.query('SELECT COUNT(*) AS n FROM cat_finca;');
    const hay = ((r.values?.[0]?.['n'] as number) ?? 0) > 0;
    this.disponibles.set(hay);
    return hay;
  }

  /**
   * Descarga y reemplaza todos los catálogos. Lanza si no hay red o el
   * servidor falla; en ese caso los catálogos anteriores quedan intactos.
   */
  async actualizar(): Promise<{ version: string; totales: Record<string, number> }> {
    this.actualizando.set(true);
    try {
      // 1. Descarga completa ANTES de tocar la base.
      const data: CatalogosResponse = await this.api.catalogos();
      this.validar(data);

      // 2. Reemplazo transaccional.
      const db = await this.database.abrir();
      await db.execute('BEGIN;', false);
      try {
        await db.execute(
          `DELETE FROM cat_finca; DELETE FROM cat_lote; DELETE FROM cat_modulo;
           DELETE FROM cat_cultivo; DELETE FROM cat_tarea; DELETE FROM cat_subtarea;
           DELETE FROM cat_ulabor; DELETE FROM cat_personal;`,
          false,
        );

        for (const f of data.fincas) {
          await db.run('INSERT INTO cat_finca (id, nombre, ha) VALUES (?, ?, ?);',
            [f.id, f.nombre, f.ha], false);
        }
        for (const l of data.lotes) {
          await db.run(
            'INSERT INTO cat_lote (id, lote, finca_id, ha, tiene_modulos) VALUES (?, ?, ?, ?, ?);',
            [l.id, l.lote, l.finca_id, l.ha, l.tiene_modulos ? 1 : 0], false);
        }
        for (const m of data.modulos) {
          await db.run('INSERT INTO cat_modulo (id, modulo, lote_id, ha) VALUES (?, ?, ?, ?);',
            [m.id, m.modulo, m.lote_id, m.ha], false);
        }
        for (const c of data.cultivos) {
          await db.run('INSERT INTO cat_cultivo (id, nombre) VALUES (?, ?);',
            [c.id, c.nombre], false);
        }
        for (const t of data.tareas) {
          await db.run('INSERT INTO cat_tarea (id, nombre, cultivos_id) VALUES (?, ?, ?);',
            [t.id, t.nombre, t.cultivos_id], false);
        }
        for (const s of data.subtareas) {
          await db.run(
            'INSERT INTO cat_subtarea (id, codigo, nombre, tarea_id, unidad_labor_id, tipo_pago_id) VALUES (?, ?, ?, ?, ?, ?);',
            [s.id, s.codigo, s.nombre, s.tarea_id, s.unidad_labor_id, s.tipo_pago_id], false);
        }
        for (const u of data.ulabores) {
          await db.run('INSERT INTO cat_ulabor (id, nombre) VALUES (?, ?);',
            [u.id, u.nombre], false);
        }
        for (const p of data.personal) {
          await db.run(
            'INSERT INTO cat_personal (id, nombre, id_finca, rol, rol_app) VALUES (?, ?, ?, ?, ?);',
            [p.id, p.nombre, p.id_finca, p.rol, p.rol_app], false);
        }

        await db.execute('COMMIT;', false);
      } catch (e) {
        await db.execute('ROLLBACK;', false);
        throw e;
      }

      const ahora = new Date().toISOString();
      await this.config.set(KV.CATALOGOS_VERSION, data.version);
      await this.config.set(KV.CATALOGOS_UPDATED_AT, ahora);
      await this.database.persistir();
      await this.verificarDisponibles();

      return {
        version: data.version,
        totales: {
          fincas: data.fincas.length,
          lotes: data.lotes.length,
          modulos: data.modulos.length,
          cultivos: data.cultivos.length,
          tareas: data.tareas.length,
          subtareas: data.subtareas.length,
          ulabores: data.ulabores.length,
          personal: data.personal.length,
        },
      };
    } finally {
      this.actualizando.set(false);
    }
  }

  /** Un catálogo vacío o mal formado no debe reemplazar uno bueno. */
  private validar(data: CatalogosResponse): void {
    const listas = ['fincas', 'lotes', 'cultivos', 'tareas', 'subtareas', 'ulabores', 'personal'] as const;
    for (const k of listas) {
      if (!Array.isArray(data[k])) {
        throw new Error(`Respuesta de catálogos inválida: falta la lista "${k}".`);
      }
    }
    if (data.fincas.length === 0 || data.personal.length === 0) {
      throw new Error('El servidor devolvió catálogos vacíos; no se reemplaza lo local.');
    }
  }
}
