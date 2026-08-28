import { Injectable, inject, signal } from '@angular/core';
import { App } from '@capacitor/app';
import { Network } from '@capacitor/network';

import { ApiService } from '../api/api.service';
import { AppConfigService, KV } from '../config/app-config.service';
import { ClockService } from '../clock/clock.service';
import { DatabaseService } from '../db/database.service';
import {
  CONTEO_VACIO,
  ConteoCola,
  RegistroCola,
  SyncRecord,
  SyncResponse,
  TipoRegistro,
} from './sync.models';

/**
 * Cola de sincronización offline-first (MOBIL/01-sincronizacion.md).
 *
 * Reglas duras implementadas aquí:
 * - FIFO por created_at_device, lotes de máximo 50.
 * - El ACK es la aparición del guid en `results` con status created o
 *   duplicate. NUNCA el HTTP 200: un portal cautivo devuelve 200 con HTML
 *   y ese caso debe dejar el lote en PENDIENTE.
 * - rejected -> RECHAZADO, no se reintenta, se guarda el motivo.
 * - guid ausente de results, error de red, timeout, 5xx o respuesta
 *   ilegible -> todo el lote vuelve a PENDIENTE.
 * - Backoff 30s -> 1m -> 2m -> 5m -> 15m -> 30m, sin límite de reintentos.
 * - Un registro jamás se borra de SQLite antes del ACK.
 * - ENVIANDO huérfano (app muerta en pleno envío) vuelve a PENDIENTE al
 *   arrancar; el guid protege del doble insert en el servidor.
 * - ENVIADO se conserva 30 días para "Registros Enviados" y luego se purga.
 */
@Injectable({ providedIn: 'root' })
export class SyncQueueService {
  private static readonly TAMANO_LOTE = 50;
  private static readonly BACKOFF_SEGUNDOS = [30, 60, 120, 300, 900, 1800];
  private static readonly INTERVALO_PERIODICO_MS = 15 * 60 * 1000;
  private static readonly RETENCION_ENVIADOS_DIAS = 30;

  private readonly database = inject(DatabaseService);
  private readonly config = inject(AppConfigService);
  private readonly clock = inject(ClockService);
  private readonly api = inject(ApiService);

  /** Conteo por estado, para el menú y la limpieza. */
  readonly conteo = signal<ConteoCola>(CONTEO_VACIO);
  /** true mientras hay un lote en vuelo. */
  readonly enviando = signal(false);
  /** Estado de red según Capacitor Network. */
  readonly online = signal(true);
  /** Epoch ms del próximo reintento programado; null = sin backoff activo. */
  readonly proximoReintentoMs = signal<number | null>(null);
  /** Último error de envío, para mostrar en la UI. */
  readonly ultimoError = signal<string | null>(null);

  private fallosConsecutivos = 0;
  private timerBackoff: ReturnType<typeof setTimeout> | null = null;
  private inicializado: Promise<void>;

  constructor() {
    this.inicializado = this.init();
  }

  // ------------------------------------------------------------------
  // Arranque
  // ------------------------------------------------------------------

  private async init(): Promise<void> {
    await this.config.cargar();
    await this.clock.cargar();
    await this.recuperarEnviando();
    await this.purgarEnviadosViejos();
    await this.refrescarConteo();

    const estado = await Network.getStatus();
    this.online.set(estado.connected);

    Network.addListener('networkStatusChange', (s) => {
      this.online.set(s.connected);
      if (s.connected) {
        // Recuperar red cancela el backoff: se intenta ya.
        this.limpiarBackoff();
        void this.flush('red-recuperada');
      }
    });

    App.addListener('appStateChange', ({ isActive }) => {
      if (isActive) {
        void this.recuperarEnviando().then(() => this.flush('app-resume'));
      }
    });

    setInterval(() => void this.flush('periodico'), SyncQueueService.INTERVALO_PERIODICO_MS);
  }

