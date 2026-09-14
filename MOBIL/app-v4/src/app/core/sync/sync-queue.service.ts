import { Injectable, inject, signal } from '@angular/core';
import { App } from '@capacitor/app';
import { Network } from '@capacitor/network';

import { EstadoLan, LanNetwork } from '../net/lan-network';

import { ApiService } from '../api/api.service';
import { AppConfigService, KV } from '../config/app-config.service';
import { ClockService } from '../clock/clock.service';
import { DatabaseService } from '../db/database.service';
import {
  CONTEO_VACIO,
  ConteoCola,
  EstadoRegistro,
  RegistroCola,
  RegistroColaVista,
  RegistroMeta,
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
  /**
   * ¿Contesta NUESTRO servidor? `null` mientras no se probó todavía.
   *
   * ESTO REEMPLAZA A `Network.connected` Y NO ES LO MISMO.
   * `@capacitor/network` calcula `connected` así (Network.java:80):
   *
   *     hasCapability(NET_CAPABILITY_VALIDATED) && hasCapability(NET_CAPABILITY_INTERNET)
   *
   * `VALIDATED` significa que Android sondeó un endpoint de Google y le
   * contestaron, o sea INTERNET DE VERDAD. La LAN de la finca no tiene salida,
   * así que ese flag vale `false` para siempre y `flush()` se cortaba sin
   * abrir un socket: la app le pedía permiso a Google para hablarle a un
   * servidor que está a veinte metros.
   *
   * La única pregunta que importa es "¿contesta `GET {baseUrl}/hora`?", y esa
   * solo la puede responder el servidor. Se actualiza con cada intento real de
   * envío y con `sondear()`.
   */
  readonly servidorAlcanzable = signal<boolean | null>(null);

  /** Qué interfaz está usando el proceso. Diagnóstico, nunca una condición. */
  readonly red = signal<EstadoLan>({
    atado: false,
    transporte: 'ninguno',
    ip: null,
    validada: false,
    motivo: null,
  });
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

    await this.asegurarRuta();
    void this.sondear();

    // `Network` queda SOLO como disparador: "algo cambió en la red, probá de
    // nuevo ahora en vez de esperar el backoff". Su `connected` ya no decide
    // nada — ver el comentario de `servidorAlcanzable`. Por eso se reacciona a
    // CUALQUIER cambio, incluido pasar a una WiFi sin internet, que es
    // justamente el caso de la finca.
    Network.addListener('networkStatusChange', () => {
      void this.asegurarRuta().then(() => {
        this.limpiarBackoff();
        return this.flush('cambio-de-red');
      });
    });

    App.addListener('appStateChange', ({ isActive }) => {
      if (isActive) {
        void this.asegurarRuta()
          .then(() => this.recuperarEnviando())
          .then(() => this.flush('app-resume'));
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
  // Ruta y alcanzabilidad
  // ------------------------------------------------------------------

  /**
   * Ata el proceso a la WiFi/Ethernet antes de hablar con el servidor.
   *
   * El teléfono ya está asociado a la WiFi de la finca; lo que falla es el
   * RUTEO: con datos móviles encendidos y un WiFi sin validar, Android aplica
   * "avoid bad wifi" y deja la celular como red por defecto del proceso. El
   * POST a `192.168.x.x` sale por la antena y muere en la red del operador.
   *
   * Nunca lanza: si el binding no se puede hacer, se envía igual por la red
   * por defecto — que es exactamente lo que pasaba antes de este plugin, así
   * que el peor caso es el comportamiento viejo y no una regresión.
   */
  private async asegurarRuta(): Promise<void> {
    try {
      this.red.set(await LanNetwork.asegurar());
    } catch (e) {
      this.red.set({
        atado: false,
        transporte: 'otro',
        ip: null,
        validada: false,
        motivo: e instanceof Error ? e.message : 'No se pudo consultar la red',
      });
    }
  }

  /**
   * "¿Contesta el servidor?", preguntado al servidor y a nadie más.
   *
   * `GET {baseUrl}/hora` es el endpoint más barato que hay y no toca la cola:
   * esto solo pinta el cartel de la pantalla. Que el sondeo falle NO impide
   * enviar — `flush()` intenta igual.
   */
  async sondear(): Promise<boolean> {
    if (!this.config.baseUrl()) {
      this.servidorAlcanzable.set(null);
      return false;
    }
    await this.asegurarRuta();
    try {
      await this.api.hora();
      this.servidorAlcanzable.set(true);
      return true;
    } catch {
      this.servidorAlcanzable.set(false);
      return false;
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
  async enqueue(tipo: TipoRegistro, payload: unknown, meta?: RegistroMeta): Promise<string> {
    await this.inicializado;
    const guid = crypto.randomUUID();
    const createdAtDevice = this.isoLocalDelDispositivo();

    // Tramo de base serializado: el `void flush()` de mas abajo NO se espera,
    // asi que el INSERT del registro siguiente se solapaba con la transaccion
    // del envio en curso. Ver `DatabaseService.exclusivo()`.
    await this.database.exclusivo(async () => {
      const db = await this.database.abrir();
      await db.run(
        `INSERT INTO sync_queue (guid, tipo, payload, estado, created_at_device, meta)
         VALUES (?, ?, ?, 'PENDIENTE', ?, ?);`,
        [guid, tipo, JSON.stringify(payload), createdAtDevice, meta ? JSON.stringify(meta) : null],
      );
      await this.auditar('ENQUEUE', guid, tipo);
      await this.database.persistir();
    });
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
    // NO hay gate de red. Antes había un `if (!this.online()) return;` y era
    // el bug: bloqueaba el envío por un flag del sistema operativo que en una
    // LAN sin internet es `false` por definición.
    //
    // Intentar y fallar no cuesta nada acá: `loteFallido()` devuelve el lote a
    // PENDIENTE, nada se borra antes del ACK y el backoff evita el machaque.
    // El único que puede decir si el servidor está es el servidor.
    const espera = this.proximoReintentoMs();
    if (!manual && espera !== null && Date.now() < espera) {
      return;
    }

    this.enviando.set(true);
    try {
      // Atarse a la WiFi ANTES de mandar. Si el equipo tiene datos móviles,
      // Android deja la celular como red por defecto cuando el WiFi no está
      // validado, y el POST a una IP privada se va por la antena y muere.
      // [EXPERIMENTO] asegurarRuta() removido del flush
      // Mientras el servidor siga confirmando, se encadenan lotes de 50.
      let continuar = true;
      while (continuar) {
        continuar = await this.enviarUnLote(motivo);
      }
    } catch (e) {
      // NO ALCANZA CON `finally`. Hasta el 2026-09-14 esto era solo
      // `try/finally`: cualquier excepcion fuera del `catch` del POST -por
      // ejemplo la transaccion de SQLite reventada por dos escrituras
      // solapadas- se iba como promesa rechazada que nadie escuchaba, porque
      // `enqueue` llama a `flush` con `void`. Resultado: registros PENDIENTE,
      // `servidorAlcanzable` en true, sin backoff y sin `ultimoError`. Tres
      // dias sin que nadie lo notara.
      //
      // Un fallo inesperado se trata como cualquier otro fallo de envio: se
      // devuelven los ENVIANDO a PENDIENTE, se muestra el error y se programa
      // el reintento.
      const detalle = this.describirError(e);
      this.ultimoError.set(detalle);
      this.fallosConsecutivos++;
      this.programarBackoff();
      await this.database.exclusivo(async () => {
        await this.recuperarEnviando();
        await this.auditar('FLUSH_FALLIDO', null, `motivo=${motivo} error=${detalle}`);
      });
    } finally {
      this.enviando.set(false);
      await this.refrescarConteo();
    }
  }

  /** @returns true si el lote se confirmó y puede intentarse el siguiente. */
  private async enviarUnLote(motivo: string): Promise<boolean> {
    // Tomar el lote y marcarlo ENVIANDO es un solo tramo de base: si entre el
    // SELECT y el UPDATE se cuela un `enqueue`, las dos transacciones chocan.
    // El lock se SUELTA antes del POST: la pantalla nunca espera a la red.
    const filas = await this.database.exclusivo(async () => {
      const db = await this.database.abrir();
      const lote = await db.query(
        `SELECT * FROM sync_queue WHERE estado = 'PENDIENTE'
         ORDER BY created_at_device ASC, guid ASC LIMIT ?;`,
        [SyncQueueService.TAMANO_LOTE],
      );
      const f = (lote.values ?? []) as RegistroCola[];
      if (f.length > 0) {
        await this.marcarEstado(
          f.map((x) => x.guid),
          'ENVIANDO',
        );
      }
      return f;
    });
    if (filas.length === 0) {
      return false;
    }

    const guids = filas.map((f) => f.guid);

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
    // Todo el ACK es un solo tramo de base. `refrescarConteo()` queda afuera:
    // solo lee y no tiene por que ocupar el turno.
    const seguir = await this.database.exclusivo(() =>
      this.aplicarResultadosInterno(guidsEnviados, respuesta),
    );
    await this.refrescarConteo();
    return seguir;
  }

  private async aplicarResultadosInterno(
    guidsEnviados: string[],
    respuesta: SyncResponse,
  ): Promise<boolean> {
    const db = await this.database.abrir();
    const ahora = new Date().toISOString();
    const porGuid = new Map(respuesta.results.map((r) => [r.guid, r]));

    let confirmados = 0;
    let rechazados = 0;
    let sinRespuesta = 0;

    for (const guid of guidsEnviados) {
      const r = porGuid.get(guid);
      if (r && (r.status === 'created' || r.status === 'duplicate')) {
        // `lot_code` sólo viene en resultados de `pc_proceso`: recién con el
        // ACK el servidor asigna la partida. Antes se descartaba acá mismo y
        // la tarjeta de /registros no tenía forma de mostrar "Partida N".
        let metaJson: string | null = null;
        if (r.lot_code) {
          const fila = await db.query('SELECT meta FROM sync_queue WHERE guid = ?;', [guid]);
          const actual = (fila.values?.[0] as { meta?: string | null } | undefined)?.meta ?? null;
          let meta: Record<string, unknown> = {};
          if (actual) {
            try {
              meta = JSON.parse(actual) as Record<string, unknown>;
            } catch {
              meta = {};
            }
          }
          meta['lotCode'] = r.lot_code;
          metaJson = JSON.stringify(meta);
        }
        await db.run(
          `UPDATE sync_queue
              SET estado = 'ENVIADO', server_id = ?, flags = ?, acked_at = ?, ultimo_error = NULL
                  ${metaJson !== null ? ', meta = ?' : ''}
            WHERE guid = ?;`,
          metaJson !== null
            ? [r.id ?? null, r.flags ? JSON.stringify(r.flags) : null, ahora, metaJson, guid]
            : [r.id ?? null, r.flags ? JSON.stringify(r.flags) : null, ahora, guid],
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
    this.servidorAlcanzable.set(true);
    this.limpiarBackoff();
    this.ultimoError.set(null);
    await this.config.set(KV.LAST_SYNC_OK_AT, ahora);
    await this.database.persistir();

    // Si todos los enviados quedaron sin respuesta, no tiene sentido
    // encadenar otro lote: sería un bucle contra un servidor que ignora.
    return confirmados + rechazados > 0 && sinRespuesta === 0;
  }

  private async loteFallido(guids: string[], error: string, motivo: string): Promise<void> {
    // Un lote que no llegó es la mejor evidencia que hay de que el servidor no
    // está: más confiable que cualquier flag del sistema, porque probó el
    // camino completo hasta `{baseUrl}/sync`.
    this.servidorAlcanzable.set(false);
    this.fallosConsecutivos++;
    this.ultimoError.set(error);
    this.programarBackoff();
    await this.database.exclusivo(async () => {
      await this.marcarEstado(guids, 'PENDIENTE', error);
      await this.auditar(
        'LOTE_FALLIDO',
        null,
        `motivo=${motivo} intento=${this.fallosConsecutivos} error=${error}`,
      );
      await this.database.persistir();
    });
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
  // Lectura para las pantallas Pendientes / Enviados
  // ------------------------------------------------------------------

  /**
   * Los registros de la cola en los estados pedidos, mas nuevos primero.
   *
   * Devuelve el `payload` ya parseado: la pantalla necesita mirarlo adentro
   * para armar la tarjeta (captura_guid, lote, subtarea, persona) y no tiene
   * sentido que cada llamador repita el JSON.parse con su try/catch.
   */
  async listar(estados: EstadoRegistro[]): Promise<RegistroColaVista[]> {
    await this.inicializado;
    if (estados.length === 0) {
      return [];
    }
    const db = await this.database.abrir();
    const marcas = estados.map(() => '?').join(',');
    const r = await db.query(
      `SELECT guid, tipo, payload, estado, created_at_device, intentos,
              ultimo_error, server_id, motivo_rechazo, flags, acked_at, meta
         FROM sync_queue
        WHERE estado IN (${marcas})
        ORDER BY created_at_device DESC;`,
      estados,
    );
    const salida: RegistroColaVista[] = [];
    for (const f of (r.values ?? []) as Record<string, unknown>[]) {
      let payload: Record<string, unknown> = {};
      try {
        payload = JSON.parse(String(f['payload'] ?? '{}')) as Record<string, unknown>;
      } catch {
        // Un payload ilegible no puede tumbar la lista entera: la tarjeta se
        // dibuja con lo que hay en las columnas y el detalle avisa.
        payload = {};
      }
      let flags: string[] = [];
      try {
        const crudo = f['flags'] == null ? [] : JSON.parse(String(f['flags']));
        flags = Array.isArray(crudo) ? crudo.map((x) => String(x)) : [];
      } catch {
        flags = [];
      }
      // `meta` es NULL en filas encoladas antes de este cambio, y en esos
      // casos las tarjetas caen al viejo camino (leer el payload).
      let meta: RegistroMeta | null = null;
      if (f['meta'] != null) {
        try {
          meta = JSON.parse(String(f['meta'])) as RegistroMeta;
        } catch {
          meta = null;
        }
      }
      salida.push({
        guid: String(f['guid']),
        tipo: String(f['tipo']) as TipoRegistro,
        estado: String(f['estado']) as EstadoRegistro,
        payload,
        createdAtDevice: String(f['created_at_device']),
        intentos: Number(f['intentos'] ?? 0),
        ultimoError: f['ultimo_error'] == null ? null : String(f['ultimo_error']),
        serverId: f['server_id'] == null ? null : Number(f['server_id']),
        motivoRechazo: f['motivo_rechazo'] == null ? null : String(f['motivo_rechazo']),
        flags,
        ackedAt: f['acked_at'] == null ? null : String(f['acked_at']),
        meta,
      });
    }
    return salida;
  }

  /**
   * Descarta un registro que NUNCA llego al servidor.
   *
   * Solo PENDIENTE, y se revalida en el propio DELETE con
   * `estado = 'PENDIENTE' AND acked_at IS NULL`: entre que la pantalla dibujo
   * la lista y el usuario confirmo, el envio automatico pudo haberlo mandado.
   * Sin esa condicion se borraria de la cola un registro que ya esta en el
   * servidor, y el telefono perderia el unico rastro de que existio.
   *
   * Queda asentado en `sync_audit` con el payload completo: si despues falta un
   * avance en la nomina, tiene que poder distinguirse "nunca se cargo" de
   * "alguien lo descarto".
   */
  async descartarPendiente(guid: string): Promise<{ ok: true } | { error: string }> {
    await this.inicializado;
    const db = await this.database.abrir();

    const q = await db.query(
      `SELECT tipo, payload FROM sync_queue
        WHERE guid = ? AND estado = 'PENDIENTE' AND acked_at IS NULL LIMIT 1;`,
      [guid],
    );
    const fila = (q.values ?? [])[0] as Record<string, unknown> | undefined;
    if (!fila) {
      return { error: 'Ese registro ya no esta pendiente: puede que se haya enviado recien.' };
    }

    // El asiento va ANTES del borrado: si el DELETE falla no sobra un asiento,
    // pero si el asiento fallara despues de borrar, el registro se perderia sin
    // rastro. El orden importa y es este.
    await this.auditar(
      'DESCARTE_PENDIENTE',
      guid,
      `tipo=${String(fila['tipo'])} payload=${String(fila['payload'])}`,
    );

    const r = await db.run(
      `DELETE FROM sync_queue WHERE guid = ? AND estado = 'PENDIENTE' AND acked_at IS NULL;`,
      [guid],
    );
    if ((r.changes?.changes ?? 0) === 0) {
      return { error: 'Ese registro ya no esta pendiente: puede que se haya enviado recien.' };
    }
    await this.database.persistir();
    await this.refrescarConteo();
    return { ok: true };
  }

  /**
   * Ultimos asientos de `sync_audit`, mas nuevos primero.
   *
   * Se expone en vez del handle de la base porque la auditoria es lo unico de
   * ahi que alguien de afuera necesita leer: los descartes, las purgas y los
   * fallos de envio. Devolver la conexion entera para eso seria abrir todo el
   * esquema local a cualquier pantalla.
   */
  async auditoriaReciente(limite = 50): Promise<
    { evento: string; guid: string | null; detalle: string | null; createdAt: string }[]
  > {
    await this.inicializado;
    const db = await this.database.abrir();
    const r = await db.query(
      `SELECT evento, guid, detalle, created_at FROM sync_audit
        ORDER BY id DESC LIMIT ?;`,
      [limite],
    );
    return ((r.values ?? []) as Record<string, unknown>[]).map((f) => ({
      evento: String(f['evento']),
      guid: f['guid'] == null ? null : String(f['guid']),
      detalle: f['detalle'] == null ? null : String(f['detalle']),
      createdAt: String(f['created_at']),
    }));
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
