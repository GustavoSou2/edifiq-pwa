// ============================================================
// entregas.service.ts
// Mock do serviço que na produção consumiria a API Java/MySQL.
// A entrega "real" usa as coordenadas reais de Indaiatuba-SP.
// ============================================================

import { Injectable, signal } from '@angular/core';
import { Entrega, StatusEntrega } from '../models/entrega.model';

@Injectable({ providedIn: 'root' })
export class EntregasService {

  // Signal com a lista de entregas do dia
  readonly entregas = signal<Entrega[]>(ENTREGAS_MOCK);

  // Signal com a entrega atualmente selecionada pelo motorista
  readonly entregaSelecionada = signal<Entrega | null>(null);

  selecionarEntrega(id: string): void {
    const e = this.entregas().find((x) => x.id === id) ?? null;
    this.entregaSelecionada.set(e);
  }

  deselecionarEntrega(): void {
    this.entregaSelecionada.set(null);
  }

  atualizarStatus(id: string, status: StatusEntrega): void {
    this.entregas.update((lista) =>
      lista.map((e) => (e.id === id ? { ...e, status } : e)),
    );
    // Atualiza também a selecionada se for a mesma
    const sel = this.entregaSelecionada();
    if (sel?.id === id) {
      this.entregaSelecionada.set({ ...sel, status });
    }
  }
}

// ── Dados mock ────────────────────────────────────────────────
// A entrega "real" (id: 'e1') usa coordenadas geocodificadas manualmente:
//   Origem:  R. Bernardino de Campos, 277 - Centro, Indaiatuba-SP
//            lat: -23.08975, lng: -47.21773
//   Destino: R. Antônio Quinteiro, 401 - Jd. Morumbi, Indaiatuba-SP
//            lat: -23.11142, lng: -47.22858

const ENTREGAS_MOCK: Entrega[] = [
  {
    id: 'e1',
    numero: 'PED-2024-001',
    cliente: 'Construtora Horizonte Ltda.',
    produto: 'Cimento CP-II (50 sacos)',
    peso: '2.500 kg',
    volumes: 50,
    status: 'pendente',
    origem: {
      logradouro: 'R. Bernardino de Campos',
      numero: '277',
      bairro: 'Centro',
      cidade: 'Indaiatuba',
      uf: 'SP',
      lat: -23.08975,
      lng: -47.21773,
    },
    destino: {
      logradouro: 'R. Antônio Quinteiro',
      numero: '401',
      bairro: 'Jd. Morumbi',
      cidade: 'Indaiatuba',
      uf: 'SP',
      lat: -23.11142,
      lng: -47.22858,
    },
    distanciaKm: 2.8,
    tempoEstimadoMin: 12,
    previsaoEntrega: '14:30',
  },
  {
    id: 'e2',
    numero: 'PED-2024-002',
    cliente: 'Reformas Castellano ME',
    produto: 'Porcelanato Rectificado (8 cx)',
    peso: '320 kg',
    volumes: 8,
    status: 'pendente',
    origem: {
      logradouro: 'R. Bernardino de Campos',
      numero: '277',
      bairro: 'Centro',
      cidade: 'Indaiatuba',
      uf: 'SP',
      lat: -23.08975,
      lng: -47.21773,
    },
    destino: {
      logradouro: 'Av. Itu',
      numero: '1.850',
      bairro: 'Res. Ibirapuera',
      cidade: 'Indaiatuba',
      uf: 'SP',
      lat: -23.10012,
      lng: -47.19854,
    },
    distanciaKm: 3.4,
    tempoEstimadoMin: 15,
    previsaoEntrega: '15:10',
  },
  {
    id: 'e3',
    numero: 'PED-2024-003',
    cliente: 'João Carlos da Silva',
    produto: 'Areia Lavada (2 m³)',
    peso: '3.200 kg',
    volumes: 1,
    status: 'entregue',
    origem: {
      logradouro: 'R. Bernardino de Campos',
      numero: '277',
      bairro: 'Centro',
      cidade: 'Indaiatuba',
      uf: 'SP',
      lat: -23.08975,
      lng: -47.21773,
    },
    destino: {
      logradouro: 'R. das Acácias',
      numero: '88',
      bairro: 'Jd. das Flores',
      cidade: 'Indaiatuba',
      uf: 'SP',
      lat: -23.09541,
      lng: -47.23401,
    },
    distanciaKm: 1.9,
    tempoEstimadoMin: 9,
    previsaoEntrega: '11:45',
  },
  {
    id: 'e4',
    numero: 'PED-2024-004',
    cliente: 'Engenharia & Projetos Costa',
    produto: 'Vergalhão CA-50 (barra 12m)',
    peso: '1.800 kg',
    volumes: 30,
    status: 'problema',
    origem: {
      logradouro: 'R. Bernardino de Campos',
      numero: '277',
      bairro: 'Centro',
      cidade: 'Indaiatuba',
      uf: 'SP',
      lat: -23.08975,
      lng: -47.21773,
    },
    destino: {
      logradouro: 'R. Piracicaba',
      numero: '534',
      bairro: 'Vila Nova',
      cidade: 'Indaiatuba',
      uf: 'SP',
      lat: -23.07832,
      lng: -47.22156,
    },
    distanciaKm: 1.5,
    tempoEstimadoMin: 8,
    previsaoEntrega: '10:00',
    observacao: 'Cliente ausente — reagendar',
  },
  {
    id: 'e5',
    numero: 'PED-2024-005',
    cliente: 'Auto Posto Bandeirantes',
    produto: 'Tintas Acrílicas (24 latas)',
    peso: '96 kg',
    volumes: 24,
    status: 'pendente',
    origem: {
      logradouro: 'R. Bernardino de Campos',
      numero: '277',
      bairro: 'Centro',
      cidade: 'Indaiatuba',
      uf: 'SP',
      lat: -23.08975,
      lng: -47.21773,
    },
    destino: {
      logradouro: 'Rod. Ângelo Simões Junqueira',
      numero: 'km 4',
      bairro: 'Lot. Chácaras Reunidas',
      cidade: 'Indaiatuba',
      uf: 'SP',
      lat: -23.07105,
      lng: -47.20648,
    },
    distanciaKm: 4.1,
    tempoEstimadoMin: 18,
    previsaoEntrega: '16:00',
  },
];
