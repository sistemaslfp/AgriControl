import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonDatetime,
  IonDatetimeButton,
  IonFooter,
  IonHeader,
  IonIcon,
  IonInput,
  IonItem,
  IonLabel,
  IonList,
  IonModal,
  IonNote,
  IonTitle,
  IonToolbar,
  ToastController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  addOutline,
  cloudUploadOutline,
  createOutline,
  personOutline,
  trashOutline,
  waterOutline,
} from 'ionicons/icons';

import { AppConfigService } from '../../core/config/app-config.service';
import { BootstrapService } from '../../core/bootstrap/bootstrap.service';
import { CatalogQueryService, OpcionCatalogo } from '../../core/catalog/catalog-query.service';
import { ClockService } from '../../core/clock/clock.service';
import { FechaService } from '../../core/captura/fecha.service';
import { SyncQueueService } from '../../core/sync/sync-queue.service';
import { SelectorComponent } from '../../shared/selector.component';
import {
  RetroactivoComponent,
  justificacionParaEnviar,
  problemasRetroactivo,
} from '../../shared/retroactivo.component';

interface Ref {
  id: number;
  nombre: string;
}

/** Una fila del registro: un lote (y su módulo) regado por un tiempo. */
export interface FilaRiego {
  /** Correlativo local. No viaja: es la identidad de la fila en pantalla. */
  n: number;
  loteId: number;
  lote: string;
  moduloId: number | null;
  modulo: string;
  minutos: number;
  /** null = no se cargó. Viaja como 0, que es lo que hay en el 99,98 % de v3. */
  volumen: number | null;
  observaciones: string;
}

/**
 * Los seis tiempos que cubren el 94,6 % de los partes.
 *
 * No es una preferencia de diseño: sobre las **9.778 filas de `z_riego`** hay
 * 34 duraciones distintas y estas seis son 9.246 de ellas —01:00 sale 3.839
 * veces—. El resto se carga a mano.
 */
const TIEMPOS_FRECUENTES = [30, 45, 60, 90, 120, 150];

/** Más de esto en una sola fila es casi siempre un dedazo: el máximo de v3 es 4 h. */
const MINUTOS_SOSPECHOSOS = 360;

/**
 * Riego — la BITÁCORA del agua, no un cierre de tareas.
 *
 * Kevin, 2026-09-03: *"Las tareas de riego AM son para el personal, estas se
 * cierran en PM. En riego únicamente se registran los tiempos, volumen, etc."*
 * Por eso esta pantalla **no lee tareas AM, no elige trabajador y no cierra
 * nada**: el AM/PM paga el jornal de la persona, acá se anota cuánta agua fue
 * a qué lote y por cuánto tiempo. Los dos lados no tienen enlace y eso está
 * decidido así (02-bd-y-api.md §Riego).
 *
 * **Un parte son 18-25 filas** (mediana 18 sobre 382 partes de `z_riego`, con
 * un máximo de 900). Por eso la carga es por LOTE con varios módulos de una
 * vez: elegir lote, marcar los módulos regados y poner el tiempo genera las N
 * filas de golpe, y después cada una se corrige sola. Copiar el formulario de
 * v3 —una pasada por fila— eran 25 formularios por parte.
 *
 * **Sin tarea ni subtarea** (Kevin, 2026-09-08): en las 9.778 filas de v3
 * `codigo_tarea` y `codigo_subtarea` valen '0'. Columnas muertas, no se
 * resucitan.
 */
@Component({
  selector: 'app-riego',
  standalone: true,
  templateUrl: './riego.page.html',
  styleUrls: ['../am/am.page.scss', './riego.page.scss'],
  imports: [
    SelectorComponent,
    RetroactivoComponent,
    IonBackButton,
    IonButton,
    IonButtons,
    IonContent,
    IonDatetime,
    IonDatetimeButton,
    IonFooter,
    IonHeader,
    IonIcon,
    IonInput,
    IonItem,
    IonLabel,
    IonList,
    IonModal,
    IonNote,
    IonTitle,
    IonToolbar,
  ],
})
export class RiegoPage implements OnInit {
  private readonly catalogo = inject(CatalogQueryService);
  private readonly fechas = inject(FechaService);
  private readonly bootstrap = inject(BootstrapService);
  private readonly cola = inject(SyncQueueService);
  private readonly clock = inject(ClockService);
  private readonly config = inject(AppConfigService);
  private readonly toast = inject(ToastController);
  private readonly router = inject(Router);

  readonly tiemposFrecuentes = TIEMPOS_FRECUENTES;

