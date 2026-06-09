import { RenderMode, ServerRoute } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
  // Rota com parâmetro dinâmico — não pode ser pré-renderizada sem dados
  // Client-side rendering: o Angular resolve no browser
  {
    path: 'entregador/detalhe/:id',
    renderMode: RenderMode.Client,
  },
  // Todas as demais rotas: pré-renderizadas no build
  {
    path: '**',
    renderMode: RenderMode.Prerender,
  },
];
