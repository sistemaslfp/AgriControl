import { Injectable, inject } from '@angular/core';

import { DatabaseService } from '../db/database.service';

/**
 * Libra en `z_ulabor`. Es la unidad que manda una subtarea a la pantalla de
 * Cosecha; el servidor usa el mismo criterio en `cosecha_unidad_ids`.
 */
const UNIDAD_LIBRA = 4;

/**
 * Lecturas de los catálogos locales para los selectores de captura.
 * `CatalogService` los DESCARGA; este servicio solo los CONSULTA.
 *
 * Vocabulario fijado el 2026-08-31 (pendiente #6 de 00-plan.md):
 * **Finca** y **Responsable** en toda la app, que es como se llaman las
 * columnas en la base (`z_finca`, `responsable_id`). "Hacienda" y
 * "Supervisor" no se usan más.
 */

export interface OpcionCatalogo {
  id: number;
  nombre: string;
  /** Texto secundario que se muestra bajo el nombre en el selector. */
  detalle?: string;
}

export interface Subtarea extends OpcionCatalogo {
  tareaId: number;
  tareaNombre: string;
  unidadLaborId: number | null;
  unidadLaborNombre: string | null;
}

/**
 * Rol del responsable de campo en `z_personal.rol`.
 *
 * Verificado contra los datos (2026-08-31): hay **6 personas activas con
 * rol = 8**, y son **exactamente las 6** que figuran como `responsable_id` en
 * los 590 AM de agosto. Coincidencia total, sin una sola excepción — por eso
 * el filtro es este y no una heurística sobre el nombre o sobre `rol_app`.
 */
export const ROL_RESPONSABLE_CAMPO = 8;

/**
 * Nombre de un lote para mostrar.
 *
 * Los lotes productivos se llaman con un numero ("0", "1", …, "4") y las areas
 * de servicio con un nombre ("Administrativos", "AREA EMPACADORA", "Area
 * social"). Anteponerle "Lote" a un numero ayuda; anteponerselo a un nombre
 * produce "Lote Administrativos", que no lo dice nadie.
 */
export function nombreLote(lote: string): string {
  const v = String(lote ?? '').trim();
  return /^\d+$/.test(v) ? `Lote ${v}` : v;
}

/**
 * Orden de los lotes: primero los numericos por valor (0, 1, 2, …) y despues
 * los que tienen nombre, alfabeticamente.
 *
 * Se ordena en TypeScript y no en SQL a proposito: en SQLite
 * `CAST('Administrativos' AS INTEGER)` da 0 y el area administrativa termina
 * mezclada con el lote "0", que existe de verdad.
 */
export function ordenarLotes<T extends { raw: string }>(lotes: T[]): T[] {
  const esNumero = (v: string) => /^\d+$/.test(v.trim());
  return [...lotes].sort((a, b) => {
    const na = esNumero(a.raw);
    const nb = esNumero(b.raw);
    if (na !== nb) {
      return na ? -1 : 1;
    }
    return na
      ? Number(a.raw) - Number(b.raw)
      : a.raw.localeCompare(b.raw, 'es', { sensitivity: 'base' });
  });
}

@Injectable({ providedIn: 'root' })
export class CatalogQueryService {
  private readonly database = inject(DatabaseService);

  async fincas(): Promise<OpcionCatalogo[]> {
    return this.filas(
      `SELECT id, nombre, ha FROM cat_finca ORDER BY nombre;`,
      [],
      (f) => ({
        id: Number(f['id']),
        nombre: String(f['nombre']),
        detalle: f['ha'] != null ? `${f['ha']} ha` : undefined,
      }),
    );
  }

