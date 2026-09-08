import { Component, OnInit, computed, inject, signal } from '@angular/core';
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
  checkmarkCircleOutline,
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
import { BarraPasosComponent, SwipePasosDirective } from '../../shared/pasos';
import { SelectorComponent } from '../../shared/selector.component';

interface Ref {
  id: number;
  nombre: string;
}

/** Lo que se registró de una etapa. */
export interface EtapaInfo {
  inicio: string | null;
  fin: string | null;
  comentario: string | null;
}

export interface CalFerm {
  buena: number;
  ligera: number;
  violeta: number;
}

export interface CalSec {
  humedad1: number;
  humedad2: number;
  humedad3: number;
  promedio: number;
  granos: number | null;
  indice: number | null;
  vanosPct: number | null;
}

/** Un registro de postcosecha en pantalla, del servidor o del espejo local. */
export interface Registro {
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
  etapas: Map<string, EtapaInfo>;
  calFerm: CalFerm | null;
  calSec: Map<string, CalSec>;
  soloLocal: boolean;
}

interface FormEtapa {
  inicio: string;
  fin: string;
  comentario: string;
}

interface FormHumedad {
  h1: number | null;
  h2: number | null;
  h3: number | null;
  granos: number | null;
  vanosG: number | null;
}

/**
 * Las cinco ventanas del detalle, en el orden en que ocurren. `resultado` no
 * es una etapa que se registre suelta: la escribe `pc_resultado` junto con el
 * peso final.
 *
 * `calidad` dice qué análisis se captura en esa ventana. **Secado a máquina no
 * captura ninguno** (Kevin, 2026-09-08): sólo inicio, fin y el tiempo empleado.
 * OJO con el dato histórico, que va al revés: de los 67 análisis de secado de
 * v3, **49 son de Secado Máquina** y 18 de Secado Sol. Por eso la ventana
 * igual MUESTRA el análisis si el registro ya lo trae — deja de pedirlo, no de
 * mostrarlo.
 */
const ETAPAS: { clave: string; nombre: string; calidad: 'grano' | 'humedad' | null }[] = [
  { clave: 'presecado', nombre: 'Presecado', calidad: null },
  { clave: 'fermentado', nombre: 'Fermentado', calidad: 'grano' },
  { clave: 'secado_sol', nombre: 'Secado (sol)', calidad: 'humedad' },
  { clave: 'secado_maq', nombre: 'Secado (máquina)', calidad: null },
  { clave: 'resultado', nombre: 'Peso final', calidad: null },
];

/**
 * La muestra de grano pesa 500 g. No es un supuesto: en las **67 filas** de
 * `z_postharvest_dryingquality` el índice guardado por v3 es exactamente
 * `500 / número de granos`, sin una sola excepción. De ahí salen los dos
 * indicadores del secado.
 */
const MUESTRA_G = 500;

const VACIO: FormEtapa = { inicio: '', fin: '', comentario: '' };
const SIN_HUMEDAD: FormHumedad = { h1: null, h2: null, h3: null, granos: null, vanosG: null };

/**
 * Postcosecha — el proceso del cacao, de la balanza al peso final.
 *
 * **No cierra ninguna tarea AM**: desde el ruteo por unidad (2026-09-05) el
 * jornal de poscosecha lo paga el PM. Acá se registra el proceso, igual que
 * riego registra el agua.
 *
 * El detalle es **una ventana por etapa, deslizable**, como en v3 — y
 * **NINGUNA es excluyente**: se puede pasar de largo una etapa que no se hizo
 * y seguir con la siguiente. Lo que no se registra queda en blanco, que es
 * exactamente como v3 guardaba las etapas salteadas (de 98 partidas, 42
 * tienen los dos secados y 13 no tienen ninguno).
 *
 * Al volver a una etapa ya registrada se muestran **sus datos**, no un cartel
 * de "ya está": lo que el supervisor quiere ahí es leer lo que cargó.
 */
