const fs = require('node:fs/promises');
const path = require('node:path');

async function migrateUploads(root) {
  root = path.resolve(root);
  const source = path.join(root, 'local', 'collections');
  function withinRoot(target) {
    const relative = path.relative(root, path.resolve(target));
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new Error(`Ruta de migración fuera de uploads: ${target}`);
    }
  }
  async function moveDirectory(from, to) {
    withinRoot(from);
    withinRoot(to);
    const stat = await fs.lstat(from);
    if (stat.isSymbolicLink()) throw new Error(`Enlace simbólico no permitido: ${from}`);
    try {
      if ((await fs.lstat(to)).isSymbolicLink()) throw new Error(`Enlace simbólico no permitido: ${to}`);
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }
    await fs.mkdir(to, { recursive: true });
    for (const entry of await fs.readdir(from, { withFileTypes: true })) {
      const oldPath = path.join(from, entry.name);
      const newPath = path.join(to, entry.name);
      withinRoot(oldPath);
      withinRoot(newPath);
      if (entry.isSymbolicLink()) throw new Error(`Enlace simbólico no permitido: ${oldPath}`);
      if (entry.isDirectory()) await moveDirectory(oldPath, newPath);
      else {
        // COPYFILE_EXCL evita sobrescribir un archivo existente.
        await fs.copyFile(oldPath, newPath, require('node:fs').constants.COPYFILE_EXCL);
        await fs.unlink(oldPath);
      }
    }
    await fs.rmdir(from); // Solo elimina directorios vacíos.
  }
  try {
    await fs.access(source);
  } catch (err) {
    if (err.code === 'ENOENT') return;
    throw err;
  }
  if ((await fs.lstat(path.join(root, 'local'))).isSymbolicLink() || (await fs.lstat(source)).isSymbolicLink())
    throw new Error('uploads contiene un enlace simbólico');
  for (const entry of await fs.readdir(source, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) throw new Error(`Carpeta inesperada: ${entry.name}`);
    await moveDirectory(path.join(source, entry.name), path.join(root, entry.name));
  }
  await fs.rmdir(source);
  const local = path.join(root, 'local');
  if ((await fs.readdir(local)).length === 0) await fs.rmdir(local);
}

module.exports = { migrateUploads };

if (require.main === module) {
  require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
  const { uploadsDir } = require('../middlewares/storage');
  migrateUploads(uploadsDir)
    .then(() => console.log('Estructura de uploads actualizada.'))
    .catch((err) => {
      console.error(err);
      process.exitCode = 1;
    });
}
