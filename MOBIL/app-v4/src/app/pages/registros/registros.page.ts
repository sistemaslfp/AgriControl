import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import {
  AlertController,
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonModal,
  IonNote,
  IonSegment,
  IonSegmentButton,
  IonSpinner,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  alertCircleOutline,
  checkmarkCircleOutline,
  chevronDownOutline,
  chevronForwardOutline,
  cloudUploadOutline,
  createOutline,
  refreshOutline,
  timeOutline,
  trashOutline,
} from 'ionicons/icons';

import { CatalogQueryService } from '../../core/catalog/catalog-query.service';
import {
  DetalleRegistroComponent,
  RegistroDetalleTarjeta,
} from '../../shared/detalle-registro.component';
import { SyncQueueService } from '../../core/sync/sync-queue.service';
import { EstadoRegistro, RegistroColaVista, TipoRegistro } from '../../core/sync/sync.models';

/**
 * Motivos de rechazo que NO se arreglan editando: hablan del estado del
 * servidor, no del payload. Volver a mandar lo mismo con otra hora o con otra
 * cantidad da el mismo rechazo, asi que la tarjeta solo ofrece descartar.
 */
const MOTIVOS_SIN_CORRECCION = [
  /ya fue cerrada/i,
  /se cierra desde la pantalla de cosecha/i,
  /no se paga por peso/i,
  /ya no existe: volve a traer/i,
];

/**
 * Pantalla que sabe retomar un rechazado de ese tipo. Los tipos que no estan
 * aqui todavia no tienen precarga: su tarjeta ofrece descartar y nada mas.
 */
const RUTA_CORRECCION: Partial<Record<TipoRegistro, string>> = {
  pm: '/pm',
  cosecha: '/cosecha',
};

/** Las dos mitades de la pantalla. */
export type Vista = 'pendientes' | 'enviados';

/**
 * Las cinco categorias de la lista (Kevin, 2026-09-28), en este orden. Los
 * cinco tipos `pc_*` son una sola: Poscosecha.
 */
export type Categoria = 'am' | 'pm' | 'cosecha' | 'poscosecha' | 'riego';
const CATEGORIAS: { cat: Categoria; etiqueta: string }[] = [
  { cat: 'am', etiqueta: 'AM' },
  { cat: 'pm', etiqueta: 'PM' },
  { cat: 'cosecha', etiqueta: 'Cosecha' },
  { cat: 'poscosecha', etiqueta: 'Poscosecha' },
  { cat: 'riego', etiqueta: 'Riego' },
];

export function categoriaDe(t: TipoRegistro): Categoria {
  return t === 'am' || t === 'pm' || t === 'cosecha' || t === 'riego' ? t : 'poscosecha';
}

/** Una categoria desplegable con sus tarjetas de la pestana actual. */
export interface SeccionRegistros {
  cat: Categoria;
  etiqueta: string;
  tarjetas: TarjetaRegistros[];
  registros: number;
  rechazados: number;
}

/**
 * Una tarjeta: los N registros de un mismo TRABAJO, en el mismo estado.
 * La clave exacta y su porque estan en `clave()`.
 */
export interface TarjetaRegistros {
  clave: string;
  estado: EstadoRegistro;
  tipo: TipoRegistro;
  registros: RegistroColaVista[];
  /**
   * Lo que identifica el trabajo en pantalla, todo resuelto contra los
   * catalogos: nunca un id ni un guid. El supervisor reconoce "Lote 1 · Mod. 02"
   * y "COSECHA / Cosecha de mazorca"; un `subtarea_id: 88` no le dice nada.
   */
  titulo: string;
  /** Lote y modulo, o el lote solo si no trabaja por modulos. */
  lote: string;
  /** Tarea y subtarea, separadas: la tarea da el contexto que faltaba. */
  labor: string;
  personas: string;
  fecha: string;
  /** Motivo del rechazo, ya unificado si las N filas fallaron por lo mismo. */
  motivo: string | null;
}