@Component({
  selector: 'app-postcosecha',
  standalone: true,
  templateUrl: './postcosecha.page.html',
  styleUrls: ['./postcosecha.page.scss'],
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
  readonly muestraG = MUESTRA_G;

  /** 'lista' | 'nuevo' | 'detalle' */
  readonly vista = signal<'lista' | 'nuevo' | 'detalle'>('lista');

  readonly registros = signal<Registro[]>([]);
  readonly cargandoLista = signal(false);
  readonly listaDesdeServidor = signal(false);
  readonly errorLista = signal<string | null>(null);
  readonly guardando = signal(false);

  // --- Nuevo registro (pesaje) ---
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
  readonly registro = signal<Registro | null>(null);
  readonly paso = signal(0);
  private readonly formEtapa = signal<Record<string, FormEtapa>>({});
  private readonly formHumedad = signal<Record<string, FormHumedad>>({});
  readonly granoBuena = signal<number | null>(null);
  readonly granoLigera = signal<number | null>(null);
  readonly granoVioleta = signal<number | null>(null);
  readonly pesoFinal = signal<number | null>(null);

  readonly etapaActualDef = computed(() => ETAPAS[this.paso()] ?? ETAPAS[0]);
  readonly etiquetaPaso = computed(() => this.etapaActualDef().nombre);

  // --- Selector ---
  readonly selectorAbierto = signal(false);
  readonly selectorTitulo = signal('');
  readonly selectorOpciones = signal<OpcionCatalogo[]>([]);
  readonly selectorSeleccion = signal<number[]>([]);
  readonly selectorVacio = signal('No hay opciones para elegir.');
  readonly selectorBuscador = signal<boolean | null>(null);
  readonly selectorMultiple = signal(false);
  private destino: 'supervisor' | 'dias' | null = null;
  readonly alturaSelector = computed(() => {
    const n = Math.min(this.selectorOpciones().length, 12);
    const conDetalle = this.selectorOpciones().some((o) => !!o.detalle);
    const buscador = this.selectorBuscador() ?? this.selectorOpciones().length > 10;
    return `${56 + (buscador ? 60 : 0) + (this.selectorMultiple() ? 44 : 0) +
      Math.max(n, 1) * (conDetalle ? 66 : 49) + 6}px`;
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

  readonly resumenDias = computed(() => {
    const n = this.diasElegidos().length;
    return n === 0 ? 'Sin elegir' : `${n} día(s) · ${this.pesoElegido()} lb`;
  });

  readonly problemasPesaje = computed(() => {
    const p: string[] = [];
    if (!this.supervisor()) p.push('Falta el supervisor del registro.');
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
      checkmarkCircleOutline,
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
  // Lista de registros abiertos
  // ------------------------------------------------------------------

  async cargarLista(): Promise<void> {
    this.cargandoLista.set(true);
    this.errorLista.set(null);

    const locales = await this.local.abiertosLocales();
    const mapa = new Map<string, Registro>();
    for (const l of locales) {
      const cargado = await this.local.cargadoLocal(l.guid);
      const etapas = new Map<string, EtapaInfo>();
      for (const [clave, e] of cargado.etapas) {
        etapas.set(clave, { inicio: e.inicio, fin: e.fin, comentario: e.comentario });
      }
      const calSec = new Map<string, CalSec>();
      let calFerm: CalFerm | null = null;
      for (const [clave, d] of cargado.calidades) {
        if (clave === 'fermentado') {
          calFerm = {
            buena: Number(d['buena'] ?? 0),
            ligera: Number(d['ligera'] ?? 0),
            violeta: Number(d['violeta'] ?? 0),
          };
        } else {
          calSec.set(clave, {
            humedad1: Number(d['humedad_1'] ?? 0),
            humedad2: Number(d['humedad_2'] ?? 0),
            humedad3: Number(d['humedad_3'] ?? 0),
            promedio: Number(d['humedad_promedio'] ?? 0),
            granos: d['granos_muestra'] == null ? null : Number(d['granos_muestra']),
            indice: d['indice_grano_g'] == null ? null : Number(d['indice_grano_g']),
            vanosPct: d['granos_vacios_pct'] == null ? null : Number(d['granos_vacios_pct']),
          });
        }
      }
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
        etapas,
        calFerm,
        calSec,
        soloLocal: true,
      });
    }

    if (this.config.baseUrl()) {
      try {
        const r = await this.api.postcosechaAbiertas();
        for (const p of r.partidas) {
          // Gana el servidor: trae el lot_code y lo que cargaron otros equipos.
          // Lo local se suma, no se pisa: una etapa recién capturada sin señal
          // todavía no está allá.
          mapa.set(p.guid, this.aRegistro(p, mapa.get(p.guid)));
        }
        this.listaDesdeServidor.set(true);
      } catch {
        this.listaDesdeServidor.set(false);
        this.errorLista.set(
          'Sin respuesta del servidor: se muestran solo los registros de este equipo.',
        );
      }
    } else {
      this.listaDesdeServidor.set(false);
    }

    this.registros.set(
      [...mapa.values()].sort((a, b) => a.fechaInicio.localeCompare(b.fechaInicio)),
    );
    this.cargandoLista.set(false);

    const abierto = this.registro();
    if (abierto) {
      const nuevo = this.registros().find((x) => x.guid === abierto.guid);
      if (nuevo) this.registro.set(nuevo);
    }
  }

  private aRegistro(p: PartidaApi, previo?: Registro): Registro {
    const etapas = new Map<string, EtapaInfo>();
    for (const e of p.etapas ?? []) {
      etapas.set(e.etapa, { inicio: e.inicio, fin: e.fin, comentario: e.comentario });
    }
    for (const [clave, info] of previo?.etapas ?? []) {
      if (!etapas.has(clave)) etapas.set(clave, info);
    }

    const calSec = new Map<string, CalSec>();
    for (const q of p.cal_secado ?? []) {
      calSec.set(q.etapa, {
        humedad1: q.humedad_1,
        humedad2: q.humedad_2,
        humedad3: q.humedad_3,
        promedio: q.humedad_promedio,
        granos: q.granos_muestra,
        indice: q.indice_grano_g,
        vanosPct: q.granos_vacios_pct,
      });
    }
    for (const [clave, info] of previo?.calSec ?? []) {
      if (!calSec.has(clave)) calSec.set(clave, info);
    }

    const calFerm: CalFerm | null = p.cal_ferm
      ? { buena: p.cal_ferm.buena, ligera: p.cal_ferm.ligera, violeta: p.cal_ferm.violeta }
      : (previo?.calFerm ?? null);

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
      calFerm,
      calSec,
      soloLocal: false,
    };
  }

  /**
   * En qué etapa está el registro: la última registrada, por nombre. La lista
   * decía "N etapa(s)" y eso no le sirve a nadie — lo que se pregunta al
   * mirar la lista es en qué anda cada uno.
   *
   * Sin ninguna etapa registrada NO se dice "Sin iniciar": el pesaje ya puso
   * el cacao en presecado, lo que falta es cerrar esa etapa con su fin.
   */
  etapaDe(r: Registro): string {
    for (let i = ETAPAS.length - 1; i >= 0; i--) {
      if (r.etapas.has(ETAPAS[i].clave)) {
        return ETAPAS[i].nombre;
      }
    }
    return 'Presecado en curso';
  }

  // ------------------------------------------------------------------
  // Nuevo registro
  // ------------------------------------------------------------------

  async nuevo(): Promise<void> {
    this.vista.set('nuevo');
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
      // otro registro, y elegir a ciegas termina en un rechazo.
      this.errorDias.set('Sin respuesta del servidor: no se pueden traer los días de cosecha.');
    }
    this.cargandoDias.set(false);
  }

  /**
   * Los días van en el MISMO selector de checkbox que el resto de la app. El
   * id de cada opción es el primer `cosecha_id` del día: es estable y evita
   * inventar una clave paralela.
   */
  abrirDias(): void {
    this.destino = 'dias';
    this.selectorTitulo.set('Días de cosecha');
    this.selectorOpciones.set(
      this.dias().map((d) => ({
        id: d.cosecha_ids[0],
        nombre: d.fecha,
        detalle: `${d.peso} lb · ${d.sacos} saco(s) en ${d.cosechas} registro(s)`,
      })),
    );
    this.selectorSeleccion.set(this.idsElegidos());
    this.selectorVacio.set('No hay cosechas pendientes de procesar.');
    this.selectorBuscador.set(null);
    this.selectorMultiple.set(true);
    this.selectorAbierto.set(true);
  }

  private idsElegidos(): number[] {
    const elegidos = new Set(this.diasElegidos());
    return this.dias().filter((d) => elegidos.has(d.fecha)).map((d) => d.cosecha_ids[0]);
  }

  private aplicarDias(ids: number[]): void {
    const set = new Set(ids);
    this.diasElegidos.set(
      this.dias().filter((d) => set.has(d.cosecha_ids[0])).map((d) => d.fecha),
    );
  }

  /**
   * El pesaje abre la PARTIDA y nada más.
   *
   * Hasta el 2026-09-08 mandaba además la etapa `presecado` con `fin: null`,
   * porque en v3 el botón decía "INICIAR PRESECADO". Con el fin obligatorio
   * eso quedaba en un callejón sin salida: la etapa nacía registrada y sin
   * fin, `registrarEtapa()` no la vuelve a tocar y el servidor rechaza el
   * segundo envío por `UNIQUE (partida, etapa)`. Ahora el presecado se
   * registra como cualquier otra etapa, en el detalle, con el inicio ya
   * cargado con la fecha del pesaje y el fin cuando de verdad terminó.
   */
  async guardarPesaje(): Promise<void> {
    if (!this.puedeGuardarPesaje()) return;
    this.guardando.set(true);
    try {
      const inicio = this.fechas.conOffset(`${this.fechaInicio()}T${this.horaInicio()}:00`);
      const fechaCosecha = [...this.diasElegidos()].sort()[0];
      const guid = await this.cola.enqueue('pc_proceso', {
        supervisor_id: this.supervisor()!.id,
        fecha_inicio: inicio,
        peso_mallas: this.pesoMallas(),
        cosecha_ids: this.cosechasElegidas(),
        comentario: this.comentario().trim(),
      });
      await this.local.registrarProceso({
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

      await this.aviso(
        'Partida abierta en presecado. Registrá la etapa cuando termine; ' +
        'el número llega con el envío.',
      );
    } finally {
      this.guardando.set(false);
    }
    this.vista.set('lista');
    await this.cargarLista();
  }

  // ------------------------------------------------------------------
  // Detalle: una ventana por etapa, sin orden obligatorio
  // ------------------------------------------------------------------

  abrir(r: Registro): void {
    this.registro.set(r);
    const ahora = this.fechas.ahoraLocal();
    const formularios: Record<string, FormEtapa> = {};
    const humedades: Record<string, FormHumedad> = {};
    for (const e of ETAPAS) {
      // El presecado arranca con el pesaje, no con el momento en que alguien
      // abre el detalle: precargar "ahora" ahí obligaba a corregir a mano una
      // fecha que la app ya conoce.
      formularios[e.clave] = {
        ...VACIO,
        inicio: e.clave === 'presecado' ? this.paraInput(r.fechaInicio) : ahora,
      };
      humedades[e.clave] = { ...SIN_HUMEDAD };
    }
    this.formEtapa.set(formularios);
    this.formHumedad.set(humedades);
    this.granoBuena.set(null);
    this.granoLigera.set(null);
    this.granoVioleta.set(null);
    this.pesoFinal.set(null);
    // Se abre en la etapa que sigue a la última registrada, pero se puede ir
    // a cualquiera: la barra de pasos no bloquea nada.
    const hechas = ETAPAS.filter((e) => r.etapas.has(e.clave)).length;
    this.paso.set(Math.min(hechas, ETAPAS.length - 1));
    this.vista.set('detalle');
  }

  volver(): void {
    this.registro.set(null);
    this.vista.set('lista');
  }

  irA(i: number): void {
    this.paso.set(Math.max(0, Math.min(i, ETAPAS.length - 1)));
  }
  siguiente(): void {
    this.irA(this.paso() + 1);
  }
  anterior(): void {
    this.irA(this.paso() - 1);
  }

  etapaHecha(clave: string): boolean {
    return this.registro()?.etapas.has(clave) ?? false;
  }

  /** Los datos de una etapa ya registrada, para mostrarlos al volver. */
  infoEtapa(clave: string): EtapaInfo | null {
    return this.registro()?.etapas.get(clave) ?? null;
  }

  calSecDe(clave: string): CalSec | null {
    return this.registro()?.calSec.get(clave) ?? null;
  }

  calidadHecha(clave: string): boolean {
    return clave === 'fermentado'
      ? this.registro()?.calFerm != null
      : this.registro()?.calSec.has(clave) ?? false;
  }

  // --- Formulario de la etapa visible ---

  campo(clave: string, campo: keyof FormEtapa): string {
    return this.formEtapa()[clave]?.[campo] ?? '';
  }

  setCampo(clave: string, campo: keyof FormEtapa, valor: unknown): void {
    const actual = this.formEtapa();
    const previo = actual[clave] ?? { ...VACIO };
    this.formEtapa.set({ ...actual, [clave]: { ...previo, [campo]: String(valor ?? '') } });
  }

  humedad(clave: string, campo: keyof FormHumedad): number | null {
    return this.formHumedad()[clave]?.[campo] ?? null;
  }

  setHumedad(clave: string, campo: keyof FormHumedad, valor: unknown): void {
    const actual = this.formHumedad();
    const previo = actual[clave] ?? { ...SIN_HUMEDAD };
    this.formHumedad.set({ ...actual, [clave]: { ...previo, [campo]: this.numero(valor) } });
  }

  /**
   * Por qué NO se puede registrar esta etapa. Lista, no booleano: el botón
   * deshabilitado sin decir qué falta es la queja de siempre.
   *
   * **El fin es obligatorio (Kevin, 2026-09-08).** Hasta ahora alcanzaba con
   * el inicio y el fin decía "(opcional)": el resultado era exactamente el
   * agujero de v3 —etapas abiertas para siempre— y con él el tiempo empleado
   * quedaba en "—" para el reporte. Una etapa se registra CUANDO TERMINÓ; si
   * todavía está en curso, no se registra.
   *
   * El futuro se bloquea por la misma política de fechas del resto de la app
   * ("futuro: prohibido, sin interruptor", `FechaService`), con cinco minutos
   * de tolerancia por la deriva del reloj del teléfono.
   *
   * Lo que NO se valida a propósito: que el inicio caiga después del pesaje.
   * El cacao entra a presecado cuando llega, que puede ser antes de que
   * alguien lo pese, y bloquear eso deja al supervisor sin forma de registrar
   * lo que realmente pasó.
   */
  problemasEtapa(clave: string): string[] {
    const p: string[] = [];
    const inicio = this.campo(clave, 'inicio');
    const fin = this.campo(clave, 'fin');
    if (!inicio) p.push('Falta la fecha y hora de inicio.');
    if (!fin) p.push('Falta la fecha y hora de fin: la etapa se registra cuando terminó.');
    if (inicio && fin) {
      const a = new Date(inicio).getTime();
      const b = new Date(fin).getTime();
      if (Number.isNaN(a) || Number.isNaN(b)) {
        p.push('Revisá las fechas: alguna no es una fecha válida.');
      } else if (b < a) {
        p.push('La etapa termina antes de empezar.');
      }
    }
    const tope = new Date(this.fechas.ahoraLocal()).getTime() + 5 * 60_000;
    for (const [etiqueta, valor] of [['inicio', inicio], ['fin', fin]] as const) {
      const t = valor ? new Date(valor).getTime() : NaN;
      if (!Number.isNaN(t) && t > tope) {
        p.push(`El ${etiqueta} está en el futuro: no se puede registrar algo que no pasó.`);
      }
    }
    return p;
  }

  puedeRegistrarEtapa(clave: string): boolean {
    return (
      !this.etapaHecha(clave) && this.problemasEtapa(clave).length === 0 && !this.guardando()
    );
  }

  async registrarEtapa(clave: string): Promise<void> {
    const r = this.registro();
    if (!r || !this.puedeRegistrarEtapa(clave)) return;
    this.guardando.set(true);
    try {
      const f = this.formEtapa()[clave];
      const inicio = this.fechas.conOffset(f.inicio);
      // `puedeRegistrarEtapa()` ya garantizó que hay fin; el `null` queda sólo
      // como red por si alguien llama al método desde otro lado.
      const fin = f.fin ? this.fechas.conOffset(f.fin) : null;
      const comentario = f.comentario.trim();
      await this.cola.enqueue('pc_etapa', {
        proceso_guid: r.guid,
        etapa: clave,
        inicio,
        fin,
        comentario,
      });
      await this.local.registrarEtapa(r.guid, clave, inicio, fin, comentario || null);
      r.etapas.set(clave, { inicio, fin, comentario: comentario || null });
      this.registro.set({ ...r });
      await this.aviso('Etapa registrada. Se envía sola cuando haya red.');
    } finally {
      this.guardando.set(false);
    }
  }

  // --- Calidad de fermentación, con sus porcentajes ---

  readonly totalGrano = computed(
    () => (this.granoBuena() ?? 0) + (this.granoLigera() ?? 0) + (this.granoVioleta() ?? 0),
  );

  /** (parte * 100) / total, redondeado a dos decimales. 0 si no hay total. */
  porcentaje(parte: number | null, total: number): number {
    if (!total) return 0;
    return Math.round(((parte ?? 0) * 100 * 100) / total) / 100;
  }

  readonly problemasGrano = computed(() => {
    const v = [this.granoBuena(), this.granoLigera(), this.granoVioleta()];
    if (v.some((x) => x === null || x < 0)) return ['Cargá los tres conteos de grano.'];
    if (this.totalGrano() === 0) return ['El corte de grano no puede ser todo ceros.'];
    return [];
  });

  async registrarGrano(): Promise<void> {
    const r = this.registro();
    if (!r || this.problemasGrano().length > 0 || this.guardando()) return;
    this.guardando.set(true);
    try {
      // Los porcentajes NO viajan: se calculan de los tres conteos. Guardar un
      // derivado es guardarse una inconsistencia futura.
      const datos = {
        buena: this.granoBuena() as number,
        ligera: this.granoLigera() as number,
        violeta: this.granoVioleta() as number,
      };
      await this.cola.enqueue('pc_calidad_ferm', {
        proceso_guid: r.guid,
        fecha_muestra: this.fechas.conOffset(this.fechas.ahoraLocal()),
        ...datos,
      });
      await this.local.registrarCalidad(r.guid, 'fermentado', datos);
      r.calFerm = datos;
      this.registro.set({ ...r });
      await this.aviso('Corte de grano registrado.');
    } finally {
      this.guardando.set(false);
    }
  }

  // --- Calidad de secado, con promedio, índice y % de vanos ---

  promedioHumedad(clave: string): number {
    const v = [
      this.humedad(clave, 'h1'),
      this.humedad(clave, 'h2'),
      this.humedad(clave, 'h3'),
    ];
    if (v.some((x) => x === null)) return 0;
    return Math.round(((v[0] as number) + (v[1] as number) + (v[2] as number)) / 3 * 100) / 100;
  }

  /** Índice de grano: gramos por grano en la muestra de 500 g. */
  indiceGrano(clave: string): number {
    const n = this.humedad(clave, 'granos');
    return n ? Math.round((MUESTRA_G / n) * 1000) / 1000 : 0;
  }

  /** Porcentaje de vanos: los gramos vanos sobre los 500 g de la muestra. */
  porcentajeVanos(clave: string): number {
    const g = this.humedad(clave, 'vanosG');
    return g ? Math.round(((g * 100) / MUESTRA_G) * 100) / 100 : 0;
  }

  problemasHumedad(clave: string): string[] {
    const v = [
      this.humedad(clave, 'h1'),
      this.humedad(clave, 'h2'),
      this.humedad(clave, 'h3'),
    ];
    return v.some((x) => x === null || x <= 0) ? ['Cargá las tres lecturas de humedad.'] : [];
  }

  puedeRegistrarHumedad(clave: string): boolean {
    return (
      !this.calidadHecha(clave) && this.problemasHumedad(clave).length === 0 && !this.guardando()
    );
  }

  async registrarHumedad(clave: string): Promise<void> {
    const r = this.registro();
    if (!r || !this.puedeRegistrarHumedad(clave)) return;
    this.guardando.set(true);
    try {
      const granos = this.humedad(clave, 'granos');
      // `humedad_promedio` es columna generada en la base: no se manda.
      // `indice_grano_g` y `granos_vacios_pct` sí, porque son las columnas que
      // v3 ya llenaba y los reportes leen.
      const datos = {
        humedad_1: this.humedad(clave, 'h1'),
        humedad_2: this.humedad(clave, 'h2'),
        humedad_3: this.humedad(clave, 'h3'),
        granos_muestra: granos,
        indice_grano_g: granos ? this.indiceGrano(clave) : null,
        granos_vacios_pct: this.humedad(clave, 'vanosG') === null ? null : this.porcentajeVanos(clave),
      };
      await this.cola.enqueue('pc_calidad_sec', {
        proceso_guid: r.guid,
        etapa: clave,
        fecha_muestra: this.fechas.conOffset(this.fechas.ahoraLocal()),
        ...datos,
      });
      await this.local.registrarCalidad(r.guid, clave, {
        ...datos,
        humedad_promedio: this.promedioHumedad(clave),
      });
      r.calSec.set(clave, {
        humedad1: this.humedad(clave, 'h1') as number,
        humedad2: this.humedad(clave, 'h2') as number,
        humedad3: this.humedad(clave, 'h3') as number,
        promedio: this.promedioHumedad(clave),
        granos,
        indice: granos ? this.indiceGrano(clave) : null,
        vanosPct: this.humedad(clave, 'vanosG') === null ? null : this.porcentajeVanos(clave),
      });
      this.registro.set({ ...r });
      await this.aviso('Análisis de secado registrado.');
    } finally {
      this.guardando.set(false);
    }
  }

  // --- Cierre ---

  readonly puedeCerrar = computed(() => (this.pesoFinal() ?? 0) > 0 && !this.guardando());

  /** El peso final CIERRA el registro: el servidor deja además la etapa. */
  async cerrar(): Promise<void> {
    const r = this.registro();
    if (!r || !this.puedeCerrar()) return;
    this.guardando.set(true);
    try {
      await this.cola.enqueue('pc_resultado', {
        proceso_guid: r.guid,
        fecha: this.fechas.conOffset(this.fechas.ahoraLocal()),
        peso_final: this.pesoFinal(),
      });
      await this.local.cerrarProceso(r.guid);
      await this.aviso(`Registro cerrado con ${this.pesoFinal()} lb.`);
    } finally {
      this.guardando.set(false);
    }
    this.registro.set(null);
    this.vista.set('lista');
    await this.cargarLista();
  }

  // ------------------------------------------------------------------
  // Selector y varios
  // ------------------------------------------------------------------

  async abrirSupervisor(): Promise<void> {
    this.destino = 'supervisor';
    this.selectorTitulo.set('Supervisor');
    this.selectorOpciones.set(await this.catalogo.responsables(null));
    this.selectorSeleccion.set(this.supervisor() ? [this.supervisor()!.id] : []);
    this.selectorVacio.set('Descargá los maestros: no hay supervisores en este equipo.');
    this.selectorBuscador.set(false);
    this.selectorMultiple.set(false);
    this.selectorAbierto.set(true);
  }

  /** En modo múltiple el selector emite `cambio`, nunca `confirmar`. */
  onCambio(ids: number[]): void {
    if (this.destino === 'dias') {
      this.aplicarDias(ids);
    }
  }

  onSeleccion(ids: number[]): void {
    if (this.destino === 'supervisor') {
      const o = this.selectorOpciones().find((x) => x.id === ids[0]);
      this.supervisor.set(o ? { id: o.id, nombre: o.nombre } : null);
    }
    this.cerrarSelector();
  }

  cerrarSelector(): void {
    this.selectorAbierto.set(false);
    this.selectorMultiple.set(false);
    this.destino = null;
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

  /**
   * La misma marca, pero como la quiere un `input[type=datetime-local]`:
   * 'YYYY-MM-DDTHH:mm', sin segundos ni offset.
   */
  paraInput(valor: string | null): string {
    if (!valor) return '';
    return valor.replace(' ', 'T').slice(0, 16);
  }

  /** 'YYYY-MM-DDTHH:mm:ss±hh:mm' o 'YYYY-MM-DD HH:mm:ss' -> 'YYYY-MM-DD HH:mm'. */
  fechaCorta(valor: string | null): string {
    if (!valor) return '—';
    return valor.replace('T', ' ').slice(0, 16);
  }

  /**
   * Tiempo empleado entre dos marcas. En v3 salía siempre "0 días, 0 horas"
   * porque inicio y fin se escribían en el mismo instante; acá los dos los
   * elige el supervisor, así que el número dice algo.
   */
  duracion(inicio: string | null, fin: string | null): string {
    if (!inicio || !fin) return '—';
    const a = new Date(inicio.replace(' ', 'T')).getTime();
    const b = new Date(fin.replace(' ', 'T')).getTime();
    if (Number.isNaN(a) || Number.isNaN(b) || b < a) return '—';
    const min = Math.round((b - a) / 60000);
    const d = Math.floor(min / 1440);
    const h = Math.floor((min % 1440) / 60);
    const m = min % 60;
    const partes: string[] = [];
    if (d) partes.push(`${d} d`);
    if (h) partes.push(`${h} h`);
    if (m || partes.length === 0) partes.push(`${m} min`);
    return partes.join(' ');
  }

  /** El tiempo empleado de la etapa que se está cargando, en vivo. */
  duracionForm(clave: string): string {
    return this.duracion(this.campo(clave, 'inicio'), this.campo(clave, 'fin'));
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
