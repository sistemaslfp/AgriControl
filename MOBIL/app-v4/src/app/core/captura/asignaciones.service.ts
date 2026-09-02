import { Injectable, inject } from '@angular/core';

import { CatalogQueryService } from '../catalog/catalog-query.service';
import { DatabaseService } from '../db/database.service';

/**
 * "¿Esta persona ya tiene una tarea AM abierta?"
 *
 * Regla de negocio (Kevin, 2026-08-31): una persona no puede estar en dos
 * tareas AM a la vez; la anterior tiene que cerrarse con un PM antes de
 * reasignarla.
 *
 * ALCANCE REAL, sin adornos — esto es lo que el teléfono puede sostener hoy:
 *
 * 1. Dentro de un mismo formulario AM: **bloqueo duro**. La misma persona en
 *    dos tareas del mismo AM es siempre un error de captura, y se resuelve
 *    sin consultar nada.
 * 2. Entre formularios, en ESTE equipo: **aviso que exige confirmar**. Se
 *    muestra el AM anterior (hora, lote, subtarea) y el responsable decide.
 * 3. Entre equipos: **no se cubre**. Un AM cargado en otra tablet es
 *    invisible acá, y offline no hay a quién preguntarle.
 *
 * Por qué aviso y no bloqueo en el caso 2, con datos y no con opinión: en la
 * ventana de agosto (590 AM reales) hubo **9 reasignaciones legítimas** de la
 * misma persona el mismo día sin un PM que cerrara la anterior. Un bloqueo
 * duro las habría impedido en el campo. Los otros 61 casos de repetición son
 * reintentos exactos de la app vieja (misma hora, mismo lote, misma
 * subtarea), o sea el pendiente #Limpieza, no reasignaciones.
 *
 * La validación de verdad exige `reg_pm.am_id` (o equivalente) y un endpoint
 * de AM abiertos. Es un paso propio, posterior a estas pantallas.
 *
 * Definición de "cerrado" que se usa acá, la misma que mejor calzó contra los
 * datos reales (533 de 590 AM de agosto): existe un PM del mismo
 * (persona, fecha, lote, subtarea).
 */

/** Una asignación AM abierta, venga del servidor o del espejo local. */
export interface AsignacionAmLocal {
  amGuid: string;
  /** null cuando sale del espejo local: ese id lo asigna el servidor. */
  amPersonalId: number | null;
  personalId: number;
  trabajador: string;
  fechaProceso: string;
  loteId: number;
  lote: string;
  subtareaId: number;
  subtarea: string;
  /** "3, 4" o '' si el lote no trabaja por módulos. */
  modulos: string;
  unidadLabor: string | null;
  origen: 'servidor' | 'local';
}

export interface AmAbierto {
  guid: string;
  personalId: number;
  fecha: string;
  loteId: number;
  subtareaId: number;
  createdAt: string;
  /** Resuelto para el mensaje: "Lote 4 · DESHIERBA a las 06:34". */
  descripcion: string;
}

@Injectable({ providedIn: 'root' })
export class AsignacionesService {
  /** Se conservan dos meses: lo justo para el aviso, no un histórico. */
  private static readonly RETENCION_DIAS = 60;

  private readonly database = inject(DatabaseService);
  private readonly catalogo = inject(CatalogQueryService);

  /** Se llama al encolar cada tarea AM, con el guid ya asignado. */
  /**
   * Un registro = una persona. El guid identifica a esa persona en esa tarea,
   * y es el mismo `am_guid` con el que el cierre la va a encontrar.
   */
  async registrarAm(
    guid: string,
    fecha: string,
    loteId: number,
    subtareaId: number,
    personalId: number,
    moduloIds: number[] = [],
  ): Promise<void> {
    const db = await this.database.abrir();
    await db.run(
      `INSERT OR REPLACE INTO am_persona_local
         (guid, personal_id, fecha, lote_id, subtarea_id, created_at, modulos)
       VALUES (?, ?, ?, ?, ?, ?, ?);`,
      [guid, personalId, fecha, loteId, subtareaId, new Date().toISOString(), moduloIds.join(',')],
    );
    await this.database.persistir();
  }

  /** Se llama al encolar cada tarea PM: es lo que cierra una asignación. */
  async registrarPm(
    guid: string,
    trabajadorId: number,
    fecha: string,
    loteId: number,
    subtareaId: number,
  ): Promise<void> {
    const db = await this.database.abrir();
    await db.run(
      `INSERT OR REPLACE INTO pm_cierre_local
         (guid, trabajador_id, fecha, lote_id, subtarea_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?);`,
      [guid, trabajadorId, fecha, loteId, subtareaId, new Date().toISOString()],
    );
    await this.database.persistir();
  }

