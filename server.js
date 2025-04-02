// server.js

const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

const app = express();

// Middleware pour parser les formulaires multipart/form-data
const upload = multer({ dest: 'uploads_tmp/' });

// Servir les fichiers statiques du dossier public
app.use(express.static(path.join(__dirname, 'public')));

/**
 * Fonction utilitaire pour formater la taille en B, KB, MB, GB
 */
function formatFileSize(bytes) {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;
    while (size >= 1024 && unitIndex < units.length - 1) {
        size /= 1024;
        unitIndex++;
    }
    return `${size.toFixed(1)} ${units[unitIndex]}`;
}

/**
 * GET /api/files
 * Liste le contenu d'un répertoire, par défaut /home/fabrique
 * On peut préciser ?dir=/home/fabrique/sousdossier
 */
app.get('/api/files', (req, res) => {
    const dirParam = req.query.dir || '/home/fabrique';

    fs.readdir(dirParam, { withFileTypes: true }, (err, dirents) => {
        if (err) {
            console.error('Erreur lecture dossier :', err);
            return res.status(500).json({ error: 'Impossible de lire le dossier.' });
        }

        const result = dirents.map(dirent => {
            const fullPath = path.join(dirParam, dirent.name);
            const stats = fs.statSync(fullPath);

            // Déterminer le type
            let fileType = 'default';
            if (dirent.isDirectory()) {
                fileType = 'folder';
            } else {
                const ext = path.extname(dirent.name).toLowerCase();
                if (['.jpg', '.jpeg', '.png', '.gif'].includes(ext)) fileType = 'image';
                else if (['.zip', '.rar', '.7z'].includes(ext)) fileType = 'archive';
                else if (['.mp4', '.mkv', '.mov'].includes(ext)) fileType = 'video';
                else if (['.mp3', '.wav', '.ogg'].includes(ext)) fileType = 'audio';
                else if (['.pdf'].includes(ext)) fileType = 'pdf';
                else if (['.doc', '.docx', '.txt', '.ppt', '.pptx'].includes(ext)) fileType = 'document';
            }

            return {
                name: dirent.name,
                path: fullPath,
                type: fileType,
                size: formatFileSize(stats.size),
                modified: stats.mtime,
            };
        });

        res.json({
            currentDir: dirParam,
            items: result
        });
    });
});

/**
 * GET /api/download
 * Télécharger un fichier
 * Ex: /api/download?file=/home/fabrique/monfichier.pdf
 */
app.get('/api/download', (req, res) => {
    const filePath = req.query.file;
    if (!filePath) {
        return res.status(400).json({ error: 'Paramètre file manquant.' });
    }
    res.download(filePath, err => {
        if (err) {
            console.error('Erreur téléchargement :', err);
            return res.status(500).json({ error: 'Impossible de télécharger ce fichier.' });
        }
    });
});

/**
 * GET /api/raw
 * Sert le fichier brut (pour prévisualisation images/PDF).
 * Ex: /api/raw?file=/home/fabrique/image.jpg
 */
app.get('/api/raw', (req, res) => {
    const filePath = req.query.file;
    if (!filePath) {
        return res.status(400).json({ error: 'Paramètre file manquant.' });
    }
    // On envoie le fichier avec le bon content-type
    res.sendFile(filePath, err => {
        if (err) {
            console.error('Erreur envoi file :', err);
            return res.status(500).json({ error: 'Impossible de servir ce fichier.' });
        }
    });
});

/**
 * POST /api/upload
 * Upload d'un ou plusieurs fichiers dans un répertoire (param ?dir=xxx)
 */
app.post('/api/upload', upload.array('files'), (req, res) => {
    const dirParam = req.query.dir || '/home/fabrique';

    if (!fs.existsSync(dirParam)) {
        return res.status(400).json({ error: 'Le répertoire spécifié n’existe pas.' });
    }

    // Pour chaque fichier temporaire, on le déplace dans dirParam
    req.files.forEach(file => {
        const destination = path.join(dirParam, file.originalname);
        fs.renameSync(file.path, destination);
    });

    res.json({ success: true, message: 'Upload terminé.' });
});

// Démarrage du serveur
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Serveur démarré sur http://localhost:${PORT}`);
});
