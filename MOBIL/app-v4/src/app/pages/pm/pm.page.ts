import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
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
  IonSpinner,
  IonTitle,
  IonToolbar,
  ToastController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  cloudOfflineOutline,
  cloudUploadOutline,
  refreshOutline,
  personOutline,
} from 'ionicons/icons';

import { ApiService } from '../../core/api/api.service';
import { AsignacionAmLocal, AsignacionesService } from '../../core/captura/asignaciones.service';
import { AppConfigService } from '../../core/config/app-config.service';
import { BootstrapService } from '../../core/bootstrap/bootstrap.service';
import {
  CatalogQueryService,
  OpcionCatalogo,
  nombreLote,
} from '../../core/catalog/catalog-query.service';
import { ClockService } from '../../core/clock/clock.service';
import { FechaService } from '../../core/captura/fecha.service';
import { SyncQueueService } from '../../core/sync/sync-queue.service';
import { BarraPasosComponent, SwipePasosDirective } from '../../shared/pasos';
import { SelectorComponent } from '../../shared/selector.component';

interface Ref {
  id: number;
  nombre: string;
}

/** Una asignación elegida, con lo único que el PM aporta. */
interface CierrePm {
  asignacion: AsignacionAmLocal;
  cantidad: string;
  comentario: string;
}

/**
 * Reporte PM — el CIERRE de una tarea AM.
 *
 * Decisión de Kevin (2026-09-01): **"NO se pueden crear PM, un PM solo es el
 * reflejo de un AM"**. Esta pantalla dejó de capturar tareas. Lista las
 * asignaciones AM abiertas de la fecha, el supervisor elige las que se
 * cerraron, y solo carga el **avance** en la unidad que ya define la subtarea.
 *
 * Todo lo demás — finca, cultivo, lote, subtarea, módulos, hora de inicio —
 * lo deriva el servidor del AM. El teléfono no puede contradecirlo, que era
 * justamente el agujero: antes se podía mandar un PM con un lote distinto al
 * de la programación de la mañana.
 *
 * El **responsable** sí se elige acá: es quien zanja la tarea, y no tiene por
 * qué ser el mismo que la programó.
 *
 * De dónde sale la lista, y por qué de dos lados:
 * - `GET /v4/am_abiertos` es la fuente autoritativa, pero solo conoce los AM
 *   que ya llegaron al servidor.
 * - El espejo local cubre los AM capturados en este equipo que siguen
 *   PENDIENTES en la cola. Sin él, un supervisor sin señal no podría cerrar
 *   por la tarde la tarea que él mismo cargó por la mañana.
 * Se juntan y se deduplican por (am_guid, persona).
 */
@Component({
  selector: 'app-pm',
  standalone: true,
  templateUrl: './pm.page.html',
  styleUrls: ['../am/am.page.scss'],
  imports: [
    BarraPasosComponent,
    SelectorComponent,
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
    IonSpinner,
    IonTitle,
    IonToolbar,
  ],
})
export class PmPage implements OnInit {
  private readonly catalogo = inject(CatalogQueryService);
  private readonly fechas = inject(FechaService);
  private readonly bootstrap = inject(BootstrapService);
  private readonly asignaciones = inject(AsignacionesService);
  private readonly cola = inject(SyncQueueService);
  private readonly clock = inject(ClockService);
  private readonly api = inject(ApiService);
  private readonly config = inject(AppConfigService);
  private readonly toast = inject(ToastController);
  private readonly router = inject(Router);

  // --- Encabezado ---
  readonly fecha = signal(''); // YYYY-MM-DD
  readonly horaCierre = signal(''); // HH:mm, común a todas las tareas
  readonly finca = signal<Ref | null>(null);
  readonly responsable = signal<Ref | null>(null);

  // --- Asignaciones ---
  readonly disponibles = signal<AsignacionAmLocal[]>([]);
  readonly elegidas = signal<CierrePm[]>([]);
  readonly cargandoLista = signal(false);
  readonly listaDesdeServidor = signal(false);
  readonly errorLista = signal<string | null>(null);

