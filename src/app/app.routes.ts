import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    redirectTo: 'painel',
    pathMatch: 'full',
  },
  {
    path: 'painel',
    loadComponent: () =>
      import('./components/painel/painel.component').then((m) => m.PainelComponent),
    title: 'Painel de Monitoramento · EdifIQ',
  },
  {
    path: 'entregador',
    loadComponent: () =>
      import('./components/entregador/entregador.component').then((m) => m.EntregadorComponent),
    title: 'App do Entregador · EdifIQ',
  },
  {
    path: '**',
    redirectTo: 'painel',
  },
];
