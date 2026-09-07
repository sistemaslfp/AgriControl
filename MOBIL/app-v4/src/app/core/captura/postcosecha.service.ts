import { Injectable, inject } from '@angular/core';

import { DatabaseService } from '../db/database.service';

/**
 * Espejo local de postcosecha.
 *
 * Existe por dos cosas que el servidor no puede cubrir:
 *
 * 1. Una partida capturada **sin señal** todavía no tiene `lot_code` —lo
 *    asigna el servidor— y aun así el supervisor tiene que poder seguir con
 *    el presecado y el fermentado (Kevin, 2026-09-05). Hasta el ACK la
 *    pantalla la muestra desde acá, con el número "pendiente".
 * 2. Las etapas y análisis ya cargados en ESTE equipo, para no ofrecer dos
 *    veces la misma antes de que el servidor conteste.
 *
 * El `lot_code` **no se guarda acá**: llega con la lista del servidor y ese
 * es el único lugar donde vive. Guardarlo sería una segunda copia que puede
 * quedar vieja.
 */

export interface PartidaLocal {
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

@Injectable({ providedIn: 'root' })
export class PostcosechaService {
  private readonly database = inject(DatabaseService);

  async registrarPartida(p: PartidaLocal): Promise<void> {
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

  async registrarEtapa(procesoGuid: string, etapa: string): Promise<void> {
    const db = await this.database.abrir();
    await db.run(
      `INSERT OR REPLACE INTO pc_etapa_local (proceso_guid, etapa, created_at)
       VALUES (?, ?, ?);`,
      [procesoGuid, etapa, new Date().toISOString()],
    );
    await this.database.persistir();
  }

  async registrarCalidad(procesoGuid: string, etapa: string): Promise<void> {
    const db = await this.database.abrir();
    await db.run(
      `INSERT OR REPLACE INTO pc_calidad_local (proceso_guid, etapa, created_at)
       VALUES (?, ?, ?);`,
      [procesoGuid, etapa, new Date().toISOString()],
    );
    await this.database.persistir();
  }

  /** El peso final cierra la partida: deja de estar abierta también acá. */
  async cerrarPartida(procesoGuid: string): Promise<void> {
    const db = await this.database.abrir();
    await db.run(`UPDATE pc_proceso_local SET cerrada = 1 WHERE guid = ?;`, [procesoGuid]);
    await this.database.persistir();
  }

  /** Partidas capturadas en este equipo que siguen abiertas. */
  async abiertasLocales(): Promise<PartidaLocal[]> {
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

  /** Etapas y análisis ya cargados en este equipo, por partida. */
  async cargadoLocal(procesoGuid: string): Promise<{ etapas: Set<string>; calidades: Set<string> }> {
    const db = await this.database.abrir();
    const e = await db.query(`SELECT etapa FROM pc_etapa_local WHERE proceso_guid = ?;`, [procesoGuid]);
    const c = await db.query(`SELECT etapa FROM pc_calidad_local WHERE proceso_guid = ?;`, [procesoGuid]);
    const set = (r: { values?: unknown[] }): Set<string> =>
      new Set(((r.values ?? []) as Record<string, unknown>[]).map((f) => String(f['etapa'])));
    return { etapas: set(e), calidades: set(c) };
  }
}
