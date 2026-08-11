// AppFinançasBr — Service Worker
// Estratégia: cache do shell (HTML, CSS, JS, ícones) para funcionar offline.
// Dados do Supabase não são cacheados — precisam de rede para serem confiáveis.

const CACHE = 'appfinancas-v3';

const SHELL = [
  '/',
  '/dashboard',
  '/login',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png',
];

// Instala: pré-carrega o shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

// Ativa: limpa caches antigos
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Fetch: rede primeiro; se falhar, cache
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  if (
    url.pathname.startsWith('/api/') ||
    url.hostname.includes('supabase.co') ||
    url.hostname.includes('google') ||
    url.hostname.includes('googleapis') ||
    url.hostname !== self.location.hostname
  ) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});

// Push notifications — exibe o lembrete de vencimento recebido do servidor
self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload;
  try { payload = event.data.json(); } catch { return; }

  event.waitUntil(
    self.registration.showNotification(payload.title || 'AppFinançasBr', {
      body:    payload.body  || 'Você tem vencimentos próximos.',
      icon:    payload.icon  || '/icon-192.png',
      badge:   payload.badge || '/icon-96.png',
      data:    { url: payload.url || '/dashboard' },
      actions: [{ action: 'abrir', title: 'Ver detalhes' }],
      requireInteraction: false,
    })
  );
});

// Clique na notificação — abre ou foca o app
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/dashboard';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((lista) => {
      const janela = lista.find((c) => c.url.includes(self.location.origin));
      if (janela) return janela.focus().then((w) => w.navigate(url));
      return clients.openWindow(url);
    })
  );
});
