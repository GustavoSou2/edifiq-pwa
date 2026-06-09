// ============================================================
// entregas.service.ts — Mock da API Java/MySQL
// Em produção: substituir ENTREGAS_MOCK por HttpClient.get()
// ============================================================

import { Injectable, signal } from '@angular/core';
import { Entrega, StatusEntrega, ItemEntrega } from '../models/entrega.model';

@Injectable({ providedIn: 'root' })
export class EntregasService {

  readonly entregas = signal<Entrega[]>(ENTREGAS_MOCK);
  readonly entregaSelecionada = signal<Entrega | null>(null);

  selecionarEntrega(id: string): void {
    const e = this.entregas().find((x) => x.id === id) ?? null;
    this.entregaSelecionada.set(e);
  }

  atualizarStatus(id: string, status: StatusEntrega): void {
    this.entregas.update((l) => l.map((e) => e.id === id ? { ...e, status } : e));
    const sel = this.entregaSelecionada();
    if (sel?.id === id) this.entregaSelecionada.set({ ...sel, status });
  }

  conferirItem(entregaId: string, itemId: string, conferido: boolean): void {
    this.entregas.update((lista) =>
      lista.map((e) => {
        if (e.id !== entregaId) return e;
        return {
          ...e,
          items: e.items.map((it) =>
            it.id === itemId ? { ...it, conferido } : it,
          ),
        };
      }),
    );
    const sel = this.entregaSelecionada();
    if (sel?.id === entregaId) {
      this.entregaSelecionada.set({
        ...sel,
        items: sel.items.map((it) =>
          it.id === itemId ? { ...it, conferido } : it,
        ),
      });
    }
  }

  salvarFinalizacao(
    id: string,
    fotoBase64: string,
    observacao: string,
  ): void {
    this.entregas.update((l) =>
      l.map((e) =>
        e.id === id
          ? { ...e, fotoEntregaBase64: fotoBase64, observacaoFinalizacao: observacao, status: 'entregue' }
          : e,
      ),
    );
    const sel = this.entregaSelecionada();
    if (sel?.id === id)
      this.entregaSelecionada.set({
        ...sel,
        fotoEntregaBase64: fotoBase64,
        observacaoFinalizacao: observacao,
        status: 'entregue',
      });
  }
}

// ────────────────────────────────────────────────────────────
// MOCK — Reflete CreateOrderRequest + CreateOrderItemRequest
// ────────────────────────────────────────────────────────────
const hoje = new Date();
const fmt = (h: number, m = 0) => {
  const d = new Date(hoje);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
};

