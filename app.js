let folderHandle;

document.getElementById('start-btn').addEventListener('click', async () => {
    try {
        folderHandle = await window.showDirectoryPicker();
        localStorage.setItem('folderHandle', folderHandle.name);
        startAutoBackup();
        document.getElementById('status').textContent = '✅ Backup activado. ¡Fotos se subirán automáticamente!';
    } catch (error) {
        alert('Error: ' + error.message);
    }
});

async function startAutoBackup() {
    setInterval(async () => {
        const files = await folderHandle.values();
        for await (const entry of files) {
            if (entry.kind === 'file' && entry.name.match(/\.(jpg|png|mp4)$/)) {
                const file = await entry.getFile();
                await uploadToGitHub(file);
            }
        }
    }, 6 * 60 * 60 * 1000); // Cada 6 horas
}

async function uploadToGitHub(file) {
    const token = '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';
    const repo = 'jaque26/ftos';
    const content = await file.arrayBuffer();
    const contentBase64 = btoa(String.fromCharCode(...new Uint8Array(content)));

    try {
        await fetch(`https://api.github.com/repos/${repo}/contents/fotos/${file.name}`, {
            method: 'PUT',
            headers: {
                'Authorization': `token ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                message: 'Backup automático',
                content: contentBase64
            })
        });
    } catch (error) {
        console.error('Error al subir:', error);
    }
}