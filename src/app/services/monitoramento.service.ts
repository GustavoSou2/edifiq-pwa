// ============================================================
// monitoramento.service.ts
// Serviço que escuta reativamente o nó do Firebase Realtime
// Database e fornece as coordenadas do motorista ao painel.
// ============================================================

import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ref, onValue, DatabaseReference, off } from 'firebase/database';
import { firebaseDB } from '../firebase.config';
import { Coordenada } from './rastreamento.service';

const DB_PATH = 'tracking/motorista_001';

@Injectable({ providedIn: 'root' })
export class MonitoramentoService {
  /**
   * Retorna um Observable que emite sempre que o Firebase
   * disparar uma atualização no nó do motorista.
   *
   * O Observable garante cleanup automático ao cancelar
   * a inscrição (unsubscribe), evitando memory leaks.
   */
  escutarCoordenadas(): Observable<Coordenada | null> {
    return new Observable<Coordenada | null>((observer) => {
      const dbRef: DatabaseReference = ref(firebaseDB, DB_PATH);

      // onValue dispara imediatamente com o valor atual e
      // depois a cada mudança — comportamento ideal para rastreamento
      const unsubscribe = onValue(
        dbRef,
        (snapshot) => {
          if (snapshot.exists()) {
            observer.next(snapshot.val() as Coordenada);
          } else {
            observer.next(null);
          }
        },
        (error) => observer.error(error)
      );

      // Cleanup: ao fazer unsubscribe do Observable, remove o listener
      return () => off(dbRef, 'value', unsubscribe as never);
    });
  }
}