  // --- Encabezado del registro ---
  readonly fecha = signal('');
  /** Hora real en que arrancó el riego. Es la que viaja en `fecha_proceso`. */
  readonly horaInicio = signal('');
  readonly finca = signal<Ref | null>(null);
  readonly supervisor = signal<Ref | null>(null);

  // --- Borrador: lo que se está por agregar ---
  readonly lote = signal<Ref | null>(null);
  readonly loteTieneModulos = signal(false);
  readonly modulos = signal<Ref[]>([]);
  readonly minutos = signal(60);

  // --- El registro ---
  readonly filas = signal<FilaRiego[]>([]);
  readonly editando = signal<number | null>(null);
  readonly guardando = signal(false);

  private siguienteN = 1;
  private lotes: (OpcionCatalogo & { tieneModulos: boolean; raw: string })[] = [];
  private fincas: OpcionCatalogo[] = [];

  // --- Selector ---
  readonly selectorAbierto = signal(false);
  readonly selectorTitulo = signal('');
  readonly selectorOpciones = signal<OpcionCatalogo[]>([]);
  readonly selectorSeleccion = signal<number[]>([]);
  readonly selectorVacio = signal('No hay opciones para elegir.');
  readonly selectorBuscador = signal<boolean | null>(null);
  readonly selectorMultiple = signal(false);
  private destino: 'finca' | 'supervisor' | 'lote' | 'modulos' | null = null;
  readonly alturaSelector = computed(() => {
    const opciones = this.selectorOpciones();
    const n = Math.min(opciones.length, 12);
    const conDetalle = opciones.some((o) => !!o.detalle);
    const buscador = this.selectorBuscador() ?? opciones.length > 10;
    return `${56 + (buscador ? 60 : 0) + (this.selectorMultiple() ? 44 : 0) +
      Math.max(n, 1) * (conDetalle ? 66 : 49) + 6}px`;
  });

  // Modo libre (Kevin, 2026-09-14). En riego importa mas que en ningun otro
  // modulo: un parte son 18-25 filas y cargarlo entero atrasado es normal.
  readonly retroactivo = signal(false);
  readonly justificacion = signal('');
  readonly limites = computed(() => this.fechas.limites('riego', this.retroactivo()));
  readonly evaluacion = computed(() =>
    this.fecha() && this.horaInicio()
      ? this.fechas.evaluar('riego', `${this.fecha()}T${this.horaInicio()}:00`)
      : null,
  );
  readonly sinHoraVerificada = computed(() => this.clock.offsetSeconds() === null);

  // ------------------------------------------------------------------
  // Totales, avisos y bloqueos
  // ------------------------------------------------------------------

  readonly totalMinutos = computed(() =>
    this.filas().reduce((a, f) => a + f.minutos, 0),
  );

  /** Minutos desde medianoche del inicio más todo lo regado. Puede pasar de 1440. */
  private readonly finEnMinutos = computed(() => {
    const i = this.aMinutos(this.horaInicio());
    return i === null ? null : i + this.totalMinutos();
  });

  /** El fin no se guarda: `reg_riego` no tiene columna y sale de inicio + tiempos. */
  readonly finCalculado = computed(() => {
    const t = this.finEnMinutos();
    if (t === null) return '';
    const dias = Math.floor(t / 1440);
    return `${this.hhmm(((t % 1440) + 1440) % 1440)}${dias > 0 ? ` (+${dias} d)` : ''}`;
  });

  readonly resumenModulos = computed(() => {
    const m = this.modulos();
    if (m.length === 0) {
      return this.loteTieneModulos() ? 'Sin elegir' : 'Este lote no tiene módulos';
    }
    return m.length <= 3
      ? m.map((x) => x.nombre).join(', ')
      : `${m.length} módulos`;
  });

  /** Lo que impide AGREGAR una fila, no lo que impide guardar el registro. */
  readonly problemasFila = computed(() => {
    const p: string[] = [];
    if (!this.finca()) p.push('Elige primero la finca.');
    if (!this.lote()) p.push('Falta el lote.');
    if (this.loteTieneModulos() && this.modulos().length === 0) {
      p.push('Elige al menos un módulo de ese lote.');
    }
    if (this.minutos() <= 0) p.push('Falta el tiempo de riego.');
    return p;
  });

  readonly puedeAgregar = computed(() => this.problemasFila().length === 0);

