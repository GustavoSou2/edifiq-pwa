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
    title: 'Minhas Entregas · EdifIQ',
    loadComponent: () =>
      import('./components/entregador/lista-entregas/lista-entregas.component')
        .then((m) => m.ListaEntregasComponent),
  },
  {
    path: 'entregador/detalhe/:id',
    title: 'Detalhes da Entrega · EdifIQ',
    loadComponent: () =>
      import('./components/entregador/detalhe-entrega/detalhe-entrega.component')
        .then((m) => m.DetalheEntregaComponent),
  },
  {
    path: '**',
    redirectTo: 'painel',
  },
];
