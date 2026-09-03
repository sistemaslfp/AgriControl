import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: 'menu',
    loadComponent: () => import('./pages/menu/menu.page').then((m) => m.MenuPage),
  },
  {
    path: 'am',
    loadComponent: () => import('./pages/am/am.page').then((m) => m.AmPage),
  },
  {
    path: 'pm',
    loadComponent: () => import('./pages/pm/pm.page').then((m) => m.PmPage),
  },
  {
    path: 'cosecha',
    loadComponent: () =>
      import('./pages/cosecha/cosecha.page').then((m) => m.CosechaPage),
  },
  {
    // Una sola pantalla para los dos estados: el menu entra con
    // ?vista=pendientes o ?vista=enviados. Un supervisor que quiere saber si le
    // falta enviar algo no tiene por que abrir cinco pantallas para saberlo.
    path: 'registros',
    loadComponent: () =>
      import('./pages/registros/registros.page').then((m) => m.RegistrosPage),
  },
  {
    path: 'configuracion',
    loadComponent: () =>
      import('./pages/configuracion/configuracion.page').then((m) => m.ConfiguracionPage),
  },
  { path: '', redirectTo: 'menu', pathMatch: 'full' },
  { path: '**', redirectTo: 'menu' },
];
