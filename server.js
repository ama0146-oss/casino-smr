const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Rutas a los archivos de datos
const USERS_FILE = path.join(__dirname, 'data', 'users.json');
const CONFIG_FILE = path.join(__dirname, 'data', 'config.json');

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Helpers
function readUsers() {
  if (!fs.existsSync(USERS_FILE)) return {};
  return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
}

function saveUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

function readConfig() {
  return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
}

// ===== RUTAS DE AUTENTICACION =====

// Registro
app.post('/api/register', (req, res) => {
  const { username, password, email } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Usuario y contrasena requeridos' });

  const users = readUsers();
  const config = readConfig();

  if (users[username]) return res.status(409).json({ error: 'El usuario ya existe' });

  users[username] = {
    username,
    password,
    email: email || '',
    coins: config.bonoBienvenida,
    createdAt: new Date().toISOString(),
    lastBonus: null,
    totalGanado: 0,
    totalPerdido: 0,
    historial: []
  };

  saveUsers(users);
  res.json({ success: true, user: sanitize(users[username]), message: `Bienvenido! Tienes ${config.bonoBienvenida} SMR Coins de regalo!` });
});

// Login
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const users = readUsers();

  if (!users[username] || users[username].password !== password) {
    return res.status(401).json({ error: 'Usuario o contrasena incorrectos' });
  }

  res.json({ success: true, user: sanitize(users[username]) });
});

// Bono diario
app.post('/api/bonus', (req, res) => {
  const { username } = req.body;
  const users = readUsers();
  const config = readConfig();

  if (!users[username]) return res.status(404).json({ error: 'Usuario no encontrado' });

  const now = new Date();
  const lastBonus = users[username].lastBonus ? new Date(users[username].lastBonus) : null;

  if (lastBonus) {
    const diffHours = (now - lastBonus) / (1000 * 60 * 60);
    if (diffHours < 24) {
      const horasRestantes = Math.ceil(24 - diffHours);
      return res.status(400).json({ error: `Vuelve en ${horasRestantes} horas para tu bono diario` });
    }
  }

  users[username].coins += config.bonoDiario;
  users[username].lastBonus = now.toISOString();
  saveUsers(users);

  res.json({ success: true, coins: users[username].coins, bonus: config.bonoDiario });
});

// Obtener perfil
app.get('/api/user/:username', (req, res) => {
  const users = readUsers();
  const user = users[req.params.username];
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
  res.json(sanitize(user));
});

// ===== RUTAS DE JUEGO =====

// Apuesta general (actualizar coins y historial)
app.post('/api/bet', (req, res) => {
  const { username, juego, apuesta, resultado, ganancia } = req.body;
  const users = readUsers();
  const config = readConfig();

  if (!users[username]) return res.status(404).json({ error: 'Usuario no encontrado' });

  const user = users[username];

  if (apuesta > config.apuestaMaxima) {
    return res.status(400).json({ error: `Apuesta maxima: ${config.apuestaMaxima} SMR Coins` });
  }

  if (apuesta < config.apuestaMinima) {
    return res.status(400).json({ error: `Apuesta minima: ${config.apuestaMinima} SMR Coins` });
  }

  if (user.coins < apuesta) {
    return res.status(400).json({ error: 'No tienes suficientes SMR Coins' });
  }

  // Actualizar coins
  user.coins -= apuesta;
  user.coins += ganancia;

  // Actualizar stats
  if (ganancia > apuesta) {
    user.totalGanado += ganancia - apuesta;
  } else {
    user.totalPerdido += apuesta - ganancia;
  }

  // Historial (max 50 entradas)
  user.historial.unshift({
    fecha: new Date().toISOString(),
    juego,
    apuesta,
    ganancia,
    resultado,
    balance: user.coins
  });
  if (user.historial.length > 50) user.historial = user.historial.slice(0, 50);

  saveUsers(users);
  res.json({ success: true, coins: user.coins, historial: user.historial.slice(0, 10) });
});

// Historial
app.get('/api/historial/:username', (req, res) => {
  const users = readUsers();
  const user = users[req.params.username];
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
  res.json(user.historial || []);
});

// Config publica
app.get('/api/config', (req, res) => {
  const config = readConfig();
  res.json(config);
});

// Sanitizar usuario (quitar password)
function sanitize(user) {
  const { password, ...safe } = user;
  return safe;
}

// Ruta principal
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`SMR Casino corriendo en http://localhost:${PORT}`);
});
