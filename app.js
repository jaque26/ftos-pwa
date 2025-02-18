const MAX_ZIP_SIZE = 1000 * 1024 * 1024; // 1 GB
let currentUploads = [];

document.getElementById('start-btn').addEventListener('click', async () => {
    try {
        // Verificar si el navegador soporta las APIs necesarias
        if (!window.showDirectoryPicker) {
            throw new Error('Tu navegador no es compatible. Usa Chrome/Edge en Android.');
        }

        // Seleccionar carpeta
        const folderHandle = await window.showDirectoryPicker();
        alert('✅ Carpeta seleccionada. Escaneando archivos...');
        
        // Recolectar y ordenar archivos
        const files = await collectFiles(folderHandle);
        if (files.length === 0) throw new Error('No se encontraron archivos');
        
        // Crear lotes ZIP
        alert(`📁 ${files.length} archivos encontrados. Creando ZIPs...`);
        const zipBatches = await createZipBatches(files);
        
        // Guardar progreso en IndexedDB
        await saveProgress(zipBatches);
        alert(`📦 ${zipBatches.length} lotes creados. Iniciando subida...`);
        
        // Iniciar subida
        await processBatches(zipBatches);
        
        document.getElementById('status').textContent = '✅ Backup completado.';
        alert('🎉 ¡Todos los archivos se subieron correctamente!');

    } catch (error) {
        console.error('Error:', error);
        alert(`🚨 Error: ${error.message}`);
    }
});

// Recolectar archivos recursivamente y ordenar por fecha
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
    try {
        const token = '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';
        const repo = 'jaque26/ftos';
        const content = await blobToBase64(blob);

        // Verificar token
        if (!token || token.startsWith('ghp_')) {
            throw new Error('Token de GitHub inválido. Genera uno nuevo.');
        }

        // Subir archivo
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

        // Manejar respuesta
        const result = await response.json();
        if (!response.ok) throw new Error(result.message || 'Error en GitHub API');
        
        return result;
    } catch (error) {
        throw new Error('Falló la subida: ' + error.message);
    }
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