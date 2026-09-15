import { Injectable, inject } from '@angular/core';

import { DatabaseService } from '../db/database.service';

/**
 * Espejo local de postcosecha.
 *
 * Existe por dos cosas que el servidor no puede cubrir:
 *
 * 1. Un registro capturado **sin señal** todavía no tiene `lot_code` —lo
 *    asigna el servidor— y aun así el supervisor tiene que poder seguir con
 *    el presecado y el fermentado (Kevin, 2026-09-05).
 * 2. Las etapas y análisis ya cargados en ESTE equipo, **con sus datos**, para
 *    poder mostrarlos al volver a una etapa antes de que llegue el ACK.
 *
 * El `lot_code` **no se guarda aquí**: llega con la lista del servidor y ese
 * es su único lugar. Guardarlo sería una segunda copia que puede quedar vieja.
 */

export interface RegistroLocal {
  guid: string;
  fechaCosecha: string;
  fechaInicio: string;
  supervisorId: number;
  supervisor: string | null;
  pesoLote: number;
  pesoMallas: number;
  cosechas: number;
  cerrada: boolean;
}

export interface EtapaLocal {
  etapa: string;
  inicio: string | null;
  fin: string | null;
  comentario: string | null;
}

/** Lo capturado en este equipo para un registro. */
export interface CargadoLocal {
  etapas: Map<string, EtapaLocal>;
  calidades: Map<string, Record<string, unknown>>;
}

@Injectable({ providedIn: 'root' })
export class PostcosechaService {
  private readonly database = inject(DatabaseService);

  async registrarProceso(p: RegistroLocal): Promise<void> {
    const db = await this.database.abrir();
    await db.run(
      `INSERT OR REPLACE INTO pc_proceso_local
         (guid, fecha_cosecha, fecha_inicio, supervisor_id, supervisor,
          peso_lote, peso_mallas, cosechas, cerrada, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      [p.guid, p.fechaCosecha, p.fechaInicio, p.supervisorId, p.supervisor,
       p.pesoLote, p.pesoMallas, p.cosechas, p.cerrada ? 1 : 0, new Date().toISOString()],
    );
    await this.database.persistir();
  }

  async registrarEtapa(
    procesoGuid: string,
    etapa: string,
    inicio: string,
    fin: string | null,
    comentario: string | null,
  ): Promise<void> {
    const db = await this.database.abrir();
    await db.run(
      `INSERT OR REPLACE INTO pc_etapa_local
         (proceso_guid, etapa, inicio, fin, comentario, created_at)
       VALUES (?, ?, ?, ?, ?, ?);`,
      [procesoGuid, etapa, inicio, fin, comentario, new Date().toISOString()],
    );
    await this.database.persistir();
  }

  async registrarCalidad(
    procesoGuid: string,
    etapa: string,
    datos: Record<string, unknown>,
  ): Promise<void> {
    const db = await this.database.abrir();
    await db.run(
      `INSERT OR REPLACE INTO pc_calidad_local (proceso_guid, etapa, datos, created_at)
       VALUES (?, ?, ?, ?);`,
      [procesoGuid, etapa, JSON.stringify(datos), new Date().toISOString()],
    );
    await this.database.persistir();
  }

  /** El peso final cierra el registro: deja de estar abierto también aquí. */
  async cerrarProceso(procesoGuid: string): Promise<void> {
    const db = await this.database.abrir();
    await db.run(`UPDATE pc_proceso_local SET cerrada = 1 WHERE guid = ?;`, [procesoGuid]);
    await this.database.persistir();
  }

  /** Registros capturados en este equipo que siguen abiertos. */
  async abiertosLocales(): Promise<RegistroLocal[]> {
    const db = await this.database.abrir();
    const r = await db.query(
      `SELECT guid, fecha_cosecha, fecha_inicio, supervisor_id, supervisor,
              peso_lote, peso_mallas, cosechas, cerrada
         FROM pc_proceso_local WHERE cerrada = 0 ORDER BY created_at;`,
    );
    return ((r.values ?? []) as Record<string, unknown>[]).map((f) => ({
      guid: String(f['guid']),
      fechaCosecha: String(f['fecha_cosecha']),
      fechaInicio: String(f['fecha_inicio']),
      supervisorId: Number(f['supervisor_id']),
      supervisor: f['supervisor'] === null ? null : String(f['supervisor']),
      pesoLote: Number(f['peso_lote']),
      pesoMallas: Number(f['peso_mallas']),
      cosechas: Number(f['cosechas']),
      cerrada: Number(f['cerrada']) === 1,
    }));
  }

  /** Etapas y análisis ya cargados en este equipo, con sus datos. */
  async cargadoLocal(procesoGuid: string): Promise<CargadoLocal> {
    const db = await this.database.abrir();
    const e = await db.query(
      `SELECT etapa, inicio, fin, comentario FROM pc_etapa_local WHERE proceso_guid = ?;`,
      [procesoGuid],
    );
    const c = await db.query(
      `SELECT etapa, datos FROM pc_calidad_local WHERE proceso_guid = ?;`,
      [procesoGuid],
    );

    const etapas = new Map<string, EtapaLocal>();
    for (const f of (e.values ?? []) as Record<string, unknown>[]) {
      etapas.set(String(f['etapa']), {
        etapa: String(f['etapa']),
        inicio: f['inicio'] == null ? null : String(f['inicio']),
        fin: f['fin'] == null ? null : String(f['fin']),
        comentario: f['comentario'] == null ? null : String(f['comentario']),
      });
    }

    const calidades = new Map<string, Record<string, unknown>>();
    for (const f of (c.values ?? []) as Record<string, unknown>[]) {
      let datos: Record<string, unknown> = {};
      try {
        datos = f['datos'] ? (JSON.parse(String(f['datos'])) as Record<string, unknown>) : {};
      } catch {
        // Un JSON ilegible no puede tumbar la pantalla: se muestra sin datos.
        datos = {};
      }
      calidades.set(String(f['etapa']), datos);
    }
    return { etapas, calidades };
  }
}
