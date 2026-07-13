const CACHE = 'financas-shell-v1';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Estratégia simples: tenta a rede primeiro; se falhar (sem internet), tenta o cache.
// Não faz cache agressivo de dados — só existe para satisfazer os critérios de instalação do navegador.
self.addEventListener('fetch', (event) => {
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
