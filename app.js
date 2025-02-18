const MAX_ZIP_SIZE = 1000 * 1024 * 1024; // 1 GB
let currentUploads = [];

document.getElementById('start-btn').addEventListener('click', async () => {
    try {
        const folderHandle = await window.showDirectoryPicker();
        const files = await collectFiles(folderHandle);
        const zipBatches = await createZipBatches(files);
        
        // Guardar progreso en IndexedDB
        await saveProgress(zipBatches);
        
        // Iniciar subida
        await processBatches(zipBatches);
        
        document.getElementById('status').textContent = '✅ Backup completado.';
    } catch (error) {
        console.error('Error:', error);
    }
});

// Recolectar archivos recursivamente y ordenar por fecha
async function collectFiles(dirHandle) {
    let files = [];
    for await (const entry of dirHandle.values()) {
        if (entry.kind === 'file') {
            const file = await entry.getFile();
            files.push({ 
                name: file.name,
                content: await file.arrayBuffer(),
                date: file.lastModified 
            });
        } else if (entry.kind === 'directory') {
            files = files.concat(await collectFiles(entry));
        }
    }
    return files.sort((a, b) => a.date - b.date);
}

// Crear lotes ZIP de máximo 1 GB
async function createZipBatches(files) {
    const batches = [];
    let currentBatch = new JSZip();
    let currentSize = 0;

    for (const file of files) {
        const fileSize = file.content.byteLength;
        if (currentSize + fileSize > MAX_ZIP_SIZE) {
            batches.push(currentBatch);
            currentBatch = new JSZip();
            currentSize = 0;
        }
        currentBatch.file(file.name, file.content);
        currentSize += fileSize;
    }

    if (currentSize > 0) batches.push(currentBatch);
    return batches;
}

// Subir lotes con reanudación automática
async function processBatches(batches) {
    const storedBatches = await getStoredProgress();
    const batchesToProcess = storedBatches.length > 0 ? storedBatches : batches;

    for (const [index, batch] of batchesToProcess.entries()) {
        const zipBlob = await batch.generateAsync({ type: 'blob' });
        await uploadZip(zipBlob, `backup-${Date.now()}-${index}.zip`);
        await updateProgress(index); // Eliminar lote completado
    }
}

// Subir ZIP a GitHub
async function uploadZip(blob, zipName) {
    const token = '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';
    const repo = 'jaque26/ftos';
    const content = await blobToBase64(blob);

    await fetch(`https://api.github.com/repos/${repo}/contents/${zipName}`, {
        method: 'PUT',
        headers: { 'Authorization': `token ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'Backup ZIP', content })
    });
}

// Helpers
async function blobToBase64(blob) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result.split(',')[1]);
        reader.readAsDataURL(blob);
    });
}

// IndexedDB para guardar progreso
async function saveProgress(batches) {
    const db = await openDB();
    await db.clear('progress');
    await db.add('progress', { batches, timestamp: Date.now() });
}

async function getStoredProgress() {
    const db = await openDB();
    const data = await db.get('progress', 1);
    return data ? data.batches : [];
}

async function updateProgress(index) {
    const db = await openDB();
    const data = await db.get('progress', 1);
    data.batches.splice(index, 1);
    await db.put('progress', data);
}

async function openDB() {
    return new Promise((resolve) => {
        const request = indexedDB.open('BackupDB', 1);
        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains('progress')) {
                db.createObjectStore('progress', { keyPath: 'id' });
            }
        };
        request.onsuccess = (e) => resolve(e.target.result);
    });
}