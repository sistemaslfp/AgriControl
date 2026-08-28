import { Component, OnInit, computed, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import {
  IonBadge,
  IonButton,
  IonButtons,
  IonContent,
  IonFooter,
  IonHeader,
  IonIcon,
  IonSpinner,
  IonTitle,
  IonToolbar,
  ToastController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  archiveOutline,
  checkmarkDoneOutline,
  cloudDownloadOutline,
  cloudOfflineOutline,
  cloudOutline,
  leafOutline,
  moonOutline,
  rainyOutline,
  settingsOutline,
  sunnyOutline,
  timeOutline,
} from 'ionicons/icons';

import { APP_VERSION } from '../../core/version';
import { AppConfigService } from '../../core/config/app-config.service';
import { CatalogService } from '../../core/catalog/catalog.service';
import { SyncQueueService } from '../../core/sync/sync-queue.service';

interface CeldaMenu {
  titulo: string;
  icono: string;
  accion: 'modulo' | 'maestros' | 'pendientes' | 'enviados';
  habilitada: boolean;
}

@Component({
  selector: 'app-menu',
  standalone: true,
  templateUrl: './menu.page.html',
  styleUrls: ['./menu.page.scss'],
  imports: [
    DatePipe,
    RouterLink,
    IonBadge,
    IonButton,
    IonButtons,
    IonContent,
    IonFooter,
    IonHeader,
    IonIcon,
    IonSpinner,
    IonTitle,
    IonToolbar,
  ],
})
export class MenuPage implements OnInit {
  readonly version = APP_VERSION;

  readonly sync = inject(SyncQueueService);
  readonly catalogos = inject(CatalogService);
  readonly config = inject(AppConfigService);
  private readonly toast = inject(ToastController);

  /** Sin celdas vacías de relleno: solo las ocho reales (corrección 03-pantallas). */
  readonly celdas: CeldaMenu[] = [
    { titulo: 'AM', icono: 'sunny-outline', accion: 'modulo', habilitada: false },
    { titulo: 'PM', icono: 'moon-outline', accion: 'modulo', habilitada: false },
    { titulo: 'Cosecha', icono: 'leaf-outline', accion: 'modulo', habilitada: false },
    { titulo: 'Riego', icono: 'rainy-outline', accion: 'modulo', habilitada: false },
    { titulo: 'Poscosecha', icono: 'time-outline', accion: 'modulo', habilitada: false },
    { titulo: 'Actualizar Maestros', icono: 'cloud-download-outline', accion: 'maestros', habilitada: true },
    { titulo: 'Pendientes', icono: 'archive-outline', accion: 'pendientes', habilitada: false },
    { titulo: 'Enviados', icono: 'checkmark-done-outline', accion: 'enviados', habilitada: false },
  ];

  readonly totalSinSincronizar = computed(
    () => this.sync.conteo().pendientes + this.sync.conteo().enviando,
  );

  constructor() {
    addIcons({
      archiveOutline,
      checkmarkDoneOutline,
      cloudDownloadOutline,
      cloudOfflineOutline,
      cloudOutline,
      leafOutline,
      moonOutline,
      rainyOutline,
      settingsOutline,
      sunnyOutline,
      timeOutline,
    });
  }

  async ngOnInit(): Promise<void> {
    await this.config.cargar();
    await this.catalogos.verificarDisponibles();
    await this.sync.refrescarConteo();
  }

  async onCelda(celda: CeldaMenu): Promise<void> {
    switch (celda.accion) {
      case 'maestros':
        await this.actualizarMaestros();
        break;
      case 'pendientes':
      case 'enviados':
        await this.aviso('Esta pantalla llega en el paso 4 del plan.');
        break;
      case 'modulo':
        await this.aviso(
          this.catalogos.disponibles()
            ? 'Este módulo llega en un paso posterior del plan.'
            : 'Primero descargá los catálogos con "Actualizar Maestros".',
        );
        break;
    }
  }

  async actualizarMaestros(): Promise<void> {
    if (!this.config.baseUrl()) {
      await this.aviso('Configurá primero la URL del servidor (engranaje, arriba a la derecha).');
      return;
    }
    try {
      const r = await this.catalogos.actualizar();
      const t = r.totales;
      await this.aviso(
        `Maestros actualizados: ${t['fincas']} fincas, ${t['lotes']} lotes, ` +
          `${t['subtareas']} subtareas, ${t['personal']} personas.`,
      );
    } catch (e) {
      await this.aviso(
        'No se pudieron actualizar los maestros. Los catálogos locales quedan como estaban. ' +
          `Detalle: ${e instanceof Error ? e.message : 'error de red'}`,
      );
    }
  }

  sincronizarAhora(): void {
    void this.sync.flush('manual-menu', true);
  }

  private async aviso(mensaje: string): Promise<void> {
    const t = await this.toast.create({ message: mensaje, duration: 3500, position: 'bottom' });
    await t.present();
  }
}
