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

  /**
   * Esquema local. TODO es IF NOT EXISTS y se ejecuta en cada apertura, asi
   * que agregar tablas NUEVAS no necesita la maquinaria de upgrade del plugin
   * ni subir DB_VERSION: la app vieja que ya tenia la base simplemente las
   * crea al abrir. DB_VERSION solo se movera cuando haya que MODIFICAR o
   * migrar datos de una tabla existente, que es lo que IF NOT EXISTS no hace.
   */
  private static readonly SCHEMA: string[] = [
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
       acked_at          TEXT,
       meta              TEXT
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
       tarea_id INTEGER NOT NULL, id_finca INTEGER,
       unidad_labor_id INTEGER, tipo_pago_id INTEGER
     );`,
    `CREATE TABLE IF NOT EXISTS cat_ulabor (
       id INTEGER PRIMARY KEY, nombre TEXT NOT NULL
     );`,
    `CREATE TABLE IF NOT EXISTS cat_personal (
       id INTEGER PRIMARY KEY, nombre TEXT NOT NULL, id_finca INTEGER,
       rol INTEGER, rol_app TEXT
     );`,

    // ---------------------------------------------------------------
    // Espejo local de lo capturado (paso 3). NO reemplaza a sync_queue:
    // el payload sigue viviendo ahi. Estas dos tablas existen solo para
    // poder responder rapido "esta persona ya tiene un AM abierto en
    // ESTE telefono?" sin parsear JSON en SQL.
    //
    // Alcance honesto de la regla: cubre lo capturado en este equipo.
    // Un AM cargado desde otra tablet es invisible aca. La validacion
    // real exige reg_pm.am_id y una consulta al servidor; es un paso
    // aparte, decidido por Kevin el 2026-08-31.
    // ---------------------------------------------------------------
    `CREATE TABLE IF NOT EXISTS am_persona_local (
       guid          TEXT    NOT NULL,
       personal_id   INTEGER NOT NULL,
       fecha         TEXT    NOT NULL,   -- YYYY-MM-DD de fecha_proceso
       lote_id       INTEGER NOT NULL,
       subtarea_id   INTEGER NOT NULL,
       created_at    TEXT    NOT NULL,
       -- ids de modulo separados por coma; el PM los muestra junto al lote.
       modulos       TEXT,
       -- guid del formulario que capturo esta persona. Lo comparten las N
       -- personas de la misma tarea y es lo que agrupa la lista del PM.
       captura_guid  TEXT,
       PRIMARY KEY (guid, personal_id)
     );`,
    `CREATE INDEX IF NOT EXISTS idx_am_persona_abierto
       ON am_persona_local (personal_id, fecha);`,
    `CREATE TABLE IF NOT EXISTS pm_cierre_local (
       guid          TEXT    PRIMARY KEY,
       trabajador_id INTEGER NOT NULL,
       fecha         TEXT    NOT NULL,
       lote_id       INTEGER NOT NULL,
       subtarea_id   INTEGER NOT NULL,
       created_at    TEXT    NOT NULL
     );`,
    `CREATE INDEX IF NOT EXISTS idx_pm_cierre
       ON pm_cierre_local (trabajador_id, fecha, lote_id, subtarea_id);`,

    // ---------------------------------------------------------------
    // Espejo local de postcosecha (paso 6). Cubre dos cosas que el
    // servidor no puede: una partida capturada sin señal --que todavia
    // no tiene lot_code-- y las etapas ya cargadas en ESTE equipo, para
    // no ofrecer dos veces la misma antes de que llegue el ACK.
    //
    // El lot_code NO se guarda aca: llega con la lista del servidor. Sin
    // señal la pantalla dice "pendiente de número", que es la decision
    // de Kevin del 2026-09-05.
    // ---------------------------------------------------------------
    `CREATE TABLE IF NOT EXISTS pc_proceso_local (
       guid          TEXT PRIMARY KEY,
       fecha_cosecha TEXT NOT NULL,
       fecha_inicio  TEXT NOT NULL,
       supervisor_id INTEGER NOT NULL,
       supervisor    TEXT,
       peso_lote     REAL NOT NULL,
       peso_mallas   REAL NOT NULL,
       cosechas      INTEGER NOT NULL DEFAULT 0,
       cerrada       INTEGER NOT NULL DEFAULT 0,
       created_at    TEXT NOT NULL
     );`,
    // `inicio`/`fin`/`comentario` y `datos` no son de control: son lo que la
    // pantalla MUESTRA al volver a una etapa ya registrada, mientras el ACK
    // no llegó y el servidor todavía no la conoce.
    `CREATE TABLE IF NOT EXISTS pc_etapa_local (
       proceso_guid TEXT NOT NULL,
       etapa        TEXT NOT NULL,
       inicio       TEXT,
       fin          TEXT,
       comentario   TEXT,
       created_at   TEXT NOT NULL,
       PRIMARY KEY (proceso_guid, etapa)
     );`,
    `CREATE TABLE IF NOT EXISTS pc_calidad_local (
       proceso_guid TEXT NOT NULL,
       etapa        TEXT NOT NULL,
       datos        TEXT,
       created_at   TEXT NOT NULL,
       PRIMARY KEY (proceso_guid, etapa)
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
    for (const sql of DatabaseService.SCHEMA) {
      await db.execute(sql, false);
    }
    await this.agregarColumnasFaltantes(db);
    await this.persistirSiWeb(db);

    this.db = db;
    return db;
  }

  /**
   * Columnas agregadas DESPUES de que la tabla ya existia en equipos en uso.
   *
   * `CREATE TABLE IF NOT EXISTS` no agrega columnas a una tabla que ya esta,
   * asi que un ALTER hace falta; y SQLite no tiene `ADD COLUMN IF NOT EXISTS`,
   * asi que el error de "duplicate column" se ignora a proposito. Es el
   * camino barato mientras los cambios sean solo agregar columnas nullables.
   */
  private async agregarColumnasFaltantes(db: SQLiteDBConnection): Promise<void> {
    const alters = [
      'ALTER TABLE am_persona_local ADD COLUMN modulos TEXT;',
      'ALTER TABLE am_persona_local ADD COLUMN captura_guid TEXT;',
      'ALTER TABLE cat_subtarea ADD COLUMN id_finca INTEGER;',
      'ALTER TABLE pc_etapa_local ADD COLUMN inicio TEXT;',
      'ALTER TABLE pc_etapa_local ADD COLUMN fin TEXT;',
      'ALTER TABLE pc_etapa_local ADD COLUMN comentario TEXT;',
      'ALTER TABLE pc_calidad_local ADD COLUMN datos TEXT;',
      'ALTER TABLE sync_queue ADD COLUMN meta TEXT;',
    ];
    for (const sql of alters) {
      try {
        await db.execute(sql, false);
      } catch {
        // la columna ya existe
      }
    }
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
