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
const ACCESS_CODE = 'noel2025';
const MAX_USERS = 2;

// État du chat
let connectedUsers = new Map();
let messageHistory = [];

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

  // Réception d'un message
  socket.on('send_message', ({ text }) => {
    const username = connectedUsers.get(socket.id);
    if (!username) return;

    const message = {
      id: Date.now(),
      username,
      text,
      timestamp: new Date().toLocaleTimeString('fr-FR', { 
        hour: '2-digit', 
        minute: '2-digit' 
      })
    };

    // Garder les 100 derniers messages
    messageHistory.push(message);
    if (messageHistory.length > 100) {
      messageHistory.shift();
    }

    // Diffuser à tous
    io.emit('new_message', message);
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