  /** ENVIANDO sin ACK = request que murió con la app. Vuelve a PENDIENTE. */
  private async recuperarEnviando(): Promise<void> {
    const db = await this.database.abrir();
    const r = await db.run(
      `UPDATE sync_queue SET estado = 'PENDIENTE' WHERE estado = 'ENVIANDO';`,
    );
    const cambiados = r.changes?.changes ?? 0;
    if (cambiados > 0) {
      await this.auditar('RECUPERA_ENVIANDO', null, `${cambiados} registro(s) devueltos a PENDIENTE`);
    }
    await this.database.persistir();
  }

  private async purgarEnviadosViejos(): Promise<void> {
    const db = await this.database.abrir();
    const limite = new Date(
      Date.now() - SyncQueueService.RETENCION_ENVIADOS_DIAS * 24 * 3600 * 1000,
    ).toISOString();
    const r = await db.run(
      `DELETE FROM sync_queue WHERE estado = 'ENVIADO' AND acked_at IS NOT NULL AND acked_at < ?;`,
      [limite],
    );
    const borrados = r.changes?.changes ?? 0;
    if (borrados > 0) {
      await this.auditar('PURGA_ENVIADOS', null, `${borrados} enviados con más de 30 días`);
      await this.database.persistir();
    }
  }

  // ------------------------------------------------------------------
  // Alta de registros
  // ------------------------------------------------------------------

  /**
   * Guarda un registro en la cola local y dispara un intento de envío.
   * La pantalla NUNCA espera a la red: esto resuelve apenas SQLite confirma.
   * Devuelve el guid generado (UUID v4, inmutable de por vida).
   */
  async enqueue(tipo: TipoRegistro, payload: unknown): Promise<string> {
    await this.inicializado;
    const guid = crypto.randomUUID();
    const createdAtDevice = this.isoLocalDelDispositivo();

    const db = await this.database.abrir();
    await db.run(
      `INSERT INTO sync_queue (guid, tipo, payload, estado, created_at_device)
       VALUES (?, ?, ?, 'PENDIENTE', ?);`,
      [guid, tipo, JSON.stringify(payload), createdAtDevice],
    );
    await this.auditar('ENQUEUE', guid, tipo);
    await this.database.persistir();
    await this.refrescarConteo();

    void this.flush('al-guardar');
    return guid;
  }

  // ------------------------------------------------------------------
  // Envío
  // ------------------------------------------------------------------

  /**
   * Intenta enviar lotes de PENDIENTES. `motivo` es solo para auditoría.
   * El disparo manual ignora la espera de backoff; los automáticos la
   * respetan.
   */
  async flush(motivo: string, manual = false): Promise<void> {
    await this.inicializado;

    if (this.enviando()) {
      return;
    }
    if (!this.config.baseUrl()) {
      return; // sin servidor configurado no hay nada que intentar
    }
    if (!this.online()) {
      return;
    }
    const espera = this.proximoReintentoMs();
    if (!manual && espera !== null && Date.now() < espera) {
      return;
    }

    this.enviando.set(true);
    try {
      // Mientras el servidor siga confirmando, se encadenan lotes de 50.
      let continuar = true;
      while (continuar) {
        continuar = await this.enviarUnLote(motivo);
      }
    } finally {
      this.enviando.set(false);
      await this.refrescarConteo();
    }
  }

  /** @returns true si el lote se confirmó y puede intentarse el siguiente. */
  private async enviarUnLote(motivo: string): Promise<boolean> {
    const db = await this.database.abrir();
    const lote = await db.query(
      `SELECT * FROM sync_queue WHERE estado = 'PENDIENTE'
       ORDER BY created_at_device ASC, guid ASC LIMIT ?;`,
      [SyncQueueService.TAMANO_LOTE],
    );
    const filas = (lote.values ?? []) as RegistroCola[];
    if (filas.length === 0) {
      return false;
    }

    const guids = filas.map((f) => f.guid);
    await this.marcarEstado(guids, 'ENVIANDO');

    const records: SyncRecord[] = filas.map((f) => ({
      guid: f.guid,
      tipo: f.tipo,
      created_at_device: f.created_at_device,
      payload: JSON.parse(f.payload),
    }));

    let respuesta: SyncResponse;
    try {
      respuesta = await this.api.sync({
        device_alias: this.config.deviceAlias() ?? '',
        device_clock_offset: this.clock.offsetSeconds(),
        records,
      });
    } catch (e) {
      // Red caída, timeout, 5xx, 501 del esbozo… todo el lote vuelve.
      await this.loteFallido(guids, this.describirError(e), motivo);
      return false;
    }

    if (!Array.isArray(respuesta?.results)) {
      // HTTP 200 pero cuerpo ilegible (proxy, portal cautivo): NO es ACK.
      await this.loteFallido(guids, 'Respuesta sin results: no es un ACK válido', motivo);
      return false;
    }

    return this.aplicarResultados(guids, respuesta);
  }

