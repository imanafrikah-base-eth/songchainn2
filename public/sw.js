// $ongChainn Push Notification Service Worker
const CACHE_NAME = 'songchainn-v2';
const AUDIO_CACHE = 'songchainn-audio-v2';
const AUDIO_CACHE_SIZE_LIMIT = 500 * 1024 * 1024;

// Files to cache for offline use
const STATIC_ASSETS = [
  '/',
  '/favicon.png',
  '/manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME && key !== AUDIO_CACHE)
          .map((key) => caches.delete(key))
      );
    })
  );
  clients.claim();
});

const cachePutIfOk = (cacheName, request, response) => {
  if (!response || !response.ok) return;
  caches.open(cacheName).then((cache) => cache.put(request, response.clone())).catch(() => {});
};

const networkFirst = (request, cacheName) => {
  return fetch(request)
    .then((response) => {
      cachePutIfOk(cacheName, request, response);
      return response;
    })
    .catch(() => caches.match(request));
};

const getAudioCacheUsage = async (cache) => {
  const keys = await cache.keys();
  let totalBytes = 0;
  const entries = [];
  for (const request of keys) {
    try {
      const response = await cache.match(request);
      if (!response) continue;
      const cloned = response.clone();
      const blob = await cloned.blob();
      const size = blob.size || 0;
      totalBytes += size;
      entries.push({ request, size });
    } catch {
    }
  }
  return { totalBytes, entries };
};

const enforceAudioCacheLimitAndBroadcast = async (cache) => {
  const { totalBytes, entries } = await getAudioCacheUsage(cache);
  let bytes = totalBytes;
  let remaining = entries.slice();
  while (bytes > AUDIO_CACHE_SIZE_LIMIT && remaining.length > 0) {
    const entry = remaining.shift();
    if (!entry) break;
    try {
      await cache.delete(entry.request);
      bytes -= entry.size;
    } catch {
    }
  }
  try {
    const clientList = await self.clients.matchAll();
    clientList.forEach((client) => {
      client.postMessage({
        type: 'AUDIO_CACHE_STATS',
        totalBytes: bytes,
      });
    });
  } catch {
  }
};

// Handle messages from the main thread
self.addEventListener('message', (event) => {
  // Skip waiting when requested (for update flow)
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }

  if (event.data && event.data.type === 'CACHE_AUDIO') {
    const { url, songId } = event.data;
    caches.open(AUDIO_CACHE).then((cache) => {
      fetch(url).then((response) => {
        if (response.ok) {
          const cloneForId = response.clone();
          const cloneForUrl = response.clone();
          Promise.all([
            cache.put(`audio-${songId}`, cloneForId).catch(() => {}),
            cache.put(url, cloneForUrl).catch(() => {}),
          ]).then(() => {
            self.clients
              .matchAll()
              .then((clients) => {
                clients.forEach((client) => {
                  client.postMessage({ type: 'AUDIO_CACHED', songId });
                });
              })
              .catch(() => {});
            enforceAudioCacheLimitAndBroadcast(cache).catch(() => {});
          });
        }
      });
    });
  }
  
  if (event.data && event.data.type === 'GET_CACHED_AUDIO') {
    // Client now resolves cached URLs from its own state; the SW fetch interceptor
    // serves the audio from cache when the audio element requests it.
    // No-op — kept for protocol compatibility with older SW activations.
  }

  if (event.data && event.data.type === 'REMOVE_CACHED_AUDIO') {
    const { songId, url } = event.data;
    caches.open(AUDIO_CACHE).then((cache) => {
      const tasks = [];
      if (songId) {
        tasks.push(cache.delete(`audio-${songId}`).catch(() => false));
      }
      if (url) {
        tasks.push(cache.delete(url).catch(() => false));
      }
      if (tasks.length) {
        Promise.all(tasks)
          .then(() => {
            enforceAudioCacheLimitAndBroadcast(cache).catch(() => {});
          })
          .catch(() => {});
      }
    });
  }
  if (event.data && event.data.type === 'GET_AUDIO_CACHE_STATS') {
    caches.open(AUDIO_CACHE).then((cache) => {
      enforceAudioCacheLimitAndBroadcast(cache).catch(() => {});
    });
  }
});

// Fetch handler with offline support
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  const request = event.request;
  const destination = request.destination;
  
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          cachePutIfOk(CACHE_NAME, request, response);
          cachePutIfOk(CACHE_NAME, '/', response);
          return response;
        })
        .catch(() => caches.match('/'))
    );
    return;
  }
  
  if (destination === 'script' || destination === 'style') {
    event.respondWith(networkFirst(request, CACHE_NAME));
    return;
  }
  
  // Handle audio files from cache first
  if (url.pathname.includes('.wav') || url.pathname.includes('.mp3')) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        return cached || fetch(event.request);
      })
    );
    return;
  }
  
  // Network first for API calls
  if (url.pathname.includes('/rest/') || url.pathname.includes('/functions/')) {
    event.respondWith(fetch(event.request));
    return;
  }
  
  // Stale-while-revalidate for other requests
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const fetchPromise = fetch(event.request).then((response) => {
        cachePutIfOk(CACHE_NAME, event.request, response);
        return response;
      }).catch(() => cached);
      return cached || fetchPromise;
    })
  );
});

self.addEventListener('push', (event) => {
  if (!event.data) return;

  event.waitUntil((async () => {
    let data;
    try {
      data = event.data.json();
    } catch {
      data = { body: await event.data.text() };
    }

    const options = {
      body: data.body || 'You have a new notification',
      icon: '/favicon.png',
      badge: '/favicon.png',
      vibrate: [100, 50, 100],
      data: {
        url: data.url || '/',
        ...data
      },
      actions: [
        { action: 'open', title: 'Open' },
        { action: 'dismiss', title: 'Dismiss' }
      ]
    };

    await self.registration.showNotification(data.title || '$ongChainn', options);
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'dismiss') return;

  const urlToOpen = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // Focus existing window if available
        for (const client of clientList) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            client.navigate(urlToOpen);
            return client.focus();
          }
        }
        // Open new window if no existing window
        if (clients.openWindow) {
          return clients.openWindow(urlToOpen);
        }
      })
  );
});

self.addEventListener('notificationclose', (event) => {
  // Track notification dismissals if needed
  console.log('Notification closed:', event.notification.tag);
});