  readonly problemas = computed(() => {
    const p: string[] = [];
    if (!this.fecha()) p.push('Falta la fecha del riego.');
    if (!this.horaInicio()) p.push('Falta la hora de inicio del riego.');
    if (!this.finca()) p.push('Falta la finca.');
    if (!this.supervisor()) p.push('Falta el supervisor que entrega el registro.');
    if (this.filas().length === 0) p.push('El registro no tiene ningún riego cargado.');
    if (this.filas().some((f) => f.minutos <= 0)) {
      p.push('Hay filas sin tiempo de riego.');
    }
    p.push(...problemasRetroactivo(this.evaluacion(), this.retroactivo(), this.justificacion()));
    return p;
  });

  readonly puedeGuardar = computed(() => this.problemas().length === 0 && !this.guardando());

  /**
   * Avisos que NO bloquean.
   *
   * Regar dos veces el mismo módulo en un día pasa de verdad --1.086 de 6.211
   * combinaciones (fecha, finca, lote, módulo) de v3 tienen más de una fila--
   * así que esto se avisa y no se prohíbe. Lo que el aviso ataja es la doble
   * carga a mano, que es el único duplicado que la base no puede impedir: los
   * guid son únicos, pero dos filas tecleadas dos veces son dos filas legítimas
   * para el servidor.
   */
  readonly avisos = computed(() => {
    const a: string[] = [];
    const vistos = new Map<string, number>();
    for (const f of this.filas()) {
      const k = `${f.loteId}|${f.moduloId ?? 0}`;
      vistos.set(k, (vistos.get(k) ?? 0) + 1);
    }
    for (const f of this.filas()) {
      const k = `${f.loteId}|${f.moduloId ?? 0}`;
      if ((vistos.get(k) ?? 0) > 1) {
        vistos.set(k, 0);
        a.push(`${this.etiqueta(f)} está cargado más de una vez: revisa que no sea repetido.`);
      }
    }
    for (const f of this.filas()) {
      if (f.minutos > MINUTOS_SOSPECHOSOS) {
        a.push(`${this.etiqueta(f)} lleva ${this.hhmm(f.minutos)}: el riego más largo de la historia es 04:00.`);
      }
    }
    return a;
  });

  constructor() {
    addIcons({
      addOutline,
      cloudUploadOutline,
      createOutline,
      personOutline,
      trashOutline,
      waterOutline,
    });
  }

  async ngOnInit(): Promise<void> {
    await this.config.cargar();
    await this.bootstrap.cargar();
    this.fecha.set(this.fechas.ahoraLocal().slice(0, 10));
    this.horaInicio.set(this.fechas.ahoraLocal().slice(11, 16));
    this.fincas = await this.catalogo.fincas();
    const porDefecto = this.config.defaultFincaId();
    const f =
      (porDefecto !== null ? this.fincas.find((x) => x.id === porDefecto) : undefined) ??
      (this.fincas.length === 1 ? this.fincas[0] : undefined);
    if (f) {
      this.finca.set({ id: f.id, nombre: f.nombre });
      await this.cargarLotes();
    }
  }

  private async cargarLotes(): Promise<void> {
    const f = this.finca();
    this.lotes = f ? await this.catalogo.lotesDeFinca(f.id) : [];
  }

  // ------------------------------------------------------------------
  // Formato
  // ------------------------------------------------------------------