  /**
   * Aplica el ACK por registro. Regla dura: solo la aparición del guid en
   * results con created/duplicate cierra un registro.
   */
  private async aplicarResultados(guidsEnviados: string[], respuesta: SyncResponse): Promise<boolean> {
    const db = await this.database.abrir();
    const ahora = new Date().toISOString();
    const porGuid = new Map(respuesta.results.map((r) => [r.guid, r]));

    let confirmados = 0;
    let rechazados = 0;
    let sinRespuesta = 0;

    for (const guid of guidsEnviados) {
      const r = porGuid.get(guid);
      if (r && (r.status === 'created' || r.status === 'duplicate')) {
        await db.run(
          `UPDATE sync_queue
              SET estado = 'ENVIADO', server_id = ?, flags = ?, acked_at = ?, ultimo_error = NULL
            WHERE guid = ?;`,
          [r.id ?? null, r.flags ? JSON.stringify(r.flags) : null, ahora, guid],
        );
        confirmados++;
      } else if (r && r.status === 'rejected') {
        await db.run(
          `UPDATE sync_queue
              SET estado = 'RECHAZADO', motivo_rechazo = ?, acked_at = ?
            WHERE guid = ?;`,
          [r.reason ?? 'Rechazado por el servidor sin motivo', ahora, guid],
        );
        await this.auditar('RECHAZADO', guid, r.reason ?? null);
        rechazados++;
      } else {
        // El guid no vino en results: ese registro NO tiene ACK.
        await db.run(`UPDATE sync_queue SET estado = 'PENDIENTE' WHERE guid = ?;`, [guid]);
        sinRespuesta++;
      }
    }

    await this.auditar(
      'LOTE_PROCESADO',
      null,
      `confirmados=${confirmados} rechazados=${rechazados} sin_respuesta=${sinRespuesta}`,
    );

    // El servidor respondió con un results válido: el canal funciona.
    this.fallosConsecutivos = 0;
    this.limpiarBackoff();
    this.ultimoError.set(null);
    await this.config.set(KV.LAST_SYNC_OK_AT, ahora);
    await this.database.persistir();
    await this.refrescarConteo();

    // Si todos los enviados quedaron sin respuesta, no tiene sentido
    // encadenar otro lote: sería un bucle contra un servidor que ignora.
    return confirmados + rechazados > 0 && sinRespuesta === 0;
  }

  private async loteFallido(guids: string[], error: string, motivo: string): Promise<void> {
    await this.marcarEstado(guids, 'PENDIENTE', error);
    this.fallosConsecutivos++;
    this.ultimoError.set(error);
    this.programarBackoff();
    await this.auditar('LOTE_FALLIDO', null, `motivo=${motivo} intento=${this.fallosConsecutivos} error=${error}`);
    await this.database.persistir();
    await this.refrescarConteo();
  }

  // ------------------------------------------------------------------
  // Backoff
  // ------------------------------------------------------------------

  private programarBackoff(): void {
    const tabla = SyncQueueService.BACKOFF_SEGUNDOS;
    const idx = Math.min(this.fallosConsecutivos - 1, tabla.length - 1);
    const esperaMs = tabla[idx] * 1000;
    this.proximoReintentoMs.set(Date.now() + esperaMs);

    if (this.timerBackoff) {
      clearTimeout(this.timerBackoff);
    }
    this.timerBackoff = setTimeout(() => {
      this.proximoReintentoMs.set(null);
      void this.flush('backoff');
    }, esperaMs);
  }

  private limpiarBackoff(): void {
    if (this.timerBackoff) {
      clearTimeout(this.timerBackoff);
      this.timerBackoff = null;
    }
    this.proximoReintentoMs.set(null);
  }

