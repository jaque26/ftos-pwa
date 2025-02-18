self.addEventListener('install', (e) => {
    self.skipWaiting();
});

self.addEventListener('fetch', (e) => {
    // Cachear recursos para funcionamiento offline
    e.respondWith(
        caches.match(e.request).then(response => response || fetch(e.request))
    );
});

self.addEventListener('periodicsync', (e) => {
    if (e.tag === 'resume-upload') {
        e.waitUntil(handleResume());
    }
});

async function handleResume() {
    const db = await openDB(); // Usar misma función de app.js
    const data = await db.get('progress', 1);
    if (data && data.batches.length > 0) {
        await processBatches(data.batches); // Usar función de app.js
    }
}