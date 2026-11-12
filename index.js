require('dotenv').config();

const mongoose = require('mongoose');
const compression = require('compression');
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const port = process.env.PORT || 4000;
// Nginx en el mismo VPS; para otro proxy configura sus IP/CIDR explÃ­citamente.
app.set('trust proxy', process.env.TRUST_PROXY || 'loopback');
app.use(require('./utils/media-url').mediaOrigin);

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use(compression());
app.use(cors());

mongoose.set('strictQuery', true);
mongoose.connect(process.env.MONGO_DB).then(() => {
  console.log('DB Online');
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'templates', 'welcome.html'));
});

const { serveUploads } = require('./middlewares/storage');
app.use('/uploads', serveUploads);
app.use('/api/uploads', require('./routes/uploads'));
app.use('/api', require('./routes/comments'));
app.use('/api', (req, res, next) =>
  /^\/(auth\/|admin\/(?:users|floating-buttons|products)(?:\/|$))/.test(req.path) ? require('./routes/accounts')(req, res, next) : next(),
);
app.get('/api/products', require('./routes/products').listPublic);
app.get('/api/floating-buttons', require('./routes/floating-buttons').listPublic);
app.use('/api/resources', require('./routes/resources'));
app.use('/api/collections', require('./routes/collections'));
app.use('/api/assets', require('./routes/assets'));
app.use('/api/category', require('./routes/category'));

app.use((req, res) => {
  res.status(404);
  if (req.accepts(['html', 'json']) === 'html') {
    return res.sendFile(path.resolve(process.cwd(), 'templates', '404.html'));
  }
  return res.json({
    status: false,
    error: 'Not Found',
    path: req.originalUrl,
    method: req.method,
  });
});

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
