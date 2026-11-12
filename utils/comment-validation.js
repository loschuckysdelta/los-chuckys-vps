const sanitize = require('sanitize-html');
const blockedWords = ['gana dinero', 't.me', 'inversión'];
function cleanText(value) {
  if (typeof value !== 'string') throw Object.assign(Error('Escribe un comentario.'), { status: 400 });
  const text = sanitize(value, { allowedTags: [], allowedAttributes: {} }).trim();
  if (!text || text.length > 500)
    throw Object.assign(Error('El texto debe tener entre 1 y 500 caracteres.'), { status: 400 });
  if (/(.)\1{9}/su.test(text))
    throw Object.assign(Error('Evita repetir el mismo carácter tantas veces.'), { status: 400 });
  if (/https?:|www\.|[\p{L}\p{N}-]+\s*\.\s*(com|net|org|pe|io|xyz|ru|tk)\b/iu.test(text))
    throw Object.assign(Error('No se permiten enlaces.'), { status: 400 });
  const normalized = text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  if (blockedWords.some((word) => normalized.includes(word.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase())))
    throw Object.assign(Error('El comentario contiene publicidad no permitida.'), { status: 400 });
  return text;
}
module.exports = { cleanText, blockedWords };
