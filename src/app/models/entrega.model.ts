// ============================================================
// entrega.model.ts — Modelo de domínio para uma entrega
// Representa o contrato que viria da API Java/MySQL principal
// ============================================================

export type StatusEntrega =
  | 'pendente'      // aguardando o motorista aceitar
  | 'em_rota'       // motorista a caminho
  | 'entregue'      // concluída
  | 'problema';     // falha na entrega

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
  numero: string;          // ex: "PED-2024-001"
  cliente: string;
  produto: string;
  peso: string;            // ex: "12 kg"
  volumes: number;
  status: StatusEntrega;
  origem: EnderecoEntrega;
  destino: EnderecoEntrega;
  distanciaKm: number;     // distância estimada em linha reta (calculada)
  tempoEstimadoMin: number;// tempo estimado em minutos (calculado)
  previsaoEntrega: string; // ex: "14:30"
  observacao?: string;
}
