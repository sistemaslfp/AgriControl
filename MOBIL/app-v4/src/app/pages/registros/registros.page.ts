import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import {
  AlertController,
  IonBackButton,
  IonButton,
  IonButtons,
  IonChip,
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
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
  cloudUploadOutline,
  refreshOutline,
  timeOutline,
  trashOutline,
} from 'ionicons/icons';

import { CatalogQueryService } from '../../core/catalog/catalog-query.service';
import { SyncQueueService } from '../../core/sync/sync-queue.service';
import { EstadoRegistro, RegistroColaVista, TipoRegistro } from '../../core/sync/sync.models';

/** Las dos mitades de la pantalla. */
export type Vista = 'pendientes' | 'enviados';

/** Un chip de modulo, con las dos cuentas: `AM 3/12`. */
export interface ChipTipo {
  tipo: TipoRegistro;
  etiqueta: string;
  pendientes: number;
  enviados: number;
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
    IonBackButton,
    IonButton,
    IonButtons,
    IonChip,
    IonContent,
    IonHeader,
    IonIcon,
    IonItem,
    IonLabel,
    IonList,
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
  private readonly alertas = inject(AlertController);

  readonly vista = signal<Vista>('pendientes');
  readonly cargando = signal(false);
  /**
   * TODAS las tarjetas, de las dos mitades.
   *
   * Se carga entero de una vez y no por pestana porque el chip de cada modulo
   * muestra las dos cuentas (`AM 3/12`): para eso hacen falta las dos mitades
   * a la vez. Es una consulta a una tabla local con, como mucho, unos miles de
   * filas; partirla en dos no compra nada y obligaria a recargar al cambiar de
   * pestana.
   */
  private readonly todas = signal<TarjetaRegistros[]>([]);
  /** null = todos los tipos. */
  readonly filtroTipo = signal<TipoRegistro | null>(null);

  /** Las de la pestana que se esta mirando. PENDIENTE y ENVIANDO van juntas. */
  readonly tarjetas = computed(() =>
    this.todas().filter((t) =>
      this.vista() === 'pendientes'
        ? t.estado === 'PENDIENTE' || t.estado === 'ENVIANDO'
        : t.estado === 'ENVIADO' || t.estado === 'RECHAZADO',
    ),
  );

  readonly conteo = this.cola.conteo;
  readonly enviando = this.cola.enviando;
  readonly online = this.cola.online;
  readonly proximoReintentoMs = this.cola.proximoReintentoMs;
  readonly ultimoError = this.cola.ultimoError;

  /**
   * Un chip POR MODULO, con las dos cuentas: `AM 3/12` = 3 pendientes y 12
   * enviados.
   *
   * Antes los chips salian de la pestana que se estaba mirando, asi que para
   * saber si a AM le faltaba enviar algo habia que cambiar de pestana. Como las
   * dos mitades ya comparten ventana, el chip comparte las dos cuentas: se ve
   * de un vistazo donde falta trabajo sin tocar nada.
   */
  readonly chips = computed<ChipTipo[]>(() => {
    const acc = new Map<TipoRegistro, { pendientes: number; enviados: number }>();
    for (const t of this.todas()) {
      const c = acc.get(t.tipo) ?? { pendientes: 0, enviados: 0 };
      const n = t.registros.length;
      if (t.estado === 'PENDIENTE' || t.estado === 'ENVIANDO') {
        c.pendientes += n;
      } else {
        c.enviados += n;
      }
      acc.set(t.tipo, c);
    }
    return [...acc.entries()]
      .map(([tipo, c]) => ({ tipo, etiqueta: this.etiquetaTipo(tipo), ...c }))
      .sort((a, b) => a.etiqueta.localeCompare(b.etiqueta));
  });