  async lotesDeFinca(
    fincaId: number,
  ): Promise<(OpcionCatalogo & { tieneModulos: boolean; raw: string })[]> {
    const filas = await this.filas(
      `SELECT id, lote, ha, tiene_modulos FROM cat_lote WHERE finca_id = ?;`,
      [fincaId],
      (f) => ({
        id: Number(f['id']),
        raw: String(f['lote']),
        nombre: nombreLote(String(f['lote'])),
        detalle: f['ha'] != null ? `${f['ha']} ha` : undefined,
        // tiene_modulos se guarda como 0/1. OJO con el "0" string: en JS es
        // truthy, así que se compara contra 1 y no se usa como booleano.
        tieneModulos: Number(f['tiene_modulos']) === 1,
      }),
    );
    return ordenarLotes(filas);
  }

  async lote(id: number): Promise<OpcionCatalogo | null> {
    const r = await this.filas(
      `SELECT id, lote FROM cat_lote WHERE id = ? LIMIT 1;`,
      [id],
      (f) => ({ id: Number(f['id']), nombre: nombreLote(String(f['lote'])) }),
    );
    return r[0] ?? null;
  }

  /** Nombres de módulos por id, para pintar "Lote 2 · Mód. 3, 4". */
  async nombresModulo(ids: number[]): Promise<Map<number, string>> {
    const mapa = new Map<number, string>();
    if (ids.length === 0) {
      return mapa;
    }
    const marcas = ids.map(() => '?').join(',');
    const filas = await this.filas(
      `SELECT id, modulo FROM cat_modulo WHERE id IN (${marcas});`,
      ids,
      (f) => ({ id: Number(f['id']), nombre: String(f['modulo']) }),
    );
    for (const f of filas) {
      mapa.set(f.id, f.nombre);
    }
    return mapa;
  }

  async modulosDeLote(loteId: number): Promise<OpcionCatalogo[]> {
    return this.filas(
      `SELECT id, modulo, ha FROM cat_modulo WHERE lote_id = ?
        ORDER BY CAST(modulo AS INTEGER), modulo;`,
      [loteId],
      (f) => ({
        id: Number(f['id']),
        nombre: `Módulo ${f['modulo']}`,
        detalle: f['ha'] != null ? `${f['ha']} ha` : undefined,
      }),
    );
  }

  async cultivos(): Promise<OpcionCatalogo[]> {
    return this.filas(`SELECT id, nombre FROM cat_cultivo ORDER BY nombre;`, [], (f) => ({
      id: Number(f['id']),
      nombre: String(f['nombre']),
    }));
  }

  /**
   * Tareas del cultivo que tienen al menos una subtarea de esa finca.
   *
   * `z_tarea` no tiene finca; `z_subtarea` sí (`id_finca`), y cada finca
   * maneja su propio juego: 78 subtareas en Bellita y 21 en Pacaritambo.
   * Sin este filtro el usuario puede elegir una tarea y encontrarse con la
   * lista de subtareas vacía, que es de las cosas más frustrantes que puede
   * hacer un formulario.
   */
  async tareasDeCultivo(cultivoId: number, fincaId: number | null): Promise<OpcionCatalogo[]> {
    if (fincaId === null) {
      return this.filas(
        `SELECT id, nombre FROM cat_tarea WHERE cultivos_id = ? ORDER BY nombre;`,
        [cultivoId],
        (f) => ({ id: Number(f['id']), nombre: String(f['nombre']) }),
      );
    }
    return this.filas(
      `SELECT t.id, t.nombre
         FROM cat_tarea t
        WHERE t.cultivos_id = ?
          AND EXISTS (SELECT 1 FROM cat_subtarea s
                       WHERE s.tarea_id = t.id AND s.id_finca = ?)
        ORDER BY t.nombre;`,
      [cultivoId, fincaId],
      (f) => ({ id: Number(f['id']), nombre: String(f['nombre']) }),
    );
  }

