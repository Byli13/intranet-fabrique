/*******************************************************
 * public/main.js
 * Gère la logique front-end (fetch, drag & drop, preview, etc.)
 *******************************************************/

// On se connecte au socket du serveur
const socket = io();
socket.on('refresh', (data) => {
  if (data && data.dir) {
    if (data.dir === currentDir) {
      fetchFiles(currentDir);
    }
  }
});

let currentDir = '/home/fabrique';

// 1) Gérer la sidebar (arborescence)
async function fetchTree() {
  try {
    const res = await fetch('/api/tree');
    const root = await res.json();
    const container = document.getElementById('treeContainer');
    container.innerHTML = ''; // reset si reload
    buildTreeHTML(root, container);
  } catch (err) {
    console.error('Erreur fetchTree :', err);
  }
}

function buildTreeHTML(node, container) {
  const ul = document.createElement('ul');
  container.appendChild(ul);

  const li = document.createElement('li');
  li.textContent = node.name;
  li.addEventListener('click', (e) => {
    e.stopPropagation();
    if (node.isDirectory) {
      fetchFiles(node.path);
    } else {
      // eventuel preview ?
      // On devine un type
      const guess = guessFileType(node.name);
      previewFile({ name: node.name, path: node.path, type: guess });
    }
  });
  ul.appendChild(li);

  if (node.isDirectory && node.children) {
    const childContainer = document.createElement('div');
    li.appendChild(childContainer);
    node.children.forEach(child => {
      buildTreeHTML(child, childContainer);
    });
  }
}

// Deviner le type d'après l'extension
function guessFileType(fileName) {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg') || lower.endsWith('.png') || lower.endsWith('.gif')) return 'image';
  if (lower.endsWith('.pdf')) return 'pdf';
  if (lower.endsWith('.zip') || lower.endsWith('.rar') || lower.endsWith('.7z')) return 'archive';
  if (lower.endsWith('.mp4') || lower.endsWith('.mkv') || lower.endsWith('.mov')) return 'video';
  if (lower.endsWith('.mp3') || lower.endsWith('.wav') || lower.endsWith('.ogg')) return 'audio';
  if (lower.endsWith('.doc') || lower.endsWith('.docx') || lower.endsWith('.txt') || lower.endsWith('.ppt') || lower.endsWith('.pptx')) return 'document';
  return 'default';
}

// 2) Drag & Drop global => upload
document.addEventListener('dragover', (e) => {
  e.preventDefault();
});
document.addEventListener('drop', async (e) => {
  e.preventDefault();
  // Si on drop sur le body => upload direct
  if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
    const formData = new FormData();
    for (const file of e.dataTransfer.files) {
      formData.append('files', file);
    }
    const url = '/api/upload?dir=' + encodeURIComponent(currentDir);
    try {
      await fetch(url, { method: 'POST', body: formData });
    } catch (err) {
      console.error(err);
      alert('Echec de l’upload par glisser-déposer.');
    }
  }
});

// 3) Récupérer la liste de fichiers
async function fetchFiles(dir = '/home/fabrique') {
  currentDir = dir;
  try {
    const response = await fetch('/api/files?dir=' + encodeURIComponent(dir));
    const data = await response.json();
    if (data.error) {
      throw new Error(data.error);
    }
    renderFiles(data.currentDir, data.items);
  } catch (error) {
    console.error('Erreur fetchFiles :', error);
  }
}

function renderFiles(dir, items) {
  document.getElementById('breadcrumb').textContent = `Chemin : ${dir}`;
  const grid = document.getElementById('fileGrid');
  grid.innerHTML = '';

  items.forEach(file => {
    const card = document.createElement('div');
    card.className = 'file-card';
    if (file.type === 'folder') {
      card.classList.add('folder');
    }
    card.setAttribute('draggable', 'true');

    card.innerHTML = `
      <div class="file-header">
        <div class="file-icon">${getFileIcon(file.type)}</div>
        <div class="file-header-buttons">
          <button class="file-menu" title="Télécharger">
            <i class="fas fa-download"></i>
          </button>
          <button class="file-delete" title="Supprimer">
            <i class="fas fa-trash-alt"></i>
          </button>
        </div>
      </div>
      <h3 class="file-title">${file.name}</h3>
      <div class="file-meta">
        <span class="file-size">${file.size}</span>
      </div>
    `;

    // clic => nav/preview
    card.addEventListener('click', e => {
      e.stopPropagation();
      if (file.type === 'folder') {
        fetchFiles(file.path);
      } else {
        previewFile(file);
      }
    });

    // bouton "Télécharger"
    const menuBtn = card.querySelector('.file-menu');
    menuBtn.addEventListener('click', e => {
      e.stopPropagation();
      downloadFile(file.path);
    });

    // bouton "Supprimer"
    const deleteBtn = card.querySelector('.file-delete');
    deleteBtn.addEventListener('click', async e => {
      e.stopPropagation();
      const confirmed = confirm(`Supprimer « ${file.name} » ?`);
      if (!confirmed) return;
      await deleteFile(file.path);
      fetchFiles(currentDir);
    });

    // DRAG & DROP pour déplacer
    card.addEventListener('dragstart', (e) => {
      e.stopPropagation();
      e.dataTransfer.setData('text/plain', file.path);
    });
    if (file.type === 'folder') {
      card.addEventListener('dragover', (e) => {
        e.preventDefault();
        card.classList.add('dragover');
      });
      card.addEventListener('dragleave', () => {
        card.classList.remove('dragover');
      });
      card.addEventListener('drop', async (e) => {
        e.preventDefault();
        card.classList.remove('dragover');
        const sourcePath = e.dataTransfer.getData('text/plain');
        if (sourcePath === file.path) {
          alert('Impossible de déplacer dans soi-même.');
          return;
        }
        try {
          await moveFile(sourcePath, file.path);
        } catch (err) {
          console.error('Erreur moveFile:', err);
          alert('Echec du déplacement.');
        }
      });
    }

    grid.appendChild(card);
  });
}

