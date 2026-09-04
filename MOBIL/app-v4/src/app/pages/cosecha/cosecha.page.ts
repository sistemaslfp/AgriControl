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
  IonSpinner,
  IonTitle,
  IonToolbar,
  ToastController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  addOutline,
  cloudOfflineOutline,
  cloudUploadOutline,
  personOutline,
  refreshOutline,
  removeOutline,
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

/** Una fila de la grilla de sacos. `libras` vacio = todavia sin pesar. */
interface Saco {
  numero: number;
  libras: number | null;
}

/** Una asignacion elegida, con lo unico que la cosecha aporta: los sacos. */
interface CierreCosecha {
  asignacion: AsignacionAmLocal;
  sacos: Saco[];
  observaciones: string;
}

/** Una tarea AM de cosecha con las personas que le faltan cerrar. */
export interface GrupoTareaCosecha {
  clave: string;
  asignaciones: AsignacionAmLocal[];
  lote: string;
  modulos: string;
  subtarea: string;
  soloLocal: boolean;
}

/**
 * Cosecha de Cacao — el CIERRE de una tarea AM, con el detalle de sacos.
 *
 * Decision de Kevin (2026-09-03): **cosecha funciona como el PM**. Todas las
 * tareas viven en el AM; esta pantalla no crea ninguna y **no vuelve a elegir
 * trabajador**: elige una tarea AM de cosecha abierta --que ya trae lote,
 * modulos, subtarea y personal-- y le carga los sacos de cada persona.
 *
 * **La suma de las libras es el avance de la tarea.** El servidor escribe
 * `reg_am.cantidad` con ese total. No es una interpretacion: sobre 14.466
 * pares (PM de cosecha, fila de z_cosecha_cacao) del mismo dia, trabajador y
 * subtarea, 13.835 tienen `cantidad = total_peso` (95,6 %) y ninguno coincide
 * con el conteo de sacos. La unidad de esas subtareas es Libra, no Saco.
 *
 * El PM, del otro lado, ya no muestra estas tareas.
 */
@Component({
  selector: 'app-cosecha',
  standalone: true,
  templateUrl: './cosecha.page.html',
  styleUrls: ['./cosecha.page.scss'],
  imports: [
    BarraPasosComponent,
    SelectorComponent,
    SwipePasosDirective,
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
    IonSpinner,
    IonTitle,
    IonToolbar,
  ],
})
export class CosechaPage implements OnInit {
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
  readonly fecha = signal('');
  readonly horaCierre = signal('');
  readonly finca = signal<Ref | null>(null);
  readonly responsable = signal<Ref | null>(null);

  // --- Asignaciones ---
  readonly disponibles = signal<AsignacionAmLocal[]>([]);
  readonly elegidas = signal<CierreCosecha[]>([]);
  readonly cargandoLista = signal(false);
  readonly listaDesdeServidor = signal(false);
  readonly errorLista = signal<string | null>(null);

  readonly paso = signal(0);
  readonly guardando = signal(false);

  readonly totalPasos = computed(() => this.elegidas().length + 2);
  readonly indiceRevision = computed(() => this.totalPasos() - 1);
  readonly indiceCierre = computed(() => this.paso() - 1);
  readonly etiquetaPaso = computed(() => {
    const p = this.paso();
    if (p === 0) return 'Tareas de cosecha';
    if (p === this.indiceRevision()) return 'Revisar y enviar';
    return `Sacos ${p}`;
  });

  // --- Selector ---
  readonly selectorAbierto = signal(false);
  readonly selectorTitulo = signal('');
  readonly selectorOpciones = signal<OpcionCatalogo[]>([]);
  readonly selectorSeleccion = signal<number[]>([]);
  readonly selectorVacio = signal('No hay opciones para elegir.');
  readonly selectorBuscador = signal<boolean | null>(null);
  readonly selectorMultiple = signal(false);
  private readonly grupoActivo = signal<string | null>(null);
  readonly alturaSelector = computed(() => {
    const opciones = this.selectorOpciones();
    const n = Math.min(opciones.length, 12);
    const conDetalle = opciones.some((o) => !!o.detalle);
    const buscador = this.selectorBuscador() ?? opciones.length > 10;
    return `${56 + (buscador ? 60 : 0) + (this.selectorMultiple() ? 44 : 0) +
      Math.max(n, 1) * (conDetalle ? 66 : 49) + 6}px`;
  });
  private destino: 'finca' | 'responsable' | 'personas' | null = null;

  private fincas: OpcionCatalogo[] = [];

  readonly limites = computed(() => this.fechas.limites('cosecha', false));
  readonly sinHoraVerificada = computed(() => this.clock.offsetSeconds() === null);

