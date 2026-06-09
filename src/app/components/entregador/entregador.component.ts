// ============================================================
// entregador.component.ts
// PWA do Entregador — captura GPS e envia ao Firebase.
// ============================================================

import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  signal,
  computed,
  PLATFORM_ID,
  Inject,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RastreamentoService, StatusEnvio, Coordenada } from '../../services/rastreamento.service';

@Component({
  selector: 'app-entregador',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './entregador.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EntregadorComponent implements OnDestroy {

  // ── Signals ─────────────────────────────────────────────────
  readonly ativo         = signal(false);
  readonly coordenada    = signal<Coordenada | null>(null);
  readonly statusEnvio   = signal<StatusEnvio>('inativo');
  readonly erroMsg       = signal('');
  readonly totalEnviados = signal(0);
  readonly isOnline      = signal(true); // default true, atualiza no browser

  // ── Computed ─────────────────────────────────────────────────
  readonly statusLabel = computed(() => {
    const map: Record<StatusEnvio, string> = {
      inativo:        'Aguardando início',
      capturando:     'Capturando GPS...',
      enviando:       'Enviando ao Firebase...',
      sincronizando:  'Sincronizando dados offline...',
      erro:           'Erro — verifique o GPS',
    };
    return map[this.statusEnvio()];
  });

  readonly statusColor = computed(() => {
    const map: Record<StatusEnvio, string> = {
      inativo:       'text-slate-400',
      capturando:    'text-green-700',
      enviando:      'text-amber-600',
      sincronizando: 'text-blue-600',
      erro:          'text-red-600',
    };
    return map[this.statusEnvio()];
  });

  readonly statusDot = computed(() => {
    const map: Record<StatusEnvio, string> = {
      inativo:       'bg-slate-300',
      capturando:    'bg-green-500 animate-pulse',
      enviando:      'bg-amber-400 animate-pulse',
      sincronizando: 'bg-blue-500 animate-pulse',
      erro:          'bg-red-500',
    };
    return map[this.statusEnvio()];
  });

  readonly coordFormatada = computed(() => {
    const c = this.coordenada();
    if (!c) return { lat: '--', lng: '--', precisao: '--' };
    return {
      lat:     c.lat.toFixed(6),
      lng:     c.lng.toFixed(6),
      precisao: c.precisao.toFixed(0),
    };
  });

  readonly ultimaAtualizacao = computed(() => {
    const c = this.coordenada();
    if (!c) return '--';
    return new Date(c.timestamp).toLocaleTimeString('pt-BR');
  });

  constructor(
    private rastreamento: RastreamentoService,
    @Inject(PLATFORM_ID) private platformId: object,
  ) {
    // Sincroniza todos os BehaviorSubjects com os signals locais
    this.rastreamento.coordenada$
      .pipe(takeUntilDestroyed())
      .subscribe((c) => this.coordenada.set(c));

    this.rastreamento.statusEnvio$
      .pipe(takeUntilDestroyed())
      .subscribe((s) => this.statusEnvio.set(s));

    this.rastreamento.erroMensagem$
      .pipe(takeUntilDestroyed())
      .subscribe((e) => this.erroMsg.set(e));

    this.rastreamento.totalEnviados$
      .pipe(takeUntilDestroyed())
      .subscribe((n) => this.totalEnviados.set(n));

    // Monitora conectividade apenas no browser
    if (isPlatformBrowser(this.platformId)) {
      this.isOnline.set(navigator.onLine);
      window.addEventListener('online',  () => this.isOnline.set(true));
      window.addEventListener('offline', () => this.isOnline.set(false));
    }
  }

  ngOnDestroy(): void {
    if (this.ativo()) {
      this.rastreamento.pararRastreamento();
    }
  }

  async iniciarEntrega(): Promise<void> {
    this.ativo.set(true);
    await this.rastreamento.iniciarRastreamento();
  }

  pararEntrega(): void {
    this.ativo.set(false);
    this.rastreamento.pararRastreamento();
  }
}