  // ------------------------------------------------------------------
  // Lectura y limpieza
  // ------------------------------------------------------------------

  async refrescarConteo(): Promise<void> {
    const db = await this.database.abrir();
    const r = await db.query(
      `SELECT estado, COUNT(*) AS n FROM sync_queue GROUP BY estado;`,
    );
    const conteo: ConteoCola = { ...CONTEO_VACIO };
    for (const fila of r.values ?? []) {
      switch (fila['estado']) {
        case 'PENDIENTE':
          conteo.pendientes = fila['n'];
          break;
        case 'ENVIANDO':
          conteo.enviando = fila['n'];
          break;
        case 'ENVIADO':
          conteo.enviados = fila['n'];
          break;
        case 'RECHAZADO':
          conteo.rechazados = fila['n'];
          break;
      }
    }
    this.conteo.set(conteo);
  }

  /**
   * Limpieza manual desde Configuración. SOLO borra ENVIADOS y RECHAZADOS.
   * Los PENDIENTES/ENVIANDO no se tocan desde acá: la pantalla bloquea la
   * sección entera si existen, y esta función lo revalida por si acaso.
   */
  async limpiarCerrados(): Promise<{ borrados: number } | { bloqueado: string }> {
    await this.inicializado;
    const c = this.conteo();
    if (c.pendientes > 0 || c.enviando > 0) {
      return {
        bloqueado: `Hay ${c.pendientes + c.enviando} registro(s) sin sincronizar. Sincronizá antes de limpiar.`,
      };
    }
    const db = await this.database.abrir();
    const r = await db.run(
      `DELETE FROM sync_queue WHERE estado IN ('ENVIADO', 'RECHAZADO');`,
    );
    const borrados = r.changes?.changes ?? 0;
    await this.auditar('LIMPIEZA', null, `${borrados} registro(s) cerrados eliminados`);
    await this.database.persistir();
    await this.refrescarConteo();
    return { borrados };
  }

  // ------------------------------------------------------------------
  // Helpers
  // ------------------------------------------------------------------

  private async marcarEstado(guids: string[], estado: string, error?: string): Promise<void> {
    if (guids.length === 0) {
      return;
    }
    const db = await this.database.abrir();
    const marcas = guids.map(() => '?').join(',');
    if (error !== undefined) {
      await db.run(
        `UPDATE sync_queue SET estado = ?, intentos = intentos + 1, ultimo_error = ? WHERE guid IN (${marcas});`,
        [estado, error, ...guids],
      );
    } else {
      await db.run(`UPDATE sync_queue SET estado = ? WHERE guid IN (${marcas});`, [
        estado,
        ...guids,
      ]);
    }
  }

  private async auditar(evento: string, guid: string | null, detalle: string | null): Promise<void> {
    const db = await this.database.abrir();
    await db.run(
      `INSERT INTO sync_audit (evento, guid, detalle, created_at) VALUES (?, ?, ?, ?);`,
      [evento, guid, detalle, new Date().toISOString()],
    );
  }

  /**
   * ISO-8601 local con offset del dispositivo (ej. 2026-08-28T11:50:37-05:00).
   * Es el reloj del teléfono SIN corregir: created_at_device documenta lo
   * que el dispositivo creía; el clock_offset viaja aparte en cada envío.
   */
  private isoLocalDelDispositivo(): string {
    const d = new Date();
    const pad = (n: number, l = 2) => String(Math.abs(n)).padStart(l, '0');
    const tz = -d.getTimezoneOffset();
    const signo = tz >= 0 ? '+' : '-';
    return (
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
      `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` +
      `${signo}${pad(Math.floor(tz / 60))}:${pad(tz % 60)}`
    );
  }

  private describirError(e: unknown): string {
    if (e && typeof e === 'object') {
      const err = e as { status?: number; name?: string; message?: string };
      if (err.status !== undefined && err.status !== 0) {
        return `HTTP ${err.status}`;
      }
      if (err.name === 'TimeoutError') {
        return 'Timeout de red';
      }
      if (err.message) {
        return err.message;
      }
    }
    return 'Error de red';
  }
}
