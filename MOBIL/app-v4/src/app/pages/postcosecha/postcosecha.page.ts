import { Component, OnInit, computed, inject, signal } from '@angular/core';
import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonDatetime,
  IonDatetimeButton,
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
  hourglassOutline,
  personOutline,
  refreshOutline,
} from 'ionicons/icons';

import { ApiService, DiaPendienteApi, PartidaApi } from '../../core/api/api.service';
import { AppConfigService } from '../../core/config/app-config.service';
import { BootstrapService } from '../../core/bootstrap/bootstrap.service';
import { CatalogQueryService, OpcionCatalogo } from '../../core/catalog/catalog-query.service';
import { ClockService } from '../../core/clock/clock.service';
import { FechaService } from '../../core/captura/fecha.service';
import { PostcosechaService } from '../../core/captura/postcosecha.service';
import { SyncQueueService } from '../../core/sync/sync-queue.service';
import { SelectorComponent } from '../../shared/selector.component';

interface Ref {
  id: number;
  nombre: string;
}

/** Una partida en pantalla, venga del servidor o del espejo local. */
export interface Partida {
  guid: string;
  /** null mientras el servidor no haya contestado: se muestra "pendiente". */
  lotCode: string | null;
  fechaCosecha: string;
  fechaInicio: string;
  supervisor: string | null;
  pesoLote: number;
  pesoMallas: number;
  pesoBaba: number;
  cosechas: number;
  etapas: Set<string>;
  calidades: Set<string>;
  soloLocal: boolean;
}

/** Las cinco etapas, en orden. `resultado` no se registra como etapa suelta. */
const ETAPAS: { clave: string; nombre: string }[] = [
  { clave: 'presecado', nombre: 'Presecado' },
  { clave: 'fermentado', nombre: 'Fermentado' },
  { clave: 'secado_sol', nombre: 'Secado (sol)' },
  { clave: 'secado_maq', nombre: 'Secado (máquina)' },
];

/**
 * Postcosecha — el proceso del cacao, de la balanza al peso final.
 *
 * **No cierra ninguna tarea AM**: desde el ruteo por unidad (2026-09-05) el
 * jornal de poscosecha lo paga el PM. Acá se registra el proceso, igual que
 * riego registra el agua.
 *
 * Tres cosas que la pantalla NO hace, a propósito:
 *
 * - **No pide el número de proceso.** El `lot_code` (dddnnaa) lo asigna el
 *   servidor. Sin señal la partida se crea igual y muestra "pendiente de
 *   número" hasta el ACK (decisión de Kevin, 2026-09-05).
 * - **No pide el peso del lote.** Sale de las cosechas elegidas.
 * - **No obliga a un orden de etapas.** Los datos de v3 lo desmienten: de 98
 *   partidas, 42 tienen los dos secados y 13 no tienen ninguno.
 */