  /**
   * Subtareas de UNA tarea, con su unidad de labor resuelta.
   *
   * La cascada es Cultivo -> Tarea -> Subtarea (decidido el 2026-08-31): sin
   * el corte por tarea, un cultivo con muchas tareas vuelca decenas de
   * subtareas sueltas en una sola lista.
   *
   * **Se filtran por finca** (`z_subtarea.id_finca`): cada finca tiene su
   * propio juego — 78 en Bellita y 21 en Pacaritambo.
   *
   * El payload de /v4/sync pide `subtarea_id` y `cultivo_id`, nunca
   * `tarea_id`: la tarea existe solo para acotar la elección en pantalla. La
   * unidad de labor viaja acá porque el PM la muestra junto al avance, en vez
   * del selector muerto y gris de la app vieja (03-pantallas.md §PM).
   *
   * **El `codigo` no se muestra**: es control interno (Kevin, 2026-08-31).
   */
  async subtareasDeTarea(tareaId: number, fincaId: number | null): Promise<Subtarea[]> {
    const filtroFinca = fincaId === null ? '' : ' AND s.id_finca = ?';
    const params = fincaId === null ? [tareaId] : [tareaId, fincaId];
    return this.filas(
      `SELECT s.id, s.nombre, s.tarea_id, s.unidad_labor_id,
              t.nombre AS tarea_nombre, u.nombre AS ulabor_nombre
         FROM cat_subtarea s
         JOIN cat_tarea t ON t.id = s.tarea_id
         LEFT JOIN cat_ulabor u ON u.id = s.unidad_labor_id
        WHERE s.tarea_id = ?${filtroFinca}
        ORDER BY s.nombre;`,
      params,
      (f) => this.aSubtarea(f),
    );
  }

  /**
   * Subtareas del modulo Cosecha. `ids` sale de `/v4/bootstrap`
   * (`cosecha_subtarea_ids`, que el servidor deriva por unidad si la
   * configuracion esta vacia).
   *
   * Si la lista llega vacia --servidor viejo, o bootstrap nunca traido-- se
   * cae al mismo criterio contra el catalogo local. Es la misma decision que
   * en `responsables()`.
   */
  async subtareasDeCosecha(ids: number[], fincaId: number | null): Promise<Subtarea[]> {
    const base = `SELECT s.id, s.nombre, s.tarea_id, s.unidad_labor_id,
                         t.nombre AS tarea_nombre, u.nombre AS ulabor_nombre
                    FROM cat_subtarea s
                    JOIN cat_tarea t ON t.id = s.tarea_id
                    LEFT JOIN cat_ulabor u ON u.id = s.unidad_labor_id`;
    const filtroFinca = fincaId === null ? '' : ' AND s.id_finca = ?';

    if (ids.length > 0) {
      const marcas = ids.map(() => '?').join(',');
      const params = fincaId === null ? [...ids] : [...ids, fincaId];
      return this.filas(
        `${base} WHERE s.id IN (${marcas})${filtroFinca} ORDER BY s.nombre;`,
        params,
        (f) => this.aSubtarea(f),
      );
    }
    return this.filas(
      `${base} WHERE s.unidad_labor_id = ?${filtroFinca} ORDER BY s.nombre;`,
      fincaId === null ? [UNIDAD_LIBRA] : [UNIDAD_LIBRA, fincaId],
      (f) => this.aSubtarea(f),
    );
  }

  /**
   * Ids de subtarea que se pagan por peso: las que cierra la pantalla de
   * Cosecha. El PM cierra el complemento, y **las dos pantallas leen esta
   * misma lista** para que ninguna subtarea quede sin quien la cierre.
   *
   * El servidor ya filtra `GET /v4/am_abiertos`, pero el espejo local de este
   * equipo no pasa por ahi: sin este filtro, un AM de cosecha capturado aca y
   * todavia sin enviar seguiria apareciendo en la lista del PM.
   */
  async subtareasQueSePesan(): Promise<Set<number>> {
    const filas = await this.filas(
      `SELECT s.id FROM cat_subtarea s WHERE s.unidad_labor_id = ?;`,
      [UNIDAD_LIBRA],
      (f) => Number(f['id']),
    );
    return new Set(filas);
  }

