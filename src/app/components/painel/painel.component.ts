// ============================================================
// painel.component.ts
// Painel do Gestor: escuta o Firebase em tempo real e renderiza
// o mapa Leaflet com a posição do motorista.
//
// PERFORMANCE CRÍTICA — Leaflet e o Firebase:
//   O Leaflet manipula o DOM diretamente e emite muitos eventos.
//   Para evitar que cada evento interno do Leaflet dispare o
//   Change Detection do Angular (mesmo com OnPush), toda a lógica
//   do mapa é executada via `ngZone.runOutsideAngular()`.
//   Apenas atualizações de dados que o template precisa renderizar
//   voltam para dentro da zona via `ngZone.run()`.
// ============================================================

import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  OnDestroy,
  signal,
  computed,
  NgZone,
  ElementRef,
  viewChild,
  AfterViewInit,
  PLATFORM_ID,
  Inject,
  DestroyRef,
  inject,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MonitoramentoService } from '../../services/monitoramento.service';
import { Coordenada } from '../../services/rastreamento.service';

// Leaflet é importado dinamicamente para evitar erros em SSR
type LeafletMap = import('leaflet').Map;
type LeafletMarker = import('leaflet').Marker;

@Component({
  selector: 'app-painel',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './painel.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PainelComponent implements OnInit, AfterViewInit, OnDestroy {
  // Referência ao elemento DOM do mapa via Signal (Angular 17+)
  readonly mapEl = viewChild<ElementRef<HTMLDivElement>>('mapContainer');

  // ── Signals de estado ────────────────────────────────────────
  readonly coordenada = signal<Coordenada | null>(null);
  readonly carregando = signal(true);
  readonly erroConexao = signal('');

  // ── Computed: derivações sem lógica no template ──────────────
  readonly statusMotorista = computed(() => {
    const c = this.coordenada();
    if (!c) return 'Aguardando dados...';
    const agora = Date.now();
    const diff = agora - c.timestamp;
    // Considera "Em trânsito" se atualizou nos últimos 60 segundos
    return diff < 60_000 ? 'Em trânsito 🟢' : 'Parado 🔴';
  });

  readonly statusColor = computed(() => {
    const c = this.coordenada();
    if (!c) return 'text-zinc-500';
    return Date.now() - c.timestamp < 60_000 ? 'text-green-400' : 'text-red-400';
  });

  readonly ultimaAtualizacao = computed(() => {
    const c = this.coordenada();
    if (!c) return '--';
    return new Date(c.timestamp).toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  });

  readonly coordFormatada = computed(() => {
    const c = this.coordenada();
    if (!c) return { lat: '--', lng: '--', precisao: '--' };
    return {
      lat: c.lat.toFixed(6),
      lng: c.lng.toFixed(6),
      precisao: c.precisao.toFixed(0),
    };
  });

  // ── Referências privadas ao Leaflet (fora da zona Angular) ───
  private leafletMap: LeafletMap | null = null;
  private marcador: LeafletMarker | null = null;

  // DestroyRef permite usar takeUntilDestroyed fora do constructor
  private destroyRef = inject(DestroyRef);

  constructor(
    private monitoramento: MonitoramentoService,
    private ngZone: NgZone,
    @Inject(PLATFORM_ID) private platformId: object
  ) {}

  ngOnInit(): void {
    // takeUntilDestroyed com DestroyRef explícito — seguro fora do constructor
    this.monitoramento
      .escutarCoordenadas()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (coord) => {
          // Atualiza signals dentro da zona para trigger de CD
          this.ngZone.run(() => {
            this.coordenada.set(coord);
            this.carregando.set(false);
          });

          // Atualiza o mapa FORA da zona para não disparar CD extra
          if (coord) {
            this.ngZone.runOutsideAngular(() => {
              this.atualizarMarcador(coord);
            });
          }
        },
        error: (err: Error) => {
          this.ngZone.run(() => {
            this.erroConexao.set(`Erro de conexão: ${err.message}`);
            this.carregando.set(false);
          });
        },
      });
  }

  ngAfterViewInit(): void {
    // Inicializa o mapa apenas no browser (guarda de SSR)
    if (isPlatformBrowser(this.platformId)) {
      // Pequeno delay para garantir que o DOM está pintado
      setTimeout(() => this.inicializarMapa(), 100);
    }
  }

  ngOnDestroy(): void {
    // Remove o mapa Leaflet do DOM para evitar memory leak
    if (this.leafletMap) {
      this.leafletMap.remove();
      this.leafletMap = null;
    }
  }

  // ── Leaflet: inicialização fora da zona Angular ──────────────

  private async inicializarMapa(): Promise<void> {
    const el = this.mapEl()?.nativeElement;
    if (!el) return;

    // Import dinâmico: evita bundle em SSR e reduz chunk inicial
    const L = await import('leaflet');

    // ⚠️ PERFORMANCE: toda inicialização do Leaflet fora da zona
    this.ngZone.runOutsideAngular(() => {
      this.leafletMap = L.map(el, {
        center: [-23.55052, -46.63331], // São Paulo como centro padrão
        zoom: 13,
        zoomControl: true,
      });

      // Tiles OpenStreetMap (gratuito, sem chave de API)
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://openstreetmap.org">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(this.leafletMap!);

      // Ícone customizado para o caminhão (emoji via DivIcon)
      const icone = L.divIcon({
        className: '',
        html: `<div style="
          background:#22c55e;
          border:2px solid #16a34a;
          border-radius:50%;
          width:36px;
          height:36px;
          display:flex;
          align-items:center;
          justify-content:center;
          font-size:18px;
          box-shadow:0 0 0 4px rgba(34,197,94,0.3);
        ">🚛</div>`,
        iconSize: [36, 36],
        iconAnchor: [18, 18],
      });

      // Marcador inicial no centro de São Paulo
      this.marcador = L.marker([-23.55052, -46.63331], { icon: icone })
        .addTo(this.leafletMap!)
        .bindPopup('<b>Motorista 001</b><br>Aguardando posição...');

      // Se já tem coordenada carregada, posiciona imediatamente
      const coordAtual = this.coordenada();
      if (coordAtual) {
        this.atualizarMarcador(coordAtual);
      }
    });
  }

  /**
   * Atualiza posição do marcador no mapa.
   * SEMPRE chamado fora da zona Angular para evitar CD desnecessário.
   */
  private atualizarMarcador(coord: Coordenada): void {
    if (!this.leafletMap || !this.marcador) return;

    const pos: [number, number] = [coord.lat, coord.lng];

    // Move o marcador suavemente para a nova posição
    this.marcador.setLatLng(pos);
    this.marcador.setPopupContent(
      `<b>Motorista 001</b><br>` +
      `Lat: ${coord.lat.toFixed(6)}<br>` +
      `Lng: ${coord.lng.toFixed(6)}<br>` +
      `Precisão: ${coord.precisao.toFixed(0)}m`
    );

    // Centraliza o mapa na nova posição com animação suave
    this.leafletMap.panTo(pos, { animate: true, duration: 0.5 });
  }
}
