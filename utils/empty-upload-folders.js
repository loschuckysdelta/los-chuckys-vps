const fs = require('node:fs/promises');
const path = require('node:path');

// Código de producción: elimina únicamente carpetas vacías dentro de uploads.
async function cleanEmptyFolders(root, target = root) {
  root = path.resolve(root);
  target = path.resolve(target);
  const relative = path.relative(root, target);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Ruta fuera de uploads');
  let current = root;
  for (const part of ['', ...relative.split(path.sep).filter(Boolean)]) {
    current = path.join(current, part);
    try {
      if ((await fs.lstat(current)).isSymbolicLink()) return;
    } catch (err) {
      if (err.code === 'ENOENT') return;
      throw err;
    }
  }
  async function visit(directory) {
    let entries;
    try {
      entries = await fs.readdir(directory, { withFileTypes: true });
    } catch (err) {
      if (err.code === 'ENOENT') return;
      throw err;
    }
    for (const entry of entries) {
      if (entry.isDirectory() && !entry.isSymbolicLink()) await visit(path.join(directory, entry.name));
    }
    if (directory === root) return;
    try {
      await fs.rmdir(directory);
    } catch (err) {
      if (!['ENOENT', 'ENOTEMPTY', 'EEXIST'].includes(err.code)) throw err;
    }
  }
  await visit(target);
}

module.exports = { cleanEmptyFolders };
