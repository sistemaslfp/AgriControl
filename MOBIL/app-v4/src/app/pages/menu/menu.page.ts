import { Component, OnInit, computed, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
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
import { BootstrapService } from '../../core/bootstrap/bootstrap.service';
import { CatalogService } from '../../core/catalog/catalog.service';
import { SyncQueueService } from '../../core/sync/sync-queue.service';

interface CeldaMenu {
  titulo: string;
  icono: string;
  accion: 'modulo' | 'maestros' | 'pendientes' | 'enviados';
  habilitada: boolean;
  /** Ruta del módulo. Solo la tienen los ya implementados. */
  ruta?: string;
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
  private readonly bootstrap = inject(BootstrapService);
  private readonly toast = inject(ToastController);
  private readonly router = inject(Router);

  /** Sin celdas vacías de relleno: solo las ocho reales (corrección 03-pantallas). */
  readonly celdas: CeldaMenu[] = [
    { titulo: 'AM', icono: 'sunny-outline', accion: 'modulo', habilitada: true, ruta: '/am' },
    { titulo: 'PM', icono: 'moon-outline', accion: 'modulo', habilitada: true, ruta: '/pm' },
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
    await this.bootstrap.cargar();
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
        // Las dos celdas abren la MISMA pantalla, en la pestaña que
        // corresponde. Se conservan las dos entradas porque es el vocabulario
        // que el supervisor ya conoce de la app vieja.
        await this.router.navigate(['/registros'], { queryParams: { vista: celda.accion } });
        break;
      case 'modulo':
        // Sin catálogos no hay nada que elegir: los selectores saldrían
        // vacíos y el registro se rechazaría en el servidor.
        if (!this.catalogos.disponibles()) {
          await this.aviso('Primero descargá los catálogos con "Actualizar Maestros".');
          return;
        }
        if (!celda.ruta) {
          await this.aviso('Este módulo llega en un paso posterior del plan.');
          return;
        }
        await this.router.navigateByUrl(celda.ruta);
        break;
    }
  }

  async actualizarMaestros(): Promise<void> {
    if (!this.config.baseUrl()) {
      await this.aviso('Configurá primero la URL del servidor (engranaje, arriba a la derecha).');
      return;
    }
    try {
      // Las ventanas horarias y de retroactividad viajan por /v4/bootstrap y
      // se refrescan acá mismo: si falla, no tumba la actualización de
      // catálogos (la app sigue con los últimos valores guardados).
      try {
        await this.bootstrap.actualizar();
      } catch {
        /* se conservan los valores anteriores */
      }
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
