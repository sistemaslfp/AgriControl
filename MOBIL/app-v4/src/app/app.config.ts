import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter, RouteReuseStrategy } from '@angular/router';
import { IonicRouteStrategy, provideIonicAngular } from '@ionic/angular';

import { routes } from './app.routes';

/**
 * Angular 22 es ZONELESS por defecto: no hay zone.js y no se declara
 * provideZoneChangeDetection. Consecuencia práctica para todo lo que venga
 * después (AM, PM, cosecha, postcosecha): el estado que la vista muestre
 * tiene que vivir en un `signal`. Un campo plano mutado desde un callback
 * async NO repinta la pantalla, y no lanza ningún error — simplemente se
 * queda con el valor viejo.
 */
export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
    provideIonicAngular({ mode: 'md' }),
    provideRouter(routes),
    provideHttpClient(),
  ],
};