  readonly paso = signal(0);
  readonly guardando = signal(false);

  /** encabezado + una por asignación elegida + revisión */
  readonly totalPasos = computed(() => this.elegidas().length + 2);
  readonly indiceRevision = computed(() => this.totalPasos() - 1);
  readonly indiceCierre = computed(() => this.paso() - 1);
  readonly etiquetaPaso = computed(() => {
    const p = this.paso();
    if (p === 0) return 'Tareas de la mañana';
    if (p === this.indiceRevision()) return 'Revisar y enviar';
    return `Avance ${p}`;
  });

  // --- Selector ---
  readonly selectorAbierto = signal(false);
  readonly selectorTitulo = signal('');
  readonly selectorOpciones = signal<OpcionCatalogo[]>([]);
  readonly selectorSeleccion = signal<number[]>([]);
  readonly selectorVacio = signal('No hay opciones para elegir.');
  readonly selectorBuscador = signal<boolean | null>(null);
  /**
   * Alto exacto de la ventana flotante, en px, para que el contenido la
   * llene sin dejar blanco abajo.
   *
   * 56 del encabezado + 60 del buscador (si aparece) + una fila por opcion.
   * Los selectores de esta pantalla son todos simples, asi que no hay pie de
   * conteo que sumar. Las filas con detalle ("12.5
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
      Math.max(n, 1) * (conDetalle ? 66 : 49) +
      6;
    return `${alto}px`;
  });
  private destino: 'finca' | 'responsable' | null = null;

  private fincas: OpcionCatalogo[] = [];

  readonly limites = computed(() => this.fechas.limites('pm', false));
  readonly sinHoraVerificada = computed(() => this.clock.offsetSeconds() === null);

  readonly problemasEncabezado = computed(() => {
    const p: string[] = [];
    if (!this.fecha()) p.push('Falta la fecha de proceso.');
    if (!this.finca()) p.push('Falta la finca.');
    if (!this.responsable()) p.push('Falta el responsable que cierra las tareas.');
    if (!this.horaCierre()) p.push('Falta la hora de cierre.');
    if (this.elegidas().length === 0) {
      p.push('Elegí al menos una tarea de la mañana para cerrar.');
    }
    return p;
  });

  problemasCierre(i: number): string[] {
    const c = this.elegidas()[i];
    if (!c) return [];
    const p: string[] = [];
    const n = Number(c.cantidad);
    if (c.cantidad.trim() === '' || Number.isNaN(n)) {
      p.push('Falta el avance.');
    } else if (n < 0) {
      p.push('El avance no puede ser negativo.');
    }
    return p;
  }

  readonly problemas = computed(() => {
    const p = [...this.problemasEncabezado()];
    this.elegidas().forEach((c, i) => {
      for (const x of this.problemasCierre(i)) {
        p.push(`${c.asignacion.trabajador}: ${x}`);
      }
    });
    return p;
  });

  readonly puedeGuardar = computed(() => this.problemas().length === 0 && !this.guardando());

  constructor() {
    addIcons({ cloudOfflineOutline, cloudUploadOutline, refreshOutline, personOutline });
  }

  async ngOnInit(): Promise<void> {
    // `config.cargar()` NO es redundante aunque la cola ya lo haya llamado al
    // arrancar: esa carga es asincrona y esta pantalla puede ganarle la
    // carrera, leer los valores por defecto todavia en null y no
    // pre-seleccionar nada. Es idempotente.
    await this.config.cargar();
    await this.bootstrap.cargar();
    const ahora = this.fechas.ahoraLocal();
    this.fecha.set(ahora.slice(0, 10));
    this.horaCierre.set(ahora.slice(11, 16));
    this.fincas = await this.catalogo.fincas();
    // Finca por defecto de Configuración; si hay una sola, tampoco se pregunta.
    const porDefecto = this.config.defaultFincaId();
    const f =
      (porDefecto !== null ? this.fincas.find((x) => x.id === porDefecto) : undefined) ??
      (this.fincas.length === 1 ? this.fincas[0] : undefined);
    if (f) {
      this.finca.set({ id: f.id, nombre: f.nombre });
    }
    await this.cargarLista();
  }

  // ------------------------------------------------------------------
  // Lista de tareas AM abiertas
  // ------------------------------------------------------------------

  async cargarLista(): Promise<void> {
    this.cargandoLista.set(true);
    this.errorLista.set(null);
    const fecha = this.fecha();
    const fincaId = this.finca()?.id ?? null;

    // El espejo local siempre entra: cubre los AM de este equipo que todavía
    // no llegaron al servidor.
    const locales = await this.asignaciones.abiertasLocales(fecha);
    let delServidor: AsignacionAmLocal[] = [];

    if (this.config.baseUrl()) {
      try {
        const r = await this.api.amAbiertos(fecha, fincaId);
        delServidor = r.asignaciones.map((a) => ({
          amGuid: a.am_guid,
          amPersonalId: a.am_personal_id,
          personalId: a.personal_id,
          trabajador: a.trabajador,
          fechaProceso: a.fecha_proceso,
          loteId: a.lote_id,
          lote: nombreLote(a.lote),
          subtareaId: a.subtarea_id,
          subtarea: a.subtarea,
          modulos: a.modulos ?? '',
          unidadLabor: a.unidad_labor,
          origen: 'servidor' as const,
        }));
        this.listaDesdeServidor.set(true);
      } catch (e) {
        this.listaDesdeServidor.set(false);
        this.errorLista.set(
          'Sin respuesta del servidor: se muestran solo las tareas cargadas en este equipo.',
        );
      }
    } else {
      this.listaDesdeServidor.set(false);
    }

    // Deduplicación por (am_guid, persona). Gana la del servidor: trae el
    // am_personal_id y los nombres ya resueltos.
    const mapa = new Map<string, AsignacionAmLocal>();
    for (const a of [...locales, ...delServidor]) {
      mapa.set(`${a.amGuid}|${a.personalId}`, a);
    }
    const lista = [...mapa.values()].sort((a, b) => a.trabajador.localeCompare(b.trabajador));
    this.disponibles.set(lista);

    // Se conserva lo ya elegido que siga existiendo en la lista nueva.
    const vivas = new Set(lista.map((a) => `${a.amGuid}|${a.personalId}`));
    this.elegidas.set(this.elegidas().filter((c) => vivas.has(this.clave(c.asignacion))));
    this.cargandoLista.set(false);
  }

  clave(a: AsignacionAmLocal): string {
    return `${a.amGuid}|${a.personalId}`;
  }

  estaElegida(a: AsignacionAmLocal): boolean {
    return this.elegidas().some((c) => this.clave(c.asignacion) === this.clave(a));
  }

  alternar(a: AsignacionAmLocal): void {
    const k = this.clave(a);
    const ya = this.elegidas().find((c) => this.clave(c.asignacion) === k);
    if (ya) {
      this.elegidas.set(this.elegidas().filter((c) => this.clave(c.asignacion) !== k));
    } else {
      this.elegidas.set([...this.elegidas(), { asignacion: a, cantidad: '', comentario: '' }]);
    }
    this.irA(Math.min(this.paso(), this.totalPasos() - 1));
  }

  // ------------------------------------------------------------------
  // Navegación y campos
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

  async setFecha(valor: string | string[] | null | undefined): Promise<void> {
    if (typeof valor === 'string' && valor && valor.slice(0, 10) !== this.fecha()) {
      this.fecha.set(valor.slice(0, 10));
      // Cambiar la fecha cambia por completo qué tareas hay abiertas.
      this.elegidas.set([]);
      await this.cargarLista();
    }
  }

  setHoraCierre(valor: string | string[] | null | undefined): void {
    if (typeof valor === 'string' && valor) {
      this.horaCierre.set(valor.length > 5 ? valor.slice(11, 16) : valor.slice(0, 5));
    }
  }

  setCampo(i: number, campo: 'cantidad' | 'comentario', v: string): void {
    this.elegidas.set(this.elegidas().map((c, k) => (k === i ? { ...c, [campo]: v } : c)));
  }

  abrirFinca(): void {
    this.destino = 'finca';
    this.selectorTitulo.set('Finca');
    this.selectorOpciones.set(this.fincas);
    this.selectorSeleccion.set(this.finca() ? [this.finca()!.id] : []);
    this.selectorVacio.set('Descargá los maestros.');
    this.selectorBuscador.set(null);
    this.selectorAbierto.set(true);
  }

  /** Responsables de campo: `rol = 8`. Son seis, así que va sin buscador. */
  async abrirResponsable(): Promise<void> {
    const f = this.finca();
    this.destino = 'responsable';
    this.selectorTitulo.set('Responsable');
    this.selectorOpciones.set(await this.catalogo.responsables(f ? f.id : null));
    this.selectorSeleccion.set(this.responsable() ? [this.responsable()!.id] : []);
    this.selectorVacio.set('Descargá los maestros: no hay responsables en este equipo.');
    this.selectorBuscador.set(false);
    this.selectorAbierto.set(true);
  }

