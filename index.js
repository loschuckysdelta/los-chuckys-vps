
require('dotenv').config();

const mongoose = require('mongoose');
const compression = require('compression');
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const port = process.env.PORT || 4001;

// Nginx está en el mismo VPS.
app.set('trust proxy', process.env.TRUST_PROXY || 'loopback');

app.use(require('./utils/media-url').mediaOrigin);

// CONFIGURACIÓN GENERAL
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use(compression());

// =======================================
// CORS - GOOGLE LOGIN Y API ADMINISTRATIVA
// =======================================

const allowedOrigins = new Set(
  (process.env.AUTH_ORIGINS || '')
    .split(',')
    .map(origin => origin.trim().replace(/\/+$/, ''))
    .filter(Boolean)
);

const protectedAPI = /^\/api\/(?:auth|admin)(?:\/|$)/;

app.use(cors((req, callback) => {
  const origin = req.get('Origin');

  // Dominios autorizados: permitir cookies.
  if (origin && allowedOrigins.has(origin)) {
    return callback(null, {
      origin: origin,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']
    });
  }

  // No habilitar CORS para otros orígenes
  // en las rutas de autenticación y administración.
  if (protectedAPI.test(req.path)) {
    return callback(null, { origin: false });
  }

  // Mantener la API pública accesible.
  return callback(null, {
    origin: '*'
  });
}));

// =======================================
// MONGODB
// =======================================

mongoose.set('strictQuery', true);

mongoose.connect(process.env.MONGO_DB)
  .then(() => {
    console.log('DB Online');
  })
  .catch(err => {
    console.error('Error de MongoDB:', err.message);
  });

// =======================================
// PÁGINA PRINCIPAL
// =======================================

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'templates', 'welcome.html'));
});

// =======================================
// UPLOADS
// =======================================

const { serveUploads } = require('./middlewares/storage');

app.use('/uploads', serveUploads);
app.use('/api/uploads', require('./routes/uploads'));

// =======================================
// COMENTARIOS
// =======================================

app.use('/api', require('./routes/comments'));

// =======================================
// GOOGLE LOGIN, CUENTAS Y ADMIN
// =======================================

const accountsRouter = require('./routes/accounts');

app.use('/api', (req, res, next) => {
  const isAccountRoute =
    /^\/(auth\/|admin\/(?:users|floating-buttons|products)(?:\/|$))/
      .test(req.path);

  if (isAccountRoute) {
    return accountsRouter(req, res, next);
  }

  next();
});

// =======================================
// PRODUCTOS Y BOTONES PÚBLICOS
// =======================================

app.get('/api/products', require('./routes/products').listPublic);

app.get(
  '/api/floating-buttons',
  require('./routes/floating-buttons').listPublic
);

// =======================================
// GALERÍA Y RECURSOS
// =======================================

app.use('/api/resources', require('./routes/resources'));
app.use('/api/collections', require('./routes/collections'));
app.use('/api/assets', require('./routes/assets'));
app.use('/api/category', require('./routes/category'));

// =======================================
// ERROR 404
// =======================================

app.use((req, res) => {
  res.status(404);

  if (req.accepts(['html', 'json']) === 'html') {
    return res.sendFile(
      path.resolve(process.cwd(), 'templates', '404.html')
    );
  }

  return res.json({
    status: false,
    error: 'Not Found',
    path: req.originalUrl,
    method: req.method
  });
});

// =======================================
// MIGRACIÓN Y SERVIDOR
// =======================================

const { migrateUploads } = require('./utils/migrate-uploads');
const { uploadsDir } = require('./middlewares/storage');

migrateUploads(uploadsDir)
  .then(() => {
    app.listen(port, () => {
      console.log('Servidor corriendo Puerto: ' + port);
    });
  })
  .catch((err) => {
    console.error('No se pudo migrar uploads:', err);
    process.exit(1);
  });
