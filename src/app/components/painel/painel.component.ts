// ============================================================
// painel.component.ts
// Dashboard do Gestor — monitoramento dinâmico de entregas.
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
  inject,
  effect,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { MonitoramentoService } from '../../services/monitoramento.service';
import { EntregasService } from '../../services/entregas.service';
import { AuthService } from '../../services/auth.service';
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

  private readonly monitoramento = inject(MonitoramentoService);
  readonly entregasService = inject(EntregasService);
  private readonly authSvc = inject(AuthService);
  private readonly router = inject(Router);
  private readonly ngZone = inject(NgZone);

  // ── Signals ──────────────────────────────────────────────────
  readonly selectedDeliveryId = signal<string>('');
  readonly coordenada    = signal<Coordenada | null>(null);
  readonly carregando    = signal(false);
  readonly erroConexao   = signal('');
  readonly totalPontos   = signal(0);

  // ── Computed ─────────────────────────────────────────────────
  readonly selectedDelivery = computed(() => {
    const id = this.selectedDeliveryId();
    return this.entregasService.entregas().find((e) => e.id === id) || null;
  });

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
  private firebaseSub?:  Subscription;

  constructor(@Inject(PLATFORM_ID) private platformId: object) {
    // Carrega entregas ativas para o gestor
    this.entregasService.carregarEntregas();

    // Seleciona automaticamente a primeira entrega disponível após o carregamento
    effect(() => {
      const list = this.entregasService.entregas();
      if (list.length > 0 && !this.selectedDeliveryId()) {
        const emRota = list.find((e) => e.status === 'em_rota');
        const defaultDel = emRota || list[0];
        this.selecionarEntrega(defaultDel.id);
      }
    });
  }

  ngOnInit(): void {}

  ngAfterViewInit(): void {
    if (isPlatformBrowser(this.platformId)) {
      requestAnimationFrame(() => {
        setTimeout(() => this.inicializarMapa(), 50);
      });
    }
  }

  ngOnDestroy(): void {
    if (this.firebaseSub) {
      this.firebaseSub.unsubscribe();
    }
    if (this.leafletMap) {
      this.leafletMap.remove();
      this.leafletMap = null;
    }
  }

  // ── Monitoramento Dinâmico ───────────────────────────────────

  selecionarEntrega(id: string): void {
    if (!id || id === this.selectedDeliveryId()) return;

    this.selectedDeliveryId.set(id);

    // Limpa inscrições anteriores e reseta estado
    if (this.firebaseSub) {
      this.firebaseSub.unsubscribe();
      this.firebaseSub = undefined;
    }

    this.coordenada.set(null);
    this.erroConexao.set('');
    this.totalPontos.set(0);
    this.carregando.set(true);

    // Reseta mapa fora da zona
    this.ngZone.runOutsideAngular(() => {
      if (this.percursoLine) {
        this.percursoLine.setLatLngs([]);
      }
      if (this.marcador) {
        this.marcador.setLatLng([-23.55052, -46.63331]);
        this.marcador.setPopupContent('Aguardando posição...');
      }
    });

    // Inicia escuta no Firebase
    this.firebaseSub = this.monitoramento
      .escutarCoordenadas(id)
      .subscribe({
        next: (coord) => {
          this.ngZone.run(() => {
            this.coordenada.set(coord);
            this.carregando.set(false);
            this.totalPontos.set(this.monitoramento.getHistorico().length);
          });

          if (coord) {
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

  logout(): void {
    this.authSvc.logout();
    this.router.navigate(['/login']);
  }

  // ── Leaflet ──────────────────────────────────────────────────

  private async inicializarMapa(): Promise<void> {
    const el = this.mapEl()?.nativeElement;
    if (!el) return;

    const L = await import('leaflet');

    // Fix de ícones do Leaflet
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

      L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '© <a href="https://carto.com">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 19,
      }).addTo(this.leafletMap!);

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

      this.percursoLine = L.polyline([], {
        color: '#16a34a',
        weight: 3,
        opacity: 0.85,
        lineJoin: 'round',
        lineCap: 'round',
      }).addTo(this.leafletMap!);

      const hist = this.monitoramento.getHistorico();
      if (hist.length > 0) {
        this.renderizarPercurso(hist);
        const ultima = hist[hist.length - 1];
        this.atualizarMarcadorPos(ultima);
      }

      setTimeout(() => this.leafletMap?.invalidateSize(), 50);
    });
  }

  private atualizarMapa(coord: Coordenada): void {
    this.atualizarMarcadorPos(coord);

    if (this.percursoLine) {
      const atual = (this.percursoLine.getLatLngs() as unknown) as [number, number][];
      atual.push([coord.lat, coord.lng]);
      this.percursoLine.setLatLngs(atual);
    }
  }

  private atualizarMarcadorPos(coord: Coordenada): void {
    if (!this.leafletMap || !this.marcador) return;
    const pos: [number, number] = [coord.lat, coord.lng];
    this.marcador.setLatLng(pos);

    const delivery = this.selectedDelivery();
    const label = delivery ? delivery.referenceCode : 'Motorista';

    this.marcador.setPopupContent(
      `<div style="font-family:system-ui;font-size:13px;line-height:1.5">
        <strong>🚛 Entrega: ${label}</strong><br>
        <span style="color:#64748b">Lat:</span> ${coord.lat.toFixed(6)}<br>
        <span style="color:#64748b">Lng:</span> ${coord.lng.toFixed(6)}<br>
        <span style="color:#64748b">Precisão:</span> ${coord.precisao.toFixed(0)}m
      </div>`,
    );
    this.leafletMap.panTo(pos, { animate: true, duration: 0.6 });
  }

  private renderizarPercurso(historico: Coordenada[]): void {
    if (!this.percursoLine) return;
    const latlngs = historico.map((c): [number, number] => [c.lat, c.lng]);
    this.percursoLine.setLatLngs(latlngs);
    if (latlngs.length > 1 && this.leafletMap) {
      this.leafletMap.fitBounds(this.percursoLine.getBounds(), { padding: [30, 30] });
    }
  }
}
