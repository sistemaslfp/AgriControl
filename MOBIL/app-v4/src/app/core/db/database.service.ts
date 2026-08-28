import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import {
  CapacitorSQLite,
  SQLiteConnection,
  SQLiteDBConnection,
} from '@capacitor-community/sqlite';

/**
 * Única puerta de acceso a SQLite. El resto de la app no toca el plugin.
 *
 * Esquema local v1 (paso 1 del plan): cola de sincronización, auditoría,
 * catálogos y clave-valor de configuración. Las tablas de captura (AM, PM,
 * cosecha, postcosecha) llegan en pasos posteriores como nuevas versiones
 * de este esquema (upgrade statements incrementales).
 */
@Injectable({ providedIn: 'root' })
export class DatabaseService {
  private static readonly DB_NAME = 'lagricontrol_v4';
  private static readonly DB_VERSION = 1;

  private readonly sqlite = new SQLiteConnection(CapacitorSQLite);
  private db: SQLiteDBConnection | null = null;
  private abriendo: Promise<SQLiteDBConnection> | null = null;

  /** Esquema v1. Todo IF NOT EXISTS: correrlo dos veces es inocuo. */
  private static readonly SCHEMA_V1: string[] = [
    `CREATE TABLE IF NOT EXISTS app_kv (
       clave TEXT PRIMARY KEY,
       valor TEXT NOT NULL
     );`,
    `CREATE TABLE IF NOT EXISTS sync_queue (
       guid              TEXT PRIMARY KEY,
       tipo              TEXT NOT NULL,
       payload           TEXT NOT NULL,
       estado            TEXT NOT NULL DEFAULT 'PENDIENTE'
                         CHECK (estado IN ('PENDIENTE','ENVIANDO','ENVIADO','RECHAZADO')),
       created_at_device TEXT NOT NULL,
       intentos          INTEGER NOT NULL DEFAULT 0,
       ultimo_error      TEXT,
       server_id         INTEGER,
       motivo_rechazo    TEXT,
       flags             TEXT,
       acked_at          TEXT
     );`,
    `CREATE INDEX IF NOT EXISTS idx_queue_estado_fecha
       ON sync_queue (estado, created_at_device);`,
    `CREATE TABLE IF NOT EXISTS sync_audit (
       id         INTEGER PRIMARY KEY AUTOINCREMENT,
       evento     TEXT NOT NULL,
       guid       TEXT,
       detalle    TEXT,
       created_at TEXT NOT NULL
     );`,
    `CREATE TABLE IF NOT EXISTS cat_finca (
       id INTEGER PRIMARY KEY, nombre TEXT NOT NULL, ha REAL
     );`,
    `CREATE TABLE IF NOT EXISTS cat_lote (
       id INTEGER PRIMARY KEY, lote TEXT NOT NULL, finca_id INTEGER NOT NULL,
       ha REAL, tiene_modulos INTEGER NOT NULL DEFAULT 0
     );`,
    `CREATE TABLE IF NOT EXISTS cat_modulo (
       id INTEGER PRIMARY KEY, modulo TEXT NOT NULL, lote_id INTEGER NOT NULL, ha REAL
     );`,
    `CREATE TABLE IF NOT EXISTS cat_cultivo (
       id INTEGER PRIMARY KEY, nombre TEXT NOT NULL
     );`,
    `CREATE TABLE IF NOT EXISTS cat_tarea (
       id INTEGER PRIMARY KEY, nombre TEXT NOT NULL, cultivos_id INTEGER
     );`,
    `CREATE TABLE IF NOT EXISTS cat_subtarea (
       id INTEGER PRIMARY KEY, codigo TEXT, nombre TEXT NOT NULL,
       tarea_id INTEGER NOT NULL, unidad_labor_id INTEGER, tipo_pago_id INTEGER
     );`,
    `CREATE TABLE IF NOT EXISTS cat_ulabor (
       id INTEGER PRIMARY KEY, nombre TEXT NOT NULL
     );`,
    `CREATE TABLE IF NOT EXISTS cat_personal (
       id INTEGER PRIMARY KEY, nombre TEXT NOT NULL, id_finca INTEGER,
       rol INTEGER, rol_app TEXT
     );`,
  ];

  /** Abre (una sola vez) la conexión y aplica el esquema. */
  async abrir(): Promise<SQLiteDBConnection> {
    if (this.db) {
      return this.db;
    }
    if (!this.abriendo) {
      this.abriendo = this.abrirInterno();
    }
    return this.abriendo;
  }

  private async abrirInterno(): Promise<SQLiteDBConnection> {
    if (Capacitor.getPlatform() === 'web') {
      await this.sqlite.initWebStore();
    }

    const nombre = DatabaseService.DB_NAME;
    const consistencia = await this.sqlite.checkConnectionsConsistency();
    const existe = (await this.sqlite.isConnection(nombre, false)).result;

    const db =
      consistencia.result && existe
        ? await this.sqlite.retrieveConnection(nombre, false)
        : await this.sqlite.createConnection(
            nombre,
            false,
            'no-encryption',
            DatabaseService.DB_VERSION,
            false,
          );

    await db.open();
    for (const sql of DatabaseService.SCHEMA_V1) {
      await db.execute(sql, false);
    }
    await this.persistirSiWeb(db);

    this.db = db;
    return db;
  }

  /**
   * En web, los cambios viven en memoria hasta que se guardan al store
   * (IndexedDB). Llamar tras cada escritura que deba sobrevivir un F5.
   * En nativo no hace nada.
   */
  async persistir(): Promise<void> {
    if (this.db) {
      await this.persistirSiWeb(this.db);
    }
  }

  private async persistirSiWeb(db: SQLiteDBConnection): Promise<void> {
    if (Capacitor.getPlatform() === 'web') {
      await this.sqlite.saveToStore(DatabaseService.DB_NAME);
    }
  }
}
