const MAX_ZIP_SIZE = 1000 * 1024 * 1024; // 1 GB
let currentUploads = [];

document.getElementById('start-btn').addEventListener('click', async () => {
    try {
        if (!window.showDirectoryPicker) {
            console.log("El navegador no es compatible con showDirectoryPicker.");
            throw new Error('Tu navegador no es compatible. Usa Chrome/Edge en Android.');
        }

        console.log("Seleccionando carpeta...");
        const folderHandle = await window.showDirectoryPicker();
        console.log("Carpeta seleccionada.");
        alert('✅ Carpeta seleccionada. Escaneando archivos...');
        
        console.log("Recolectando archivos...");
        const files = await collectFiles(folderHandle);
        if (files.length === 0) {
            console.log("No se encontraron archivos.");
            throw new Error('No se encontraron archivos');
        }
        
        console.log(`Se encontraron ${files.length} archivos.`);
        alert(`📁 ${files.length} archivos encontrados. Creando ZIPs...`);
        const zipBatches = await createZipBatches(files);
        console.log(`Se crearon ${zipBatches.length} lotes de ZIP.`);
        
        console.log("Guardando progreso...");
        await saveProgress(zipBatches);
        console.log("Progreso guardado.");
        alert(`📦 ${zipBatches.length} lotes creados. Iniciando subida...`);
        
        console.log("Antes de procesar lotes");
        await processBatches(zipBatches);
        console.log("Después de procesar lotes");
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
        console.log("Iniciando recolección de archivos...");
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
        console.log("Ordenando archivos por fecha...");
        return files.sort((a, b) => a.date - b.date);
    } catch (error) {
        console.error('Error escaneando archivos:', error);
        throw new Error('Error escaneando archivos: ' + error.message);
    }
}

async function createZipBatches(files) {
    try {
        console.log("Creando lotes de ZIP...");
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
        console.log("Lotes de ZIP creados.");
        return batches;
    } catch (error) {
        console.error('Error creando ZIPs:', error);
        throw new Error('Error creando ZIPs: ' + error.message);
    }
}

async function processBatches(batches) {
    console.log("Iniciando proceso de lotes");
    try {
        console.log("Obteniendo progreso almacenado...");
        const storedBatches = await getStoredProgress();
        const batchesToProcess = storedBatches.length > 0 ? storedBatches : batches;

        for (const [index, batch] of batchesToProcess.entries()) {
            console.log(`Procesando lote ${index}`);
            const zipBlob = await batch.generateAsync({ type: 'blob' });
            console.log(`Subiendo lote ${index}...`);
            await uploadZip(zipBlob, `backup-${Date.now()}-${index}.zip`);
            console.log(`Actualizando progreso para lote ${index}...`);
            await updateProgress(index);
        }
    } catch (error) {
        console.error('Error procesando lotes:', error);
        throw new Error('Error procesando lotes: ' + error.message);
    }
    console.log("Finalizado proceso de lotes");
}

// ========== GESTIÓN DE INDEXEDDB (CORREGIDO) ==========
async function saveProgress(batches) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('progress', 'readwrite');
        const store = tx.objectStore('progress');

        // Convertir lotes a un formato serializable
        Promise.all(
            batches.map(async (batch) => {
                const zipBlob = await batch.generateAsync({ type: 'blob' });
                return await blobToBase64(zipBlob);
            })
        ).then(serializedBatches => {
            console.log("Limpiando almacenamiento previo...");
            const clearRequest = store.clear();
            clearRequest.onsuccess = () => {
                console.log("Añadiendo nuevo progreso...");
                const addRequest = store.add({ batches: serializedBatches, timestamp: Date.now() });
                addRequest.onsuccess = () => {
                    tx.oncomplete = () => {
                        console.log("Progreso guardado con éxito.");
                        resolve();
                    };
                    tx.onerror = (event) => reject(new Error('Error al guardar el progreso: ' + event.target.error));
                };
                addRequest.onerror = (event) => {
                    tx.abort();
                    reject(new Error('Error al añadir el progreso: ' + event.target.error));
                };
            };
            clearRequest.onerror = (event) => {
                tx.abort();
                reject(new Error('Error al limpiar el progreso: ' + event.target.error));
            };
        }).catch(error => {
            tx.abort();
            reject(new Error('Error al serializar los lotes: ' + error.message));
        });
    });
}

async function getStoredProgress() {
    const db = await openDB();
    const tx = db.transaction('progress', 'readonly');
    const store = tx.objectStore('progress');
    const allRecords = await store.getAll();

    if (allRecords.length === 0) {
        console.log("No hay progreso almacenado.");
        return [];
    }

    // Convertir lotes serializados a objetos JSZip
    console.log("Convirtiendo lotes almacenados...");
    return await Promise.all(
        allRecords[0].batches.map(async (base64) => {
            const blob = await base64ToBlob(base64);
            return await JSZip.loadAsync(blob);
        })
    );
}

async function updateProgress(index) {
    const db = await openDB();
    const tx = db.transaction('progress', 'readwrite');
    const store = tx.objectStore('progress');
    const allRecords = await store.getAll();

    if (allRecords.length > 0) {
        const record = allRecords[0];
        console.log(`Actualizando progreso, eliminando lote ${index}`);
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
                console.log("Creando ObjectStore 'progress'");
                const store = db.createObjectStore('progress', {
                    keyPath: 'id',
                    autoIncrement: true
                });
                store.createIndex('timestamp', 'timestamp', { unique: false });
            }
        };

        request.onsuccess = (e) => {
            console.log("Base de datos abierta con éxito.");
            resolve(e.target.result);
        };
        request.onerror = (e) => {
            console.error("Error al abrir la base de datos:", e.target.error);
            reject(e.target.error);
        };
    });
}

// ========== FUNCIONES AUXILIARES ==========
async function uploadZip(blob, zipName) {
    try {
        const token = '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';
        const repo = 'jaque26/ftos';
        const content = await blobToBase64(blob);

        if (!token || !token.startsWith('ghp_')) {
            console.log("Token de GitHub inválido.");
            throw new Error('Token de GitHub inválido');
        }

        console.log(`Subiendo ${zipName}`);
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
        if (!response.ok) {
            console.error('Error en la subida:', result);
            throw new Error(result.message || 'Error en GitHub API');
        }
        console.log(`Subida exitosa de ${zipName}`, result);
        return result;
        
    } catch (error) {
        console.error('Error subiendo ZIP:', error);
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

async function base64ToBlob(base64) {
    const response = await fetch(`data:application/zip;base64,${base64}`);
    return await response.blob();
}
