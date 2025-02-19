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
        // Limpiar datos antiguos si existen
        if (localStorage.getItem('batchesProgress')) {
            localStorage.removeItem('batchesProgress');
            addLog('⚠️ Limpiando datos de progreso antiguos...');
        }
        
        const lastProcessedIndex = await getStoredProgress();
        const startIndex = lastProcessedIndex || 0;

        for (let index = startIndex; index < batches.length; index++) {
            try {
                addLog(`Procesando lote ${index + 1}/${batches.length}...`);
                const zipBlob = await batches[index].generateAsync({ type: 'blob' });
                addLog(`Subiendo lote ${index + 1}...`);
                await uploadZip(zipBlob, `backup-${Date.now()}-${index}.zip`);
                addLog(`✔ Lote ${index + 1} subido`);
                await saveProgress(index);
            } catch (batchError) {
                await saveProgress(index); // Guardar último índice válido
                addLog(`❌ Falló el lote ${index + 1}: ${batchError.message}`, true);
                throw batchError;
            }
        }
        localStorage.removeItem('lastProcessedIndex'); // Limpiar al finalizar
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

// ========== FUNCIÓN saveProgress ACTUALIZADA ==========
function saveProgress(index) {
    try {
        localStorage.setItem('lastProcessedIndex', index.toString());
    } catch (error) {
        addLog(`⚠️ Error guardando progreso: ${error.message}`, true);
        throw new Error('No se pudo guardar el progreso');
    }
}

// ========== FUNCIÓN getStoredProgress ACTUALIZADA ==========
function getStoredProgress() {
    try {
        return parseInt(localStorage.getItem('lastProcessedIndex')) || 0;
    } catch (error) {
        addLog('⚠️ Error leyendo progreso: ' + error.message, true);
        return 0;
    }
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
