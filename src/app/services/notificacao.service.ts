// ============================================================
// notificacao.service.ts
//
// Responsabilidades:
//   1. Solicitar permissão de notificação ao usuário
//   2. Registrar o Service Worker do FCM
//   3. Obter o FCM Token do dispositivo (deve ser enviado ao Java)
//   4. Escutar mensagens em foreground (app aberto)
//   5. Escutar mensagens de navegação vindas do SW (toque em notif)
// ============================================================

import {
  Injectable,
  NgZone,
  OnDestroy,
  PLATFORM_ID,
  Inject,
  signal,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Router } from '@angular/router';
import { getMessaging, getToken, onMessage, Messaging } from 'firebase/messaging';
import { firebaseApp } from '../firebase.config';

export type PermissaoNotif = 'pendente' | 'concedida' | 'negada' | 'nao_suportado';

export interface NotificacaoPayload {
  title: string;
  body: string;
  entregaId?: string;
}

// VAPID key pública — gerada no Firebase Console:
// Project Settings → Cloud Messaging → Web Push certificates
// ⚠️ Substitua pelo valor real do seu projeto
const VAPID_KEY = 'COLE_SUA_VAPID_KEY_PUBLICA_AQUI';

@Injectable({ providedIn: 'root' })
export class NotificacaoService implements OnDestroy {

  // ── Estado público ───────────────────────────────────────────
  readonly permissao        = signal<PermissaoNotif>('pendente');
  readonly fcmToken         = signal<string | null>(null);
  readonly ultimaNotificacao = signal<NotificacaoPayload | null>(null);

  private messaging: Messaging | null = null;
  private swMessageHandler: ((e: MessageEvent) => void) | null = null;

  constructor(
    private router: Router,
    private ngZone: NgZone,
    @Inject(PLATFORM_ID) private platformId: object,
  ) {
    if (isPlatformBrowser(this.platformId)) {
      this.verificarPermissaoAtual();
      this.escutarMensagensDoSW();
    }
  }

  ngOnDestroy(): void {
    if (this.swMessageHandler && isPlatformBrowser(this.platformId)) {
      navigator.serviceWorker?.removeEventListener('message', this.swMessageHandler);
    }
  }

  // ── API pública ──────────────────────────────────────────────

  /**
   * Solicita permissão e registra o dispositivo no FCM.
   * Retorna o token que deve ser enviado ao servidor Java
   * para que ele possa disparar notificações para este dispositivo.
   */
  async solicitarPermissao(): Promise<string | null> {
    if (!isPlatformBrowser(this.platformId)) return null;

    // Verifica suporte à API
    if (!('Notification' in window) || !('serviceWorker' in navigator)) {
      this.permissao.set('nao_suportado');
      return null;
    }

    try {
      // Solicita permissão ao usuário
      const resultado = await Notification.requestPermission();

      if (resultado !== 'granted') {
        this.permissao.set('negada');
        return null;
      }

      this.permissao.set('concedida');
      return await this.registrarFCM();

    } catch (err) {
      console.error('[Notificacao] Erro ao solicitar permissão:', err);
      this.permissao.set('negada');
      return null;
    }
  }

  // ── Privados ─────────────────────────────────────────────────

  private verificarPermissaoAtual(): void {
    if (!('Notification' in window)) {
      this.permissao.set('nao_suportado');
      return;
    }
    const perm = Notification.permission;
    if (perm === 'granted')  this.permissao.set('concedida');
    else if (perm === 'denied') this.permissao.set('negada');
    else this.permissao.set('pendente');
  }

  private async registrarFCM(): Promise<string | null> {
    try {
      // Registra o SW dedicado do FCM (separado do ngsw-worker.js)
      const swRegistration = await navigator.serviceWorker.register(
        '/firebase-messaging-sw.js',
        { scope: '/' },
      );

      this.messaging = getMessaging(firebaseApp);

      const token = await getToken(this.messaging, {
        vapidKey:            VAPID_KEY,
        serviceWorkerRegistration: swRegistration,
      });

      this.ngZone.run(() => this.fcmToken.set(token));

      console.log('[FCM] Token do dispositivo:', token);
      // ↑ Em produção: enviar este token ao servidor Java via HTTP POST
      // POST /api/v1/dispositivos/registrar { token, motoristaId }

      // Escuta mensagens quando o app está em foreground
      this.escutarForeground();

      return token;

    } catch (err) {
      console.error('[FCM] Erro ao obter token:', err);
      return null;
    }
  }

  /**
   * Mensagens em foreground (app aberto):
   * O FCM não exibe notificação nativa automaticamente —
   * precisa ser tratado manualmente para mostrar um banner.
   */
  private escutarForeground(): void {
    if (!this.messaging) return;

    onMessage(this.messaging, (payload) => {
      console.log('[FCM] Mensagem em foreground:', payload);

      const notif: NotificacaoPayload = {
        title:     payload.notification?.title ?? 'EdifIQ',
        body:      payload.notification?.body  ?? 'Nova mensagem',
        entregaId: payload.data?.['entregaId'],
      };

      this.ngZone.run(() => this.ultimaNotificacao.set(notif));
    });
  }

  /**
   * Escuta mensagens do Service Worker (toque em notificação).
   * O SW envia NAVIGATE quando o usuário toca na notificação
   * com o app já aberto — navegamos programaticamente.
   */
  private escutarMensagensDoSW(): void {
    if (!('serviceWorker' in navigator)) return;

    this.swMessageHandler = (event: MessageEvent) => {
      if (event.data?.type === 'NAVIGATE' && event.data?.url) {
        this.ngZone.run(() => {
          this.router.navigateByUrl(event.data.url);
        });
      }
    };

    navigator.serviceWorker.addEventListener('message', this.swMessageHandler);
  }
}
