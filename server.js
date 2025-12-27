require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Servir les fichiers statiques
app.use(express.static(path.join(__dirname, 'public')));

// Configuration
const ACCESS_CODE = process.env.ACCESS_CODE || 'noel2025';
const MAX_USERS = parseInt(process.env.MAX_USERS) || 2;
const TEXT_HISTORY_DURATION_MS = 10 * 60 * 1000; // 10 minutes pour les textes
const IMAGE_DURATION_MS = 60 * 1000; // 1 minute pour les images

// État du chat
let connectedUsers = new Map();
let messageHistory = [];

// Nettoyer l'historique en fonction du type de message
function cleanOldMessages() {
  const now = Date.now();
  messageHistory = messageHistory.filter(msg => {
    const maxAge = msg.type === 'image' ? IMAGE_DURATION_MS : TEXT_HISTORY_DURATION_MS;
    return (now - msg.createdAt) < maxAge;
  });
}

// Nettoyer toutes les 5 secondes pour les images
setInterval(cleanOldMessages, 5000);

io.on('connection', (socket) => {
  console.log(`Nouvelle connexion: ${socket.id}`);

  // Tentative d'authentification
  socket.on('authenticate', ({ code, username }) => {
    // Vérifier le code
    if (code !== ACCESS_CODE) {
      socket.emit('auth_error', { message: 'Code d\'accès incorrect' });
      return;
    }

    // Vérifier le nombre d'utilisateurs
    if (connectedUsers.size >= MAX_USERS && !connectedUsers.has(socket.id)) {
      socket.emit('auth_error', { message: 'Le chat est complet (2 personnes max)' });
      return;
    }

    // Vérifier que le pseudo n'est pas déjà pris
    const existingUsernames = Array.from(connectedUsers.values());
    if (existingUsernames.includes(username)) {
      socket.emit('auth_error', { message: 'Ce pseudo est déjà utilisé' });
      return;
    }

    // Authentification réussie
    connectedUsers.set(socket.id, username);
    socket.emit('auth_success', { 
      username,
      history: messageHistory,
      usersOnline: Array.from(connectedUsers.values())
    });

    // Notifier les autres
    socket.broadcast.emit('user_joined', { 
      username,
      usersOnline: Array.from(connectedUsers.values())
    });

    console.log(`${username} a rejoint le chat. Utilisateurs: ${connectedUsers.size}`);
  });

  // Réception d'un message texte
  socket.on('send_message', ({ text }) => {
    const username = connectedUsers.get(socket.id);
    if (!username) return;

    const message = {
      id: Date.now(),
      type: 'text',
      username,
      text,
      createdAt: Date.now(),
      timestamp: new Date().toLocaleTimeString('fr-FR', {
        hour: '2-digit',
        minute: '2-digit'
      })
    };

    messageHistory.push(message);
    cleanOldMessages();

    // Diffuser à tous
    io.emit('new_message', message);
  });

  // Réception d'une image
  socket.on('send_image', ({ imageData }) => {
    const username = connectedUsers.get(socket.id);
    if (!username) return;

    // Limiter la taille de l'image (5MB en base64)
    if (imageData.length > 5 * 1024 * 1024) {
      socket.emit('error', { message: 'Image trop volumineuse (max 5MB)' });
      return;
    }

    const message = {
      id: Date.now(),
      type: 'image',
      username,
      imageData,
      createdAt: Date.now(),
      timestamp: new Date().toLocaleTimeString('fr-FR', {
        hour: '2-digit',
        minute: '2-digit'
      }),
      expiresAt: Date.now() + IMAGE_DURATION_MS
    };

    messageHistory.push(message);
    cleanOldMessages();

    // Diffuser à tous
    io.emit('new_message', message);

    // Programmer la suppression après 1 minute
    setTimeout(() => {
      io.emit('delete_message', { id: message.id });
    }, IMAGE_DURATION_MS);
  });

  // Indicateur de frappe
  socket.on('typing', () => {
    const username = connectedUsers.get(socket.id);
    if (username) {
      socket.broadcast.emit('user_typing', { username });
    }
  });

  socket.on('stop_typing', () => {
    socket.broadcast.emit('user_stop_typing');
  });

  // Déconnexion
  socket.on('disconnect', () => {
    const username = connectedUsers.get(socket.id);
    if (username) {
      connectedUsers.delete(socket.id);
      io.emit('user_left', { 
        username,
        usersOnline: Array.from(connectedUsers.values())
      });
      console.log(`${username} a quitté le chat. Utilisateurs: ${connectedUsers.size}`);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🎄 Chat de Noël démarré sur http://localhost:${PORT}`);
});
