/*
 * 앱 화면(HTML·JS·CSS·아이콘)을 기기에 보관해 인터넷이 끊겨도 앱을 열 수 있게 한다.
 * 시나리오 데이터(/api)는 보관하지 않는다. 목록 캐시는 앱이 직접 관리한다.
 */
const CACHE = 'mt-shell-v1';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(['./', './manifest.webmanifest', './icons/icon.svg']))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.includes('/api/')) return;

  // 페이지: 네트워크 우선, 실패하면 보관본
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put('./', copy));
          }
          return response;
        })
        .catch(() => caches.match('./').then((cached) => cached ?? Response.error())),
    );
    return;
  }

  // 해시가 붙은 빌드 파일은 바뀌지 않으므로 보관본 우선, 나머지는 보관본을 쓰면서 새로 받아 둔다.
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached && url.pathname.includes('/assets/')) return cached;
      const network = fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached ?? Response.error());
      return cached ?? network;
    }),
  );
});
