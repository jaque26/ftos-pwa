// ========== NUEVA FUNCIÓN PARA MOSTRAR LOGS ==========
const logContainer = document.createElement('div');
logContainer.style = 'position: fixed; bottom: 0; left: 0; right: 0; background: white; padding: 10px; height: 200px; overflow-y: auto; z-index: 1000; border-top: 2px solid #2ecc71;';
document.body.appendChild(logContainer);

function addLog(message, isError = false) {
    const logEntry = document.createElement('div');
    logEntry.textContent = `📄 ${message}`;
    logEntry.style.color = isError ? 'red' : '#333';
    logEntry.style.fontSize = '14px';
    logEntry.style.padding = '5px 0';
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