  /**
   * AM de esa persona, ese día, sin PM que los cierre. Se limita al MISMO
   * día a propósito: en agosto 49 de 590 AM nunca recibieron un PM, así que
   * arrastrar días anteriores convertiría el aviso en ruido permanente.
   */
  async amAbiertosDe(personalId: number, fecha: string): Promise<AmAbierto[]> {
    const db = await this.database.abrir();
    const r = await db.query(
      `SELECT a.guid, a.personal_id, a.fecha, a.lote_id, a.subtarea_id, a.created_at
         FROM am_persona_local a
        WHERE a.personal_id = ? AND a.fecha = ?
          AND NOT EXISTS (
            SELECT 1 FROM pm_cierre_local p
             WHERE p.trabajador_id = a.personal_id
               AND p.fecha         = a.fecha
               AND p.lote_id       = a.lote_id
               AND p.subtarea_id   = a.subtarea_id
          )
        ORDER BY a.created_at;`,
      [personalId, fecha],
    );

    const filas = (r.values ?? []) as Record<string, unknown>[];
    const salida: AmAbierto[] = [];
    for (const f of filas) {
      const loteId = Number(f['lote_id']);
      const subtareaId = Number(f['subtarea_id']);
      const sub = await this.catalogo.subtarea(subtareaId);
      const hora = String(f['created_at']).slice(11, 16);
      salida.push({
        guid: String(f['guid']),
        personalId: Number(f['personal_id']),
        fecha: String(f['fecha']),
        loteId,
        subtareaId,
        createdAt: String(f['created_at']),
        descripcion: `Lote ${loteId} · ${sub?.nombre ?? 'subtarea ' + subtareaId} (cargado ${hora})`,
      });
    }
    return salida;
  }

  /** Igual que amAbiertosDe, pero para varias personas de una sola pasada. */
  async personasConAmAbierto(
    personalIds: number[],
    fecha: string,
  ): Promise<Map<number, AmAbierto[]>> {
    const mapa = new Map<number, AmAbierto[]>();
    for (const id of new Set(personalIds)) {
      const abiertos = await this.amAbiertosDe(id, fecha);
      if (abiertos.length > 0) {
        mapa.set(id, abiertos);
      }
    }
    return mapa;
  }

  /**
   * Asignaciones AM abiertas de esa fecha **según este teléfono**.
   *
   * Es el complemento offline de `GET /v4/am_abiertos`: el servidor solo
   * conoce los AM que ya recibió, así que un AM capturado hace cinco minutos
   * y todavía PENDIENTE en la cola **no aparece en su lista**. Sin esto, el
   * supervisor no podría cerrar por la tarde una tarea que él mismo cargó por
   * la mañana sin señal.
   *
   * `am_personal_id` viene en null: ese id lo asigna el servidor. El PM no lo
   * necesita — viaja con `am_guid` + `trabajador_id`, que el servidor
   * resuelve.
   */
  async abiertasLocales(fecha: string): Promise<AsignacionAmLocal[]> {
    const db = await this.database.abrir();
    const r = await db.query(
      `SELECT a.guid, a.personal_id, a.fecha, a.lote_id, a.subtarea_id, a.modulos
         FROM am_persona_local a
        WHERE a.fecha = ?
          AND NOT EXISTS (
            SELECT 1 FROM pm_cierre_local p
             WHERE p.trabajador_id = a.personal_id
               AND p.fecha         = a.fecha
               AND p.lote_id       = a.lote_id
               AND p.subtarea_id   = a.subtarea_id
          )
        ORDER BY a.created_at;`,
      [fecha],
    );
    const filas = (r.values ?? []) as Record<string, unknown>[];
    const personalIds = filas.map((f) => Number(f['personal_id']));
    const nombres = await this.catalogo.nombresPersonal(personalIds);

    const salida: AsignacionAmLocal[] = [];
    for (const f of filas) {
      const loteId = Number(f['lote_id']);
      const subtareaId = Number(f['subtarea_id']);
      const sub = await this.catalogo.subtarea(subtareaId);
      const lote = await this.catalogo.lote(loteId);
      const ids = String(f['modulos'] ?? '')
        .split(',')
        .map((x) => Number(x))
        .filter((x) => x > 0);
      const nombresMod = await this.catalogo.nombresModulo(ids);
      salida.push({
        amGuid: String(f['guid']),
        amPersonalId: null,
        personalId: Number(f['personal_id']),
        trabajador: nombres.get(Number(f['personal_id'])) ?? `#${f['personal_id']}`,
        fechaProceso: String(f['fecha']),
        loteId,
        lote: lote?.nombre ?? `Lote ${loteId}`,
        subtareaId,
        subtarea: sub?.nombre ?? `Subtarea ${subtareaId}`,
        modulos: ids.map((x) => nombresMod.get(x) ?? String(x)).join(', '),
        unidadLabor: sub?.unidadLaborNombre ?? null,
        origen: 'local',
      });
    }
    return salida;
  }

  /** Higiene: el espejo local no es un histórico, se poda. */
  async purgarViejos(): Promise<void> {
    const limite = new Date(
      Date.now() - AsignacionesService.RETENCION_DIAS * 86400_000,
    ).toISOString();
    const db = await this.database.abrir();
    await db.run(`DELETE FROM am_persona_local WHERE created_at < ?;`, [limite]);
    await db.run(`DELETE FROM pm_cierre_local  WHERE created_at < ?;`, [limite]);
    await this.database.persistir();
  }
}
