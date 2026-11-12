const { AsyncLocalStorage } = require('node:async_hooks');
const requestOrigin = new AsyncLocalStorage();

function mediaOrigin(req, res, next) {
  // Host conserva el puerto; Express valida la confianza del proxy para protocol.
  const origin = `${req.protocol}://${req.get('host')}`;
  requestOrigin.run(origin, next);
}

function localPath(file) {
  const id = file?.public_id;
  if (typeof id !== 'string') return null;
  const normalized = id.replace(/^local\/collections\//, '');
  if (!/^(?:[a-zA-Z0-9_-]+\/)+[a-f0-9-]{36}\.[a-z0-9]+$/.test(normalized)) return null;
  return `/uploads/${normalized}`;
}

function publicUrl(file) {
  const relative = localPath(file);
  if (!relative) return file?.secure_url || null;
  const base = (process.env.PUBLIC_BASE_URL || requestOrigin.getStore() || '').replace(/\/+$/, '');
  return `${base}${relative}`;
}

// MongoDB guarda una ruta independiente del dominio para nuevas escrituras.
function storedFile(file) {
  const relative = localPath(file);
  return relative ? { ...file, secure_url: relative } : file;
}

function serializeMedia(field) {
  return (_doc, result) => {
    if (result[field]?.public_id) {
      result[field] = { ...result[field], secure_url: publicUrl(result[field]) };
    }
    return result;
  };
}

module.exports = { publicUrl, storedFile, serializeMedia, mediaOrigin };
