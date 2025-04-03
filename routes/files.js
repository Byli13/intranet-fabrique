/*******************************************************
 * routes/files.js
 * Regroupe les routes /api/tree, /api/files, /api/upload...
 *******************************************************/
const express = require('express');
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const multer = require('multer');

const router = express.Router();

// Multer pour l'upload
const upload = multer({ dest: 'uploads_tmp/' });

// Petite utilitaire pour format de taille
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

// Fonction récursive pour construire l'arborescence
function buildTree(startPath) {
  const stats = fs.statSync(startPath);
  const node = {
    name: path.basename(startPath),
    path: startPath,
    isDirectory: stats.isDirectory(),
    children: []
  };
  if (stats.isDirectory()) {
    const dirents = fs.readdirSync(startPath, { withFileTypes: true })
      .filter(d => !d.name.startsWith('.')); // ignorer cachés
    for (const dirent of dirents) {
      const childPath = path.join(startPath, dirent.name);
      node.children.push(buildTree(childPath));
    }
  }
  return node;
}

module.exports = function(io) {
  // GET /api/tree
  router.get('/api/tree', (req, res) => {
    try {
      const root = '/home/fabrique';
      const tree = buildTree(root);
      res.json(tree);
    } catch (err) {
      console.error('Erreur build tree:', err);
      res.status(500).json({ error: 'Impossible de construire l’arborescence.' });
    }
  });

  // GET /api/files
  router.get('/api/files', (req, res) => {
    const dirParam = req.query.dir || '/home/fabrique';

    fs.readdir(dirParam, { withFileTypes: true }, (err, dirents) => {
      if (err) {
        console.error('Erreur lecture dossier :', err);
        return res.status(500).json({ error: 'Impossible de lire le dossier.' });
      }

      const visibleDirents = dirents.filter(d => !d.name.startsWith('.'));
      const result = visibleDirents.map(dirent => {
        const fullPath = path.join(dirParam, dirent.name);
        const stats = fs.statSync(fullPath);

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

      res.json({ currentDir: dirParam, items: result });
    });
  });

  // GET /api/download
  router.get('/api/download', (req, res) => {
    const filePath = req.query.file;
    if (!filePath) {
      return res.status(400).json({ error: 'Paramètre file manquant.' });
    }
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Fichier/dossier introuvable.' });
    }

    const stats = fs.lstatSync(filePath);
    if (stats.isDirectory()) {
      // ZIP
      const baseName = path.basename(filePath);
      res.setHeader('Content-Disposition', `attachment; filename=${baseName}.zip`);
      res.setHeader('Content-Type', 'application/zip');

      const archive = archiver('zip', { zlib: { level: 9 } });
      archive.on('error', (err) => {
        console.error('Erreur ZIP:', err);
        return res.status(500).end();
      });
      archive.pipe(res);
      archive.directory(filePath, false);
      archive.finalize();
    } else {
      // Fichier normal
      res.download(filePath, (err) => {
        if (err) {
          console.error('Erreur téléchargement :', err);
          return res.status(500).json({ error: 'Impossible de télécharger ce fichier.' });
        }
      });
    }
  });

  // GET /api/raw
  router.get('/api/raw', (req, res) => {
    const filePath = req.query.file;
    if (!filePath) {
      return res.status(400).json({ error: 'Paramètre file manquant.' });
    }
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Introuvable.' });
    }

    res.sendFile(filePath, (err) => {
      if (err) {
        console.error('Erreur envoi file :', err);
        return res.status(500).json({ error: 'Impossible de servir ce fichier.' });
      }
    });
  });

  // POST /api/upload
  router.post('/api/upload', upload.array('files'), (req, res) => {
    const dirParam = req.query.dir || '/home/fabrique';
    if (!fs.existsSync(dirParam)) {
      return res.status(400).json({ error: 'Le répertoire spécifié n’existe pas.' });
    }

    req.files.forEach(file => {
      const destination = path.join(dirParam, file.originalname);
      fs.renameSync(file.path, destination);
    });

    res.json({ success: true, message: 'Upload terminé.' });
    io.emit('refresh', { dir: dirParam });
  });

  // DELETE /api/delete
  router.delete('/api/delete', (req, res) => {
    const filePath = req.query.file;
    if (!filePath) {
      return res.status(400).json({ error: 'Paramètre file manquant.' });
    }
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Fichier ou dossier introuvable.' });
    }

    try {
      const stats = fs.lstatSync(filePath);
      if (stats.isDirectory()) {
        fs.rmSync(filePath, { recursive: true, force: true });
      } else {
        fs.unlinkSync(filePath);
      }
      res.json({ success: true });
      io.emit('refresh', { dir: path.dirname(filePath) });
    } catch (err) {
      console.error('Erreur suppression :', err);
      return res.status(500).json({ error: 'Impossible de supprimer.' });
    }
  });

  // POST /api/move
  router.post('/api/move', (req, res) => {
    const { source, target } = req.body;
    if (!source || !target) {
      return res.status(400).json({ error: 'Paramètres source et target manquants.' });
    }

    if (!fs.existsSync(source)) {
      return res.status(404).json({ error: 'Source introuvable.' });
    }
    if (!fs.existsSync(target) || !fs.lstatSync(target).isDirectory()) {
      return res.status(400).json({ error: 'Dossier de destination invalide.' });
    }

    const baseName = path.basename(source);
    const newPath = path.join(target, baseName);

    try {
      fs.renameSync(source, newPath);
      res.json({ success: true });
      io.emit('refresh', { dir: path.dirname(source) });
      io.emit('refresh', { dir: target });
    } catch (err) {
      console.error('Erreur move :', err);
      res.status(500).json({ error: 'Impossible de déplacer.' });
    }
  });

  return router;
};