  async subtarea(id: number): Promise<Subtarea | null> {
    const r = await this.filas(
      `SELECT s.id, s.nombre, s.tarea_id, s.unidad_labor_id,
              t.nombre AS tarea_nombre, u.nombre AS ulabor_nombre
         FROM cat_subtarea s
         JOIN cat_tarea t ON t.id = s.tarea_id
         LEFT JOIN cat_ulabor u ON u.id = s.unidad_labor_id
        WHERE s.id = ? LIMIT 1;`,
      [id],
      (f) => this.aSubtarea(f),
    );
    return r[0] ?? null;
  }

  private aSubtarea(f: Record<string, unknown>): Subtarea {
    return {
      id: Number(f['id']),
      nombre: String(f['nombre']),
      // Sin `detalle`: el codigo es interno y la tarea ya la eligio el usuario
      // en el paso anterior, asi que repetirla es ruido.
      tareaId: Number(f['tarea_id']),
      tareaNombre: String(f['tarea_nombre'] ?? ''),
      unidadLaborId: f['unidad_labor_id'] != null ? Number(f['unidad_labor_id']) : null,
      unidadLaborNombre: f['ulabor_nombre'] != null ? String(f['ulabor_nombre']) : null,
    };
  }

  /**
   * Personal para los selectores. Son ~1.100 personas: el filtro por finca y
   * el buscador no son un lujo, son la diferencia entre usable e inusable
   * (03-pantallas.md §AM). `fincaId = null` trae todas.
   *
   * No se filtra por `rol`: el catálogo ya llega filtrado por el servidor
   * (`eregistro = 'A'`) y el rol de la app vieja no distingue de forma
   * confiable responsable de operario.
   */
  async personal(fincaId: number | null): Promise<OpcionCatalogo[]> {
    const sql =
      fincaId === null
        ? `SELECT id, nombre, id_finca FROM cat_personal ORDER BY nombre;`
        : `SELECT id, nombre, id_finca FROM cat_personal WHERE id_finca = ? ORDER BY nombre;`;
    return this.filas(sql, fincaId === null ? [] : [fincaId], (f) => ({
      id: Number(f['id']),
      nombre: String(f['nombre']),
    }));
  }

  /**
   * Responsables de campo: `rol = 8`, de la finca indicada.
   *
   * Son seis en toda la operación, así que la lista sale sin buscador. Si el
   * catálogo local no trajera ninguno con ese rol se devuelve todo el personal
   * de la finca: es preferible una lista larga a una pantalla que no deja
   * avanzar.
   */
  async responsables(fincaId: number | null): Promise<OpcionCatalogo[]> {
    const sql =
      fincaId === null
        ? `SELECT id, nombre FROM cat_personal WHERE rol = ? ORDER BY nombre;`
        : `SELECT id, nombre FROM cat_personal WHERE rol = ? AND id_finca = ? ORDER BY nombre;`;
    const params = fincaId === null ? [ROL_RESPONSABLE_CAMPO] : [ROL_RESPONSABLE_CAMPO, fincaId];
    const r = await this.filas(sql, params, (f) => ({
      id: Number(f['id']),
      nombre: String(f['nombre']),
    }));
    return r.length > 0 ? r : this.personal(fincaId);
  }

  /** Nombres por id, para pintar resúmenes sin N consultas. */
  async nombresPersonal(ids: number[]): Promise<Map<number, string>> {
    const mapa = new Map<number, string>();
    if (ids.length === 0) {
      return mapa;
    }
    const marcas = ids.map(() => '?').join(',');
    const filas = await this.filas(
      `SELECT id, nombre FROM cat_personal WHERE id IN (${marcas});`,
      ids,
      (f) => ({ id: Number(f['id']), nombre: String(f['nombre']) }),
    );
    for (const f of filas) {
      mapa.set(f.id, f.nombre);
    }
    return mapa;
  }

  private async filas<T>(
    sql: string,
    params: unknown[],
    mapear: (f: Record<string, unknown>) => T,
  ): Promise<T[]> {
    const db = await this.database.abrir();
    const r = await db.query(sql, params as never[]);
    return (r.values ?? []).map((f) => mapear(f as Record<string, unknown>));
  }
}