  readonly visibles = computed(() => {
    const f = this.filtroTipo();
    return f === null ? this.tarjetas() : this.tarjetas().filter((t) => t.tipo === f);
  });

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
    if (!this.online()) {
      return 'Sin conexión: se reintenta solo al volver.';
    }
    const ms = this.proximoReintentoMs();
    if (ms !== null) {
      const seg = Math.max(0, Math.round((ms - Date.now()) / 1000));
      return seg >= 60
        ? `Reintentando en ${Math.round(seg / 60)} min.`
        : `Reintentando en ${seg} s.`;
    }
    if (this.conteo().pendientes > 0) {
      return 'Pendiente de enviar.';
    }
    return 'Al día.';
  });

  constructor() {
    addIcons({
      alertCircleOutline,
      checkmarkCircleOutline,
      cloudUploadOutline,
      refreshOutline,
      timeOutline,
      trashOutline,
    });
  }

  async ngOnInit(): Promise<void> {
    const v = this.ruta.snapshot.queryParamMap.get('vista');
    this.vista.set(v === 'enviados' ? 'enviados' : 'pendientes');
    await this.cargar();
  }

  cambiarVista(v: Vista): void {
    // No recarga: `tarjetas` es un computed sobre lo ya cargado. Y el filtro de
    // modulo NO se limpia a proposito -- si alguien filtro por AM y cambia de
    // pestana, quiere ver los AM del otro lado, no todo de nuevo.
    this.vista.set(v);
  }

  filtrar(t: TipoRegistro | null): void {
    this.filtroTipo.set(this.filtroTipo() === t ? null : t);
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
   * Descarta un PENDIENTE que nunca llego al servidor.
   *
   * Se pide confirmacion nombrando la tarea, no solo "¿borrar?": el guid no le
   * dice nada a nadie y una confirmacion generica se acepta sin leer.
   */
  async descartar(t: TarjetaRegistros): Promise<void> {
    const n = t.registros.length;
    const alerta = await this.alertas.create({
      header: 'Descartar registro',
      message:
        `Se va a descartar ${n === 1 ? 'el registro' : `los ${n} registros`} de ` +
        `${t.lote} — ${t.labor}. Nunca llegaron al servidor, así que ` +
        `no quedan cargados en ningún lado. No se puede deshacer.`,
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
      const res = await this.cola.descartarPendiente(r.guid);
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
    const modulos = Array.isArray(p['modulo_ids'])
      ? [...(p['modulo_ids'] as unknown[])].map(String).sort().join(',')
      : '';
    // Un cierre PM no describe un trabajo propio: hereda el del AM que cierra,
    // y lo unico que lo identifica es a que AM apunta.
    if (r.tipo === 'pm') {
      return `${r.estado}|pm|${p['am_guid'] ?? r.guid}`;
    }
    return [
      r.estado,
      r.tipo,
      p['fecha_proceso'] ?? '',
      p['finca_id'] ?? '',
      p['responsable_id'] ?? '',
      p['cultivo_id'] ?? '',
      p['lote_id'] ?? '',
      p['subtarea_id'] ?? '',
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

      const loteId = Number(p['lote_id'] ?? 0);
      const subtareaId = Number(p['subtarea_id'] ?? 0);
      const lote = loteId > 0 ? await this.catalogo.lote(loteId) : null;
      const sub = subtareaId > 0 ? await this.catalogo.subtarea(subtareaId) : null;

      const moduloIds = Array.isArray(p['modulo_ids'])
        ? (p['modulo_ids'] as unknown[]).map(Number).filter((x) => x > 0)
        : [];
      const nombresMod = moduloIds.length > 0
        ? await this.catalogo.nombresModulo(moduloIds)
        : new Map<number, string>();

      const ids = registros
        .map((r) => Number(r.payload['personal_id'] ?? r.payload['trabajador_id'] ?? 0))
        .filter((x) => x > 0);
      const nombres = await this.catalogo.nombresPersonal(ids);
      // Si el catalogo no tiene a alguien --se descargo despues, o se dio de
      // baja-- se muestra "Trabajador 301" y no "#301": lo primero se entiende,
      // lo segundo parece un error de la app.
      const listaPersonas = ids.map((id) => nombres.get(id) ?? `Trabajador ${id}`);

      // Si las N filas se rechazaron por lo mismo, el motivo va una vez. Si
      // difieren, se dice cuantos motivos hay: esconder eso detras del primero
      // haria creer que se arregla con un solo cambio.
      const motivos = [...new Set(registros.map((r) => r.motivoRechazo).filter((m) => !!m))];
      const motivo =
        motivos.length === 0
          ? null
          : motivos.length === 1
            ? (motivos[0] as string)
            : `${motivos.length} motivos distintos: ${motivos.join(' · ')}`;

      salida.push({
        clave,
        estado: primero.estado,
        tipo: primero.tipo,
        registros,
        titulo: this.etiquetaTipo(primero.tipo),
        // `catalogo.lote()` ya devuelve el nombre pasado por `nombreLote()`, que
        // antepone "Lote" SOLO a los numericos. Volver a anteponerlo da
        // "Lote Lote 1" y, peor, "Lote Administrativos" -- justo lo que la
        // decision de los lotes con nombre prohibe.
        lote: [
          lote?.nombre,
          moduloIds.length > 0
            ? `Mód. ${moduloIds.map((m) => nombresMod.get(m) ?? String(m)).join(', ')}`
            : null,
        ]
          .filter((x) => !!x)
          .join(' · ') || 'Sin datos de catálogo',
        // La TAREA da el contexto que la subtarea sola no tiene: "Cosecha de
        // mazorca" puede colgar de mas de una tarea.
        labor: [sub?.tareaNombre, sub?.nombre].filter((x) => !!x).join(' / '),
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