  // --- Totales ---

  totalSacos(i: number): number {
    return (this.elegidas()[i]?.sacos ?? []).filter((s) => (s.libras ?? 0) > 0).length;
  }

  totalPeso(i: number): number {
    const suma = (this.elegidas()[i]?.sacos ?? []).reduce((a, s) => a + (s.libras ?? 0), 0);
    return Math.round(suma * 100) / 100;
  }

  readonly totalSacosGeneral = computed(() =>
    this.elegidas().reduce((a, c) => a + c.sacos.filter((s) => (s.libras ?? 0) > 0).length, 0),
  );

  readonly totalPesoGeneral = computed(() => {
    const suma = this.elegidas().reduce(
      (a, c) => a + c.sacos.reduce((b, s) => b + (s.libras ?? 0), 0),
      0,
    );
    return Math.round(suma * 100) / 100;
  });

  // --- Validacion ---

  readonly problemasEncabezado = computed(() => {
    const p: string[] = [];
    if (!this.fecha()) p.push('Falta la fecha de cosecha.');
    if (!this.finca()) p.push('Falta la finca.');
    if (!this.responsable()) p.push('Falta el responsable que cierra las tareas.');
    if (!this.horaCierre()) p.push('Falta la hora de cierre.');
    if (this.elegidas().length === 0) {
      p.push('Elige al menos una persona de una tarea de cosecha.');
    }
    return p;
  });

