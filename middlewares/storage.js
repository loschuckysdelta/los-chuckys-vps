const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { randomUUID } = require('node:crypto');
const fileUpload = require('express-fileupload');
const express = require('express');
const { cleanEmptyFolders } = require('../utils/empty-upload-folders');

const uploadsDir = path.resolve(__dirname, '..', process.env.UPLOADS_DIR || 'uploads');
const maxBytes = Number(process.env.MAX_UPLOAD_MB || 500) * 1024 * 1024;
if (!Number.isFinite(maxBytes) || maxBytes <= 0) throw new Error('MAX_UPLOAD_MB inválido');
const { publicUrl } = require('../utils/media-url');
const serveUploads = express.Router();
const staticOptions = {
  dotfiles: 'deny',
  setHeaders: (res) => res.setHeader('X-Content-Type-Options', 'nosniff'),
};
// Los enlaces antiguos apuntan a la misma carpeta física, sin recrear el anidado.
serveUploads.use('/local/collections', express.static(uploadsDir, staticOptions));
serveUploads.use(express.static(uploadsDir, staticOptions));
const formats = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
  'image/bmp': 'bmp',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
  'video/x-msvideo': 'avi',
  'video/x-matroska': 'mkv',
  'video/mpeg': 'mpeg',
};
const invalid = (message) => Object.assign(new Error(message), { status: 400 });
const parser = fileUpload({
  useTempFiles: true,
  tempFileDir: os.tmpdir(),
  limits: { fileSize: maxBytes, files: 1 },
});
const tempUpload = (req, res, next) => {
  res.once('close', () => {
    const files = Object.values(req.files || {}).flat();
    for (const file of files) {
      if (file.tempFilePath) fs.rm(file.tempFilePath, { force: true }).catch(console.error);
    }
  });
  parser(req, res, (err) => {
    if (err) return next(err);
    if (
      Object.values(req.files || {})
        .flat()
        .some((file) => file.truncated)
    ) {
      return res.status(413).json({ msg: 'El archivo supera el tamaño máximo permitido.' });
    }
    next();
  });
};

async function uploadAsset(file, folder = 'resources', resourceType = 'image') {
  if (!file || Array.isArray(file) || !file.tempFilePath || !file.size || file.truncated) {
    throw invalid('Archivo inválido o vacío.');
  }
  if (typeof folder !== 'string' || !/^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*$/.test(folder)) {
    throw invalid('Carpeta inválida.');
  }
  const format = formats[file.mimetype];
  if (!['image', 'video'].includes(resourceType) || !format || !file.mimetype.startsWith(`${resourceType}/`)) {
    throw invalid('Formato de imagen o video no soportado.');
  }
  folder = folder.replace(/^collections\//, '');
  const public_id = `${folder}/${randomUUID()}.${format}`;
  const destination = path.join(uploadsDir, public_id);
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await file.mv(destination);
  return { public_id, secure_url: publicUrl({ public_id }), resource_type: resourceType, bytes: file.size, format };
}

async function deleteAsset(publicId) {
  // Los identificadores antiguos pertenecen al proveedor anterior.
  if (typeof publicId !== 'string') return;
  const legacy = publicId.startsWith('local/');
  publicId = publicId.replace(/^local\/collections\//, '');
  if (!/^(?:[a-zA-Z0-9_-]+\/)+[a-f0-9-]{36}\.[a-z0-9]+$/.test(publicId)) {
    if (!legacy && !publicId.includes('..')) return;
    throw invalid('Identificador de archivo inválido.');
  }
  await fs.rm(path.join(uploadsDir, publicId), { force: true });
  await cleanEmptyFolders(uploadsDir, path.join(uploadsDir, publicId.split('/')[0]));
}

async function cleanCollectionFolder(id) {
  if (!/^[a-f0-9]{24}$/.test(String(id))) throw invalid('Colección inválida.');
  await cleanEmptyFolders(uploadsDir, path.join(uploadsDir, String(id)));
}

module.exports = { tempUpload, uploadAsset, deleteAsset, uploadsDir, publicUrl, serveUploads, cleanCollectionFolder };