  /** Minutos -> 'HH:MM'. El registro se lee en horas, no en minutos sueltos. */
  hhmm(min: number): string {
    const h = Math.floor(min / 60);
    const m = min % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  /** 'HH:MM' -> minutos desde medianoche. null si no es una hora. */
  private aMinutos(hhmm: string): number | null {
    const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
  }

  /** `ion-datetime` devuelve 'HH:mm' o un ISO entero según cómo se le pasó el valor. */
  private hhmmDe(valor: unknown): string | null {
    const m = /(\d{2}):(\d{2})/.exec(String(valor ?? ''));
    return m ? `${m[1]}:${m[2]}` : null;
  }

  etiqueta(f: FilaRiego): string {
    return f.modulo ? `${f.lote} · ${f.modulo}` : f.lote;
  }

  // ------------------------------------------------------------------
  // Encabezado
  // ------------------------------------------------------------------

  async setFecha(valor: string | string[] | null | undefined): Promise<void> {
    if (typeof valor === 'string' && valor) {
      this.fecha.set(valor.slice(0, 10));
    }
  }

  setHoraInicio(valor: string | string[] | null | undefined): void {
    const h = this.hhmmDe(valor);
    if (h) this.horaInicio.set(h);
  }

  abrirFinca(): void {
    this.destino = 'finca';
    this.selectorTitulo.set('Finca');
    this.selectorOpciones.set(this.fincas);
    this.selectorSeleccion.set(this.finca() ? [this.finca()!.id] : []);
    this.selectorVacio.set('Descarga los maestros.');
    this.selectorBuscador.set(null);
    this.selectorMultiple.set(false);
    this.selectorAbierto.set(true);
  }

  async abrirSupervisor(): Promise<void> {
    const f = this.finca();
    this.destino = 'supervisor';
    this.selectorTitulo.set('Supervisor');
    this.selectorOpciones.set(await this.catalogo.responsables(f ? f.id : null));
    this.selectorSeleccion.set(this.supervisor() ? [this.supervisor()!.id] : []);
    this.selectorVacio.set('Descarga los maestros: no hay supervisores en este equipo.');
    this.selectorBuscador.set(false);
    this.selectorMultiple.set(false);
    this.selectorAbierto.set(true);
  }

  abrirLote(): void {
    if (!this.finca()) {
      void this.aviso('Elige primero la finca: los lotes son de una finca.');
      return;
    }
    this.destino = 'lote';
    this.selectorTitulo.set('Lote');
    this.selectorOpciones.set(this.lotes);
    this.selectorSeleccion.set(this.lote() ? [this.lote()!.id] : []);
    this.selectorVacio.set('Esa finca no tiene lotes en este equipo.');
    this.selectorBuscador.set(null);
    this.selectorMultiple.set(false);
    this.selectorAbierto.set(true);
  }

  async abrirModulos(): Promise<void> {
    const l = this.lote();
    if (!l) {
      void this.aviso('Elige primero el lote.');
      return;
    }
    this.destino = 'modulos';
    this.selectorTitulo.set(`Módulos de ${l.nombre}`);
    this.selectorOpciones.set(await this.catalogo.modulosDeLote(l.id));
    this.selectorSeleccion.set(this.modulos().map((m) => m.id));
    this.selectorVacio.set('Ese lote no tiene módulos: se registra el lote entero.');
    this.selectorBuscador.set(null);
    this.selectorMultiple.set(true);
    this.selectorAbierto.set(true);
  }

  /** En modo múltiple el selector emite `cambio`, nunca `confirmar`. */
  onCambio(ids: number[]): void {
    if (this.destino !== 'modulos') {
      return;
    }
    const opciones = this.selectorOpciones();
    this.modulos.set(
      ids
        .map((id) => opciones.find((o) => o.id === id))
        .filter((o): o is OpcionCatalogo => !!o)
        .map((o) => ({ id: o.id, nombre: o.nombre })),
    );
  }

  async onSeleccion(ids: number[]): Promise<void> {
    const d = this.destino;
    const o = this.selectorOpciones().find((x) => x.id === ids[0]);
    const ref: Ref | null = o ? { id: o.id, nombre: o.nombre } : null;
    this.cerrarSelector();

    if (d === 'finca') {
      const antes = this.finca()?.id;
      this.finca.set(ref);
      if (antes !== undefined && antes !== ref?.id) {
        // Los lotes y los módulos son de una finca: lo cargado deja de tener
        // sentido y arrastrarlo mandaría filas de otra finca al servidor.
        this.filas.set([]);
        this.lote.set(null);
        this.modulos.set([]);
      }
      await this.cargarLotes();
      await this.validarSupervisor();
    } else if (d === 'supervisor') {
      this.supervisor.set(ref);
    } else if (d === 'lote') {
      this.lote.set(ref);
      this.modulos.set([]);
      const l = this.lotes.find((x) => x.id === ref?.id);
      this.loteTieneModulos.set(!!l?.tieneModulos);
    }
  }

  cerrarSelector(): void {
    this.selectorAbierto.set(false);
    this.selectorMultiple.set(false);
    this.destino = null;
  }

  private async validarSupervisor(): Promise<void> {
    const s = this.supervisor();
    if (!s) {
      return;
    }
    const validos = await this.catalogo.responsables(this.finca()?.id ?? null);
    if (!validos.some((v) => v.id === s.id)) {
      this.supervisor.set(null);
      await this.aviso(`${s.nombre} no es supervisor de esa finca; elige otro.`);
    }
  }

  // ------------------------------------------------------------------
  // Tiempo
  // ------------------------------------------------------------------

  setMinutos(min: number): void {
    this.minutos.set(Math.max(0, Math.min(1440, Math.round(min))));
  }

  /** El campo libre es 'HH:MM'; el tope de 24 h es el de la columna. */
  setTiempoLibre(valor: unknown): void {
    const t = String(valor ?? '').trim();
    const m = /^(\d{1,2}):(\d{2})$/.exec(t);
    if (!m) {
      return;
    }
    this.setMinutos(Number(m[1]) * 60 + Number(m[2]));
  }

  setMinutosFila(n: number, min: number): void {
    const v = Math.max(0, Math.min(1440, Math.round(min)));
    this.filas.set(this.filas().map((f) => (f.n === n ? { ...f, minutos: v } : f)));
  }

  setTiempoLibreFila(n: number, valor: unknown): void {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(valor ?? '').trim());
    if (m) {
      this.setMinutosFila(n, Number(m[1]) * 60 + Number(m[2]));
    }
  }