  problemasCierre(i: number): string[] {
    const c = this.elegidas()[i];
    if (!c) return [];
    const p: string[] = [];
    if (c.sacos.filter((s) => (s.libras ?? 0) > 0).length === 0) {
      p.push('Sin sacos pesados no hay cosecha: cargá al menos uno.');
    }
    if (c.sacos.some((s) => s.libras !== null && s.libras <= 0)) {
      p.push('Hay sacos en 0: borrálos o poneles el peso.');
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
    addIcons({
      addOutline,
      cloudOfflineOutline,
      cloudUploadOutline,
      personOutline,
      refreshOutline,
      removeOutline,
    });
  }

  async ngOnInit(): Promise<void> {
    await this.config.cargar();
    await this.bootstrap.cargar();
    const ahora = this.fechas.ahoraLocal();
    this.fecha.set(ahora.slice(0, 10));
    this.horaCierre.set(ahora.slice(11, 16));
    this.fincas = await this.catalogo.fincas();
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
  // Lista de tareas AM de cosecha abiertas
  // ------------------------------------------------------------------

  async cargarLista(): Promise<void> {
    this.cargandoLista.set(true);
    this.errorLista.set(null);
    const fecha = this.fecha();
    const fincaId = this.finca()?.id ?? null;

    // El espejo local cubre los AM de este equipo que todavia no llegaron al
    // servidor; hay que filtrarlo aca porque no pasa por /v4/am_abiertos.
    const soloCosecha = await this.catalogo.subtareasSoloCosecha();
    const locales = (await this.asignaciones.abiertasLocales(fecha)).filter((a) =>
      soloCosecha.has(a.subtareaId),
    );
    let delServidor: AsignacionAmLocal[] = [];

    if (this.config.baseUrl()) {
      try {
        const r = await this.api.amAbiertos(fecha, fincaId, 'cosecha');
        delServidor = r.asignaciones.map((a) => ({
          amGuid: a.am_guid,
          capturaGuid: a.captura_guid ?? null,
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
      } catch {
        this.listaDesdeServidor.set(false);
        this.errorLista.set(
          'Sin respuesta del servidor: se muestran solo las tareas cargadas en este equipo.',
        );
      }
    } else {
      this.listaDesdeServidor.set(false);
    }

    const mapa = new Map<string, AsignacionAmLocal>();
    for (const a of [...locales, ...delServidor]) {
      mapa.set(`${a.amGuid}|${a.personalId}`, a);
    }
    const lista = [...mapa.values()].sort(
      (a, b) =>
        a.lote.localeCompare(b.lote) ||
        a.subtarea.localeCompare(b.subtarea) ||
        a.fechaProceso.localeCompare(b.fechaProceso) ||
        a.trabajador.localeCompare(b.trabajador) ||
        a.amGuid.localeCompare(b.amGuid),
    );
    this.disponibles.set(lista);

    const vivas = new Set(lista.map((a) => `${a.amGuid}|${a.personalId}`));
    this.elegidas.set(this.elegidas().filter((c) => vivas.has(this.clave(c.asignacion))));
    this.cargandoLista.set(false);
  }

  clave(a: AsignacionAmLocal): string {
    return `${a.amGuid}|${a.personalId}`;
  }

  /** La identidad de la TAREA: el trabajo, no el formulario. Igual que el PM. */
  claveGrupo(a: AsignacionAmLocal): string {
    return `${a.loteId}|${a.subtareaId}|${a.modulos}`;
  }

  readonly grupos = computed<GrupoTareaCosecha[]>(() => {
    const porGrupo = new Map<string, AsignacionAmLocal[]>();
    for (const a of this.disponibles()) {
      const k = this.claveGrupo(a);
      const ya = porGrupo.get(k);
      if (ya) {
        ya.push(a);
      } else {
        porGrupo.set(k, [a]);
      }
    }
    return [...porGrupo.entries()].map(([clave, asignaciones]) => ({
      clave,
      asignaciones,
      lote: asignaciones[0].lote,
      modulos: asignaciones[0].modulos,
      subtarea: asignaciones[0].subtarea,
      soloLocal: asignaciones.every((a) => a.origen === 'local'),
    }));
  });

  elegidasDe(g: GrupoTareaCosecha): AsignacionAmLocal[] {
    const vivas = new Set(this.elegidas().map((c) => this.clave(c.asignacion)));
    return g.asignaciones.filter((a) => vivas.has(this.clave(a)));
  }

  resumenPersonas(g: GrupoTareaCosecha): string {
    const e = this.elegidasDe(g);
    if (e.length === 0) {
      const n = g.asignaciones.length;
      return n === 1 ? '1 persona por cerrar' : `${n} personas por cerrar`;
    }
    if (e.length <= 2) {
      return e.map((a) => a.trabajador).join(', ');
    }
    return `${e[0].trabajador} y ${e.length - 1} mas`;
  }

  abrirPersonas(g: GrupoTareaCosecha): void {
    this.destino = 'personas';
    this.grupoActivo.set(g.clave);
    this.selectorTitulo.set(g.subtarea);
    this.selectorMultiple.set(true);
    this.selectorOpciones.set(
      g.asignaciones.map((a) => ({
        id: a.personalId,
        nombre: a.trabajador,
        detalle: a.origen === 'local' ? 'Cargada en este equipo, sin enviar' : undefined,
      })),
    );
    this.selectorSeleccion.set(this.elegidasDe(g).map((a) => a.personalId));
    this.selectorVacio.set('Esta tarea no tiene personas por cerrar.');
    this.selectorBuscador.set(null);
    this.selectorAbierto.set(true);
  }

  /** Lo ya elegido CONSERVA sus sacos: reconstruirlo borraria lo pesado. */
  private aplicarPersonas(g: GrupoTareaCosecha, ids: number[]): void {
    const quedan = new Set(ids);
    const delGrupo = new Set(g.asignaciones.map((a) => this.clave(a)));
    const previas = new Map(
      this.elegidas()
        .filter((c) => delGrupo.has(this.clave(c.asignacion)))
        .map((c) => [c.asignacion.personalId, c] as const),
    );
    const otras = this.elegidas().filter((c) => !delGrupo.has(this.clave(c.asignacion)));
    const nuevas = g.asignaciones
      .filter((a) => quedan.has(a.personalId))
      .map(
        (a) =>
          previas.get(a.personalId) ?? {
            asignacion: a,
            sacos: [{ numero: 1, libras: null }],
            observaciones: '',
          },
      );
    this.elegidas.set([...otras, ...nuevas]);
    this.irA(Math.min(this.paso(), this.totalPasos() - 1));
  }

  // ------------------------------------------------------------------
  // Sacos
  // ------------------------------------------------------------------

  agregarSaco(i: number): void {
    this.actualizar(i, (c) => ({
      ...c,
      sacos: [...c.sacos, { numero: c.sacos.length + 1, libras: null }],
    }));
  }

  quitarSaco(i: number, numero: number): void {
    // Se renumera: los numeros son la posicion en la grilla, no una identidad.
    // Un hueco (1, 3, 4) confunde al contar en el campo.
    this.actualizar(i, (c) => ({
      ...c,
      sacos: c.sacos.filter((s) => s.numero !== numero).map((s, k) => ({ ...s, numero: k + 1 })),
    }));
  }

  setLibras(i: number, numero: number, valor: string): void {
    const v = valor.trim() === '' ? null : Number(valor.replace(',', '.'));
    this.actualizar(i, (c) => ({
      ...c,
      sacos: c.sacos.map((s) =>
        s.numero === numero
          ? { ...s, libras: v === null || Number.isNaN(v) ? null : Math.round(v * 100) / 100 }
          : s,
      ),
    }));
  }

  /**
   * El selector "cantidad de sacos" de la pantalla vieja, sin el tope de 15.
   * Achicar NUNCA borra un saco que ya tiene peso.
   */
  setCantidadSacos(i: number, valor: string): void {
    const n = Math.max(0, Math.min(200, Math.floor(Number(valor) || 0)));
    this.actualizar(i, (c) => {
      const sacos = [...c.sacos];
      while (sacos.length < n) {
        sacos.push({ numero: sacos.length + 1, libras: null });
      }
      while (sacos.length > n && (sacos[sacos.length - 1].libras ?? 0) === 0) {
        sacos.pop();
      }
      return { ...c, sacos };
    });
  }

  setObservaciones(i: number, texto: string): void {
    this.actualizar(i, (c) => ({ ...c, observaciones: texto }));
  }

  private actualizar(i: number, cambio: (c: CierreCosecha) => CierreCosecha): void {
    this.elegidas.set(this.elegidas().map((c, k) => (k === i ? cambio(c) : c)));
  }

  // ------------------------------------------------------------------
  // Navegacion y encabezado
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
      this.elegidas.set([]);
      await this.cargarLista();
    }
  }

  setHoraCierre(valor: string | string[] | null | undefined): void {
    if (typeof valor === 'string' && valor) {
      this.horaCierre.set(valor.length > 5 ? valor.slice(11, 16) : valor.slice(0, 5));
    }
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

  /** El mismo filtro de rol 8 que el PM; acá se llama Supervisor. */
  async abrirResponsable(): Promise<void> {
    const f = this.finca();
    this.destino = 'responsable';
    this.selectorTitulo.set('Supervisor');
    this.selectorOpciones.set(await this.catalogo.responsables(f ? f.id : null));
    this.selectorSeleccion.set(this.responsable() ? [this.responsable()!.id] : []);
    this.selectorVacio.set('Descargá los maestros: no hay supervisores en este equipo.');
    this.selectorBuscador.set(false);
    this.selectorAbierto.set(true);
  }

  onCambio(ids: number[]): void {
    if (this.destino !== 'personas') {
      return;
    }
    const grupo = this.grupos().find((g) => g.clave === this.grupoActivo());
    if (grupo) {
      this.aplicarPersonas(grupo, ids);
    }
  }

  cerrarSelector(): void {
    this.selectorAbierto.set(false);
    this.destino = null;
    this.selectorMultiple.set(false);
    this.grupoActivo.set(null);
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
        this.elegidas.set([]);
      }
      await this.validarResponsable();
      await this.cargarLista();
    } else if (d === 'responsable') {
      this.responsable.set(ref);
    }
  }

  private async validarResponsable(): Promise<void> {
    const r = this.responsable();
    if (!r) {
      return;
    }
    const validos = await this.catalogo.responsables(this.finca()?.id ?? null);
    if (!validos.some((v) => v.id === r.id)) {
      this.responsable.set(null);
      await this.aviso(`${r.nombre} no es supervisor de esa finca; Elige otro.`);
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
        const sacos = c.sacos
          .filter((s) => (s.libras ?? 0) > 0)
          .map((s, k) => ({ numero: k + 1, libras: s.libras as number }));
        const totalPeso = Math.round(sacos.reduce((x, s) => x + s.libras, 0) * 100) / 100;
        // Minimo a proposito: finca, lote, modulos, subtarea, trabajador y
        // fecha los deriva el servidor del AM. Lo unico que aporta la cosecha
        // son los sacos -- y su suma pasa a ser el avance de la tarea.
        const payload = {
          am_guid: a.amGuid,
          trabajador_id: a.personalId,
          responsable_id: this.responsable()!.id,
          hora_cierre: this.fechas.conOffset(`${this.fecha()}T${this.horaCierre()}:00`),
          sacos,
          total_sacos: sacos.length,
          total_peso: totalPeso,
          observaciones: c.observaciones.trim(),
        };
        const guid = await this.cola.enqueue('cosecha', payload);
        guids.push(guid);
        // El mismo espejo local que el PM: una tarea cerrada no vuelve a la
        // lista aunque el envio siga pendiente.
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
      `${guids.length} tarea(s) cerrada(s) con ${this.totalSacosGeneral()} saco(s) ` +
        `y ${this.totalPesoGeneral()} lb. Se envían solas cuando haya red.`,
    );
    await this.router.navigateByUrl('/menu');
  }

  private async aviso(mensaje: string): Promise<void> {
    const t = await this.toast.create({ message: mensaje, duration: 3500, position: 'bottom' });
    await t.present();
  }
}
