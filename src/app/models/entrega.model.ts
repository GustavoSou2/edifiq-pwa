// ============================================================
// entrega.model.ts
// Espelha o contrato DeliveryDetailResponse da API Java.
// ============================================================

export type StatusEntrega = 'pendente' | 'em_rota' | 'entregue' | 'problema';

export interface ItemEntrega {
  id: string;
  categoryId?: string;
  description: string;
  unit: string;
  quantity: number;
  notes?: string;
  sortOrder?: number;
  // checklist de finalização
  conferido: boolean;
}

export interface Entrega {
  id: string;
  referenceCode: string;
  title: string;
  isUrgent: boolean;
  notes?: string;
  status: StatusEntrega;

  // ── Endereço de destino ──────────────────────────────────
  deliveryAddress: string;
  deliveryCity: string;
  deliveryState: string;
  deliveryLat: number;
  deliveryLng: number;

  // ── Fornecedor (origem) ──────────────────────────────────
  supplierName: string;
  supplierCity: string;
  supplierState: string;
  supplierLat: number;
  supplierLng: number;
  supplierReputationScore?: number;

  // ── Proposta aceita ──────────────────────────────────────
  proposalTotalPrice?: number;
  proposalDeliveryEtaHours?: number;
  proposalProposedDeliveryAt?: string; // ISO
  proposalMessage?: string;

  // ── Janela de entrega (da ordem) ─────────────────────────
  deliveryWindowStart: string; // ISO
  deliveryWindowEnd?: string;  // ISO — opcional

  // ── Datas da entrega ─────────────────────────────────────
  scheduledAt?: string;
  dispatchedAt?: string;
  deliveredAt?: string;

  // ── Métricas calculadas ───────────────────────────────────
  distanciaKm: number;
  tempoEstimadoMin: number;

  // ── Itens da ordem ────────────────────────────────────────
  items: ItemEntrega[];

  // ── Finalização ───────────────────────────────────────────
  proofUrl?: string;
  trackingCode?: string;
}
