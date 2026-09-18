import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  AlertController,
  IonBackButton,
  IonButton,
  IonButtons,
  IonCheckbox,
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
  alertCircleOutline,
  cloudUploadOutline,
  peopleOutline,
  trashOutline,
} from 'ionicons/icons';

import { AsignacionesService } from '../../core/captura/asignaciones.service';
import { AppConfigService } from '../../core/config/app-config.service';
import { BootstrapService } from '../../core/bootstrap/bootstrap.service';
import { CatalogQueryService, OpcionCatalogo, Subtarea } from '../../core/catalog/catalog-query.service';
import { ClockService } from '../../core/clock/clock.service';
import { FechaService } from '../../core/captura/fecha.service';
import { SyncQueueService } from '../../core/sync/sync-queue.service';
import { BarraPasosComponent, SwipePasosDirective } from '../../shared/pasos';
import { SelectorComponent } from '../../shared/selector.component';
import {
  RetroactivoComponent,
  justificacionCompleta,
  justificacionParaEnviar,
  problemasRetroactivo,
} from '../../shared/retroactivo.component';

interface Ref {
  id: number;
  nombre: string;
}

interface TareaAm {
  cultivo: Ref | null;
  tarea: Ref | null;
  lote: (Ref & { tieneModulos: boolean }) | null;
  subtarea: Subtarea | null;
  modulos: Ref[];
  personal: Ref[];
  comentario: string;
}

type Destino =
  | { tipo: 'finca' }
  | { tipo: 'responsable' }
  | { tipo: 'cultivo'; i: number }
  | { tipo: 'tarea'; i: number }
  | { tipo: 'subtarea'; i: number }
  | { tipo: 'lote'; i: number }
  | { tipo: 'modulo'; i: number }
  | { tipo: 'personal'; i: number };

/**
 * Reporte AM — programación de la mañana.
 *
 * **Una tarea = un guid = una fila de `reg_am`.** Esto no es un detalle de
 * implementación: el servidor acusa recibo POR REGISTRO, así que un AM de
 * tres tareas puede terminar con dos `created` y una `rejected`. La pantalla
 * de revisión no promete atomicidad, porque el servidor no la da. (La nota de
 * 03-pantallas.md que dice "un AM con N personas genera N filas" describe
 * `z_tabla_am`, el modelo de V3; en V4 las personas son tabla hija.)
 *
 * Regla dura, decidida por Kevin el 2026-08-31: **no se guarda un AM sin al
 * menos una persona en cada tarea.** El botón queda deshabilitado y dice por
 * qué. El servidor también lo rechaza (`personal_ids vacio`), pero esa es la
 * segunda barrera: enterarse tres horas después, cuando el responsable ya se
 * fue del lote, no sirve de nada.
 *
 * Vocabulario: **Finca** y **Responsable** (pendiente #6, cerrado).
 */
