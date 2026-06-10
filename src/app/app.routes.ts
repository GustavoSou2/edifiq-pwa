import { Routes } from '@angular/router';
import { authGuard } from './services/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () =>
      import('./components/auth/login/login.component').then((m) => m.LoginComponent),
    title: 'Entrar · EdifIQ',
  },
  {
    path: '',
    redirectTo: 'painel',
    pathMatch: 'full',
  },
  {
    path: 'painel',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./components/painel/painel.component').then((m) => m.PainelComponent),
    title: 'Painel de Monitoramento · EdifIQ',
  },
  {
    path: 'entregador',
    canActivate: [authGuard],
    title: 'Minhas Entregas · EdifIQ',
    loadComponent: () =>
      import('./components/entregador/lista-entregas/lista-entregas.component')
        .then((m) => m.ListaEntregasComponent),
  },
  {
    path: 'entregador/detalhe/:id',
    canActivate: [authGuard],
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
