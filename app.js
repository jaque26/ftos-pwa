// ========== NUEVA FUNCIÓN PARA MOSTRAR LOGS ==========
const logContainer = document.createElement('div');
logContainer.id = 'log-container';
document.body.appendChild(logContainer);

function addLog(message, isError = false) {
    const logEntry = document.createElement('div');
    logEntry.className = `log-entry ${isError ? 'log-error' : ''}`;
    logEntry.textContent = `📄 ${message}`;
    logContainer.appendChild(logEntry);
    logContainer.scrollTop = logContainer.scrollHeight;
}

// ========== FUNCIÓN PRINCIPAL MODIFICADA ==========
document.getElementById('start-btn').addEventListener('click', async () => {
    try {
        logContainer.innerHTML = ''; // Limpiar logs anteriores
        addLog('Iniciando proceso...');
        
        if (!window.showDirectoryPicker) {
            addLog('ERROR: Navegador no compatible', true);
            throw new Error('Usa Chrome/Edge en Android');
        }

        addLog('Seleccionando carpeta...');
        const folderHandle = await window.showDirectoryPicker();
        addLog('✔ Carpeta seleccionada: ' + folderHandle.name);
        
        addLog('Buscando archivos...');
        const files = await collectFiles(folderHandle);
        if (files.length === 0) {
            addLog('❌ No hay archivos', true);
            throw new Error('No se encontraron archivos');
        }
        addLog(`✔ Encontrados ${files.length} archivos`);

        addLog('Comprimiendo en ZIPs...');
        const zipBatches = await createZipBatches(files);
        addLog(`✔ Creados ${zipBatches.length} lotes ZIP`);

        addLog('Guardando progreso...');
        await saveProgress(zipBatches);
        addLog('✔ Progreso guardado');

        addLog('Iniciando subida a GitHub...');
        await processBatches(zipBatches);
        
        addLog('🎉 ¡Backup completado!');
        document.getElementById('status').textContent = '✅ Backup completado';

    } catch (error) {
        addLog(`❌ ERROR CRÍTICO: ${error.message}`, true);
        alert(`ERROR: ${error.message}`);
    }
});

// ========== FUNCIÓN collectFiles ==========
async function collectFiles(folderHandle) {
    const files = [];
    for await (const entry of folderHandle.values()) {
        if (entry.kind === 'file') {
            files.push(entry);
        } else if (entry.kind === 'directory') {
            files.push(...await collectFiles(entry));
        }
    }
    return files;
}

// ========== FUNCIÓN createZipBatches ==========
async function createZipBatches(files) {
    const batches = [];
    let zip = new JSZip();
    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const fileContent = await file.getFile();
        const content = await fileContent.arrayBuffer();
        zip.file(file.name, content);
        if ((i + 1) % 100 === 0 || i === files.length - 1) { // Cada 100 archivos o al final
            batches.push(zip);
            zip = new JSZip();
        }
    }
    return batches;
}

// ========== FUNCIÓN processBatches ACTUALIZADA ==========
async function processBatches(batches) {
    try {
        const storedBatches = await getStoredProgress();
        const batchesToProcess = storedBatches.length > 0 ? storedBatches : batches;

        for (const [index, batch] of batchesToProcess.entries()) {
            try {
                addLog(`Procesando lote ${index + 1}/${batchesToProcess.length}...`);
                const zipBlob = await batch.generateAsync({ type: 'blob' });
                addLog(`Subiendo lote ${index + 1}...`);
                await uploadZip(zipBlob, `backup-${Date.now()}-${index}.zip`);
                addLog(`✔ Lote ${index + 1} subido`);
                await updateProgress(index);
            } catch (batchError) {
                addLog(`❌ Falló el lote ${index + 1}: ${batchError.message}`, true);
                throw batchError;
            }
        }
    } catch (error) {
        addLog('❌ Error en el proceso: ' + error.message, true);
        throw error;
    }
}

// ========== FUNCIÓN uploadZip MEJORADA ==========
async function uploadZip(blob, zipName) {
    try {
        const token = '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';
        const repo = 'jaque26/ftos';
        const content = await blobToBase64(blob);

        if (!token) {
            addLog('❌ Token de GitHub faltante', true);
            throw new Error('Token no configurado');
        }

        addLog(`Subiendo ${zipName} (${(blob.size / 1024 / 1024).toFixed(2)} MB)...`);
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
            addLog(`❌ GitHub API Error: ${result.message}`, true);
            throw new Error(result.message || 'Error desconocido de GitHub');
        }
        
        addLog(`✔ ${zipName} subido correctamente`);
        return result;
        
    } catch (error) {
        addLog(`❌ Error subiendo ZIP: ${error.message}`, true);
        throw error;
    }
}

// ========== FUNCIÓN saveProgress ==========
async function saveProgress(batches) {
    const serializedBatches = await Promise.all(batches.map(async (batch) => {
        return await batch.generateAsync({ type: "base64" });
    }));
    localStorage.setItem('batchesProgress', JSON.stringify(serializedBatches));
}

// ========== FUNCIÓN getStoredProgress ==========
async function getStoredProgress() {
    const stored = localStorage.getItem('batchesProgress');
    if (stored) {
        return JSON.parse(stored).map(base64 => {
            const zip = new JSZip();
            zip.loadAsync(base64);
            return zip;
        });
    }
    return [];
}

// ========== FUNCIÓN updateProgress ==========
async function updateProgress(index) {
    const stored = await getStoredProgress();
    stored.splice(0, index + 1);
    await saveProgress(stored);
}

// ========== FUNCIÓN blobToBase64 ==========
function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}