@Component({
  selector: 'app-am',
  standalone: true,
  templateUrl: './am.page.html',
  styleUrls: ['./am.page.scss'],
  imports: [
    BarraPasosComponent,
    SelectorComponent,
    RetroactivoComponent,
    SwipePasosDirective,
    IonBackButton,
    IonButton,
    IonButtons,
    IonCheckbox,
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
export class AmPage implements OnInit {
  private readonly catalogo = inject(CatalogQueryService);
  private readonly fechas = inject(FechaService);
  private readonly bootstrap = inject(BootstrapService);
  private readonly asignaciones = inject(AsignacionesService);
  private readonly cola = inject(SyncQueueService);
  private readonly clock = inject(ClockService);
  private readonly config = inject(AppConfigService);
  private readonly alert = inject(AlertController);
  private readonly toast = inject(ToastController);
  private readonly router = inject(Router);

  // --- Encabezado ---
  readonly fechaLocal = signal('');
  readonly retroactivo = signal(false);
  readonly justificacion = signal('');
  readonly retroJustificado = computed(() =>
    justificacionCompleta(this.retroactivo(), this.justificacion()),
  );
  readonly finca = signal<Ref | null>(null);
  readonly responsable = signal<Ref | null>(null);

  // --- Tareas ---
  readonly tareas = signal<TareaAm[]>([AmPage.tareaVacia()]);

  // --- Navegación ---
  readonly paso = signal(0);
  readonly guardando = signal(false);

  /** encabezado + N tareas + revisión */
  readonly totalPasos = computed(() => this.tareas().length + 2);
  readonly indiceRevision = computed(() => this.totalPasos() - 1);
  readonly indiceTarea = computed(() => this.paso() - 1);
  readonly etiquetaPaso = computed(() => {
    const p = this.paso();
    if (p === 0) return 'Encabezado';
    if (p === this.indiceRevision()) return 'Revisar y enviar';
    return `Tarea ${p}`;
  });

  // --- Selector modal ---
  readonly selectorAbierto = signal(false);
  readonly selectorTitulo = signal('');
  readonly selectorOpciones = signal<OpcionCatalogo[]>([]);
  readonly selectorMultiple = signal(false);
  readonly selectorSeleccion = signal<number[]>([]);
  readonly selectorVacio = signal('No hay opciones para elegir.');
  /** null = automático (buscador solo si hay muchas opciones). */
  readonly selectorBuscador = signal<boolean | null>(null);
  /**
   * Alto exacto de la ventana flotante, en px, para que el contenido la
   * llene sin dejar blanco abajo.
   *
   * 56 del encabezado + 60 del buscador (si aparece) + 44 del pie de conteo
   * (solo en multiple) + una fila por opcion. Las filas con detalle ("12.5
   * ha") son mas altas. Se topea a 12 filas: mas que eso ya es una lista para
   * recorrer con el buscador, no de un vistazo. El CSS pone el piso y el
   * techo por si la cuenta se queda corta.
   */
  readonly alturaSelector = computed(() => {
    const opciones = this.selectorOpciones();
    const n = Math.min(opciones.length, 12);
    const conDetalle = opciones.some((o) => !!o.detalle);
    const buscador = this.selectorBuscador() ?? opciones.length > 10;
    const alto =
      56 +
      (buscador ? 60 : 0) +
      (this.selectorMultiple() ? 44 : 0) +
      Math.max(n, 1) * (conDetalle ? 66 : 49) +
      6;
    return `${alto}px`;
  });
  private destino: Destino | null = null;

  // --- Catálogos base ---
  private fincas: OpcionCatalogo[] = [];
  private cultivos: OpcionCatalogo[] = [];
  // La clave lleva la finca: las subtareas se filtran por finca, asi que la
  // misma tarea da listas distintas en Bellita y en Pacaritambo.
  private tareasPorCultivo = new Map<string, OpcionCatalogo[]>();
  private subtareasPorTarea = new Map<string, Subtarea[]>();

  // --- Evaluación de la fecha ---
  readonly evaluacion = computed(() => {
    const f = this.fechaLocal();
    return f ? this.fechas.evaluar('am', f) : null;
  });
  readonly limites = computed(() => this.fechas.limites('am', this.retroactivo()));
  readonly sinHoraVerificada = computed(() => this.clock.offsetSeconds() === null);

  // --- Validación ---

  /**
   * Personas repetidas entre tareas del MISMO formulario. Bloqueo duro: una
   * persona no puede estar en dos tareas AM a la vez (Kevin, 2026-08-31), y
   * dentro del formulario esto se sabe con certeza, sin consultar nada.
   */
  readonly personasRepetidas = computed(() => {
    const enTareas = new Map<number, { nombre: string; tareas: number[] }>();
    this.tareas().forEach((t, i) => {
      for (const p of t.personal) {
        const acumulado = enTareas.get(p.id) ?? { nombre: p.nombre, tareas: [] };
        acumulado.tareas.push(i + 1);
        enTareas.set(p.id, acumulado);
      }
    });
    return [...enTareas.values()].filter((x) => x.tareas.length > 1);
  });

  readonly problemasEncabezado = computed(() => {
    const p: string[] = [];
    const ev = this.evaluacion();
    if (!this.fechaLocal()) p.push('Falta la fecha y hora de proceso.');
    if (ev?.futuro) p.push('La fecha de proceso no puede estar en el futuro.');
    p.push(...problemasRetroactivo(ev ?? null, this.retroactivo(), this.justificacion()));
    if (!this.finca()) p.push('Falta la finca.');
    if (!this.responsable()) p.push('Falta el responsable.');
    return p;
  });

  problemasTarea(i: number): string[] {
    const t = this.tareas()[i];
    if (!t) return [];
    const p: string[] = [];
    if (!t.cultivo) p.push('Falta el cultivo.');
    if (!t.lote) p.push('Falta el lote.');
    if (!t.tarea) p.push('Falta la tarea.');
    if (!t.subtarea) p.push('Falta la subtarea.');
    if (t.lote?.tieneModulos && t.modulos.length === 0) {
      p.push('Este lote trabaja por módulos: Elige al menos uno.');
    }
    if (t.personal.length === 0) {
      p.push('Sin personal no hay programación: agrega al menos una persona.');
    }
    return p;
  }

  readonly problemas = computed(() => {
    const p = [...this.problemasEncabezado()];
    this.tareas().forEach((_, i) => {
      for (const x of this.problemasTarea(i)) {
        p.push(`Tarea ${i + 1}: ${x}`);
      }
    });
    for (const r of this.personasRepetidas()) {
      p.push(`${r.nombre} está en más de una tarea (${r.tareas.join(', ')}).`);
    }
    return p;
  });

  readonly puedeGuardar = computed(() => this.problemas().length === 0 && !this.guardando());

  readonly totalPersonas = computed(
    () => new Set(this.tareas().flatMap((t) => t.personal.map((p) => p.id))).size,
  );

  constructor() {
    addIcons({ addOutline, alertCircleOutline, cloudUploadOutline, peopleOutline, trashOutline });
  }

  async ngOnInit(): Promise<void> {
    // `config.cargar()` NO es redundante aunque la cola ya lo haya llamado al
    // arrancar: esa carga es asincrona y esta pantalla puede ganarle la
    // carrera, leer los valores por defecto todavia en null y no
    // pre-seleccionar nada. Es idempotente.
    await this.config.cargar();
    await this.bootstrap.cargar();
    this.fechaLocal.set(this.fechas.ahoraLocal());
    this.fincas = await this.catalogo.fincas();
    this.cultivos = await this.catalogo.cultivos();

    // Finca por defecto de Configuración; si hay una sola, tampoco tiene
    // sentido preguntar.
    const porDefecto = this.config.defaultFincaId();
    const f =
      (porDefecto !== null ? this.fincas.find((x) => x.id === porDefecto) : undefined) ??
      (this.fincas.length === 1 ? this.fincas[0] : undefined);
    if (f) {
      this.finca.set({ id: f.id, nombre: f.nombre });
    }

    // Cultivo por defecto: se aplica a la primera tarea y lo hereda cada
    // tarea nueva, porque la precarga arrastra el cultivo.
    const cid = this.config.defaultCultivoId();
    const c =
      (cid !== null ? this.cultivos.find((x) => x.id === cid) : undefined) ??
      (this.cultivos.length === 1 ? this.cultivos[0] : undefined);
    if (c) {
      this.actualizarTarea(0, (t) => ({ ...t, cultivo: { id: c.id, nombre: c.nombre } }));
    }
  }

  // ------------------------------------------------------------------
  // Navegación
  // ------------------------------------------------------------------

  irA(i: number): void {
    this.paso.set(Math.max(0, Math.min(i, this.totalPasos() - 1)));
  }

  siguiente(): void {
    this.irA(this.paso() + 1);
  }

  anterior(): void {
    this.irA(this.paso() - 1);
  }

  agregarTarea(): void {
    const previa = this.tareas()[this.tareas().length - 1];
    const nueva = AmPage.tareaVacia();
    // Precarga decidida por Kevin (2026-08-31): SOLO cultivo y lote. La
    // subtarea, los módulos y sobre todo el personal se eligen de cero, para
    // no arrastrar gente a una tarea donde no estuvo.
    if (previa) {
      nueva.cultivo = previa.cultivo;
      nueva.lote = previa.lote;
    }
    this.tareas.set([...this.tareas(), nueva]);
    this.irA(this.tareas().length);
  }

  async quitarTarea(i: number): Promise<void> {
    if (this.tareas().length === 1) {
      await this.aviso('Un AM tiene al menos una tarea.');
      return;
    }
    this.tareas.set(this.tareas().filter((_, k) => k !== i));
    this.irA(Math.min(this.paso(), this.totalPasos() - 1));
  }

  // ------------------------------------------------------------------
  // Campos
  // ------------------------------------------------------------------

  setFecha(valor: string | string[] | null | undefined): void {
    if (typeof valor === 'string' && valor) {
      this.fechaLocal.set(valor.slice(0, 19));
    }
  }

  setComentario(i: number, texto: string): void {
    this.actualizarTarea(i, (t) => ({ ...t, comentario: texto }));
  }

  async abrirFinca(): Promise<void> {
    this.abrir({ tipo: 'finca' }, 'Finca', this.fincas, this.finca() ? [this.finca()!.id] : []);
  }

  /**
   * Responsables de campo: `rol = 8`. Son seis en toda la operación, así que
   * la ventana sale SIN buscador (`conBuscador = false`).
   */
  async abrirResponsable(): Promise<void> {
    const f = this.finca();
    const opciones = await this.catalogo.responsables(f ? f.id : null);
    this.abrir(
      { tipo: 'responsable' },
      'Responsable',
      opciones,
      this.responsable() ? [this.responsable()!.id] : [],
      'Descarga los maestros: no hay responsables en este equipo.',
      false,
      false,
    );
  }

  async abrirCultivo(i: number): Promise<void> {
    const t = this.tareas()[i];
    this.abrir({ tipo: 'cultivo', i }, 'Cultivo', this.cultivos, t.cultivo ? [t.cultivo.id] : []);
  }

  async abrirLote(i: number): Promise<void> {
    const f = this.finca();
    if (!f) {
      await this.aviso('Elige primero la finca, en el encabezado.');
      return;
    }
    const t = this.tareas()[i];
    const lotes = await this.catalogo.lotesDeFinca(f.id);
    this.abrir({ tipo: 'lote', i }, 'Lote', lotes, t.lote ? [t.lote.id] : []);
  }

  async abrirTarea(i: number): Promise<void> {
    const t = this.tareas()[i];
    if (!t.cultivo) {
      await this.aviso('Elige primero el cultivo.');
      return;
    }
    const tareas = await this.tareasDe(t.cultivo.id);
    this.abrir(
      { tipo: 'tarea', i },
      'Tarea',
      tareas,
      t.tarea ? [t.tarea.id] : [],
      'Este cultivo no tiene tareas con subtareas en esta finca.',
    );
  }

  async abrirSubtarea(i: number): Promise<void> {
    const t = this.tareas()[i];
    if (!t.tarea) {
      await this.aviso('Elige primero la tarea.');
      return;
    }
    const subs = await this.subtareasDe(t.tarea.id);
    this.abrir(
      { tipo: 'subtarea', i },
      'Subtarea',
      subs,
      t.subtarea ? [t.subtarea.id] : [],
      'Esta tarea no tiene subtareas activas.',
    );
  }

  async abrirModulos(i: number): Promise<void> {
    const t = this.tareas()[i];
    if (!t.lote) {
      await this.aviso('Elige primero el lote.');
      return;
    }
    const modulos = await this.catalogo.modulosDeLote(t.lote.id);
    this.abrir(
      { tipo: 'modulo', i },
      'Módulos',
      modulos,
      t.modulos.map((m) => m.id),
      'Este lote no tiene módulos cargados.',
      true,
    );
  }

  async abrirPersonal(i: number): Promise<void> {
    const f = this.finca();
    const t = this.tareas()[i];
    const opciones = await this.catalogo.personal(f ? f.id : null);
    this.abrir(
      { tipo: 'personal', i },
      'Personal',
      opciones,
      t.personal.map((p) => p.id),
      'Descarga los maestros: no hay personal en este equipo.',
      true,
    );
  }

  cerrarSelector(): void {
    this.selectorAbierto.set(false);
    this.destino = null;
  }

  /**
   * Modo múltiple: cada toque aplica de una, sin cerrar la ventana. Así
   * cerrar tocando fuera nunca pierde lo elegido.
   */
  async onCambio(ids: number[]): Promise<void> {
    const d = this.destino;
    if (!d) {
      return;
    }
    const refs = this.aRefs(ids);
    if (d.tipo === 'modulo') {
      this.actualizarTarea(d.i, (t) => ({ ...t, modulos: refs }));
    } else if (d.tipo === 'personal') {
      this.actualizarTarea(d.i, (t) => ({ ...t, personal: refs }));
    }
  }

  private aRefs(ids: number[]): Ref[] {
    const opciones = this.selectorOpciones();
    return ids
      .map((id) => opciones.find((o) => o.id === id))
      .filter((o): o is OpcionCatalogo => !!o)
      .map((o) => ({ id: o.id, nombre: o.nombre }));
  }

  async onSeleccion(ids: number[]): Promise<void> {
    const d = this.destino;
    const refs = this.aRefs(ids);
    this.cerrarSelector();
    if (!d) {
      return;
    }

    switch (d.tipo) {
      case 'finca': {
        const antes = this.finca()?.id;
        this.finca.set(refs[0] ?? null);
        // Cambiar de finca invalida lotes, módulos y personal ya elegidos:
        // el servidor rechaza un lote que no es de la finca declarada.
        if (antes !== undefined && antes !== refs[0]?.id) {
          // Las subtareas tambien son por finca, asi que caen con el resto.
          this.tareas.set(
            this.tareas().map((t) => ({
              ...t,
              lote: null,
              modulos: [],
              personal: [],
              tarea: null,
              subtarea: null,
            })),
          );
          await this.aviso('Cambió la finca: se limpiaron lote, tarea, subtarea y personal.');
        }
        await this.validarResponsable();
        break;
      }
      case 'responsable':
        this.responsable.set(refs[0] ?? null);
        break;
      case 'cultivo': {
        // La cascada es Cultivo -> Tarea -> Subtarea: cambiar el cultivo
        // invalida las dos de abajo.
        const cambio = this.tareas()[d.i].cultivo?.id !== refs[0]?.id;
        this.actualizarTarea(d.i, (t) => ({
          ...t,
          cultivo: refs[0] ?? null,
          tarea: cambio ? null : t.tarea,
          subtarea: cambio ? null : t.subtarea,
        }));
        break;
      }
      case 'tarea': {
        const cambio = this.tareas()[d.i].tarea?.id !== refs[0]?.id;
        this.actualizarTarea(d.i, (t) => ({
          ...t,
          tarea: refs[0] ?? null,
          subtarea: cambio ? null : t.subtarea,
        }));
        break;
      }
      case 'subtarea': {
        const sub = (this.selectorOpciones() as Subtarea[]).find((x) => x.id === ids[0]);
        this.actualizarTarea(d.i, (t) => ({ ...t, subtarea: sub ?? null }));
        break;
      }
      case 'lote': {
        const elegido = this.selectorOpciones().find((o) => o.id === ids[0]) as
          | (OpcionCatalogo & { tieneModulos: boolean })
          | undefined;
        this.actualizarTarea(d.i, (t) => ({
          ...t,
          lote: elegido
            ? { id: elegido.id, nombre: elegido.nombre, tieneModulos: elegido.tieneModulos }
            : null,
          modulos: [],
        }));
        break;
      }
      case 'modulo':
        this.actualizarTarea(d.i, (t) => ({ ...t, modulos: refs }));
        break;
      case 'personal':
        this.actualizarTarea(d.i, (t) => ({ ...t, personal: refs }));
        break;
    }
  }

  /**
   * El responsable se puede elegir ANTES que la finca. Al fijar la finca se
   * revisa si sigue siendo válido, en vez de borrarlo a ciegas: borrarlo
   * siempre obligaba a elegirlo dos veces sin explicación.
   */
  private async validarResponsable(): Promise<void> {
    const r = this.responsable();
    if (!r) {
      return;
    }
    const validos = await this.catalogo.responsables(this.finca()?.id ?? null);
    if (!validos.some((v) => v.id === r.id)) {
      this.responsable.set(null);
      await this.aviso(`${r.nombre} no es responsable de esa finca; Elige otro.`);
    }
  }

  // ------------------------------------------------------------------
  // Guardar
  // ------------------------------------------------------------------

  async guardar(): Promise<void> {
    if (!this.puedeGuardar()) {
      this.irA(this.indiceRevision());
      return;
    }
    const fecha = this.fechas.soloFecha(this.fechaLocal());

    // Bloqueo por AM abierto (Kevin, 2026-09-04): el servidor rechaza una
    // segunda tarea sin cerrar, así que dejar guardar aquí sólo fabrica
    // registros condenados. Sólo ve lo capturado en ESTE equipo.
    const ids = this.tareas().flatMap((t) => t.personal.map((p) => p.id));
    const abiertos = await this.asignaciones.personasConAmAbierto(ids, fecha);
    if (abiertos.size > 0) {
      const detalle = [...abiertos.entries()]
        .map(([id, lista]) => {
          const nombre =
            this.tareas()
              .flatMap((t) => t.personal)
              .find((p) => p.id === id)?.nombre ?? `#${id}`;
          // TEXTO PLANO, no HTML. Desde Ionic 6 el `message` de un alert se
          // escapa salvo que se encienda `innerHTMLTemplatesEnabled`, que lo
          // habilita para TODA la app: cualquier texto que venga de la base
          // --un nombre de z_personal, editable desde la web-- pasaria a ser
          // HTML inyectable. Se deja apagado; los saltos de linea se ven
          // gracias al `white-space: pre-line` de .alert-message en
          // styles.scss.
          return `• ${nombre}\n   ${lista.map((a) => a.descripcion).join('\n   ')}`;
        })
        .join('\n');
      await this.bloqueo(
        'Personal con una tarea AM sin cerrar',
        'Estas personas ya tienen una tarea AM de hoy sin cerrar. El servidor no acepta otra hasta que el PM cierre la primera:\n\n' +
          detalle
      );
      return;
    }

    const justificacion = justificacionParaEnviar(this.retroactivo(), this.justificacion());

    this.guardando.set(true);
    const guids: string[] = [];
    try {
      for (const t of this.tareas()) {
        // UN captura_guid POR TAREA, no por envío del formulario.
        //
        // Estuvo mal hasta el 2026-09-02: se generaba UNO SOLO antes de este
        // bucle, así que un AM con tres tareas mandaba las tres con el mismo
        // guid. La migración de agosto, en cambio, lo asignó por tarea, y el
        // campo terminó significando dos cosas segun de donde viniera la fila.
        //
        // Por tarea es lo correcto: el guid tiene que juntar las N PERSONAS de
        // una tarea --que es lo que las pantallas PM y "Enviados" muestran como
        // una tarjeta-- y no mezclar lotes ni subtareas distintos. Sobre agosto,
        // el 26 % de los envíos llevaba más de una tarea y el mayor tenía 27
        // registros de lotes y subtareas distintos: una sola tarjeta con eso
        // adentro no la puede leer nadie.
        const capturaGuid = crypto.randomUUID();
        // **Un registro por PERSONA**, no por tarea. Cada uno viaja con su
        // propio guid y recibe su propio ACK: si el servidor rechaza a una
        // persona, las demás entran igual. La acumulación de personal es de
        // esta pantalla; en la base cada una es su propia fila.
        for (const persona of t.personal) {
          const payload = {
            captura_guid: capturaGuid,
            fecha_proceso: this.fechas.conOffset(this.fechaLocal()),
            finca_id: this.finca()!.id,
            responsable_id: this.responsable()!.id,
            cultivo_id: t.cultivo!.id,
            lote_id: t.lote!.id,
            subtarea_id: t.subtarea!.id,
            modulo_ids: t.modulos.map((m) => m.id),
            personal_id: persona.id,
            comentario: t.comentario.trim(),
            // Campo propio desde el 2026-09-14: antes iba pegado al
            // comentario como '[RETROACTIVO] ...'. Ver retroactivo.component.
            justificacion_retro: justificacion,
          };
          const guid = await this.cola.enqueue('am', payload);
          guids.push(guid);
          await this.asignaciones.registrarAm(
            guid,
            fecha,
            t.lote!.id,
            t.subtarea!.id,
            persona.id,
            t.modulos.map((m) => m.id),
            capturaGuid,
          );
        }
      }
    } finally {
      this.guardando.set(false);
    }

    await this.aviso(
      `${guids.length} registro(s) guardado(s) en el equipo ` +
        `(${this.tareas().length} tarea(s), ${this.totalPersonas()} persona(s)). ` +
        'Se envían solos cuando haya red.',
    );
    await this.router.navigateByUrl('/menu');
  }

  // ------------------------------------------------------------------
  // Helpers
  // ------------------------------------------------------------------

  private async tareasDe(cultivoId: number): Promise<OpcionCatalogo[]> {
    const fincaId = this.finca()?.id ?? null;
    const clave = `${cultivoId}|${fincaId}`;
    if (!this.tareasPorCultivo.has(clave)) {
      this.tareasPorCultivo.set(clave, await this.catalogo.tareasDeCultivo(cultivoId, fincaId));
    }
    return this.tareasPorCultivo.get(clave)!;
  }

  private async subtareasDe(tareaId: number): Promise<Subtarea[]> {
    const fincaId = this.finca()?.id ?? null;
    const clave = `${tareaId}|${fincaId}`;
    if (!this.subtareasPorTarea.has(clave)) {
      this.subtareasPorTarea.set(clave, await this.catalogo.subtareasDeTarea(tareaId, fincaId));
    }
    return this.subtareasPorTarea.get(clave)!;
  }

  private abrir(
    destino: Destino,
    titulo: string,
    opciones: OpcionCatalogo[],
    seleccion: number[],
    vacio = 'No hay opciones para elegir.',
    multiple = false,
    conBuscador: boolean | null = null,
  ): void {
    this.destino = destino;
    this.selectorTitulo.set(titulo);
    this.selectorOpciones.set(opciones);
    this.selectorSeleccion.set(seleccion);
    this.selectorMultiple.set(multiple);
    this.selectorVacio.set(vacio);
    this.selectorBuscador.set(conBuscador);
    this.selectorAbierto.set(true);
  }

  private actualizarTarea(i: number, cambio: (t: TareaAm) => TareaAm): void {
    this.tareas.set(this.tareas().map((t, k) => (k === i ? cambio(t) : t)));
  }

  private static tareaVacia(): TareaAm {
    return {
      cultivo: null,
      tarea: null,
      lote: null,
      subtarea: null,
      modulos: [],
      personal: [],
      comentario: '',
    };
  }

  private async aviso(mensaje: string): Promise<void> {
    const t = await this.toast.create({ message: mensaje, duration: 3500, position: 'bottom' });
    await t.present();
  }

  private async bloqueo(titulo: string, mensaje: string): Promise<void> {
    const a = await this.alert.create({
      header: titulo,
      message: mensaje,
      buttons: [{ text: 'Entendido', role: 'cancel' }],
    });
    await a.present();
    await a.onDidDismiss();
  }
}
