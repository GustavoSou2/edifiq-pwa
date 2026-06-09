// ============================================================
// notif-banner.component.ts
// Banner toast que aparece quando chega notificação em foreground
// (o FCM não exibe notificação nativa quando o app está aberto)
// ============================================================

import {
  ChangeDetectionStrategy,
  Component,
  computed,
  signal,
  effect,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { NotificacaoService } from '../../../services/notificacao.service';

@Component({
  selector: 'app-notif-banner',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (visivel()) {
      <div class="fixed top-4 left-4 right-4 z-[9999] rounded-2xl p-4 flex items-start gap-3 animate-slide-down"
           style="max-width:420px;margin:0 auto;
                  background:rgba(255,255,255,0.97);
                  backdrop-filter:blur(16px);
                  border:1px solid #e5e5e5;
                  box-shadow:0 8px 32px rgba(0,0,0,0.12);">

        <div class="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5"
             style="background:#dcfce7;border:1px solid #bbf7d0;">
          <svg class="w-4 h-4" style="color:#16a34a;" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round"
              d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0"/>
          </svg>
        </div>

        <div class="flex-1 min-w-0 cursor-pointer" (click)="navegar()">
          <p class="text-sm font-bold leading-tight" style="color:#0a0a0a;">{{ notif()?.title }}</p>
          <p class="text-xs mt-0.5 leading-relaxed" style="color:#737373;">{{ notif()?.body }}</p>
          @if (notif()?.entregaId) {
            <p class="text-xs font-bold mt-1" style="color:#16a34a;">Ver entrega →</p>
          }
        </div>

        <button (click)="fechar()"
          class="w-6 h-6 rounded-lg flex items-center justify-center shrink-0 transition-colors"
          style="background:#f5f5f5;color:#a3a3a3;"
          style-touch-action="manipulation">
          <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
          </svg>
        </button>

      </div>
    }
  `,
  styles: [`
    @keyframes slide-down {
      from { opacity: 0; transform: translateY(-16px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    .animate-slide-down {
      animation: slide-down 250ms ease-out;
    }
  `],
})
export class NotifBannerComponent {

  readonly notif   = computed(() => this.notifSvc.ultimaNotificacao());
  readonly visivel = signal(false);

  private autoFecharTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private notifSvc: NotificacaoService,
    private router: Router,
  ) {
    // Reage a novas notificações em foreground
    effect(() => {
      const n = this.notif();
      if (n) {
        this.visivel.set(true);
        // Auto-fecha após 6 segundos
        if (this.autoFecharTimer) clearTimeout(this.autoFecharTimer);
        this.autoFecharTimer = setTimeout(() => this.fechar(), 6000);
      }
    });
  }

  navegar(): void {
    const n = this.notif();
    if (n?.entregaId) {
      this.router.navigate(['/entregador/detalhe', n.entregaId]);
    } else {
      this.router.navigate(['/entregador']);
    }
    this.fechar();
  }

  fechar(): void {
    this.visivel.set(false);
    // Limpa após fechar para não re-exibir ao voltar
    setTimeout(() => this.notifSvc.ultimaNotificacao.set(null), 300);
  }
}
