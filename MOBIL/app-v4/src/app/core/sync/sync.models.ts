/**
 * Modelos de sincronización — contrato con la API V4.
 * Fuente: MOBIL/01-sincronizacion.md y MOBIL/02-bd-y-api.md §7.
 */

/** Máquina de estados local (01-sincronizacion.md §Máquina de estados). */
export type EstadoRegistro = 'PENDIENTE' | 'ENVIANDO' | 'ENVIADO' | 'RECHAZADO';

/** Tipos de registro que acepta POST /v4/sync. */
export type TipoRegistro =
  | 'am'
  | 'pm'
  | 'cosecha'
  | 'riego'
  | 'pc_proceso'
  | 'pc_etapa'
  | 'pc_calidad_ferm'
  | 'pc_calidad_sec'
  | 'pc_resultado';

/**
 * Identidad humana de un registro de la cola, resuelta al momento de
 * `guardar()` y guardada aparte del payload para NO viajar a `/v4/sync`
 * (el payload mínimo es una decisión cerrada, 2026-09-03).
 *
 * Sin esto, `clave()` y las tarjetas de /registros tenían que adivinar la
 * identidad leyendo campos del payload que cosecha, PM y pc_* nunca mandan
 * -- porque el servidor los deriva de otro lado (el AM que cierran, o la
 * partida a la que pertenecen) -- y todo terminaba colapsado en una sola
 * tarjeta con el lote en "Sin datos de catálogo".
 *
 * Filas encoladas ANTES de este cambio tienen `meta` NULL: la pantalla cae
 * al viejo camino (leer el payload) para esas, no se migra nada.
 */
export interface RegistroMeta {
  loteId?: number;
  /** Nombre del lote ya resuelto -- lo que ya tenía `c.asignacion`. */
  lote?: string;
  subtareaId?: number;
  subtarea?: string;
  /** "3, 4" o '' si el lote no trabaja por módulos, ya resuelto. */
  modulos?: string;
  trabajador?: string;
  /** Partida de postcosecha. `null` hasta que el ACK de pc_proceso la trae. */
  lotCode?: string | null;
  /** Etapa de postcosecha (pc_etapa / pc_calidad_sec). */
  etapa?: string;
}

/** Fila de la tabla local sync_queue. */
export interface RegistroCola {
  guid: string;
  tipo: TipoRegistro;
  /** Payload específico del tipo, serializado JSON. */
  payload: string;
  estado: EstadoRegistro;
  /** Reloj del dispositivo al guardar, ISO-8601 con offset. Orden FIFO. */
  created_at_device: string;
  intentos: number;
  ultimo_error: string | null;
  /** id asignado por el servidor cuando hubo ACK created/duplicate. */
  server_id: number | null;
  /** reason del servidor cuando el estado es RECHAZADO. */
  motivo_rechazo: string | null;
  /** Flags informativos que devolvió el servidor, JSON array. */
  flags: string | null;
  acked_at: string | null;
  /** Identidad humana, serializada JSON. NULL en filas viejas. */
  meta: string | null;
}

/**
 * Una fila de la cola YA PARSEADA, como la consumen las pantallas.
 *
 * `RegistroCola` es la fila cruda de SQLite: `payload` y `flags` vienen como
 * texto JSON. Esta es la version util para dibujar: el parseo con su try/catch
 * se hace una sola vez, en el servicio, y no en cada pantalla.
 */
export interface RegistroColaVista {
  guid: string;
  tipo: TipoRegistro;
  estado: EstadoRegistro;
  payload: Record<string, unknown>;
  createdAtDevice: string;
  intentos: number;
  ultimoError: string | null;
  serverId: number | null;
  motivoRechazo: string | null;
  flags: string[];
  ackedAt: string | null;
  /** Identidad humana ya parseada. `null` si la fila no la trae (vieja) o vino corrupta. */
  meta: RegistroMeta | null;
}

/** Un registro dentro del body de POST /v4/sync. */
export interface SyncRecord {
  guid: string;
  tipo: TipoRegistro;
  created_at_device: string;
  payload: unknown;
}

export interface SyncRequest {
  device_alias: string;
  device_clock_offset: number | null;
  records: SyncRecord[];
}

export type SyncResultStatus = 'created' | 'duplicate' | 'rejected';

export interface SyncResult {
  guid: string;
  status: SyncResultStatus;
  id?: number;
  reason?: string;
  flags?: string[];
  /** Sólo en resultados de `pc_proceso`: la partida que asignó el servidor. */
  lot_code?: string;
}

export interface SyncResponse {
  server_time: string;
  results: SyncResult[];
}

/** Conteo por estado para el menú y la pantalla de limpieza. */
export interface ConteoCola {
  pendientes: number;
  enviando: number;
  enviados: number;
  rechazados: number;
}

export const CONTEO_VACIO: ConteoCola = {
  pendientes: 0,
  enviando: 0,
  enviados: 0,
  rechazados: 0,
};
