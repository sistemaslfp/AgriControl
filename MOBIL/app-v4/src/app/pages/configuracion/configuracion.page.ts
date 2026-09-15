import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
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
  checkmarkCircleOutline,
  closeCircleOutline,
  closeOutline,
  trashOutline,
} from 'ionicons/icons';

import { ApiService } from '../../core/api/api.service';
import { CatalogQueryService, OpcionCatalogo } from '../../core/catalog/catalog-query.service';
import { SelectorComponent } from '../../shared/selector.component';
import { AppConfigService } from '../../core/config/app-config.service';
import { ClockService } from '../../core/clock/clock.service';
import { SyncQueueService } from '../../core/sync/sync-queue.service';
import { EstadoLan, LanNetwork } from '../../core/net/lan-network';
import {
  BootstrapService,
  MODULOS_RETRO,
  ModuloRetro,
  TOPE_VENTANA_DIAS,
} from '../../core/bootstrap/bootstrap.service';

@Component({
  selector: 'app-configuracion',
  standalone: true,
  templateUrl: './configuracion.page.html',
  styleUrls: ['./configuracion.page.scss'],
  imports: [
    FormsModule,
    DatePipe,
    SelectorComponent,
    IonBackButton,
    IonButton,
    IonButtons,
    IonContent,
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
export class ConfiguracionPage implements OnInit {
  readonly config = inject(AppConfigService);
  readonly clock = inject(ClockService);
  readonly sync = inject(SyncQueueService);
  private readonly api = inject(ApiService);
  private readonly bootstrap = inject(BootstrapService);
  private readonly catalogo = inject(CatalogQueryService);
  private readonly toast = inject(ToastController);

  // --- Servidor ---
  url = '';
  alias = '';
  readonly probando = signal(false);
  readonly resultadoPrueba = signal<
    | { ok: true; serverTime: string; offsetSeconds: number }
    | { ok: false; error: string }
    | null
  >(null);
  /**
   * Qué interfaz usó la prueba. En la finca es el dato que separa "el servidor
   * está caído" de "este teléfono ni siquiera está mirando la LAN".
   */
  readonly red = signal<EstadoLan | null>(null);

  // --- Valores por defecto de captura ---
  //
  // Un equipo se queda en una finca y en un cultivo toda la temporada. Fijarlos
  // aquí ahorra dos toques por tarea y, sobre todo, evita el error de cargar en
  // la finca equivocada. Se pueden dejar vacíos: entonces se eligen a mano en
  // cada registro, como antes.
  readonly fincaDefecto = signal<OpcionCatalogo | null>(null);
  readonly cultivoDefecto = signal<OpcionCatalogo | null>(null);
  private fincas: OpcionCatalogo[] = [];
  private cultivos: OpcionCatalogo[] = [];

  readonly selectorAbierto = signal(false);
  readonly selectorTitulo = signal('');
  readonly selectorOpciones = signal<OpcionCatalogo[]>([]);
  readonly selectorSeleccion = signal<number[]>([]);
  private destino: 'finca' | 'cultivo' | null = null;

  readonly alturaSelector = computed(() => {
    const n = Math.min(this.selectorOpciones().length, 12);
    const conDetalle = this.selectorOpciones().some((o) => !!o.detalle);
    const buscador = this.selectorOpciones().length > 10;
    return `${56 + (buscador ? 60 : 0) + Math.max(n, 1) * (conDetalle ? 66 : 49) + 6}px`;
  });

  // --- Limpieza ---
  confirmacionEscrita = '';
  readonly limpiando = signal(false);

  // ------------------------------------------------------------------
  // Ventanas de retroactividad (Kevin, 2026-09-14)
  //
  // Lo que se escribe aca le GANA a `/v4/bootstrap`. Es a proposito: si
  // mandara el servidor, el cambio se borraria solo en el proximo
  // "Actualizar Maestros" y nadie entenderia por que.
  // ------------------------------------------------------------------

  readonly topeVentana = TOPE_VENTANA_DIAS;
  readonly modulosRetro: { clave: ModuloRetro; nombre: string }[] = [
    { clave: 'am', nombre: 'AM (programación)' },
    { clave: 'pm', nombre: 'PM (cierre)' },
    { clave: 'cosecha', nombre: 'Cosecha' },
    { clave: 'riego', nombre: 'Riego' },
    { clave: 'postcosecha', nombre: 'Postcosecha' },
  ];

  /** Lo tecleado, sin guardar todavia. Se vacia al guardar o al restaurar. */
  readonly borradorVentanas = signal<Partial<Record<ModuloRetro, string>>>({});
  readonly errorVentanas = signal<string | null>(null);

  diasDe(m: ModuloRetro): string {
    const b = this.borradorVentanas()[m];
    return b !== undefined ? b : String(this.bootstrap.retroactividadDias(m));
  }

  esDelEquipo(m: ModuloRetro): boolean {
    return this.bootstrap.esDelEquipo(m);
  }

  hayOverride(): boolean {
    return MODULOS_RETRO.some((m) => this.bootstrap.esDelEquipo(m));
  }

  setDias(m: ModuloRetro, v: string): void {
    this.borradorVentanas.set({ ...this.borradorVentanas(), [m]: v });
    this.errorVentanas.set(null);
  }

  /**
   * Guarda SOLO los modulos que se tocaron. Un modulo que quedo igual al
   * servidor no se marca como override: si no, tocar un numero y arrepentirse
   * congelaba los cinco.
   */
  async guardarVentanas(): Promise<void> {
    const borrador = this.borradorVentanas();
    const cambios: [ModuloRetro, number][] = [];
    for (const m of MODULOS_RETRO) {
      const crudo = borrador[m];
      if (crudo === undefined) {
        continue;
      }
      const v = Number(crudo.trim());
      if (crudo.trim() === '' || !Number.isInteger(v) || v < 0 || v > TOPE_VENTANA_DIAS) {
        const nombre = this.modulosRetro.find((x) => x.clave === m)!.nombre;
        this.errorVentanas.set(
          `${nombre}: tiene que ser un número entero entre 0 y ${TOPE_VENTANA_DIAS}.`,
        );
        return;
      }
      cambios.push([m, v]);
    }
    if (cambios.length === 0) {
      await this.aviso('No hay nada que guardar.');
      return;
    }
    for (const [m, v] of cambios) {
      // Igual al servidor = volver al servidor, no fijarlo a mano.
      await this.bootstrap.fijarRetroactividad(
        m,
        v === this.bootstrap.retroactividadDelServidor(m) ? null : v,
      );
    }
    this.borradorVentanas.set({});
    this.errorVentanas.set(null);
    await this.aviso('Días guardados. Rigen desde el próximo registro.');
  }

  async restaurarVentanas(): Promise<void> {
    await this.bootstrap.restaurarRetroactividad();
    this.borradorVentanas.set({});
    this.errorVentanas.set(null);
    await this.aviso('Los cinco módulos vuelven a los días que manda el servidor.');
  }

  /** La limpieza queda BLOQUEADA si hay registros sin sincronizar. */
  readonly limpiezaBloqueada = computed(
    () => this.sync.conteo().pendientes + this.sync.conteo().enviando > 0,
  );

  constructor() {
    addIcons({ checkmarkCircleOutline, closeCircleOutline, closeOutline, trashOutline });
  }

  async ngOnInit(): Promise<void> {
    await this.config.cargar();
    await this.clock.cargar();
    await this.sync.refrescarConteo();
    this.url = this.config.baseUrl() ?? '';
    this.alias = this.config.deviceAlias() ?? '';

    this.fincas = await this.catalogo.fincas();
    this.cultivos = await this.catalogo.cultivos();
    const fid = this.config.defaultFincaId();
    const cid = this.config.defaultCultivoId();
    this.fincaDefecto.set(this.fincas.find((f) => f.id === fid) ?? null);
    this.cultivoDefecto.set(this.cultivos.find((c) => c.id === cid) ?? null);
  }

  // ------------------------------------------------------------------
  // Valores por defecto
  // ------------------------------------------------------------------

  abrirFincaDefecto(): void {
    this.abrirSelector('finca', 'Finca por defecto', this.fincas, this.fincaDefecto());
  }

  abrirCultivoDefecto(): void {
    this.abrirSelector('cultivo', 'Cultivo por defecto', this.cultivos, this.cultivoDefecto());
  }

  async limpiarFincaDefecto(): Promise<void> {
    this.fincaDefecto.set(null);
    await this.config.setDefaultFinca(null);
  }

  async limpiarCultivoDefecto(): Promise<void> {
    this.cultivoDefecto.set(null);
    await this.config.setDefaultCultivo(null);
  }

  cerrarSelector(): void {
    this.selectorAbierto.set(false);
    this.destino = null;
  }

  async onSeleccion(ids: number[]): Promise<void> {
    const d = this.destino;
    const o = this.selectorOpciones().find((x) => x.id === ids[0]) ?? null;
    this.cerrarSelector();
    if (d === 'finca') {
      this.fincaDefecto.set(o);
      await this.config.setDefaultFinca(o?.id ?? null);
    } else if (d === 'cultivo') {
      this.cultivoDefecto.set(o);
      await this.config.setDefaultCultivo(o?.id ?? null);
    }
  }

  private abrirSelector(
    destino: 'finca' | 'cultivo',
    titulo: string,
    opciones: OpcionCatalogo[],
    actual: OpcionCatalogo | null,
  ): void {
    if (opciones.length === 0) {
      void this.aviso('Descarga primero los maestros desde el menú.');
      return;
    }
    this.destino = destino;
    this.selectorTitulo.set(titulo);
    this.selectorOpciones.set(opciones);
    this.selectorSeleccion.set(actual ? [actual.id] : []);
    this.selectorAbierto.set(true);
  }

  urlValida(): boolean {
    const u = this.url.trim();
    if (!/^https?:\/\//i.test(u)) {
      return false;
    }
    try {
      new URL(u);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * "Probar conexión": golpea GET /v4/hora sobre la URL TAL COMO ESTÁ
   * ESCRITA (aunque no se haya guardado) y muestra hora del servidor y
   * desfase contra el reloj del teléfono.
   */
  async probarConexion(): Promise<void> {
    if (!this.urlValida()) {
      await this.aviso('La URL no es válida. Ejemplo: https://servidor.com/v4');
      return;
    }
    this.probando.set(true);
    this.resultadoPrueba.set(null);
    try {
      // Atarse a la WiFi ANTES de probar. Sin esto, en un equipo con datos
      // móviles la prueba sale por la antena y falla contra una IP privada,
      // que es un diagnóstico falso: el servidor está bien y el WiFi también.
      this.red.set(await LanNetwork.asegurar());
      const hora = await this.api.hora(this.url);
      const offset = hora.server_epoch - Math.floor(Date.now() / 1000);
      this.resultadoPrueba.set({ ok: true, serverTime: hora.server_time, offsetSeconds: offset });
    } catch (e) {
      this.resultadoPrueba.set({ ok: false, error: this.mensajeErrorConexion(e) });
    } finally {
      this.probando.set(false);
    }
  }

  /**
   * `HttpErrorResponse` NO es instancia de `Error` (implementa la interfaz,
   * no extiende la clase), asi que el catch generico se lo tragaba entero y
   * "Probar conexion" siempre mostraba el mismo cartel vacio sin importar la
   * causa real (cleartext bloqueado, CORS, timeout, DNS, servidor caido).
   * `status === 0` es la firma de "la peticion nunca completo contra el
   * servidor" -- ahi es donde vive un bloqueo de cleartext o de CORS.
   */
  private mensajeErrorConexion(e: unknown): string {
    if (e instanceof HttpErrorResponse) {
      if (e.status === 0) {
        return `No se pudo conectar (status 0): ${e.message}`;
      }
      const cuerpo = typeof e.error === 'string' ? e.error : JSON.stringify(e.error);
      return `HTTP ${e.status} ${e.statusText}: ${cuerpo || e.message}`;
    }
    if (e instanceof Error) {
      return e.message;
    }
    return 'No hubo respuesta del servidor.';
  }

  async guardar(): Promise<void> {
    if (!this.urlValida()) {
      await this.aviso('La URL no es válida; no se guardó.');
      return;
    }
    if (!this.alias.trim()) {
      await this.aviso('Define un alias para el dispositivo (ej. TABLET-BELLITA-02).');
      return;
    }
    await this.config.setBaseUrl(this.url);
    await this.config.setDeviceAlias(this.alias);
    this.alias = this.config.deviceAlias() ?? this.alias;

    // Con servidor recién configurado, sincronizar el reloj de una.
    try {
      await this.clock.sincronizar();
      await this.aviso('Guardado. Reloj sincronizado con el servidor.');
    } catch {
      await this.aviso(
        'Guardado, pero no se pudo sincronizar la hora. Se reintenta en la próxima conexión.',
      );
    }
  }

  async limpiar(): Promise<void> {
    if (this.limpiezaBloqueada()) {
      return; // la UI ya lo impide; doble guarda
    }
    if (this.confirmacionEscrita.trim().toUpperCase() !== 'ELIMINAR') {
      await this.aviso('Escribe ELIMINAR en el campo de confirmación.');
      return;
    }
    this.limpiando.set(true);
    try {
      const r = await this.sync.limpiarCerrados();
      if ('bloqueado' in r) {
        await this.aviso(r.bloqueado);
      } else {
        this.confirmacionEscrita = '';
        await this.aviso(`Se eliminaron ${r.borrados} registro(s) ya cerrados.`);
      }
    } finally {
      this.limpiando.set(false);
    }
  }

  private async aviso(mensaje: string): Promise<void> {
    const t = await this.toast.create({ message: mensaje, duration: 3500, position: 'bottom' });
    await t.present();
  }
}
