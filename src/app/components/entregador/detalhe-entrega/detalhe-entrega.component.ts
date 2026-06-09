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
import { RastreamentoService, StatusEnvio } from '../../../services/rastreamento.service';
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
  readonly abaAtiva      = signal<Aba>('rota');
  readonly rastreandoAtivo = signal(false);
  readonly statusEnvio   = signal<StatusEnvio>('inativo');
  readonly erroMsg       = signal('');
  readonly totalEnviados = signal(0);
  readonly mapPronto     = signal(false);
  readonly obsFinalizacao = signal('');
  readonly fotoPreview   = signal<string | null>(null);
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

  readonly janela = computed(() => {
    const e = this.entrega();
    if (!e) return '';
    const fmt = (iso: string) =>
      new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    return `${fmt(e.deliveryWindowStart)} – ${fmt(e.deliveryWindowEnd)}`;
  });

  private leafletMap: LeafletMap | null = null;

  constructor(
    private svc: EntregasService,
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
      // Usa requestAnimationFrame + setTimeout para garantir que o
      // @if (entrega(); as e) já renderizou o #mapContainer no DOM
      // antes de tentar inicializar o Leaflet
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
    await this.rastreamento.iniciarRastreamento();
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
    // Simula envio à API (em produção: HTTP call)
    setTimeout(() => {
      this.svc.salvarFinalizacao(e.id, this.fotoPreview()!, this.obsFinalizacao());
      this.rastreamento.pararRastreamento();
      this.rastreandoAtivo.set(false);
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
    const { lat, lng } = e.destino;
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

    // Fix obrigatório para ícones do Leaflet com bundlers (webpack/esbuild).
    // O Leaflet tenta resolver imagens via _getIconUrl que usa require(),
    // o que falha em ESM. A solução é reescrever os paths manualmente.
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
      const { origem, destino } = entrega;

      this.leafletMap = L.map(el, {
        center: [(origem.lat + destino.lat) / 2, (origem.lng + destino.lng) / 2],
        zoom: 14, zoomControl: false,
      });

      L.control.zoom({ position: 'bottomright' }).addTo(this.leafletMap!);

      // Tiles CartoDB Positron — minimalista claro
      L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '© <a href="https://carto.com">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 19,
      }).addTo(this.leafletMap!);

      // Marcadores minimalistas — tema claro
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

      L.marker([origem.lat, origem.lng], { icon: pin('#16a34a') })
        .addTo(this.leafletMap!)
        .bindPopup(`<strong style="color:#0a0a0a">Saída</strong><br><span style="color:#737373">${origem.logradouro}, ${origem.numero}</span>`);

      L.marker([destino.lat, destino.lng], { icon: pin('#0a0a0a') })
        .addTo(this.leafletMap!)
        .bindPopup(`<strong style="color:#0a0a0a">Destino</strong><br><span style="color:#737373">${destino.logradouro}, ${destino.numero}</span>`);

      const pontos: [number, number][] = [
        [origem.lat, origem.lng],
        [origem.lat + (destino.lat - origem.lat) * 0.35, origem.lng + (destino.lng - origem.lng) * 0.1],
        [origem.lat + (destino.lat - origem.lat) * 0.65, origem.lng + (destino.lng - origem.lng) * 0.9],
        [destino.lat, destino.lng],
      ];

      // Rota — sombra cinza + linha verde fina com traço
      L.polyline(pontos, {
        color: '#e5e5e5', weight: 7, opacity: 1,
        lineJoin: 'round', lineCap: 'round',
      }).addTo(this.leafletMap!);
      L.polyline(pontos, {
        color: '#16a34a', weight: 3, opacity: 0.85,
        lineJoin: 'round', lineCap: 'round',
        dashArray: '8 5',
      }).addTo(this.leafletMap!);

      const bounds = L.latLngBounds([origem.lat, origem.lng], [destino.lat, destino.lng]);
      this.leafletMap!.fitBounds(bounds, { padding: [50, 50] });

      setTimeout(() => {
        this.leafletMap?.invalidateSize();
        this.leafletMap?.fitBounds(bounds, { padding: [50, 50] });
      }, 120);

      this.ngZone.run(() => this.mapPronto.set(true));
    });
  }
}
