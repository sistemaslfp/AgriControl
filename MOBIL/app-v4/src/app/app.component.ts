import { Component, inject, isDevMode } from '@angular/core';
import { IonApp, IonRouterOutlet } from '@ionic/angular';

import { AsignacionesService } from './core/captura/asignaciones.service';
import { BootstrapService } from './core/bootstrap/bootstrap.service';
import { SyncQueueService } from './core/sync/sync-queue.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [IonApp, IonRouterOutlet],
  template: `
    <ion-app>
      <ion-router-outlet></ion-router-outlet>
    </ion-app>
  `,
})
export class AppComponent {
  /**
   * Inyectar la cola aquí la instancia al arrancar la app: recupera los
   * registros que quedaron en ENVIANDO, purga ENVIADOS viejos y arma los
   * disparadores (red, timer de 15 min).
   */
  private readonly sync = inject(SyncQueueService);
  private readonly bootstrap = inject(BootstrapService);
  private readonly asignaciones = inject(AsignacionesService);

  constructor() {
    // Parámetros de operación (ventanas AM/PM y retroactividad) desde lo ya
    // guardado, para poder capturar sin red desde el primer segundo.
    void this.bootstrap.cargar();
    // El espejo de asignaciones no es un histórico: se poda al arrancar.
    void this.asignaciones.purgarViejos();
    // Hook de inspección SOLO en builds de desarrollo (ng build -c development
    // / ionic serve). En el build de producción isDevMode() es false y esto
    // no existe.
    if (isDevMode()) {
      (window as unknown as Record<string, unknown>)['__lagricontrol'] = { sync: this.sync };
    }
  }
}