@Component({
  selector: 'app-registros',
  standalone: true,
  templateUrl: './registros.page.html',
  styleUrls: ['../am/am.page.scss'],
  imports: [
    DetalleRegistroComponent,
    IonBackButton,
    IonButton,
    IonButtons,
    IonContent,
    IonHeader,
    IonIcon,
    IonItem,
    IonLabel,
    IonList,
    IonModal,
    IonNote,
    IonSegment,
    IonSegmentButton,
    IonSpinner,
    IonTitle,
    IonToolbar,
  ],
})
export class RegistrosPage implements OnInit {
  private readonly cola = inject(SyncQueueService);
  private readonly catalogo = inject(CatalogQueryService);
  private readonly ruta = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly alertas = inject(AlertController);

  readonly vista = signal<Vista>('pendientes');
  readonly cargando = signal(false);
  /**
   * TODAS las tarjetas, de las dos mitades.
   *
   * Se carga entero de una vez y no por pestana: los contadores del segmento
   * necesitan las dos mitades. Es una consulta a una tabla local con, como
   * mucho, unos miles de filas; partirla no compra nada.
   */
  private readonly todas = signal<TarjetaRegistros[]>([]);
  /**
   * Lo que el usuario abrio o cerro a mano, por pestana. Lo que no toco sigue
   * la regla de `abierta()`.
   */
  private readonly toques = signal<Record<Vista, Partial<Record<Categoria, boolean>>>>({
    pendientes: {},
    enviados: {},
  });
  /**
   * La tarjeta abierta en Detalle Registro, o null si la ventana esta
   * cerrada. Guarda la tarjeta entera y no el guid: Detalle Registro pinta
   * de la misma tarjeta que ya esta en pantalla, sin volver a consultar la
   * cola.
   */
  readonly detalleTarjeta = signal<RegistroDetalleTarjeta | null>(null);

  /** Las de la pestana que se esta mirando. PENDIENTE y ENVIANDO van juntas. */
  readonly tarjetas = computed(() =>
    this.todas().filter((t) =>
      this.vista() === 'pendientes'
        ? t.estado === 'PENDIENTE' || t.estado === 'ENVIANDO'
        : t.estado === 'ENVIADO' || t.estado === 'RECHAZADO',
    ),
  );

  /**
   * Las cuentas de las pestanas, DERIVADAS de las mismas tarjetas que se
   * muestran.
   *
   * Antes salian de `cola.conteo()`, que cuenta filas de sync_queue por estado,
   * y el segmento decia "ENVIADOS (0)" mientras el chip decia "0/3": el
   * contador sumaba solo `enviados` e ignoraba `rechazados`, que viven en esta
   * misma pestana. Dos fuentes para la misma cuenta terminan discrepando
   * siempre; ahora hay una.
   *
   * Un RECHAZADO cuenta del lado de "Enviados" porque es la pestana donde esta
   * --llego al servidor, el servidor lo refuso-- pero ademas se cuenta aparte:
   * es el unico estado que necesita que alguien haga algo, y esconderlo dentro
   * de "enviados" lo vuelve invisible.
   */
  readonly cuentas = computed(() => {
    let pendientes = 0;
    let enviados = 0;
    let rechazados = 0;
    for (const t of this.todas()) {
      const n = t.registros.length;
      if (t.estado === 'PENDIENTE' || t.estado === 'ENVIANDO') {
        pendientes += n;
      } else if (t.estado === 'RECHAZADO') {
        rechazados += n;
        enviados += n;
      } else {
        enviados += n;
      }
    }
    return { pendientes, enviados, rechazados };
  });

