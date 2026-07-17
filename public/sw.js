// AppFinançasBr — Service Worker
// Estratégia: cache do shell (HTML, CSS, JS, ícones) para funcionar offline.
// Dados do Supabase não são cacheados — precisam de rede para serem confiáveis.

const CACHE = 'appfinancas-v2';

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
// Rotas de API e Supabase sempre vão para a rede (sem fallback)
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Não intercepta APIs, Supabase, Google nem terceiros
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
        // Cacheia a resposta fresca
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
