// ============================================================
// lista-entregas.component.ts
// Tela principal do app do motorista — lista de entregas do dia
// ============================================================

import {
  ChangeDetectionStrategy,
  Component,
  computed,
  PLATFORM_ID,
  Inject,
  signal,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Router } from '@angular/router';
import { EntregasService } from '../../../services/entregas.service';
import { Entrega, StatusEntrega } from '../../../models/entrega.model';

@Component({
  selector: 'app-lista-entregas',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './lista-entregas.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ListaEntregasComponent {

  readonly isOnline = signal(true);

  // ── Computed de resumo ───────────────────────────────────────
  readonly resumo = computed(() => {
    const lista = this.entregas.entregas();
    return {
      total:     lista.length,
      pendentes: lista.filter((e) => e.status === 'pendente').length,
      emRota:    lista.filter((e) => e.status === 'em_rota').length,
      entregues: lista.filter((e) => e.status === 'entregue').length,
      problemas: lista.filter((e) => e.status === 'problema').length,
    };
  });

  readonly dataHoje = new Date().toLocaleDateString('pt-BR', {
    weekday: 'long', day: '2-digit', month: 'long',
  });

  constructor(
    readonly entregas: EntregasService,
    private router: Router,
    @Inject(PLATFORM_ID) private platformId: object,
  ) {
    if (isPlatformBrowser(this.platformId)) {
      this.isOnline.set(navigator.onLine);
      window.addEventListener('online',  () => this.isOnline.set(true));
      window.addEventListener('offline', () => this.isOnline.set(false));
    }
  }

  abrirEntrega(entrega: Entrega): void {
    this.entregas.selecionarEntrega(entrega.id);
    this.router.navigate(['/entregador/detalhe', entrega.id]);
  }

  // Helpers de template
  corStatus(status: StatusEntrega): string {
    const map: Record<StatusEntrega, string> = {
      pendente:  'bg-amber-100 text-amber-700 border-amber-200',
      em_rota:   'bg-blue-100 text-blue-700 border-blue-200',
      entregue:  'bg-green-100 text-green-700 border-green-200',
      problema:  'bg-red-100 text-red-700 border-red-200',
    };
    return map[status];
  }

  labelStatus(status: StatusEntrega): string {
    const map: Record<StatusEntrega, string> = {
      pendente:  'Pendente',
      em_rota:   'Em rota',
      entregue:  'Entregue',
      problema:  'Problema',
    };
    return map[status];
  }

  iconeStatus(status: StatusEntrega): string {
    const map: Record<StatusEntrega, string> = {
      pendente:  '🕐',
      em_rota:   '🚛',
      entregue:  '✅',
      problema:  '⚠️',
    };
    return map[status];
  }
}