  readonly enviando = this.cola.enviando;
  /** `false` = probado y no contesta. `null` = todavía no se probó. */
  readonly servidorAlcanzable = this.cola.servidorAlcanzable;
  /** Qué interfaz está usando el proceso. Solo para explicar el fallo. */
  readonly red = this.cola.red;
  readonly proximoReintentoMs = this.cola.proximoReintentoMs;
  readonly ultimoError = this.cola.ultimoError;

  readonly secciones = computed<SeccionRegistros[]>(() =>
    CATEGORIAS.map(({ cat, etiqueta }) => {
      const tarjetas = this.tarjetas().filter((t) => categoriaDe(t.tipo) === cat);
      return {
        cat,
        etiqueta,
        tarjetas,
        registros: tarjetas.reduce((a, t) => a + t.registros.length, 0),
        rechazados: tarjetas
          .filter((t) => t.estado === 'RECHAZADO')
          .reduce((a, t) => a + t.registros.length, 0),
      };
    }).filter((x) => x.tarjetas.length > 0),
  );

  /**
   * Plegada por defecto. Se abre sola si es la unica categoria de la pestana
   * (plegarla no ordena nada) o si tiene rechazados: es lo unico que pide que
   * alguien haga algo.
   */
  abierta(s: SeccionRegistros): boolean {
    const tocada = this.toques()[this.vista()][s.cat];
    if (tocada !== undefined) {
      return tocada;
    }
    return this.secciones().length === 1 || s.rechazados > 0;
  }

  alternar(s: SeccionRegistros): void {
    const v = this.vista();
    const todas = this.toques();
    this.toques.set({ ...todas, [v]: { ...todas[v], [s.cat]: !this.abierta(s) } });
  }

  /**
   * Estado de la cola en una frase, que es lo que el supervisor mira primero.
   *
   * Reemplaza al "Proxima Sincronizacion: 09:05:48" de la app vieja, que
   * mostraba una hora ya pasada porque el temporizador se colgaba: una hora
   * fija no puede decir la verdad si el envio se atasco.
   */
  readonly estadoCola = computed(() => {
    if (this.enviando()) {
      return 'Enviando…';
    }
    // "No hay internet" ya no es la pregunta: la finca no tiene internet y no
    // lo necesita. La pregunta es si contesta NUESTRO servidor, y cuando no
    // contesta hay que decir qué mirar — el supervisor no puede hacer nada
    // con un ícono de nube tachada.
    if (this.servidorAlcanzable() === false) {
      return this.red().transporte === 'celular'
        ? 'No se alcanza el servidor: el teléfono está en datos móviles. ' +
          'Conectate al WiFi de la finca.'
        : 'No se alcanza el servidor: revisa el WiFi de la finca. Se reintenta solo.';
    }
    const ms = this.proximoReintentoMs();
    if (ms !== null) {
      const seg = Math.max(0, Math.round((ms - Date.now()) / 1000));
      return seg >= 60
        ? `Reintentando en ${Math.round(seg / 60)} min.`
        : `Reintentando en ${seg} s.`;
    }
    if (this.cuentas().pendientes > 0) {
      return 'Pendiente de enviar.';
    }
    return 'Al día.';
  });

  constructor() {
    addIcons({
      alertCircleOutline,
      checkmarkCircleOutline,
      chevronDownOutline,
      chevronForwardOutline,
      cloudUploadOutline,
      createOutline,
      refreshOutline,
      timeOutline,
      trashOutline,
    });
  }

  async ngOnInit(): Promise<void> {
    const v = this.ruta.snapshot.queryParamMap.get('vista');
    this.vista.set(v === 'enviados' ? 'enviados' : 'pendientes');
    await this.cargar();
    // Sondeo al abrir: el cartel tiene que decir la verdad de AHORA, no la del
    // último envío, que pudo haber sido ayer en otro lote de la finca.
    void this.cola.sondear();
  }

  cambiarVista(v: Vista): void {
    // No recarga: `tarjetas` es un computed sobre lo ya cargado.
    this.vista.set(v);
  }

