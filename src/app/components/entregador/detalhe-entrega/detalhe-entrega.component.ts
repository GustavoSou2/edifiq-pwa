// ============================================================
// detalhe-entrega.component.ts
// Tela de detalhe: preview da rota no mapa + controle de rastreamento
// ============================================================

import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  AfterViewInit,
  signal,
  computed,
  input,
  NgZone,
  ElementRef,
  viewChild,
  PLATFORM_ID,
  Inject,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { EntregasService } from '../../../services/entregas.service';
import { RastreamentoService, StatusEnvio } from '../../../services/rastreamento.service';
import { Entrega } from '../../../models/entrega.model';

type LeafletMap    = import('leaflet').Map;
type LeafletMarker = import('leaflet').Marker;

@Component({
  selector: 'app-detalhe-entrega',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './detalhe-entrega.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DetalheEntregaComponent implements AfterViewInit, OnDestroy {

  // Parâmetro de rota via input binding (Angular 17+)
  readonly id = input<string>('');

  readonly mapEl = viewChild<ElementRef<HTMLDivElement>>('mapContainer');

  // ── Signals ──────────────────────────────────────────────────
  readonly rastreandoAtivo = signal(false);
  readonly statusEnvio     = signal<StatusEnvio>('inativo');
  readonly erroMsg         = signal('');
  readonly totalEnviados   = signal(0);
  readonly mapPronto       = signal(false);

  // ── Computed ─────────────────────────────────────────────────
  readonly entrega = computed<Entrega | null>(() => {
    const id = this.id();
    return this.entregasService.entregas().find((e) => e.id === id) ?? null;
  });

  readonly statusLabel = computed(() => {
    const map: Record<StatusEnvio, string> = {
      inativo:       'GPS inativo',
      capturando:    'GPS ativo — transmitindo',
      enviando:      'Enviando posição...',
      sincronizando: 'Sincronizando offline...',
      erro:          'Erro no GPS',
    };
    return map[this.statusEnvio()];
  });

  readonly podeiniciar = computed(() => {
    const e = this.entrega();
    return e?.status === 'pendente' || e?.status === 'em_rota';
  });

  // Leaflet (sempre fora da zona Angular)
  private leafletMap: LeafletMap | null = null;

  constructor(
    private entregasService: EntregasService,
    private rastreamento: RastreamentoService,
    private router: Router,
    private ngZone: NgZone,
    @Inject(PLATFORM_ID) private platformId: object,
  ) {
    this.rastreamento.statusEnvio$
      .pipe(takeUntilDestroyed())
      .subscribe((s) => this.statusEnvio.set(s));

    this.rastreamento.erroMensagem$
      .pipe(takeUntilDestroyed())
      .subscribe((e) => this.erroMsg.set(e));

    this.rastreamento.totalEnviados$
      .pipe(takeUntilDestroyed())
      .subscribe((n) => this.totalEnviados.set(n));
  }

  ngAfterViewInit(): void {
    if (isPlatformBrowser(this.platformId)) {
      setTimeout(() => this.inicializarMapa(), 100);
    }
  }

  ngOnDestroy(): void {
    if (this.rastreandoAtivo()) {
      this.rastreamento.pararRastreamento();
    }
    if (this.leafletMap) {
      this.leafletMap.remove();
      this.leafletMap = null;
    }
  }

  voltar(): void {
    this.router.navigate(['/entregador']);
  }

  async iniciarEntrega(): Promise<void> {
    const e = this.entrega();
    if (!e) return;

    this.entregasService.atualizarStatus(e.id, 'em_rota');
    this.rastreandoAtivo.set(true);
    await this.rastreamento.iniciarRastreamento();
  }

  finalizarEntrega(): void {
    const e = this.entrega();
    if (!e) return;

    this.rastreamento.pararRastreamento();
    this.rastreandoAtivo.set(false);
    this.entregasService.atualizarStatus(e.id, 'entregue');
    this.router.navigate(['/entregador']);
  }

  reportarProblema(): void {
    const e = this.entrega();
    if (!e) return;

    this.rastreamento.pararRastreamento();
    this.rastreandoAtivo.set(false);
    this.entregasService.atualizarStatus(e.id, 'problema');
    this.router.navigate(['/entregador']);
  }

  abrirNavegacao(): void {
    const e = this.entrega();
    if (!e) return;
    const { lat, lng } = e.destino;
    const destino = encodeURIComponent(
      `${e.destino.logradouro}, ${e.destino.numero}, ${e.destino.cidade}`,
    );
    // Abre Google Maps ou Waze em navegação nativa
    if (isPlatformBrowser(this.platformId)) {
      window.open(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`, '_blank');
    }
  }

  // ── Leaflet ──────────────────────────────────────────────────

  private async inicializarMapa(): Promise<void> {
    const el = this.mapEl()?.nativeElement;
    const entrega = this.entrega();
    if (!el || !entrega) return;

    const L = await import('leaflet');

    this.ngZone.runOutsideAngular(() => {
      const origem  = entrega.origem;
      const destino = entrega.destino;

      // Centro do mapa = ponto médio entre origem e destino
      const centroLat = (origem.lat + destino.lat) / 2;
      const centroLng = (origem.lng + destino.lng) / 2;

      this.leafletMap = L.map(el, {
        center: [centroLat, centroLng],
        zoom: 14,
        zoomControl: false,
        attributionControl: true,
      });

      L.control.zoom({ position: 'bottomright' }).addTo(this.leafletMap!);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://openstreetmap.org">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(this.leafletMap!);

      // Marcador ORIGEM — ícone verde
      const iconeOrigem = L.divIcon({
        className: '',
        html: `<div style="
          width:36px;height:36px;border-radius:50%;
          background:#16a34a;border:3px solid #fff;
          display:flex;align-items:center;justify-content:center;
          font-size:16px;
          box-shadow:0 2px 8px rgba(0,0,0,0.3);">🏭</div>`,
        iconSize: [36, 36],
        iconAnchor: [18, 18],
      });

      // Marcador DESTINO — ícone vermelho
      const iconeDestino = L.divIcon({
        className: '',
        html: `<div style="
          width:36px;height:36px;border-radius:50%;
          background:#dc2626;border:3px solid #fff;
          display:flex;align-items:center;justify-content:center;
          font-size:16px;
          box-shadow:0 2px 8px rgba(0,0,0,0.3);">📦</div>`,
        iconSize: [36, 36],
        iconAnchor: [18, 36],
      });

      L.marker([origem.lat, origem.lng], { icon: iconeOrigem })
        .addTo(this.leafletMap!)
        .bindPopup(`<b>Saída</b><br>${origem.logradouro}, ${origem.numero}<br>${origem.bairro}`);

      L.marker([destino.lat, destino.lng], { icon: iconeDestino })
        .addTo(this.leafletMap!)
        .bindPopup(`<b>Destino</b><br>${destino.logradouro}, ${destino.numero}<br>${destino.bairro}`);

      // Linha da rota estimada (linha reta — sem API de roteamento)
      // Em produção usar OSRM ou Google Directions API
      const linhaDasRuas: [number, number][] = [
        [origem.lat,  origem.lng],
        // ponto intermediário para dar curva visual (simula rua)
        [origem.lat + (destino.lat - origem.lat) * 0.35, origem.lng + (destino.lng - origem.lng) * 0.1],
        [origem.lat + (destino.lat - origem.lat) * 0.65, origem.lng + (destino.lng - origem.lng) * 0.9],
        [destino.lat, destino.lng],
      ];

      // Sombra da rota (linha mais grossa, cinza)
      L.polyline(linhaDasRuas, {
        color: '#94a3b8', weight: 7, opacity: 0.4,
        lineJoin: 'round', lineCap: 'round',
      }).addTo(this.leafletMap!);

      // Rota principal (linha azul)
      L.polyline(linhaDasRuas, {
        color: '#2563eb', weight: 4, opacity: 0.9,
        lineJoin: 'round', lineCap: 'round',
        dashArray: undefined,
      }).addTo(this.leafletMap!);

      // Enquadra os dois pontos no mapa
      const bounds = L.latLngBounds(
        [origem.lat, origem.lng],
        [destino.lat, destino.lng],
      );
      this.leafletMap!.fitBounds(bounds, { padding: [50, 50] });

      // invalidateSize: reconstrói o cálculo de dimensões do container.
      // Necessário porque o mapa é criado dentro de um componente Angular
      // que pode ainda estar ajustando layout quando o Leaflet inicializa.
      setTimeout(() => {
        this.leafletMap?.invalidateSize();
        // Refaz o fitBounds após o resize para garantir enquadramento correto
        this.leafletMap?.fitBounds(bounds, { padding: [50, 50] });
      }, 100);

      this.ngZone.run(() => this.mapPronto.set(true));
    });
  }
}