const ENTREGAS_MOCK: Entrega[] = [
  {
    id: 'e1',
    referenceCode: 'ORD-2024-001',
    title: 'Entrega Construtora Horizonte',
    cliente: 'Construtora Horizonte Ltda.',
    isUrgent: true,
    notes: 'Descarregar na lateral do canteiro. Solicitar NF ao porteiro.',
    status: 'pendente',
    origem: {
      logradouro: 'R. Bernardino de Campos', numero: '277',
      bairro: 'Centro', cidade: 'Indaiatuba', uf: 'SP',
      lat: -23.08975, lng: -47.21773,
    },
    destino: {
      logradouro: 'R. Antônio Quinteiro', numero: '401',
      bairro: 'Jd. Morumbi', cidade: 'Indaiatuba', uf: 'SP',
      lat: -23.11142, lng: -47.22858,
    },
    deliveryWindowStart: fmt(13, 0),
    deliveryWindowEnd:   fmt(15, 0),
    distanciaKm: 2.8,
    tempoEstimadoMin: 12,
    items: [
      { id: 'i1a', description: 'Cimento CP-II', unit: 'saco 50 kg', quantity: 50, sortOrder: 1, conferido: false },
      { id: 'i1b', description: 'Areia Lavada', unit: 'm³', quantity: 2, sortOrder: 2, conferido: false },
      { id: 'i1c', description: 'Brita 0', unit: 'm³', quantity: 1.5, sortOrder: 3, conferido: false },
      { id: 'i1d', description: 'Cal Hidratada', unit: 'saco 20 kg', quantity: 20, notes: 'Manter em local seco', sortOrder: 4, conferido: false },
    ],
  },
  {
    id: 'e2',
    referenceCode: 'ORD-2024-002',
    title: 'Porcelanato Castellano',
    cliente: 'Reformas Castellano ME',
    isUrgent: false,
    status: 'pendente',
    origem: {
      logradouro: 'R. Bernardino de Campos', numero: '277',
      bairro: 'Centro', cidade: 'Indaiatuba', uf: 'SP',
      lat: -23.08975, lng: -47.21773,
    },
    destino: {
      logradouro: 'Av. Itu', numero: '1.850',
      bairro: 'Res. Ibirapuera', cidade: 'Indaiatuba', uf: 'SP',
      lat: -23.10012, lng: -47.19854,
    },
    deliveryWindowStart: fmt(14, 30),
    deliveryWindowEnd:   fmt(17, 0),
    distanciaKm: 3.4,
    tempoEstimadoMin: 15,
    items: [
      { id: 'i2a', description: 'Porcelanato Retificado 60x60 Branco', unit: 'cx', quantity: 8, sortOrder: 1, conferido: false },
      { id: 'i2b', description: 'Argamassa AC-III', unit: 'saco 20 kg', quantity: 4, sortOrder: 2, conferido: false },
      { id: 'i2c', description: 'Rejunte Cinza Platina', unit: 'kg', quantity: 3, sortOrder: 3, conferido: false },
    ],
  },
  {
    id: 'e3',
    referenceCode: 'ORD-2024-003',
    title: 'Areia João Carlos',
    cliente: 'João Carlos da Silva',
    isUrgent: false,
    status: 'entregue',
    origem: {
      logradouro: 'R. Bernardino de Campos', numero: '277',
      bairro: 'Centro', cidade: 'Indaiatuba', uf: 'SP',
      lat: -23.08975, lng: -47.21773,
    },
    destino: {
      logradouro: 'R. das Acácias', numero: '88',
      bairro: 'Jd. das Flores', cidade: 'Indaiatuba', uf: 'SP',
      lat: -23.09541, lng: -47.23401,
    },
    deliveryWindowStart: fmt(10, 0),
    deliveryWindowEnd:   fmt(12, 0),
    distanciaKm: 1.9,
    tempoEstimadoMin: 9,
    items: [
      { id: 'i3a', description: 'Areia Lavada Média', unit: 'm³', quantity: 2, sortOrder: 1, conferido: true },
    ],
  },
  {
    id: 'e4',
    referenceCode: 'ORD-2024-004',
    title: 'Vergalhão Costa Engenharia',
    cliente: 'Engenharia & Projetos Costa',
    isUrgent: false,
    notes: 'Cliente ausente — reagendar',
    status: 'problema',
    origem: {
      logradouro: 'R. Bernardino de Campos', numero: '277',
      bairro: 'Centro', cidade: 'Indaiatuba', uf: 'SP',
      lat: -23.08975, lng: -47.21773,
    },
    destino: {
      logradouro: 'R. Piracicaba', numero: '534',
      bairro: 'Vila Nova', cidade: 'Indaiatuba', uf: 'SP',
      lat: -23.07832, lng: -47.22156,
    },
    deliveryWindowStart: fmt(9, 0),
    deliveryWindowEnd:   fmt(11, 0),
    distanciaKm: 1.5,
    tempoEstimadoMin: 8,
    items: [
      { id: 'i4a', description: 'Vergalhão CA-50 Ø12mm', unit: 'barra 12m', quantity: 20, sortOrder: 1, conferido: false },
      { id: 'i4b', description: 'Vergalhão CA-50 Ø8mm', unit: 'barra 12m', quantity: 10, sortOrder: 2, conferido: false },
    ],
  },
  {
    id: 'e5',
    referenceCode: 'ORD-2024-005',
    title: 'Tintas Auto Posto',
    cliente: 'Auto Posto Bandeirantes',
    isUrgent: false,
    status: 'pendente',
    origem: {
      logradouro: 'R. Bernardino de Campos', numero: '277',
      bairro: 'Centro', cidade: 'Indaiatuba', uf: 'SP',
      lat: -23.08975, lng: -47.21773,
    },
    destino: {
      logradouro: 'Rod. Ângelo Simões Junqueira', numero: 'km 4',
      bairro: 'Lot. Chácaras Reunidas', cidade: 'Indaiatuba', uf: 'SP',
      lat: -23.07105, lng: -47.20648,
    },
    deliveryWindowStart: fmt(15, 0),
    deliveryWindowEnd:   fmt(17, 30),
    distanciaKm: 4.1,
    tempoEstimadoMin: 18,
    items: [
      { id: 'i5a', description: 'Tinta Acrílica Premium Branco', unit: 'lata 18L', quantity: 12, sortOrder: 1, conferido: false },
      { id: 'i5b', description: 'Tinta Acrílica Premium Amarelo', unit: 'lata 18L', quantity: 6, sortOrder: 2, conferido: false },
      { id: 'i5c', description: 'Selador Acrílico', unit: 'galão 3.6L', quantity: 6, sortOrder: 3, conferido: false },
    ],
  },
];
