/*******************************************************
 * server.js
 * Lancement : sudo node server.js
 *******************************************************/
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

// On importe le router principal
const filesRouter = require('./routes/files');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// ==============================
// 1) MIDDLEWARE BASIC AUTH
// ==============================
app.use((req, res, next) => {
  // Identifiants choisis
  const USER = 'admin';
  const PASS = 'LPHrmTV';

  // On vérifie l'en-tête Authorization
  const b64auth = (req.headers.authorization || '').split(' ')[1] || '';
  const [login, password] = Buffer.from(b64auth, 'base64').toString().split(':');

  if (login === USER && password === PASS) {
    return next(); // OK => suite
  }

  res.set('WWW-Authenticate', 'Basic realm="Espace Protégé"');
  return res.status(401).send('Authentification requise.');
});

// On sert le dossier public (index.html, style.css, main.js, etc.)
app.use(express.static('public'));

// Pour parser JSON (déplacement de fichier, etc.)
app.use(express.json());

// On monte le router (en lui passant io pour émettre les événements)
app.use(filesRouter(io));

// Gestion des sockets
io.on('connection', (socket) => {
  console.log('Client connecté en WebSocket.');
});

// Lancement du serveur
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Serveur démarré sur http://localhost:${PORT}`);
});
