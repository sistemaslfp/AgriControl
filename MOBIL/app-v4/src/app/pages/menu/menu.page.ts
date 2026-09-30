import { Component, OnInit, computed, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Router } from '@angular/router';
import {
  AlertController,
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
  arrowUpCircleOutline,
  swapVerticalOutline,
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

import { ActualizacionService } from '../../core/actualizacion/actualizacion.service';
import { AppConfigService } from '../../core/config/app-config.service';
import { BootstrapService } from '../../core/bootstrap/bootstrap.service';
import { CatalogService } from '../../core/catalog/catalog.service';
import { SyncQueueService } from '../../core/sync/sync-queue.service';

/**
 * PIN de acceso a Configuracion.
 */
const PIN_CONFIGURACION = '1987';

interface CeldaMenu {
  titulo: string;
  icono: string;
  accion: 'modulo' | 'maestros' | 'registros';
  habilitada: boolean;
  /** Ruta del módulo. Solo la tienen los ya implementados. */
  ruta?: string;
  /** Ocupa las dos columnas de la grilla. */
  ancha?: boolean;
}

@Component({
  selector: 'app-menu',
  standalone: true,
  templateUrl: './menu.page.html',
  styleUrls: ['./menu.page.scss'],
  imports: [
    DatePipe,
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
  readonly actualizacion = inject(ActualizacionService);

  readonly sync = inject(SyncQueueService);
  readonly catalogos = inject(CatalogService);
  readonly config = inject(AppConfigService);
  private readonly bootstrap = inject(BootstrapService);
  private readonly toast = inject(ToastController);
  private readonly router = inject(Router);
  private readonly alerta = inject(AlertController);

  /** Sin celdas vacías de relleno: solo las ocho reales (corrección 03-pantallas). */
  readonly celdas: CeldaMenu[] = [
    { titulo: 'AM', icono: 'sunny-outline', accion: 'modulo', habilitada: true, ruta: '/am' },
    { titulo: 'PM', icono: 'moon-outline', accion: 'modulo', habilitada: true, ruta: '/pm' },
    { titulo: 'Cosecha', icono: 'leaf-outline', accion: 'modulo', habilitada: true, ruta: '/cosecha' },
    { titulo: 'Riego', icono: 'rainy-outline', accion: 'modulo', habilitada: true, ruta: '/riego' },
    { titulo: 'Poscosecha', icono: 'time-outline', accion: 'modulo', habilitada: true, ruta: '/postcosecha' },
    { titulo: 'Actualizar Maestros', icono: 'cloud-download-outline', accion: 'maestros', habilitada: true },
    // UNA celda para las dos mitades: ya abrian la misma pantalla, asi que dos
    // celdas separadas prometian dos lugares distintos. Va a lo ancho para que
    // se lea como deliberado y no como un hueco en la grilla.
    //
    // Y va HABILITADA: estaban en `false` desde el paso 1 y quedaron grises
    // aunque `onCelda` ya navegaba, asi que la pantalla funcionaba y parecia
    // apagada.
    {
      titulo: 'Pendientes / Enviados',
      icono: 'swap-vertical-outline',
      accion: 'registros',
      habilitada: true,
      ancha: true,
    },
  ];

  readonly totalSinSincronizar = computed(
    () => this.sync.conteo().pendientes + this.sync.conteo().enviando,
  );

  constructor() {
    addIcons({
      arrowUpCircleOutline,
      swapVerticalOutline,
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
    void this.actualizacion.verificar();
  }

  async onCelda(celda: CeldaMenu): Promise<void> {
    switch (celda.accion) {
      case 'maestros':
        await this.actualizarMaestros();
        break;
      case 'registros':
        // Entra por Pendientes: es la mitad accionable. Enviados esta a un
        // toque del segmento.
        await this.router.navigate(['/registros'], { queryParams: { vista: 'pendientes' } });
        break;
      case 'modulo':
        // Sin catálogos no hay nada que elegir: los selectores saldrían
        // vacíos y el registro se rechazaría en el servidor.
        if (!this.catalogos.disponibles()) {
          await this.aviso('Primero descarga los catálogos con "Actualizar Maestros".');
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
      await this.aviso('Configura primero la URL del servidor (engranaje, arriba a la derecha).');
      return;
    }
    try {
      // Las ventanas horarias y de retroactividad viajan por /v4/bootstrap y
      // se refrescan aquí mismo: si falla, no tumba la actualización de
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

  /** Pide el PIN antes de abrir Configuracion (el engranaje ya no navega directo). */
  async abrirConfiguracion(): Promise<void> {
    const a = await this.alerta.create({
      header: 'PIN de configuración',
      inputs: [
        {
          name: 'pin',
          type: 'password',
          placeholder: '4 dígitos',
          attributes: { inputmode: 'numeric', maxlength: 4 },
        },
      ],
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        { text: 'Entrar', role: 'confirm' },
      ],
    });
    await a.present();
    const { role, data } = await a.onDidDismiss();
    if (role !== 'confirm') return;
    if (data?.values?.pin === PIN_CONFIGURACION) {
      await this.router.navigateByUrl('/configuracion');
    } else {
      await this.aviso('PIN incorrecto.');
    }
  }

  async actualizarApp(): Promise<void> {
    const texto = await this.actualizacion.actualizar();
    if (texto) {
      await this.aviso(texto);
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
