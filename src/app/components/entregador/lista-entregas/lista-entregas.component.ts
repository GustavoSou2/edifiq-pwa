import {
  ChangeDetectionStrategy, Component, computed,
  PLATFORM_ID, Inject, signal, OnInit, inject,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Router } from '@angular/router';
import { EntregasService } from '../../../services/entregas.service';
import { Entrega, StatusEntrega } from '../../../models/entrega.model';
import { NotificacaoService } from '../../../services/notificacao.service';

@Component({
  selector: 'app-lista-entregas',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './lista-entregas.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ListaEntregasComponent implements OnInit {

  // ── inject() no campo — resolve antes do constructor ────────
  private readonly notifSvc     = inject(NotificacaoService);
  readonly entregas             = inject(EntregasService);
  private readonly router       = inject(Router);

  // ── Signals ──────────────────────────────────────────────────
  readonly isOnline             = signal(true);
  readonly solicitandoPermissao = signal(false);

  // Expõe diretamente o signal do serviço (referência, não cópia)
  readonly permissaoNotif = this.notifSvc.permissao;

  // ── Computed ─────────────────────────────────────────────────
  readonly resumo = computed(() => {
    const l = this.entregas.entregas();
    return {
      total:     l.length,
      pendentes: l.filter((e) => e.status === 'pendente').length,
      emRota:    l.filter((e) => e.status === 'em_rota').length,
      entregues: l.filter((e) => e.status === 'entregue').length,
      problemas: l.filter((e) => e.status === 'problema').length,
    };
  });

  readonly progresso = computed(() => {
    const r = this.resumo();
    return r.total ? Math.round((r.entregues / r.total) * 100) : 0;
  });

  readonly dataHoje = new Date().toLocaleDateString('pt-BR', {
    weekday: 'long', day: '2-digit', month: 'long',
  });

  constructor(@Inject(PLATFORM_ID) private platformId: object) {
    if (isPlatformBrowser(this.platformId)) {
      this.isOnline.set(navigator.onLine);
      window.addEventListener('online',  () => this.isOnline.set(true));
      window.addEventListener('offline', () => this.isOnline.set(false));
    }
  }

  ngOnInit(): void {
    if (isPlatformBrowser(this.platformId) &&
        this.notifSvc.permissao() === 'pendente') {
      setTimeout(() => this.solicitarNotificacoes(), 2000);
    }
  }

  async solicitarNotificacoes(): Promise<void> {
    this.solicitandoPermissao.set(true);
    const token = await this.notifSvc.solicitarPermissao();
    this.solicitandoPermissao.set(false);

    if (token) {
      console.log('[EdifIQ] FCM Token — enviar ao servidor Java:', token);
      // Em produção:
      // this.http.post('/api/v1/dispositivos/registrar', { token, motoristaId })
    }
  }

  abrirEntrega(e: Entrega): void {
    this.entregas.selecionarEntrega(e.id);
    this.router.navigate(['/entregador/detalhe', e.id]);
  }

  formatarJanela(e: Entrega): string {
    const fmt = (iso: string) =>
      new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    return `${fmt(e.deliveryWindowStart)} – ${fmt(e.deliveryWindowEnd)}`;
  }

  labelStatus(s: StatusEntrega): string {
    return {
      pendente: 'Pendente',
      em_rota:  'Em rota',
      entregue: 'Entregue',
      problema: 'Problema',
    }[s];
  }
}
