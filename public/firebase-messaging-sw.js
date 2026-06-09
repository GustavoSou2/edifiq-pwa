// ============================================================
// firebase-messaging-sw.js
//
// Service Worker dedicado ao Firebase Cloud Messaging (FCM).
// Este arquivo DEVE estar na raiz do domínio (public/) para
// que o FCM consiga registrá-lo com o escopo correto.
//
// Ele é separado do ngsw-worker.js (Angular SW) — os dois
// coexistem sem conflito porque têm escopos diferentes:
//   ngsw-worker.js   → cache de assets do app
//   firebase-messaging-sw.js → push notifications em background
// ============================================================

importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

// Mesma config do firebase.config.ts
// (SW não tem acesso ao bundle do Angular — precisa estar aqui)
firebase.initializeApp({
  apiKey:            'AIzaSyAQ-lieUKMNaGEtchpHDNsqy1k5HD4_zHE',
  authDomain:        'edifiq-logistic.firebaseapp.com',
  projectId:         'edifiq-logistic',
  storageBucket:     'edifiq-logistic.firebasestorage.app',
  messagingSenderId: '569786522662',
  appId:             '1:569786522662:web:3bb74e0511fe7b6fd5dae7',
  databaseURL:       'https://edifiq-logistic-default-rtdb.firebaseio.com/',
});

const messaging = firebase.messaging();

// ── Notificações em background ───────────────────────────────
// Quando o app está fechado ou em segundo plano, o FCM entrega
// a mensagem aqui. O SW exibe a notificação nativo do SO.
messaging.onBackgroundMessage((payload) => {
  console.log('[FCM SW] Mensagem em background recebida:', payload);

  const { title, body, icon, data } = payload.notification ?? {};
  const entregaId = payload.data?.entregaId ?? data?.entregaId;

  self.registration.showNotification(title ?? 'EdifIQ', {
    body:    body ?? 'Você tem uma nova entrega.',
    icon:    icon ?? '/icons/icon-192x192.png',
    badge:   '/icons/icon-96x96.png',
    tag:     entregaId ?? 'edifiq-notif',   // agrupa notificações da mesma entrega
    renotify: true,
    vibrate: [200, 100, 200],
    data: {
      url: entregaId
        ? `/entregador/detalhe/${entregaId}`
        : '/entregador',
    },
  });
});

// ── Toque na notificação ─────────────────────────────────────
// Abre (ou foca) o app na URL correta ao tocar na notificação.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = event.notification.data?.url ?? '/entregador';
  const fullUrl   = new URL(targetUrl, self.location.origin).href;

  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // Se já há uma aba aberta com o app, foca e navega
        for (const client of clientList) {
          if (client.url.startsWith(self.location.origin) && 'focus' in client) {
            client.focus();
            client.postMessage({ type: 'NAVIGATE', url: targetUrl });
            return;
          }
        }
        // Caso contrário, abre uma nova aba
        if (clients.openWindow) {
          return clients.openWindow(fullUrl);
        }
      }),
  );
});
