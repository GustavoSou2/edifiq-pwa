// ============================================================
// rastreamento.service.ts
//
// Responsabilidades:
//   1. Capturar posição GPS via watchPosition (alta precisão)
//   2. Filtrar envios por distância mínima (Haversine) OU intervalo
//   3. Escrever no Firebase Realtime Database (nó tracking/motorista_001)
//   4. Manter fila offline: se o write falhar, guarda localmente e
//      reenvia quando a conexão voltar
//   5. Keep-alive via Wake Lock API: evita que o SO suspenda o GPS
//      enquanto o entregador está com a tela ligada
// ============================================================

import { Injectable, NgZone, OnDestroy, PLATFORM_ID, Inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { BehaviorSubject } from 'rxjs';
import { ref, set } from 'firebase/database';
import { firebaseDB } from '../firebase.config';

// ── Tipos públicos ───────────────────────────────────────────
export interface Coordenada {
  lat: number;
  lng: number;
  timestamp: number;
  precisao: number;
}

export type StatusEnvio = 'inativo' | 'capturando' | 'enviando' | 'sincronizando' | 'erro';

// ── Constantes de negócio ────────────────────────────────────
const DB_PATH            = 'tracking/motorista_001';
const DISTANCIA_MIN_M    = 10;        // metros mínimos para novo envio
const INTERVALO_MIN_MS   = 30_000;    // 30 s de keep-alive mesmo parado
const OFFLINE_QUEUE_KEY  = 'edifiq_offline_queue';

@Injectable({ providedIn: 'root' })
export class RastreamentoService implements OnDestroy {

  // ── Estado público (observado pelos componentes) ─────────────
  readonly coordenada$   = new BehaviorSubject<Coordenada | null>(null);
  readonly statusEnvio$  = new BehaviorSubject<StatusEnvio>('inativo');
  readonly erroMensagem$ = new BehaviorSubject<string>('');
  readonly totalEnviados$ = new BehaviorSubject<number>(0);

  // ── Estado interno ───────────────────────────────────────────
  private watchId: number | null = null;
  private ultimaEnviada: Coordenada | null = null;
  private ultimoEnvioTs = 0;
  private wakeLock: WakeLockSentinel | null = null;
  private onlineHandler = () => this.sincronizarFila();

  constructor(
    private ngZone: NgZone,
    @Inject(PLATFORM_ID) private platformId: object,
  ) {
    // Guards de SSR: window/navigator não existem no Node (pre-render)
    if (isPlatformBrowser(this.platformId)) {
      window.addEventListener('online', this.onlineHandler);
    }
  }

  ngOnDestroy(): void {
    if (isPlatformBrowser(this.platformId)) {
      window.removeEventListener('online', this.onlineHandler);
    }
    this.pararRastreamento();
  }

  // ── API pública ──────────────────────────────────────────────

  /** Inicia GPS + Wake Lock */
  async iniciarRastreamento(): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) return;

    if (!navigator.geolocation) {
      this.emitirErro('Geolocalização não suportada neste dispositivo.');
      return;
    }

    this.statusEnvio$.next('capturando');
    this.erroMensagem$.next('');

    await this.solicitarWakeLock();

    this.watchId = navigator.geolocation.watchPosition(
      (pos) => this.onPosicao(pos),
      (err) => this.onErroPosicao(err),
      {
        enableHighAccuracy: true,  // Força uso do GPS de hardware
        timeout: 15_000,
        maximumAge: 5_000,
      },
    );

    // Drena qualquer fila offline pendente imediatamente
    if (navigator.onLine) {
      this.sincronizarFila();
    }
  }

  /** Para GPS, libera Wake Lock e reseta estado */
  pararRastreamento(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
    this.liberarWakeLock();
    this.statusEnvio$.next('inativo');
    this.ultimaEnviada = null;
    this.ultimoEnvioTs = 0;
  }

  // ── GPS callbacks ────────────────────────────────────────────

  private onPosicao(pos: GeolocationPosition): void {
    const nova: Coordenada = {
      lat:      pos.coords.latitude,
      lng:      pos.coords.longitude,
      timestamp: Date.now(),
      precisao: pos.coords.accuracy,
    };

    // Atualiza UI imediatamente (dentro da zona para OnPush funcionar)
    this.ngZone.run(() => this.coordenada$.next(nova));

    // Regra de negócio: filtragem antes do envio
    const distancia = this.ultimaEnviada
      ? this.haversineMetros(this.ultimaEnviada, nova)
      : Infinity;

    const tempoPassado = Date.now() - this.ultimoEnvioTs;

    const deveEnviar =
      distancia >= DISTANCIA_MIN_M ||
      tempoPassado >= INTERVALO_MIN_MS;

    if (deveEnviar) {
      // Envio assíncrono — não bloqueia o callback do GPS
      this.enviar(nova).catch(() => {/* erro já tratado internamente */});
    }
  }

  private onErroPosicao(err: GeolocationPositionError): void {
    this.ngZone.run(() => this.emitirErro(`GPS [${err.code}]: ${err.message}`));
  }

  // ── Firebase write + fila offline ───────────────────────────

  /**
   * Tenta escrever no Firebase.
   * Se offline ou se falhar, enfileira localmente para reenvio.
   */
  private async enviar(coord: Coordenada): Promise<void> {
    this.ngZone.run(() => this.statusEnvio$.next('enviando'));

    if (!navigator.onLine || !isPlatformBrowser(this.platformId)) {
      this.enfileirar(coord);
      this.ngZone.run(() => this.statusEnvio$.next('capturando'));
      return;
    }

    try {
      await set(ref(firebaseDB, DB_PATH), {
        lat:       coord.lat,
        lng:       coord.lng,
        timestamp: coord.timestamp,
        precisao:  coord.precisao,
      });

      this.ultimaEnviada = coord;
      this.ultimoEnvioTs = Date.now();

      this.ngZone.run(() => {
        this.statusEnvio$.next('capturando');
        this.totalEnviados$.next(this.totalEnviados$.value + 1);
        this.erroMensagem$.next('');
      });
    } catch (e: unknown) {
      // Falha de rede: salva offline e tenta depois
      this.enfileirar(coord);
      const msg = e instanceof Error ? e.message : 'Erro desconhecido';
      this.ngZone.run(() => this.emitirErro(`Falha de envio (salvo offline): ${msg}`));
    }
  }

  // ── Fila offline (localStorage) ──────────────────────────────

  private enfileirar(coord: Coordenada): void {
    if (!isPlatformBrowser(this.platformId)) return;
    try {
      const fila = this.lerFila();
      // Mantém no máximo 50 posições offline para não lotar o storage
      fila.push(coord);
      if (fila.length > 50) fila.splice(0, fila.length - 50);
      localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(fila));
    } catch {
      // localStorage indisponível — ignora silenciosamente
    }
  }

  private lerFila(): Coordenada[] {
    if (!isPlatformBrowser(this.platformId)) return [];
    try {
      const raw = localStorage.getItem(OFFLINE_QUEUE_KEY);
      return raw ? (JSON.parse(raw) as Coordenada[]) : [];
    } catch {
      return [];
    }
  }

  private limparFila(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    try {
      localStorage.removeItem(OFFLINE_QUEUE_KEY);
    } catch { /* */ }
  }

  /**
   * Drena a fila offline quando a conexão é restaurada.
   * Envia apenas a posição mais recente da fila (evita flood).
   * As anteriores são descartadas pois já estão desatualizadas.
   */
  private async sincronizarFila(): Promise<void> {
    const fila = this.lerFila();
    if (fila.length === 0) return;

    this.ngZone.run(() => this.statusEnvio$.next('sincronizando'));

    // Pega só a última posição da fila (a mais recente)
    const ultima = fila[fila.length - 1];

    try {
      await set(ref(firebaseDB, DB_PATH), {
        lat:       ultima.lat,
        lng:       ultima.lng,
        timestamp: ultima.timestamp,
        precisao:  ultima.precisao,
      });

      this.limparFila();

      this.ngZone.run(() => {
        const status = this.watchId !== null ? 'capturando' : 'inativo';
        this.statusEnvio$.next(status);
        this.erroMensagem$.next('');
        this.totalEnviados$.next(this.totalEnviados$.value + 1);
      });
    } catch {
      // Falhou de novo — mantém fila para próxima tentativa
      this.ngZone.run(() => {
        const status = this.watchId !== null ? 'capturando' : 'inativo';
        this.statusEnvio$.next(status);
      });
    }
  }

  // ── Wake Lock API ────────────────────────────────────────────

  /**
   * Solicita o Screen Wake Lock para manter a tela acesa enquanto
   * o motorista está entregando. Isso evita que o SO suspenda o
   * GPS por inatividade.
   *
   * ⚠️ Wake Lock só funciona em contexto seguro (HTTPS ou localhost).
   * Falha silenciosamente se não suportado.
   */
  private async solicitarWakeLock(): Promise<void> {
    if (!('wakeLock' in navigator)) return;

    try {
      this.wakeLock = await (navigator as Navigator & {
        wakeLock: { request(type: string): Promise<WakeLockSentinel> };
      }).wakeLock.request('screen');

      // Reaquire o lock se a tela for reativada pelo usuário
      this.wakeLock.addEventListener('release', () => {
        if (this.watchId !== null) {
          // Entrega ainda ativa — tenta reaquirir
          setTimeout(() => this.solicitarWakeLock(), 500);
        }
      });
    } catch {
      // Permissão negada ou API não disponível — continua sem Wake Lock
    }
  }

  private liberarWakeLock(): void {
    if (this.wakeLock) {
      this.wakeLock.release().catch(() => {/* */});
      this.wakeLock = null;
    }
  }

  // ── Utilitários ──────────────────────────────────────────────

  /**
   * Fórmula de Haversine — distância em metros entre dois pontos.
   */
  private haversineMetros(a: Coordenada, b: Coordenada): number {
    const R = 6_371_000;
    const φ1 = (a.lat * Math.PI) / 180;
    const φ2 = (b.lat * Math.PI) / 180;
    const Δφ = ((b.lat - a.lat) * Math.PI) / 180;
    const Δλ = ((b.lng - a.lng) * Math.PI) / 180;
    const h =
      Math.sin(Δφ / 2) ** 2 +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  }

  private emitirErro(msg: string): void {
    this.statusEnvio$.next('erro');
    this.erroMensagem$.next(msg);
  }
}
