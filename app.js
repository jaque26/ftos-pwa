const MAX_ZIP_SIZE = 1000 * 1024 * 1024; // 1 GB
let currentUploads = [];

document.getElementById('start-btn').addEventListener('click', async () => {
    try {
        if (!window.showDirectoryPicker) {
            throw new Error('Tu navegador no es compatible. Usa Chrome/Edge en Android.');
        }

        const folderHandle = await window.showDirectoryPicker();
        alert('✅ Carpeta seleccionada. Escaneando archivos...');
        
        const files = await collectFiles(folderHandle);
        if (files.length === 0) throw new Error('No se encontraron archivos');
        
        alert(`📁 ${files.length} archivos encontrados. Creando ZIPs...`);
        const zipBatches = await createZipBatches(files);
        
        await saveProgress(zipBatches);
        alert(`📦 ${zipBatches.length} lotes creados. Iniciando subida...`);
        
        await processBatches(zipBatches);
        document.getElementById('status').textContent = '✅ Backup completado.';
        alert('🎉 ¡Todos los archivos se subieron correctamente!');

    } catch (error) {
        console.error('Error:', error);
        alert(`🚨 Error: ${error.message}`);
    }
});

// ========== FUNCIONES PRINCIPALES ==========
async function collectFiles(dirHandle) {
    try {
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
    } catch (error) {
        throw new Error('Error escaneando archivos: ' + error.message);
    }
}

async function createZipBatches(files) {
    try {
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
    } catch (error) {
        throw new Error('Error creando ZIPs: ' + error.message);
    }
}

async function processBatches(batches) {
    try {
        const storedBatches = await getStoredProgress();
        const batchesToProcess = storedBatches.length > 0 ? storedBatches : batches;

        for (const [index, batch] of batchesToProcess.entries()) {
            const zipBlob = await batch.generateAsync({ type: 'blob' });
            await uploadZip(zipBlob, `backup-${Date.now()}-${index}.zip`);
            await updateProgress(index);
        }
    } catch (error) {
        throw new Error('Error procesando lotes: ' + error.message);
    }
}

// ========== GESTIÓN DE INDEXEDDB (CORREGIDO) ==========
async function saveProgress(batches) {
    const db = await openDB();
    const tx = db.transaction('progress', 'readwrite');
    const store = tx.objectStore('progress');
    
    await store.clear();
    await store.add({ batches, timestamp: Date.now() });
    await tx.done;
}

async function getStoredProgress() {
    const db = await openDB();
    const tx = db.transaction('progress', 'readonly');
    const store = tx.objectStore('progress');
    const allRecords = await store.getAll();
    
    return allRecords.length > 0 ? allRecords[0].batches : [];
}

async function updateProgress(index) {
    const db = await openDB();
    const tx = db.transaction('progress', 'readwrite');
    const store = tx.objectStore('progress');
    const allRecords = await store.getAll();

    if (allRecords.length > 0) {
        const record = allRecords[0];
        record.batches.splice(index, 1);
        await store.put(record);
    }
    await tx.done;
}

async function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('BackupDB', 2);
        
        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains('progress')) {
                const store = db.createObjectStore('progress', {
                    keyPath: 'id',
                    autoIncrement: true
                });
                store.createIndex('timestamp', 'timestamp', { unique: false });
            }
        };

        request.onsuccess = (e) => resolve(e.target.result);
        request.onerror = (e) => reject(e.target.error);
    });
}

// ========== FUNCIONES AUXILIARES ==========
async function uploadZip(blob, zipName) {
    try {
        const token = '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';
        const repo = 'jaque26/ftos';
        const content = await blobToBase64(blob);

        if (!token || !token.startsWith('ghp_')) {
            throw new Error('Token de GitHub inválido');
        }

        const response = await fetch(`https://api.github.com/repos/${repo}/contents/${zipName}`, {
            method: 'PUT',
            headers: { 
                'Authorization': `token ${token}`, 
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
                message: 'Backup automático', 
                content: content 
            })
        });

        const result = await response.json();
        if (!response.ok) throw new Error(result.message || 'Error en GitHub API');
        return result;
        
    } catch (error) {
        throw new Error('Error subiendo ZIP: ' + error.message);
    }
}

async function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}