  setVolumen(n: number, valor: unknown): void {
    const t = String(valor ?? '').trim().replace(',', '.');
    const v = t === '' ? null : Number(t);
    this.filas.set(
      this.filas().map((f) =>
        f.n === n
          ? { ...f, volumen: v === null || Number.isNaN(v) || v < 0 ? null : v }
          : f,
      ),
    );
  }

  setObservaciones(n: number, valor: unknown): void {
    const t = String(valor ?? '');
    this.filas.set(this.filas().map((f) => (f.n === n ? { ...f, observaciones: t } : f)));
  }

  // ------------------------------------------------------------------
  // Filas
  // ------------------------------------------------------------------

  /**
   * Agrega una fila por módulo elegido, o una sola si el lote no tiene
   * módulos. **El lote y el tiempo NO se limpian**: lo normal es seguir con
   * otro lote al mismo tiempo de riego, y volver a teclearlo 20 veces es
   * exactamente lo que hacía perder la tarde con el formulario de v3.
   */
  agregar(): void {
    if (!this.puedeAgregar()) {
      return;
    }
    const l = this.lote()!;
    const min = this.minutos();
    const nuevas: FilaRiego[] =
      this.modulos().length > 0
        ? this.modulos().map((m) => ({
            n: this.siguienteN++,
            loteId: l.id,
            lote: l.nombre,
            moduloId: m.id,
            modulo: m.nombre,
            minutos: min,
            volumen: null,
            observaciones: '',
          }))
        : [
            {
              n: this.siguienteN++,
              loteId: l.id,
              lote: l.nombre,
              moduloId: null,
              modulo: '',
              minutos: min,
              volumen: null,
              observaciones: '',
            },
          ];
    this.filas.set([...this.filas(), ...nuevas]);
    this.modulos.set([]);
  }

  quitar(n: number): void {
    this.filas.set(this.filas().filter((f) => f.n !== n));
    if (this.editando() === n) {
      this.editando.set(null);
    }
  }

  alternarEdicion(n: number): void {
    this.editando.set(this.editando() === n ? null : n);
  }

  // ------------------------------------------------------------------
  // Guardar
  // ------------------------------------------------------------------

  /**
   * Un registro por fila, cada uno con su guid y su propio ACK.
   *
   * Sin `captura_guid`: `reg_riego` no tiene esa columna y no se inventa una
   * (00-plan.md, decisión cerrada). Las filas de un registro se reconocen por
   * fecha + finca + supervisor, que es como se leen los partes de v3.
   */
  async guardar(): Promise<void> {
    if (!this.puedeGuardar()) {
      return;
    }
    this.guardando.set(true);
    let n = 0;
    try {
      // `fecha_proceso` lleva el INICIO del riego. Antes llevaba la hora de la
      // carga, que no era un dato de nadie.
      const fechaProceso = this.fechas.conOffset(`${this.fecha()}T${this.horaInicio()}:00`);
      // UNA justificacion para el parte entero, repetida en las N filas. Es el
      // unico lugar donde puede ir: cada fila es su propio registro con su
      // propio guid y su propio ACK, asi que no hay una cabecera comun donde
      // guardarla una sola vez. Por eso NO va dentro de `observaciones`, que
      // son de la fila y las escribe el usuario.
      const justificacion = justificacionParaEnviar(this.retroactivo(), this.justificacion());
      for (const f of this.filas()) {
        await this.cola.enqueue('riego', {
          fecha_proceso: fechaProceso,
          finca_id: this.finca()!.id,
          supervisor_id: this.supervisor()!.id,
          lote_id: f.loteId,
          modulo_id: f.moduloId,
          tiempo_riego_min: f.minutos,
          volumen_riego: f.volumen ?? 0,
          observaciones: f.observaciones.trim(),
          justificacion_retro: justificacion,
        });
        n++;
      }
    } finally {
      this.guardando.set(false);
    }
    await this.aviso(
      `${n} riego(s) registrados, ${this.hhmm(this.totalMinutos())} en total. ` +
        'Se envían solos cuando haya red.',
    );
    await this.router.navigateByUrl('/menu');
  }

  private async aviso(mensaje: string): Promise<void> {
    const t = await this.toast.create({ message: mensaje, duration: 3500, position: 'bottom' });
    await t.present();
  }
}
