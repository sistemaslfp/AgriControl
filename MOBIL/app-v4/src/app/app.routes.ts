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
    path: 'configuracion',
    loadComponent: () =>
      import('./pages/configuracion/configuracion.page').then((m) => m.ConfiguracionPage),
  },
  { path: '', redirectTo: 'menu', pathMatch: 'full' },
  { path: '**', redirectTo: 'menu' },
];