  /**
   * Abre Detalle Registro con la tarjeta tocada. No vuelve a resolver nada
   * contra el catalogo: pinta el payload tal cual esta guardado.
   */
  abrirDetalle(t: TarjetaRegistros): void {
    this.detalleTarjeta.set(t);
  }

  cerrarDetalle(): void {
    this.detalleTarjeta.set(null);
  }

  // ------------------------------------------------------------------

  async cargar(): Promise<void> {
    this.cargando.set(true);
    // PENDIENTE y ENVIANDO caen los dos en "Pendientes": para el supervisor las
    // dos cosas son "todavia no llego", y separarlas obligaria a mirar en dos
    // lados por un estado que dura segundos. La tarjeta si distingue cual es.
    const filas = await this.cola.listar(['PENDIENTE', 'ENVIANDO', 'ENVIADO', 'RECHAZADO']);
    this.todas.set(await this.agrupar(filas));
    this.cargando.set(false);
  }

  async sincronizar(): Promise<void> {
    await this.cola.flush('manual desde Registros', true);
    await this.cargar();
  }

  /**
   * ¿Esta tarjeta se puede retomar en la pantalla de su modulo?
   *
   * Dos condiciones: que el tipo tenga pantalla con precarga, y que el motivo
   * no sea uno de los que hablan del servidor y no del payload.
   */
  corregible(t: TarjetaRegistros): boolean {
    if (t.estado !== 'RECHAZADO' || !RUTA_CORRECCION[t.tipo]) {
      return false;
    }
    const motivo = t.motivo ?? '';
    return !MOTIVOS_SIN_CORRECCION.some((re) => re.test(motivo));
  }

  /**
   * Abre la pantalla del modulo con los datos del rechazado ya cargados. Los
   * guids viajan en la URL porque la pantalla destino se monta de cero.
   */
  async corregir(t: TarjetaRegistros): Promise<void> {
    const destino = RUTA_CORRECCION[t.tipo];
    if (!destino) {
      return;
    }
    await this.router.navigate([destino], {
      queryParams: { corregir: t.registros.map((r) => r.guid).join(',') },
    });
  }

  /**
   * Descarta un PENDIENTE que nunca llego al servidor.
   *
   * Se pide confirmacion nombrando la tarea, no solo "¿borrar?": el guid no le
   * dice nada a nadie y una confirmacion generica se acepta sin leer.
   */
  async descartar(t: TarjetaRegistros): Promise<void> {
    const n = t.registros.length;
    const rechazado = t.estado === 'RECHAZADO';
    const alerta = await this.alertas.create({
      header: 'Descartar registro',
      message:
        `Se va a descartar ${n === 1 ? 'el registro' : `los ${n} registros`} de ` +
        `${t.lote} — ${t.labor}. ` +
        (rechazado
          ? 'El servidor los rechazó, así que no quedaron cargados allá. '
          : 'Nunca llegaron al servidor, así que no quedan cargados en ningún lado. ') +
        'No se puede deshacer.',
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        { text: 'Descartar', role: 'destructive' },
      ],
    });
    await alerta.present();
    const { role } = await alerta.onDidDismiss();
    if (role !== 'destructive') {
      return;
    }

