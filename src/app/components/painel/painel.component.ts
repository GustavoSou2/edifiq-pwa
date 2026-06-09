// ============================================================
// painel.component.ts
// Dashboard do Gestor — tema claro, mapa com percurso polyline.
// Leaflet roda fora da zona Angular para evitar CD desnecessário.
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

type LeafletMap    = import('leaflet').Map;
type LeafletMarker = import('leaflet').Marker;
type LeafletPolyline = import('leaflet').Polyline;

@Component({
  selector: 'app-painel',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './painel.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PainelComponent implements OnInit, AfterViewInit, OnDestroy {

  readonly mapEl = viewChild<ElementRef<HTMLDivElement>>('mapContainer');

  // ── Signals ──────────────────────────────────────────────────
  readonly coordenada    = signal<Coordenada | null>(null);
  readonly carregando    = signal(true);
  readonly erroConexao   = signal('');
  readonly totalPontos   = signal(0);

  // ── Computed ─────────────────────────────────────────────────
  readonly emTransito = computed(() => {
    const c = this.coordenada();
    if (!c) return false;
    return Date.now() - c.timestamp < 60_000;
  });

  readonly statusLabel = computed(() => {
    const c = this.coordenada();
    if (!c) return 'Aguardando motorista...';
    return this.emTransito() ? 'Em trânsito' : 'Parado';
  });

  readonly ultimaAtualizacao = computed(() => {
    const c = this.coordenada();
    if (!c) return '--:--:--';
    return new Date(c.timestamp).toLocaleTimeString('pt-BR');
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

  // ── Leaflet (fora da zona Angular) ───────────────────────────
  private leafletMap:    LeafletMap     | null = null;
  private marcador:      LeafletMarker  | null = null;
  private percursoLine:  LeafletPolyline | null = null;

  private destroyRef = inject(DestroyRef);

  constructor(
    private monitoramento: MonitoramentoService,
    private ngZone: NgZone,
    @Inject(PLATFORM_ID) private platformId: object,
  ) {}

  ngOnInit(): void {
    this.monitoramento
      .escutarCoordenadas()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (coord) => {
          this.ngZone.run(() => {
            this.coordenada.set(coord);
            this.carregando.set(false);
            this.totalPontos.set(this.monitoramento.getHistorico().length);
          });

          if (coord) {
            // Mapa fora da zona — sem CD extra
            this.ngZone.runOutsideAngular(() => {
              this.atualizarMapa(coord);
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
    if (isPlatformBrowser(this.platformId)) {
      requestAnimationFrame(() => {
        setTimeout(() => this.inicializarMapa(), 50);
      });
    }
  }

  ngOnDestroy(): void {
    if (this.leafletMap) {
      this.leafletMap.remove();
      this.leafletMap = null;
    }
  }

  // ── Leaflet ──────────────────────────────────────────────────

  private async inicializarMapa(): Promise<void> {
    const el = this.mapEl()?.nativeElement;
    if (!el) return;

    const L = await import('leaflet');

    // Fix obrigatório para ícones do Leaflet com bundlers (webpack/esbuild)
    type LeafletIconDefault = typeof L.Icon.Default & {
      prototype: { _getIconUrl?: () => string };
    };
    delete (L.Icon.Default as LeafletIconDefault).prototype._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
      iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
      shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
    });

    this.ngZone.runOutsideAngular(() => {
      this.leafletMap = L.map(el, {
        center: [-23.55052, -46.63331],
        zoom: 14,
        zoomControl: true,
      });

      // Tiles CartoDB Positron — minimalista claro, sem poluição visual
      L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '© <a href="https://carto.com">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 19,
      }).addTo(this.leafletMap!);

      // Ícone do caminhão — ponto verde claro
      const icone = L.divIcon({
        className: '',
        html: `<div style="
          width:14px;height:14px;border-radius:50%;
          background:#16a34a;
          border:2.5px solid #ffffff;
          box-shadow:0 2px 8px rgba(22,163,74,0.35), 0 0 0 4px rgba(22,163,74,0.15);
        "></div>`,
        iconSize: [14, 14],
        iconAnchor: [7, 7],
      });

      this.marcador = L.marker([-23.55052, -46.63331], { icon: icone })
        .addTo(this.leafletMap!)
        .bindPopup('Aguardando posição...');

      // Polyline do percurso — verde EdifIQ
      this.percursoLine = L.polyline([], {
        color: '#16a34a',
        weight: 3,
        opacity: 0.85,
        lineJoin: 'round',
        lineCap: 'round',
      }).addTo(this.leafletMap!);

      // Se já há histórico (reconexão), renderiza tudo
      const hist = this.monitoramento.getHistorico();
      if (hist.length > 0) {
        this.renderizarPercurso(hist);
        const ultima = hist[hist.length - 1];
        this.atualizarMarcadorPos(ultima);
      }

      // invalidateSize: força o Leaflet a recalcular as dimensões do
      // container após o Angular terminar de renderizar o DOM.
      // Sem isso, o mapa renderiza "cinza" quando o container não
      // tinha tamanho definido no momento do L.map().
      setTimeout(() => this.leafletMap?.invalidateSize(), 50);
    });
  }

  /**
   * Chamado a cada nova coordenada do Firebase.
   * Atualiza marcador + estende a polyline com o novo ponto.
   * Roda FORA da zona Angular.
   */
  private atualizarMapa(coord: Coordenada): void {
    this.atualizarMarcadorPos(coord);

    if (this.percursoLine) {
      // getLatLngs() retorna union type — fazemos cast seguro via unknown
      const atual = (this.percursoLine.getLatLngs() as unknown) as [number, number][];
      atual.push([coord.lat, coord.lng]);
      this.percursoLine.setLatLngs(atual);
    }
  }

  private atualizarMarcadorPos(coord: Coordenada): void {
    if (!this.leafletMap || !this.marcador) return;
    const pos: [number, number] = [coord.lat, coord.lng];
    this.marcador.setLatLng(pos);
    this.marcador.setPopupContent(
      `<div style="font-family:system-ui;font-size:13px;line-height:1.5">
        <strong>🚛 Motorista 001</strong><br>
        <span style="color:#64748b">Lat:</span> ${coord.lat.toFixed(6)}<br>
        <span style="color:#64748b">Lng:</span> ${coord.lng.toFixed(6)}<br>
        <span style="color:#64748b">Precisão:</span> ${coord.precisao.toFixed(0)}m
      </div>`,
    );
    this.leafletMap.panTo(pos, { animate: true, duration: 0.6 });
  }

  /** Reconstrói a polyline completa a partir do histórico */
  private renderizarPercurso(historico: Coordenada[]): void {
    if (!this.percursoLine) return;
    const latlngs = historico.map((c): [number, number] => [c.lat, c.lng]);
    this.percursoLine.setLatLngs(latlngs);
    if (latlngs.length > 1 && this.leafletMap) {
      this.leafletMap.fitBounds(this.percursoLine.getBounds(), { padding: [30, 30] });
    }
  }
}
