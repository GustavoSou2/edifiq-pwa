// ============================================================
// entregas.service.ts — Integração com API Java/MySQL
// ============================================================

import { Injectable, signal, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { forkJoin, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { Entrega, StatusEntrega, ItemEntrega } from '../models/entrega.model';

@Injectable({ providedIn: 'root' })
export class EntregasService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = 'http://localhost:8081/api/v1';

  readonly entregas = signal<Entrega[]>([]);
  readonly entregaSelecionada = signal<Entrega | null>(null);
  readonly carregando = signal(false);
  readonly erro = signal<string | null>(null);

  /**
   * Carrega todas as entregas do tenant.
   * O DeliveryDetailResponse já contém dados da ordem, proposta e supplier,
   * portanto não é necessária uma chamada extra a /orders/{id}.
   */
  carregarEntregas(): void {
    this.carregando.set(true);
    this.erro.set(null);

    this.http.get<{ data: any[] }>(`${this.apiUrl}/deliveries`).subscribe({
      next: (response) => {
        const list = response.data || [];
        if (list.length === 0) {
          this.entregas.set([]);
          this.carregando.set(false);
          return;
        }

        // Busca detalhes completos em paralelo — detail já traz tudo
        const requests = list.map((d) =>
          this.http.get<{ data: any }>(`${this.apiUrl}/deliveries/${d.id}`).pipe(
            map((r) => this.mapToEntrega(r.data)),
            catchError((err) => {
              console.error(`Erro ao carregar entrega ${d.id}:`, err);
              return of(null);
            }),
          ),
        );

        forkJoin(requests).subscribe({
          next: (results) => {
            const valid = results.filter((e): e is Entrega => e !== null);
            this.entregas.set(valid);
            this.carregando.set(false);
          },
          error: () => {
            this.erro.set('Erro ao carregar entregas.');
            this.carregando.set(false);
          },
        });
      },
      error: () => {
        this.erro.set('Não foi possível carregar as entregas.');
        this.carregando.set(false);
      },
    });
  }

  /** Recarrega uma entrega específica e atualiza o signal */
  recarregarEntrega(id: string): void {
    this.http.get<{ data: any }>(`${this.apiUrl}/deliveries/${id}`).subscribe({
      next: (r) => {
        const atualizada = this.mapToEntrega(r.data);
        this.entregas.update((l) => l.map((e) => (e.id === id ? atualizada : e)));
        if (this.entregaSelecionada()?.id === id) {
          this.entregaSelecionada.set(atualizada);
        }
      },
      error: (err) => console.error('Erro ao recarregar entrega:', err),
    });
  }

  selecionarEntrega(id: string): void {
    const e = this.entregas().find((x) => x.id === id) ?? null;
    this.entregaSelecionada.set(e);
  }

  atualizarStatus(id: string, status: StatusEntrega): void {
    const apiStatus = this.toApiStatus(status);

    this.http
      .patch<{ data: any }>(`${this.apiUrl}/deliveries/${id}`, { status: apiStatus })
      .subscribe({
        next: () => {
          this.entregas.update((l) => l.map((e) => (e.id === id ? { ...e, status } : e)));
          const sel = this.entregaSelecionada();
          if (sel?.id === id) this.entregaSelecionada.set({ ...sel, status });
        },
        error: (err) => console.error('Erro ao atualizar status:', err),
      });
  }

  conferirItem(entregaId: string, itemId: string, conferido: boolean): void {
    this.saveConferidoToStorage(entregaId, itemId, conferido);
    this.entregas.update((lista) =>
      lista.map((e) => {
        if (e.id !== entregaId) return e;
        return { ...e, items: e.items.map((it) => (it.id === itemId ? { ...it, conferido } : it)) };
      }),
    );
    const sel = this.entregaSelecionada();
    if (sel?.id === entregaId) {
      this.entregaSelecionada.set({
        ...sel,
        items: sel.items.map((it) => (it.id === itemId ? { ...it, conferido } : it)),
      });
    }
  }

  /**
   * Finaliza a entrega: envia foto como proofUrl e muda status para delivered.
   * O campo trackingCode é mantido separado da observação textual.
   */
  salvarFinalizacao(id: string, fotoBase64: string, observacao: string): void {
    this.http
      .patch<{ data: any }>(`${this.apiUrl}/deliveries/${id}`, {
        status: 'delivered',
        proofUrl: fotoBase64,
      })
      .subscribe({
        next: () => {
          this.entregas.update((l) =>
            l.map((e) =>
              e.id === id ? { ...e, proofUrl: fotoBase64, status: 'entregue' as StatusEntrega } : e,
            ),
          );
          const sel = this.entregaSelecionada();
          if (sel?.id === id)
            this.entregaSelecionada.set({ ...sel, proofUrl: fotoBase64, status: 'entregue' });
        },
        error: (err) => console.error('Erro ao finalizar entrega:', err),
      });
  }

  // ── Utilitários ──────────────────────────────────────────────

  private toApiStatus(status: StatusEntrega): string {
    const map: Record<StatusEntrega, string> = {
      pendente: 'scheduled',
      em_rota: 'in_transit',
      entregue: 'delivered',
      problema: 'failed',
    };
    return map[status];
  }

  private mapToEntrega(detail: any): Entrega {
    let status: StatusEntrega = 'pendente';
    if (detail.status === 'in_transit') status = 'em_rota';
    else if (detail.status === 'delivered') status = 'entregue';
    else if (detail.status === 'failed' || detail.status === 'returned') status = 'problema';

    // Calcula distância estimada entre fornecedor e destino
    const distanciaKm = this.calcularDistancia(
      detail.supplierLat ?? 0,
      detail.supplierLng ?? 0,
      detail.deliveryLat ?? 0,
      detail.deliveryLng ?? 0,
    );

    return {
      id: detail.id,
      referenceCode: detail.orderReferenceCode || 'REF',
      title: detail.orderTitle || 'Entrega',
      isUrgent: false,
      notes: detail.proposalMessage || '',
      status,

      // Destino
      deliveryAddress: detail.deliveryAddress || 'A definir',
      deliveryCity: detail.deliveryCity || '',
      deliveryState: detail.deliveryState || '',
      deliveryLat: detail.deliveryLat ?? -23.5505,
      deliveryLng: detail.deliveryLng ?? -46.6333,

      // Fornecedor
      supplierName: detail.supplierName || 'Fornecedor',
      supplierCity: detail.supplierCity || '',
      supplierState: detail.supplierState || '',
      supplierLat: detail.supplierLat ?? -23.5505,
      supplierLng: detail.supplierLng ?? -46.6333,
      supplierReputationScore: detail.supplierReputationScore
        ? Number(detail.supplierReputationScore)
        : undefined,

      // Proposta
      proposalTotalPrice: detail.proposalTotalPrice ? Number(detail.proposalTotalPrice) : undefined,
      proposalDeliveryEtaHours: detail.proposalDeliveryEtaHours ?? undefined,
      proposalProposedDeliveryAt: detail.proposalProposedDeliveryAt ?? undefined,
      proposalMessage: detail.proposalMessage ?? undefined,

      // Janela de entrega — vem do detail (se existir) ou deixa null
      deliveryWindowStart: detail.deliveryWindowStart ?? new Date().toISOString(),
      deliveryWindowEnd: detail.deliveryWindowEnd ?? undefined,

      // Datas da entrega
      scheduledAt: detail.scheduledAt ?? undefined,
      dispatchedAt: detail.dispatchedAt ?? undefined,
      deliveredAt: detail.deliveredAt ?? undefined,

      // Métricas
      distanciaKm: Math.round(distanciaKm * 10) / 10,
      tempoEstimadoMin: Math.round((distanciaKm / 30) * 60), // ~30 km/h urbano

      // Itens — buscados de orderItems que chegam na ordem
      items: (detail.orderItems || []).map((i: any) => ({
        id: i.id,
        description: i.description,
        unit: i.unit,
        quantity: Number(i.quantity),
        notes: i.notes || '',
        sortOrder: i.sortOrder || 0,
        conferido: this.readConferidoFromStorage(detail.id, i.id),
      })),

      proofUrl: detail.proofUrl ?? undefined,
      trackingCode: detail.trackingCode ?? undefined,
    };
  }

  /** Fórmula de Haversine para distância em km */
  private calcularDistancia(lat1: number, lng1: number, lat2: number, lng2: number): number {
    if (!lat1 || !lat2) return 0;
    const R = 6371;
    const dLat = this.deg2rad(lat2 - lat1);
    const dLng = this.deg2rad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.deg2rad(lat1)) *
        Math.cos(this.deg2rad(lat2)) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  private deg2rad(deg: number): number {
    return deg * (Math.PI / 180);
  }

  private readConferidoFromStorage(entregaId: string, itemId: string): boolean {
    if (typeof window !== 'undefined') {
      return localStorage.getItem(`conferido_${entregaId}_${itemId}`) === 'true';
    }
    return false;
  }

  private saveConferidoToStorage(entregaId: string, itemId: string, conferido: boolean): void {
    if (typeof window !== 'undefined') {
      const key = `conferido_${entregaId}_${itemId}`;
      conferido ? localStorage.setItem(key, 'true') : localStorage.removeItem(key);
    }
  }
}