@Component({
  selector: 'app-postcosecha',
  standalone: true,
  templateUrl: './postcosecha.page.html',
  styleUrls: ['./postcosecha.page.scss'],
  imports: [
    SelectorComponent,
    IonBackButton,
    IonButton,
    IonButtons,
    IonContent,
    IonDatetime,
    IonDatetimeButton,
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
export class PostcosechaPage implements OnInit {
  private readonly catalogo = inject(CatalogQueryService);
  private readonly fechas = inject(FechaService);
  private readonly bootstrap = inject(BootstrapService);
  private readonly local = inject(PostcosechaService);
  private readonly cola = inject(SyncQueueService);
  private readonly clock = inject(ClockService);
  private readonly api = inject(ApiService);
  private readonly config = inject(AppConfigService);
  private readonly toast = inject(ToastController);

  readonly etapasDef = ETAPAS;

  /** 'lista' | 'nueva' | 'detalle' */
  readonly vista = signal<'lista' | 'nueva' | 'detalle'>('lista');

  readonly partidas = signal<Partida[]>([]);
  readonly cargandoLista = signal(false);
  readonly listaDesdeServidor = signal(false);
  readonly errorLista = signal<string | null>(null);
  readonly guardando = signal(false);

  // --- Nueva partida (pesaje) ---
  readonly fechaInicio = signal('');
  readonly horaInicio = signal('');
  readonly supervisor = signal<Ref | null>(null);
  readonly pesoMallas = signal<number | null>(null);
  readonly comentario = signal('');
  readonly dias = signal<DiaPendienteApi[]>([]);
  readonly diasElegidos = signal<string[]>([]);
  readonly cargandoDias = signal(false);
  readonly errorDias = signal<string | null>(null);

  // --- Detalle ---
  readonly partida = signal<Partida | null>(null);
  readonly etapaInicio = signal('');
  readonly etapaFin = signal('');
  readonly etapaComentario = signal('');
  readonly granoBuena = signal<number | null>(null);
  readonly granoLigera = signal<number | null>(null);
  readonly granoVioleta = signal<number | null>(null);
  readonly humedad1 = signal<number | null>(null);
  readonly humedad2 = signal<number | null>(null);
  readonly humedad3 = signal<number | null>(null);
  readonly pesoFinal = signal<number | null>(null);

  // --- Selector ---
  readonly selectorAbierto = signal(false);
  readonly selectorTitulo = signal('');
  readonly selectorOpciones = signal<OpcionCatalogo[]>([]);
  readonly selectorSeleccion = signal<number[]>([]);
  readonly selectorVacio = signal('No hay opciones para elegir.');
  readonly selectorBuscador = signal<boolean | null>(null);
  readonly alturaSelector = computed(() => {
    const n = Math.min(this.selectorOpciones().length, 12);
    const conDetalle = this.selectorOpciones().some((o) => !!o.detalle);
    const buscador = this.selectorBuscador() ?? this.selectorOpciones().length > 10;
    return `${56 + (buscador ? 60 : 0) + Math.max(n, 1) * (conDetalle ? 66 : 49) + 6}px`;
  });

  readonly sinHoraVerificada = computed(() => this.clock.offsetSeconds() === null);
  readonly limites = computed(() => this.fechas.limites('postcosecha', false));

  // --- Totales del pesaje ---

  readonly pesoElegido = computed(() => {
    const elegidos = new Set(this.diasElegidos());
    const suma = this.dias()
      .filter((d) => elegidos.has(d.fecha))
      .reduce((a, d) => a + d.peso, 0);
    return Math.round(suma * 100) / 100;
  });

  readonly cosechasElegidas = computed(() => {
    const elegidos = new Set(this.diasElegidos());
    return this.dias()
      .filter((d) => elegidos.has(d.fecha))
      .flatMap((d) => d.cosecha_ids);
  });

  readonly pesoBabaNuevo = computed(() => {
    const m = this.pesoMallas() ?? 0;
    return Math.round((this.pesoElegido() - m) * 100) / 100;
  });

  readonly problemasPesaje = computed(() => {
    const p: string[] = [];
    if (!this.supervisor()) p.push('Falta el supervisor de la partida.');
    if (!this.fechaInicio() || !this.horaInicio()) p.push('Falta la fecha de inicio.');
    if (this.diasElegidos().length === 0) p.push('Elegí al menos un día de cosecha.');
    const m = this.pesoMallas();
    if (m === null || m < 0) p.push('Falta el peso de las mallas vacías.');
    else if (m >= this.pesoElegido()) p.push('Las mallas pesan más que el lote: revisá el número.');
    return p;
  });

  readonly puedeGuardarPesaje = computed(
    () => this.problemasPesaje().length === 0 && !this.guardando(),
  );

  constructor() {
    addIcons({
      addOutline,
      cloudOfflineOutline,
      cloudUploadOutline,
      hourglassOutline,
      personOutline,
      refreshOutline,
    });
  }

  async ngOnInit(): Promise<void> {
    await this.config.cargar();
    await this.bootstrap.cargar();
    const ahora = this.fechas.ahoraLocal();
    this.fechaInicio.set(ahora.slice(0, 10));
    this.horaInicio.set(ahora.slice(11, 16));
    await this.cargarLista();
  }

  // ------------------------------------------------------------------
  // Lista de partidas abiertas
  // ------------------------------------------------------------------

  async cargarLista(): Promise<void> {
    this.cargandoLista.set(true);
    this.errorLista.set(null);

    const locales = await this.local.abiertasLocales();
    const mapa = new Map<string, Partida>();
    for (const l of locales) {
      const cargado = await this.local.cargadoLocal(l.guid);
      mapa.set(l.guid, {
        guid: l.guid,
        lotCode: null,
        fechaCosecha: l.fechaCosecha,
        fechaInicio: l.fechaInicio,
        supervisor: l.supervisor,
        pesoLote: l.pesoLote,
        pesoMallas: l.pesoMallas,
        pesoBaba: Math.round((l.pesoLote - l.pesoMallas) * 100) / 100,
        cosechas: l.cosechas,
        etapas: cargado.etapas,
        calidades: cargado.calidades,
        soloLocal: true,
      });
    }

    if (this.config.baseUrl()) {
      try {
        const r = await this.api.postcosechaAbiertas();
        for (const p of r.partidas) {
          // Gana el servidor: trae el lot_code y lo que cargaron otros equipos.
          // Las etapas locales se suman, no se pisan: una etapa recién
          // capturada sin señal todavía no está allá.
          const previo = mapa.get(p.guid);
          mapa.set(p.guid, this.aPartida(p, previo));
        }
        this.listaDesdeServidor.set(true);
      } catch {
        this.listaDesdeServidor.set(false);
        this.errorLista.set(
          'Sin respuesta del servidor: se muestran solo las partidas de este equipo.',
        );
      }
    } else {
      this.listaDesdeServidor.set(false);
    }

    this.partidas.set(
      [...mapa.values()].sort((a, b) => a.fechaInicio.localeCompare(b.fechaInicio)),
    );
    this.cargandoLista.set(false);

    // Si estábamos mirando una partida, se refresca con lo que llegó.
    const abierta = this.partida();
    if (abierta) {
      const nueva = this.partidas().find((x) => x.guid === abierta.guid);
      if (nueva) this.partida.set(nueva);
    }
  }

  private aPartida(p: PartidaApi, previo?: Partida): Partida {
    const etapas = new Set<string>(p.etapas ?? []);
    const calidades = new Set<string>(p.cal_secado ?? []);
    if (p.tiene_cal_ferm) calidades.add('fermentado');
    for (const e of previo?.etapas ?? []) etapas.add(e);
    for (const c of previo?.calidades ?? []) calidades.add(c);
    return {
      guid: p.guid,
      lotCode: p.lot_code,
      fechaCosecha: p.fecha_cosecha,
      fechaInicio: p.fecha_inicio,
      supervisor: p.supervisor,
      pesoLote: p.peso_lote,
      pesoMallas: p.peso_mallas,
      pesoBaba: p.peso_baba,
      cosechas: p.cosechas,
      etapas,
      calidades,
      soloLocal: false,
    };
  }

  // ------------------------------------------------------------------
  // Nueva partida
  // ------------------------------------------------------------------

  async nueva(): Promise<void> {
    this.vista.set('nueva');
    this.diasElegidos.set([]);
    this.pesoMallas.set(null);
    this.comentario.set('');
    await this.cargarDias();
  }

  async cargarDias(): Promise<void> {
    this.cargandoDias.set(true);
    this.errorDias.set(null);
    this.dias.set([]);
    if (!this.config.baseUrl()) {
      this.errorDias.set('Configurá el servidor: los días de cosecha vienen de allá.');
      this.cargandoDias.set(false);
      return;
    }
    try {
      const r = await this.api.postcosechaPendientes();
      this.dias.set(r.dias);
      if (r.dias.length === 0) {
        this.errorDias.set('No hay cosechas pendientes de procesar.');
      }
    } catch {
      // A diferencia del resto de la app, esta lista NO se puede resolver
      // offline: el servidor es el unico que sabe que cosechas ya entraron en
      // otra partida, y elegir a ciegas termina en un rechazo.
      this.errorDias.set('Sin respuesta del servidor: no se pueden traer los días de cosecha.');
    }
    this.cargandoDias.set(false);
  }

  alternarDia(fecha: string): void {
    const actual = this.diasElegidos();
    this.diasElegidos.set(
      actual.includes(fecha) ? actual.filter((f) => f !== fecha) : [...actual, fecha],
    );
  }

  diaElegido(fecha: string): boolean {
    return this.diasElegidos().includes(fecha);
  }

  async guardarPesaje(): Promise<void> {
    if (!this.puedeGuardarPesaje()) return;
    this.guardando.set(true);
    try {
      const inicio = this.fechas.conOffset(`${this.fechaInicio()}T${this.horaInicio()}:00`);
      const fechaCosecha = [...this.diasElegidos()].sort()[0];
      const payload = {
        supervisor_id: this.supervisor()!.id,
        fecha_inicio: inicio,
        peso_mallas: this.pesoMallas(),
        cosecha_ids: this.cosechasElegidas(),
        comentario: this.comentario().trim(),
      };
      const guid = await this.cola.enqueue('pc_proceso', payload);
      await this.local.registrarPartida({
        guid,
        fechaCosecha,
        fechaInicio: inicio,
        supervisorId: this.supervisor()!.id,
        supervisor: this.supervisor()!.nombre,
        pesoLote: this.pesoElegido(),
        pesoMallas: this.pesoMallas() as number,
        cosechas: this.cosechasElegidas().length,
        cerrada: false,
      });
      await this.aviso('Partida iniciada. El número de proceso llega con el envío.');
    } finally {
      this.guardando.set(false);
    }
    this.vista.set('lista');
    await this.cargarLista();
  }

  // ------------------------------------------------------------------
  // Detalle de una partida
  // ------------------------------------------------------------------

  abrir(p: Partida): void {
    this.partida.set(p);
    const ahora = this.fechas.ahoraLocal();
    this.etapaInicio.set(ahora);
    this.etapaFin.set('');
    this.etapaComentario.set('');
    this.granoBuena.set(null);
    this.granoLigera.set(null);
    this.granoVioleta.set(null);
    this.humedad1.set(null);
    this.humedad2.set(null);
    this.humedad3.set(null);
    this.pesoFinal.set(null);
    this.vista.set('detalle');
  }

  volver(): void {
    this.partida.set(null);
    this.vista.set('lista');
  }

  etapaHecha(clave: string): boolean {
    return this.partida()?.etapas.has(clave) ?? false;
  }

  calidadHecha(clave: string): boolean {
    return this.partida()?.calidades.has(clave) ?? false;
  }

  /** El análisis de secado sólo tiene sentido si esa etapa ya se registró. */
  puedeAnalizarSecado(clave: string): boolean {
    return this.etapaHecha(clave) && !this.calidadHecha(clave);
  }

  async registrarEtapa(clave: string): Promise<void> {
    const p = this.partida();
    if (!p || this.etapaHecha(clave) || this.guardando()) return;
    this.guardando.set(true);
    try {
      const payload = {
        proceso_guid: p.guid,
        etapa: clave,
        inicio: this.fechas.conOffset(this.etapaInicio()),
        fin: this.etapaFin() ? this.fechas.conOffset(this.etapaFin()) : null,
        comentario: this.etapaComentario().trim(),
      };
      await this.cola.enqueue('pc_etapa', payload);
      await this.local.registrarEtapa(p.guid, clave);
      p.etapas.add(clave);
      this.partida.set({ ...p });
      await this.aviso('Etapa registrada. Se envía sola cuando haya red.');
    } finally {
      this.guardando.set(false);
    }
  }

  readonly problemasGrano = computed(() => {
    const v = [this.granoBuena(), this.granoLigera(), this.granoVioleta()];
    if (v.some((x) => x === null || x < 0)) return ['Cargá los tres conteos de grano.'];
    if (v.reduce((a: number, x) => a + (x ?? 0), 0) === 0) {
      return ['El corte de grano no puede ser todo ceros.'];
    }
    return [];
  });

  async registrarGrano(): Promise<void> {
    const p = this.partida();
    if (!p || this.problemasGrano().length > 0 || this.guardando()) return;
    this.guardando.set(true);
    try {
      await this.cola.enqueue('pc_calidad_ferm', {
        proceso_guid: p.guid,
        fecha_muestra: this.fechas.conOffset(this.fechas.ahoraLocal()),
        buena: this.granoBuena(),
        ligera: this.granoLigera(),
        violeta: this.granoVioleta(),
      });
      await this.local.registrarCalidad(p.guid, 'fermentado');
      p.calidades.add('fermentado');
      this.partida.set({ ...p });
      await this.aviso('Corte de grano registrado.');
    } finally {
      this.guardando.set(false);
    }
  }

  readonly problemasHumedad = computed(() => {
    const v = [this.humedad1(), this.humedad2(), this.humedad3()];
    return v.some((x) => x === null || x <= 0) ? ['Cargá las tres lecturas de humedad.'] : [];
  });

  async registrarHumedad(etapa: string): Promise<void> {
    const p = this.partida();
    if (!p || this.problemasHumedad().length > 0 || this.guardando()) return;
    this.guardando.set(true);
    try {
      await this.cola.enqueue('pc_calidad_sec', {
        proceso_guid: p.guid,
        etapa,
        fecha_muestra: this.fechas.conOffset(this.fechas.ahoraLocal()),
        humedad_1: this.humedad1(),
        humedad_2: this.humedad2(),
        humedad_3: this.humedad3(),
      });
      await this.local.registrarCalidad(p.guid, etapa);
      p.calidades.add(etapa);
      this.partida.set({ ...p });
      await this.aviso('Análisis de secado registrado.');
    } finally {
      this.guardando.set(false);
    }
  }

  readonly puedeCerrar = computed(() => (this.pesoFinal() ?? 0) > 0 && !this.guardando());

  /** El peso final CIERRA la partida: el servidor deja además la etapa. */
  async cerrar(): Promise<void> {
    const p = this.partida();
    if (!p || !this.puedeCerrar()) return;
    this.guardando.set(true);
    try {
      await this.cola.enqueue('pc_resultado', {
        proceso_guid: p.guid,
        fecha: this.fechas.conOffset(this.fechas.ahoraLocal()),
        peso_final: this.pesoFinal(),
      });
      await this.local.cerrarPartida(p.guid);
      await this.aviso(`Partida cerrada con ${this.pesoFinal()} lb.`);
    } finally {
      this.guardando.set(false);
    }
    this.partida.set(null);
    this.vista.set('lista');
    await this.cargarLista();
  }

  // ------------------------------------------------------------------
  // Selector y varios
  // ------------------------------------------------------------------

  async abrirSupervisor(): Promise<void> {
    this.selectorTitulo.set('Supervisor');
    this.selectorOpciones.set(await this.catalogo.responsables(null));
    this.selectorSeleccion.set(this.supervisor() ? [this.supervisor()!.id] : []);
    this.selectorVacio.set('Descargá los maestros: no hay supervisores en este equipo.');
    this.selectorBuscador.set(false);
    this.selectorAbierto.set(true);
  }

  onSeleccion(ids: number[]): void {
    const o = this.selectorOpciones().find((x) => x.id === ids[0]);
    this.supervisor.set(o ? { id: o.id, nombre: o.nombre } : null);
    this.cerrarSelector();
  }

  cerrarSelector(): void {
    this.selectorAbierto.set(false);
  }

  setFechaInicio(valor: string | string[] | null | undefined): void {
    if (typeof valor === 'string' && valor) {
      this.fechaInicio.set(valor.slice(0, 10));
    }
  }

  setHoraInicio(valor: string | string[] | null | undefined): void {
    if (typeof valor === 'string' && valor) {
      this.horaInicio.set(valor.length > 5 ? valor.slice(11, 16) : valor.slice(0, 5));
    }
  }

  numero(valor: unknown): number | null {
    const n = Number(valor);
    return valor === '' || valor === null || Number.isNaN(n) ? null : n;
  }

  private async aviso(mensaje: string): Promise<void> {
    const t = await this.toast.create({ message: mensaje, duration: 3500, position: 'bottom' });
    await t.present();
  }
}