function getFileIcon(type) {
  const icons = {
    folder: '<i class="fas fa-folder fa-2x"></i>',
    image: '<i class="fas fa-file-image fa-2x"></i>',
    document: '<i class="fas fa-file-alt fa-2x"></i>',
    archive: '<i class="fas fa-file-archive fa-2x"></i>',
    video: '<i class="fas fa-file-video fa-2x"></i>',
    audio: '<i class="fas fa-file-audio fa-2x"></i>',
    pdf: '<i class="fas fa-file-pdf fa-2x"></i>',
    default: '<i class="fas fa-file fa-2x"></i>'
  };
  return icons[type] || icons.default;
}

function downloadFile(filePath) {
  window.location.href = '/api/download?file=' + encodeURIComponent(filePath);
}

async function deleteFile(filePath) {
  try {
    const url = '/api/delete?file=' + encodeURIComponent(filePath);
    const response = await fetch(url, { method: 'DELETE' });
    const result = await response.json();
    if (result.error) throw new Error(result.error);
    alert('Fichier/dossier supprimé !');
  } catch (err) {
    console.error('Erreur suppression :', err);
    alert('Echec de la suppression.');
  }
}

async function moveFile(source, target) {
  const response = await fetch('/api/move', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source, target })
  });
  const result = await response.json();
  if (result.error) throw new Error(result.error);
}

// ================= PREVIEW
function previewFile(file) {
  if (file.type === 'image' || file.type === 'pdf') {
    const previewOverlay = document.getElementById('previewOverlay');
    const previewContainer = document.getElementById('previewFile');
    previewContainer.innerHTML = '';
    let el;
    if (file.type === 'image') {
      el = document.createElement('img');
      el.src = '/api/raw?file=' + encodeURIComponent(file.path);
    } else {
      el = document.createElement('iframe');
      el.src = '/api/raw?file=' + encodeURIComponent(file.path);
    }
    previewContainer.appendChild(el);
    previewOverlay.style.display = 'flex';
  } else {
    downloadFile(file.path);
  }
}

document.getElementById('closePreview').addEventListener('click', () => {
  document.getElementById('previewOverlay').style.display = 'none';
});

// 5) Bouton Upload (unique)
const uploadBtn = document.getElementById('uploadBtn');
const uploadInput = document.getElementById('uploadInput');
uploadBtn.addEventListener('click', () => {
  uploadInput.click();
});
uploadInput.addEventListener('change', async () => {
  if (uploadInput.files.length > 0) {
    const formData = new FormData();
    for (const file of uploadInput.files) {
      formData.append('files', file);
    }
    const url = '/api/upload?dir=' + encodeURIComponent(currentDir);
    try {
      await fetch(url, { method: 'POST', body: formData });
      alert('Upload terminé !');
      fetchFiles(currentDir);
    } catch (err) {
      console.error('Erreur upload :', err);
      alert('Echec de l’upload.');
    }
  }
});

// 6) Boutons de navigation
document.getElementById('goUpBtn').addEventListener('click', () => {
  goUpOneLevel();
});
document.getElementById('goRootBtn').addEventListener('click', () => {
  fetchFiles('/home/fabrique');
});

function goUpOneLevel() {
  if (currentDir === '/home/fabrique') return;
  const idx = currentDir.lastIndexOf('/');
  if (idx <= '/home/fabrique'.length) {
    fetchFiles('/home/fabrique');
  } else {
    const parent = currentDir.substring(0, idx);
    fetchFiles(parent);
  }
}

// 7) Au chargement
window.addEventListener('DOMContentLoaded', () => {
  fetchFiles(currentDir);
  fetchTree(); // Charger la sidebar
});
