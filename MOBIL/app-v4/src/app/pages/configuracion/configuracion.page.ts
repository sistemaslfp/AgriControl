import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonInput,
  IonItem,
  IonList,
  IonNote,
  IonSpinner,
  IonTitle,
  IonToolbar,
  ToastController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { checkmarkCircleOutline, closeCircleOutline, trashOutline } from 'ionicons/icons';

import { ApiService } from '../../core/api/api.service';
import { AppConfigService } from '../../core/config/app-config.service';
import { ClockService } from '../../core/clock/clock.service';
import { SyncQueueService } from '../../core/sync/sync-queue.service';

@Component({
  selector: 'app-configuracion',
  standalone: true,
  templateUrl: './configuracion.page.html',
  styleUrls: ['./configuracion.page.scss'],
  imports: [
    FormsModule,
    DatePipe,
    IonBackButton,
    IonButton,
    IonButtons,
    IonContent,
    IonHeader,
    IonIcon,
    IonInput,
    IonItem,
    IonList,
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

  // --- Limpieza ---
  confirmacionEscrita = '';
  readonly limpiando = signal(false);

  /** La limpieza queda BLOQUEADA si hay registros sin sincronizar. */
  readonly limpiezaBloqueada = computed(
    () => this.sync.conteo().pendientes + this.sync.conteo().enviando > 0,
  );

  constructor() {
    addIcons({ checkmarkCircleOutline, closeCircleOutline, trashOutline });
  }

  async ngOnInit(): Promise<void> {
    await this.config.cargar();
    await this.clock.cargar();
    await this.sync.refrescarConteo();
    this.url = this.config.baseUrl() ?? '';
    this.alias = this.config.deviceAlias() ?? '';
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
      const hora = await this.api.hora(this.url);
      const offset = hora.server_epoch - Math.floor(Date.now() / 1000);
      this.resultadoPrueba.set({ ok: true, serverTime: hora.server_time, offsetSeconds: offset });
    } catch (e) {
      this.resultadoPrueba.set({
        ok: false,
        error: e instanceof Error ? e.message : 'No hubo respuesta del servidor.',
      });
    } finally {
      this.probando.set(false);
    }
  }

  async guardar(): Promise<void> {
    if (!this.urlValida()) {
      await this.aviso('La URL no es válida; no se guardó.');
      return;
    }
    if (!this.alias.trim()) {
      await this.aviso('Definí un alias para el dispositivo (ej. TABLET-BELLITA-02).');
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
      await this.aviso('Escribí ELIMINAR en el campo de confirmación.');
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