  cerrarSelector(): void {
    this.selectorAbierto.set(false);
    this.destino = null;
  }

  async onSeleccion(ids: number[]): Promise<void> {
    const d = this.destino;
    const o = this.selectorOpciones().find((x) => x.id === ids[0]);
    const ref: Ref | null = o ? { id: o.id, nombre: o.nombre } : null;
    this.cerrarSelector();
    if (d === 'finca') {
      const antes = this.finca()?.id;
      this.finca.set(ref);
      // Solo un cambio REAL de finca invalida las tareas ya elegidas.
      // `antes === undefined` es "todavia no habia finca", no un cambio.
      if (antes !== undefined && antes !== ref?.id) {
        this.elegidas.set([]);
      }
      await this.validarResponsable();
      await this.cargarLista();
    } else if (d === 'responsable') {
      this.responsable.set(ref);
    }
  }

  /**
   * El responsable se puede elegir ANTES que la finca: en ese caso la lista
   * trae a los de las dos fincas. Al fijar la finca hay que revisar si el que
   * quedó elegido pertenece a ella — y solo entonces limpiarlo, diciendo por
   * qué.
   *
   * Borrarlo siempre (que es lo que hacía antes) obligaba a elegirlo dos
   * veces sin explicación; no borrarlo nunca dejaba un responsable de la otra
   * finca, que el servidor no rechaza pero es un dato equivocado.
   */
  private async validarResponsable(): Promise<void> {
    const r = this.responsable();
    if (!r) {
      return;
    }
    const validos = await this.catalogo.responsables(this.finca()?.id ?? null);
    if (!validos.some((v) => v.id === r.id)) {
      this.responsable.set(null);
      await this.aviso(`${r.nombre} no es responsable de esa finca; elegí otro.`);
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
    this.guardando.set(true);
    const guids: string[] = [];
    try {
      for (const c of this.elegidas()) {
        const a = c.asignacion;
        // El payload es mínimo a propósito: todo lo demás lo deriva el
        // servidor del AM. Si el AM todavía no llegó, el servidor omite este
        // guid de `results` y la cola lo reintenta sola.
        const payload = {
          am_guid: a.amGuid,
          trabajador_id: a.personalId,
          responsable_id: this.responsable()!.id,
          cantidad: Number(c.cantidad),
          hora_cierre: this.fechas.conOffset(`${this.fecha()}T${this.horaCierre()}:00`),
          comentario: c.comentario.trim(),
        };
        const guid = await this.cola.enqueue('pm', payload);
        guids.push(guid);
        await this.asignaciones.registrarPm(
          guid,
          a.personalId,
          this.fecha(),
          a.loteId,
          a.subtareaId,
        );
      }
    } finally {
      this.guardando.set(false);
    }

    await this.aviso(
      `${guids.length} tarea(s) cerrada(s) en el equipo. Se envían solas cuando haya red.`,
    );
    await this.router.navigateByUrl('/menu');
  }

  private async aviso(mensaje: string): Promise<void> {
    const t = await this.toast.create({ message: mensaje, duration: 3500, position: 'bottom' });
    await t.present();
  }
}
