/* Service worker do Cartinhas.

   Guarda so a casca do aplicativo (pagina, codigo, leitor de PDF), para abrir rapido e
   funcionar sem sinal. Dado de ponto NUNCA e guardado aqui: toda chamada a /api/ vai
   direto para a rede e, sem rede, falha — e a tela trata disso guardando a edicao na fila
   da conta. Assim nenhum saldo antigo aparece como se fosse o de agora, e nada do ponto de
   uma pessoa fica no cache para a proxima que usar o aparelho. */

const CASCA = 'cartinhas-casca-4';
const ARQUIVOS = [
  '/', '/index.html', '/app.mjs', '/regras.mjs', '/logo.svg', '/logo.png',
  '/manifest.webmanifest', '/vendor/pdf.min.mjs', '/vendor/pdf.worker.min.mjs',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CASCA).then((c) => c.addAll(ARQUIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== CASCA).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;
  if (url.pathname.startsWith('/api/')) return;              // ponto nunca sai do cache
  if (e.request.method !== 'GET') return;

  e.respondWith((async () => {
    // rede primeiro, para o aparelho pegar a versao nova assim que houver sinal
    try {
      const res = await fetch(e.request);
      if (res && res.ok) {
        const c = await caches.open(CASCA);
        c.put(e.request, res.clone());
      }
      return res;
    } catch (_) {
      const guardado = await caches.match(e.request);
      if (guardado) return guardado;
      const casca = await caches.match('/index.html');
      if (casca) return casca;
      return new Response('Sem conexão.', { status: 503, headers: { 'content-type': 'text/plain; charset=utf-8' } });
    }
  })());
});
