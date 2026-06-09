// ============================================================
// entrega.model.ts
// Espelha o contrato CreateOrderRequest / CreateOrderItemRequest
// da API Java — pronto para substituir o mock por HTTP call.
// ============================================================

export type StatusEntrega = 'pendente' | 'em_rota' | 'entregue' | 'problema';

export interface ItemEntrega {
  id: string;
  categoryId?: string;
  description: string;      // CreateOrderItemRequest.description
  unit: string;             // ex: "saco", "cx", "m²"
  quantity: number;         // CreateOrderItemRequest.quantity (BigDecimal)
  notes?: string;
  sortOrder?: number;
  // checklist de finalização
  conferido: boolean;
}

export interface EnderecoEntrega {
  logradouro: string;
  numero: string;
  bairro: string;
  cidade: string;
  uf: string;
  lat: number;
  lng: number;
}

export interface Entrega {
  id: string;
  referenceCode: string;       // CreateOrderRequest.referenceCode
  title: string;               // CreateOrderRequest.title
  cliente: string;
  isUrgent: boolean;           // CreateOrderRequest.isUrgent
  notes?: string;              // CreateOrderRequest.notes
  status: StatusEntrega;

  // Endereços
  origem: EnderecoEntrega;
  destino: EnderecoEntrega;    // deliveryAddress / deliveryCity / deliveryState / lat / lng

  // Janela de entrega — CreateOrderRequest.deliveryWindowStart / End
  deliveryWindowStart: string; // ISO string
  deliveryWindowEnd: string;

  // Métricas calculadas no frontend
  distanciaKm: number;
  tempoEstimadoMin: number;

  // Itens da ordem
  items: ItemEntrega[];

  // Finalização
  fotoEntregaBase64?: string;
  observacaoFinalizacao?: string;
}
