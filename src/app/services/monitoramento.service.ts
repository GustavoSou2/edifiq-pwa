// ============================================================
// monitoramento.service.ts
// Escuta o Firebase e acumula o histórico de posições para
// renderizar o percurso completo no mapa (polyline).
// ============================================================

import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ref, onValue, DatabaseReference, off } from 'firebase/database';
import { firebaseDB } from '../firebase.config';
import { Coordenada } from './rastreamento.service';

// Máximo de pontos no histórico de percurso (evita memória ilimitada)
const MAX_HISTORICO = 500;

@Injectable({ providedIn: 'root' })
export class MonitoramentoService {

  // Histórico acumulado de posições — usado para desenhar a polyline
  private historico: Coordenada[] = [];

  /**
   * Observable que emite a coordenada atual a cada mudança no Firebase.
   * Internamente acumula o histórico para expor via getHistorico().
   */
  escutarCoordenadas(deliveryId: string): Observable<Coordenada | null> {
    this.limparHistorico();
    return new Observable<Coordenada | null>((observer) => {
      const dbPath = `tracking/delivery_${deliveryId}`;
      const dbRef: DatabaseReference = ref(firebaseDB, dbPath);

      const unsubscribe = onValue(
        dbRef,
        (snapshot) => {
          if (snapshot.exists()) {
            const coord = snapshot.val() as Coordenada;

            // Acumula posição no histórico de percurso
            this.adicionarAoHistorico(coord);

            observer.next(coord);
          } else {
            observer.next(null);
          }
        },
        (error) => observer.error(error),
      );

      return () => off(dbRef, 'value', unsubscribe as never);
    });
  }

  /** Retorna uma cópia do histórico para uso no mapa */
  getHistorico(): Coordenada[] {
    return [...this.historico];
  }

  /** Limpa o histórico (chamado quando a entrega é reiniciada) */
  limparHistorico(): void {
    this.historico = [];
  }

  private adicionarAoHistorico(coord: Coordenada): void {
    // Evita pontos duplicados consecutivos
    const ultimo = this.historico[this.historico.length - 1];
    if (ultimo && ultimo.lat === coord.lat && ultimo.lng === coord.lng) return;

    this.historico.push(coord);

    // Mantém janela deslizante de MAX_HISTORICO pontos
    if (this.historico.length > MAX_HISTORICO) {
      this.historico.shift();
    }
  }
}
