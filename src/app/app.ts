import { Component, computed, inject } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive, Router, NavigationEnd } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map, startWith } from 'rxjs/operators';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  title = 'EdifIQ PWA';

  // inject() no nível do campo — disponível antes da inicialização
  private readonly router = inject(Router);

  // Captura a URL atual como signal para decidir qual layout renderizar
  private readonly url = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects),
      startWith(this.router.url),
    ),
    { initialValue: this.router.url },
  );

  /**
   * Mostra a navegação lateral/bottom apenas no painel do gestor.
   * Na tela do entregador o app ocupa 100% sem nenhum chrome extra.
   */
  readonly mostrarNav = computed(() => !this.url().startsWith('/entregador'));
}
