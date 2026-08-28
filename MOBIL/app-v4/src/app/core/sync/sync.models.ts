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
  | 'pc_lote'
  | 'pc_etapa'
  | 'pc_calidad';

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
