// ============================================================
// detalhe-entrega.component.ts
// Detalhe da ordem: mapa, itens, checklist de finalização + foto
// ============================================================

import {
  ChangeDetectionStrategy, Component, OnDestroy, AfterViewInit,
  signal, computed, input, NgZone, ElementRef, viewChild,
  PLATFORM_ID, Inject,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { EntregasService } from '../../../services/entregas.service';
import { RastreamentoService, StatusEnvio, Coordenada } from '../../../services/rastreamento.service';
import { Entrega } from '../../../models/entrega.model';
import { CountConferidosPipe } from '../../../pipes/count-conferidos.pipe';

type LeafletMap = import('leaflet').Map;

// Abas da tela de detalhe
type Aba = 'rota' | 'itens' | 'finalizar';

@Component({
  selector: 'app-detalhe-entrega',
  standalone: true,
  imports: [CommonModule, CountConferidosPipe],
  templateUrl: './detalhe-entrega.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DetalheEntregaComponent implements AfterViewInit, OnDestroy {

  readonly id = input<string>('');

  readonly mapEl = viewChild<ElementRef<HTMLDivElement>>('mapContainer');
  readonly fotoInput = viewChild<ElementRef<HTMLInputElement>>('fotoInput');

  // ── Signals ──────────────────────────────────────────────────
  readonly abaAtiva        = signal<Aba>('rota');
  readonly rastreandoAtivo = signal(false);
  readonly statusEnvio     = signal<StatusEnvio>('inativo');
  readonly erroMsg         = signal('');
  readonly totalEnviados   = signal(0);
  readonly posicaoAtual    = signal<Coordenada | null>(null);
  readonly mapPronto       = signal(false);
  readonly obsFinalizacao  = signal('');
  readonly fotoPreview     = signal<string | null>(null);
  readonly enviandoFinaliz = signal(false);

  // ── Computed ─────────────────────────────────────────────────
  readonly entrega = computed<Entrega | null>(() => {
    const id = this.id();
    return this.svc.entregas().find((e) => e.id === id) ?? null;
  });

  readonly statusLabel = computed(() => ({
    inativo: 'GPS inativo', capturando: 'Transmitindo posição',
    enviando: 'Enviando...', sincronizando: 'Sincronizando...', erro: 'Erro GPS',
  }[this.statusEnvio()]));

  readonly todosConferidos = computed(() => {
    const e = this.entrega();
    return e ? e.items.every((i) => i.conferido) : false;
  });

  readonly podeFinalizarChecklist = computed(() =>
    this.todosConferidos() && !!this.fotoPreview(),
  );

  /** Janela de entrega formatada */
  readonly janela = computed(() => {
    const e = this.entrega();
    if (!e) return '';
    const fmt = (iso: string) =>
      new Date(iso).toLocaleString('pt-BR', {
        day: '2-digit', month: '2-digit',
        hour: '2-digit', minute: '2-digit',
      });
    const inicio = fmt(e.deliveryWindowStart);
    if (e.deliveryWindowEnd) {
      const fim = fmt(e.deliveryWindowEnd);
      return `${inicio} → ${fim}`;
    }
    return `A partir de ${inicio}`;
  });

  /** Valor da proposta formatado em BRL */
  readonly valorProposta = computed(() => {
    const e = this.entrega();
    if (!e?.proposalTotalPrice) return null;
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
      .format(e.proposalTotalPrice);
  });

  /** Reputação do fornecedor formatada */
  readonly estrelasFornecedor = computed(() => {
    const e = this.entrega();
    if (!e?.supplierReputationScore) return null;
    return e.supplierReputationScore.toFixed(1);
  });

  private leafletMap: LeafletMap | null = null;
  private driverMarker: any = null;

  constructor(
    private svc: EntregasService,
    private rastreamento: RastreamentoService,
    private router: Router,
    private ngZone: NgZone,
    @Inject(PLATFORM_ID) private platformId: object,
  ) {
    if (this.svc.entregas().length === 0) {
      this.svc.carregarEntregas();
    }
    this.rastreamento.statusEnvio$
      .pipe(takeUntilDestroyed())
      .subscribe((s) => this.statusEnvio.set(s));
    this.rastreamento.erroMensagem$
      .pipe(takeUntilDestroyed())
      .subscribe((e) => this.erroMsg.set(e));
    this.rastreamento.totalEnviados$
      .pipe(takeUntilDestroyed())
      .subscribe((n) => this.totalEnviados.set(n));
    // Posição em tempo real para atualizar o marcador no mapa
    this.rastreamento.coordenada$
      .pipe(takeUntilDestroyed())
      .subscribe((c) => {
        this.posicaoAtual.set(c);
        if (c) this.atualizarMarcadorDriver(c);
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
    if (this.rastreandoAtivo()) this.rastreamento.pararRastreamento();
    if (this.leafletMap) { this.leafletMap.remove(); this.leafletMap = null; }
  }

  // ── Navegação ────────────────────────────────────────────────
  voltar(): void { this.router.navigate(['/entregador']); }
  mudarAba(aba: Aba): void { this.abaAtiva.set(aba); }

  // ── Ações de entrega ─────────────────────────────────────────
  async iniciarEntrega(): Promise<void> {
    const e = this.entrega();
    if (!e) return;
    this.svc.atualizarStatus(e.id, 'em_rota');
    this.rastreandoAtivo.set(true);
    await this.rastreamento.iniciarRastreamento(e.id);
  }

  conferirItem(itemId: string, conferido: boolean): void {
    const e = this.entrega();
    if (!e) return;
    this.svc.conferirItem(e.id, itemId, conferido);
  }

  abrirSeletorFoto(): void {
    if (isPlatformBrowser(this.platformId)) {
      this.fotoInput()?.nativeElement.click();
    }
  }

  onFotoSelecionada(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      this.ngZone.run(() => this.fotoPreview.set(result));
    };
    reader.readAsDataURL(file);
  }

  confirmarEntrega(): void {
    const e = this.entrega();
    if (!e || !this.podeFinalizarChecklist()) return;

    this.enviandoFinaliz.set(true);
    this.svc.salvarFinalizacao(e.id, this.fotoPreview()!, this.obsFinalizacao());
    this.rastreamento.pararRastreamento();
    this.rastreandoAtivo.set(false);
    setTimeout(() => {
      this.enviandoFinaliz.set(false);
      this.router.navigate(['/entregador']);
    }, 800);
  }

  reportarProblema(): void {
    const e = this.entrega();
    if (!e) return;
    this.rastreamento.pararRastreamento();
    this.rastreandoAtivo.set(false);
    this.svc.atualizarStatus(e.id, 'problema');
    this.router.navigate(['/entregador']);
  }

  abrirNavegacao(): void {
    const e = this.entrega();
    if (!e || !isPlatformBrowser(this.platformId)) return;
    const { deliveryLat: lat, deliveryLng: lng } = e;
    window.open(
      `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`,
      '_blank',
    );
  }

  // ── Leaflet ──────────────────────────────────────────────────
  private async inicializarMapa(): Promise<void> {
    const el = this.mapEl()?.nativeElement;
    const entrega = this.entrega();
    if (!el || !entrega) return;

    const L = await import('leaflet');

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
      const origemLat = entrega.supplierLat;
      const origemLng = entrega.supplierLng;
      const destinoLat = entrega.deliveryLat;
      const destinoLng = entrega.deliveryLng;

      this.leafletMap = L.map(el, {
        center: [(origemLat + destinoLat) / 2, (origemLng + destinoLng) / 2],
        zoom: 14, zoomControl: false,
      });

      L.control.zoom({ position: 'bottomright' }).addTo(this.leafletMap!);

      L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '© <a href="https://carto.com">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 19,
      }).addTo(this.leafletMap!);

      const pin = (accent: string) => L.divIcon({
        className: '',
        html: `<div style="
          width:12px;height:12px;border-radius:50%;
          background:${accent};
          border:2.5px solid #ffffff;
          box-shadow:0 2px 8px rgba(0,0,0,0.18);
        "></div>`,
        iconSize: [12, 12], iconAnchor: [6, 6],
      });

      L.marker([origemLat, origemLng], { icon: pin('#16a34a') })
        .addTo(this.leafletMap!)
        .bindPopup(`<strong style="color:#0a0a0a">Saída</strong><br><span style="color:#737373">${entrega.supplierName}</span>`);

      L.marker([destinoLat, destinoLng], { icon: pin('#0a0a0a') })
        .addTo(this.leafletMap!)
        .bindPopup(`<strong style="color:#0a0a0a">Destino</strong><br><span style="color:#737373">${entrega.deliveryAddress}</span>`);

      const pontos: [number, number][] = [
        [origemLat, origemLng],
        [origemLat + (destinoLat - origemLat) * 0.35, origemLng + (destinoLng - origemLng) * 0.1],
        [origemLat + (destinoLat - origemLat) * 0.65, origemLng + (destinoLng - origemLng) * 0.9],
        [destinoLat, destinoLng],
      ];

      L.polyline(pontos, {
        color: '#e5e5e5', weight: 7, opacity: 1,
        lineJoin: 'round', lineCap: 'round',
      }).addTo(this.leafletMap!);
      L.polyline(pontos, {
        color: '#16a34a', weight: 3, opacity: 0.85,
        lineJoin: 'round', lineCap: 'round',
        dashArray: '8 5',
      }).addTo(this.leafletMap!);

      const bounds = L.latLngBounds([origemLat, origemLng], [destinoLat, destinoLng]);
      this.leafletMap!.fitBounds(bounds, { padding: [50, 50] });

      setTimeout(() => {
        this.leafletMap?.invalidateSize();
        this.leafletMap?.fitBounds(bounds, { padding: [50, 50] });
      }, 120);

      this.ngZone.run(() => this.mapPronto.set(true));
    });
  }

  /** Atualiza (ou cria) o marcador do motorista no mapa em tempo real */
  private atualizarMarcadorDriver(coordenada: Coordenada): void {
    if (!this.leafletMap || !isPlatformBrowser(this.platformId)) return;

    this.ngZone.runOutsideAngular(async () => {
      const L = await import('leaflet');

      const driverIcon = L.divIcon({
        className: '',
        html: `<div style="
          width:14px;height:14px;border-radius:50%;
          background:#2563eb;
          border:3px solid #ffffff;
          box-shadow:0 0 0 4px rgba(37,99,235,0.25);
          animation:pulse 1.5s ease-in-out infinite;
        "></div>`,
        iconSize: [14, 14], iconAnchor: [7, 7],
      });

      if (this.driverMarker) {
        this.driverMarker.setLatLng([coordenada.lat, coordenada.lng]);
      } else {
        this.driverMarker = (L as any)
          .marker([coordenada.lat, coordenada.lng], { icon: driverIcon })
          .addTo(this.leafletMap!)
          .bindPopup('📍 Motorista');
      }
    });
  }
}
