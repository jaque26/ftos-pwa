self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('periodicsync', (event) => {
    if (event.tag === 'backup-fotos') {
        event.waitUntil(performBackup());
    }
});

async function performBackup() {
    const folderName = localStorage.getItem('folderHandle');
    if (folderName) {
        try {
            const folderHandle = await window.showDirectoryPicker();
            const files = await folderHandle.values();
            // ... lógica de subida (similar a app.js)
        } catch (error) {
            console.error('Error en segundo plano:', error);
        }
    }
}