    const fallos: string[] = [];
    for (const r of t.registros) {
      const res = rechazado
        ? await this.cola.descartarRechazado(r.guid)
        : await this.cola.descartarPendiente(r.guid);
      if ('error' in res) {
        fallos.push(res.error);
      }
    }
    await this.cargar();
    if (fallos.length > 0) {
      const aviso = await this.alertas.create({
        header: 'No se descartó todo',
        message: fallos[0],
        buttons: ['Entendido'],
      });
      await aviso.present();
    }
  }

  // ------------------------------------------------------------------
  // Armado de las tarjetas
  // ------------------------------------------------------------------

  /**
   * Identidad de la tarjeta: el TRABAJO, no el `captura_guid`.
   *
   * Misma decision y mismo motivo que en la pantalla PM: dos personas puestas
   * en la misma subtarea del mismo lote pero cargadas como dos tareas del
   * formulario daban dos tarjetas identicas, imposibles de distinguir. Son el
   * mismo trabajo. `captura_guid` dice que filas salieron del mismo formulario
   * --sirve para rastrear-- y no que trabajo es cual.
   *
   * Aca SI entran fecha y finca, al reves que en el PM: esta lista cruza dias y
   * fincas, asi que sin ellas se fundiria la misma subtarea de dos dias.
   *
   * El ESTADO entra a proposito: el ACK es por registro, asi que un AM de tres
   * personas puede terminar con dos ENVIADOS y una RECHAZADA. Si el estado no
   * separara, la tarjeta tendria que mostrar dos estados a la vez y mentiria en
   * cualquiera de los dos.
   */
  private clave(r: RegistroColaVista): string {
    const p = r.payload;
    const m = r.meta;
    // Un cierre PM no describe un trabajo propio: hereda el del AM que cierra,
    // y lo unico que lo identifica es a que AM apunta.
    if (r.tipo === 'pm') {
      return `${r.estado}|pm|${p['am_guid'] ?? r.guid}`;
    }
    // Los pc_* cuelgan todos de una partida: `proceso_guid` en el payload
    // (o el guid propio para pc_proceso, que ES la partida). Agrupar por eso
    // es lo que de verdad los identifica -- y a diferencia de lote_id o
    // subtarea_id, que estos tipos nunca mandan, `proceso_guid` SI viaja.
    // Sin esto, todos los pc_etapa (o pc_calidad_*) de un mismo estado
    // colapsaban en una sola tarjeta sin importar de que partida eran.
    if (r.tipo.startsWith('pc_')) {
      const proceso = r.tipo === 'pc_proceso' ? r.guid : (p['proceso_guid'] ?? r.guid);
      const etapa = m?.etapa ?? p['etapa'] ?? '';
      return [r.estado, r.tipo, proceso, etapa].join('|');
    }
    // Riego manda `modulo_id` en singular --su tabla guarda uno solo-- y el
    // resto `modulo_ids`. Sin contemplar los dos, los N modulos de un mismo
    // lote caian en una sola tarjeta y el parte parecia la mitad de lo que es.
    const modulosPayload = Array.isArray(p['modulo_ids'])
      ? [...(p['modulo_ids'] as unknown[])].map(String).sort().join(',')
      : p['modulo_id'] != null
        ? String(p['modulo_id'])
        : '';
    // Cosecha (como PM) no manda lote_id/subtarea_id/modulo_ids: el servidor
    // los deriva del AM que cierra. Sin `meta`, esos campos vienen vacios de
    // TODOS los registros del mismo tipo y estado, y todo colapsa en una
    // tarjeta con el lote en "Sin datos de catálogo". Con `meta` (guardada en
    // `guardar()` desde `c.asignacion`) se agrupa por el trabajo real; las
    // filas viejas sin `meta` caen al payload, que es lo que había antes.
    const loteId = m?.loteId ?? p['lote_id'] ?? '';
    const subtareaId = m?.subtareaId ?? p['subtarea_id'] ?? '';
    const modulos = m?.modulos ?? modulosPayload;
    return [
      r.estado,
      r.tipo,
      p['fecha_proceso'] ?? '',
      p['finca_id'] ?? '',
      p['responsable_id'] ?? '',
      p['cultivo_id'] ?? '',
      loteId,
      subtareaId,
      modulos,
    ].join('|');
  }

  private async agrupar(filas: RegistroColaVista[]): Promise<TarjetaRegistros[]> {
    const porClave = new Map<string, RegistroColaVista[]>();
    for (const r of filas) {
      const k = this.clave(r);
      const ya = porClave.get(k);
      if (ya) {
        ya.push(r);
      } else {
        porClave.set(k, [r]);
      }
    }

    const salida: TarjetaRegistros[] = [];
    for (const [clave, registros] of porClave) {
      const primero = registros[0];
      const p = primero.payload;
      const m = primero.meta;

      // Con `meta` el lote/subtarea/modulos ya vinieron resueltos desde
      // `c.asignacion` al guardar: no hace falta ir al catalogo, y de hecho
      // no se podria -- cosecha y PM no mandan lote_id/subtarea_id en el
      // payload. Sin `meta` (filas viejas) se resuelve como antes.
      const loteId = Number(m?.loteId ?? p['lote_id'] ?? 0);
      const subtareaId = Number(m?.subtareaId ?? p['subtarea_id'] ?? 0);
      const lote = m?.lote ? null : loteId > 0 ? await this.catalogo.lote(loteId) : null;
      const sub = m?.subtarea ? null : subtareaId > 0 ? await this.catalogo.subtarea(subtareaId) : null;

      const moduloIds = Array.isArray(p['modulo_ids'])
        ? (p['modulo_ids'] as unknown[]).map(Number).filter((x) => x > 0)
        : p['modulo_id'] != null
          ? [Number(p['modulo_id'])].filter((x) => x > 0)
          : [];
      const nombresMod = !m?.modulos && moduloIds.length > 0
        ? await this.catalogo.nombresModulo(moduloIds)
        : new Map<number, string>();

      // En riego no hay trabajador: el parte lo entrega el supervisor, y es el
      // unico nombre que la tarjeta puede mostrar.
      const ids = registros
        .map((r) =>
          Number(
            r.payload['personal_id'] ??
              r.payload['trabajador_id'] ??
              r.payload['supervisor_id'] ??
              0,
          ),
        )
        .filter((x) => x > 0);
      const nombres = await this.catalogo.nombresPersonal(ids);
      // Si el catalogo no tiene a alguien --se descargo despues, o se dio de
      // baja-- se muestra "Trabajador 301" y no "#301": lo primero se entiende,
      // lo segundo parece un error de la app.
      const listaPersonas = ids.map((id) => nombres.get(id) ?? `Trabajador ${id}`);

      // Si las N filas se rechazaron por lo mismo, el motivo va una vez. Si
      // difieren, se dice cuantos motivos hay: esconder eso detras del primero
      // haria creer que se arregla con un solo cambio.
      const motivos = [...new Set(registros.map((r) => r.motivoRechazo).filter((m2) => !!m2))];
      const motivo =
        motivos.length === 0
          ? null
          : motivos.length === 1
            ? (motivos[0] as string)
            : `${motivos.length} motivos distintos: ${motivos.join(' · ')}`;

      // `catalogo.lote()` ya devuelve el nombre pasado por `nombreLote()`, que
      // antepone "Lote" SOLO a los numericos. Volver a anteponerlo da
      // "Lote Lote 1" y, peor, "Lote Administrativos" -- justo lo que la
      // decision de los lotes con nombre prohibe.
      let loteTexto: string;
      if (m && (m.lote || m.modulos)) {
        loteTexto =
          [m.lote, m.modulos ? `Mód. ${m.modulos}` : null].filter((x) => !!x).join(' · ') ||
          'Sin datos de catálogo';
      } else if (m && 'lotCode' in m) {
        // Postcosecha: la tarjeta es la lectura humana de la partida, no del
        // lote agricola -- una partida junta cosechas de varios lotes.
        loteTexto = m.lotCode ? `Partida ${m.lotCode}` : 'Pendiente de número';
      } else {
        loteTexto =
          [
            lote?.nombre,
            moduloIds.length > 0
              ? `Mód. ${moduloIds.map((x) => nombresMod.get(x) ?? String(x)).join(', ')}`
              : null,
          ]
            .filter((x) => !!x)
            .join(' · ') || 'Sin datos de catálogo';
      }

      // La TAREA da el contexto que la subtarea sola no tiene: "Cosecha de
      // mazorca" puede colgar de mas de una tarea. Riego no tiene subtarea
      // --las columnas de v3 estan muertas-- y lo que lo describe es el
      // tiempo regado. Postcosecha no tiene subtarea agricola: lo que la
      // identifica es en que paso del proceso esta.
      let laborTexto: string;
      if (primero.tipo === 'riego') {
        laborTexto = this.tiempoRiego(p['tiempo_riego_min']);
      } else if (m?.subtarea) {
        laborTexto = m.subtarea;
      } else if (primero.tipo.startsWith('pc_')) {
        laborTexto = this.etiquetaPostcosecha(primero.tipo, String(m?.etapa ?? p['etapa'] ?? ''));
      } else {
        laborTexto = [sub?.tareaNombre, sub?.nombre].filter((x) => !!x).join(' / ');
      }

      salida.push({
        clave,
        estado: primero.estado,
        tipo: primero.tipo,
        registros,
        titulo: this.etiquetaTipo(primero.tipo),
        lote: loteTexto,
        labor: laborTexto,
        personas:
          listaPersonas.length === 0
            ? ''
            : listaPersonas.length <= 2
              ? listaPersonas.join(', ')
              : `${listaPersonas[0]} y ${listaPersonas.length - 1} más`,
        fecha: String(p['fecha_proceso'] ?? p['hora_cierre'] ?? primero.createdAtDevice).slice(
          0,
          16,
        ),
        motivo,
      });
    }
    return salida;
  }

  /** Como se describe cada paso de postcosecha en la tarjeta. */
  private etiquetaPostcosecha(tipo: TipoRegistro, etapa: string): string {
    switch (tipo) {
      case 'pc_proceso':
        return 'Pesaje inicial';
      case 'pc_etapa':
        return etapa ? `Etapa: ${etapa}` : 'Etapa';
      case 'pc_calidad_ferm':
        return 'Corte de grano (fermentado)';
      case 'pc_calidad_sec':
        return etapa ? `Análisis de secado: ${etapa}` : 'Análisis de secado';
      case 'pc_resultado':
        return 'Cierre (peso final)';
      default:
        return this.etiquetaTipo(tipo);
    }
  }

  /** Minutos -> '01:30 de riego'. Vacio si el payload no lo trae. */
  private tiempoRiego(valor: unknown): string {
    const min = Number(valor ?? 0);
    if (!Number.isFinite(min) || min <= 0) {
      return '';
    }
    const h = Math.floor(min / 60);
    const m = min % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')} de riego`;
  }

  etiquetaTipo(t: TipoRegistro): string {
    switch (t) {
      case 'am':
        return 'AM';
      case 'pm':
        return 'PM';
      case 'cosecha':
        return 'Cosecha';
      case 'riego':
        return 'Riego';
      default:
        return 'Poscosecha';
    }
  }

  /** Icono e intencion por estado. Tres estados, tres indicadores. */
  iconoDe(e: EstadoRegistro): string {
    switch (e) {
      case 'ENVIANDO':
        return 'cloud-upload-outline';
      case 'ENVIADO':
        return 'checkmark-circle-outline';
      case 'RECHAZADO':
        return 'alert-circle-outline';
      default:
        return 'time-outline';
    }
  }

  colorDe(e: EstadoRegistro): string {
    switch (e) {
      case 'ENVIANDO':
        return 'primary';
      case 'ENVIADO':
        return 'success';
      case 'RECHAZADO':
        return 'danger';
      default:
        return 'medium';
    }
  }

  textoDe(e: EstadoRegistro): string {
    switch (e) {
      case 'ENVIANDO':
        return 'Enviando';
      case 'ENVIADO':
        return 'Enviado';
      case 'RECHAZADO':
        return 'Rechazado';
      default:
        return 'Pendiente';
    }
  }
}
