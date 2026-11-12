const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { createHash, randomBytes } = require('node:crypto');
const router = express.Router();
const User = require('../models/user');
const Session = require('../models/session');
const cookie = 'chucky_session';

const options = {
  path: '/api',
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production' || process.env.COOKIE_SECURE === 'true',
};

const digest = (value) => createHash('sha256').update(value).digest('hex');
const configList = (name) =>
  (process.env[name] || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
function sessionId(req) {
  const token = (req.headers.cookie || '').match(/(?:^|;\s*)chucky_session=([0-9a-f]{64})(?:;|$)/)?.[1];
  return token ? digest(token) : null;
}
let keys,
  expires = 0,
  pending;
async function verify(token) {
  const kid = jwt.decode(token, { complete: true })?.header?.kid;
  if (!kid || !process.env.GOOGLE_CLIENT_ID) throw Error('credential');
  if (Date.now() >= expires) {
    pending ??= (async () => {
      const res = await fetch('https://www.googleapis.com/oauth2/v1/certs', { signal: AbortSignal.timeout(8000) });
      if (!res.ok) throw Error('certificates');
      keys = await res.json();
      expires = Date.now() + 1000 * Number(res.headers.get('cache-control')?.match(/max-age=(\d+)/)?.[1] || 60);
    })().finally(() => {
      pending = null;
    });
    await pending;
  }
  if (!Object.hasOwn(keys, kid)) throw Error('credential');
  const claims = jwt.verify(token, keys[kid], {
    algorithms: ['RS256'],
    audience: process.env.GOOGLE_CLIENT_ID,
    issuer: ['accounts.google.com', 'https://accounts.google.com'],
  });
  if (!claims.sub || !claims.email || !claims.exp) throw Error('credential');
  return claims;
}
const profile = (u) => ({
  name: u.name,
  picture: u.picture,
  id: String(u._id),
  email: u.email,
  gender: u.gender || '',
});

router.use((req, res, next) => {
  res.set('Cache-Control', 'private, no-store');
  if (
    req.path.startsWith('/auth/') &&
    ['POST', 'PATCH'].includes(req.method) &&
    (!req.is('application/json') || !configList('AUTH_ORIGINS').includes(req.get('origin')))
  )
    return res.sendStatus(403);
  next();
});

router.get('/auth/config', (req, res) => res.json({ clientId: process.env.GOOGLE_CLIENT_ID || '' }));

router.get('/auth/me', async (req, res) => {
  const id = sessionId(req);
  const session = id && (await Session.findOne({ _id: id, expiresAt: { $gt: new Date() } }).lean());
  const user = session && (await User.findById(session.user).lean());
  if (user && user.active !== false) {
    const token = (req.headers.cookie || '').match(/(?:^|;\s*)chucky_session=([0-9a-f]{64})(?:;|$)/)?.[1];
    res.clearCookie(cookie, { ...options, path: '/api/auth' });
    res.cookie(cookie, token, { ...options, maxAge: Math.max(0, new Date(session.expiresAt) - Date.now()) });
  }
  res.json({ user: user && user.active !== false ? profile(user) : null });
});

router.post('/auth/google', async (req, res) => {
  let claims;
  try {
    claims = await verify(req.body?.credential);
  } catch {
    return res.sendStatus(401);
  }
  const user = await User.findOneAndUpdate(
    { googleSub: claims.sub },
    {
      $set: { email: claims.email, lastLoginAt: new Date() },
      $setOnInsert: { picture: claims.picture || '', name: claims.name || '' },
    },
    { upsert: true, new: true },
  );
  if (user.active === false) return res.status(403).json({ error: 'Tu cuenta estÃ¡ desactivada.' });
  const token = randomBytes(32).toString('hex'),
    maxAge = 7 * 86400000;
  await Session.create({ _id: digest(token), user: user._id, expiresAt: new Date(Date.now() + maxAge) });
  const previous = sessionId(req);
  if (previous) await Session.deleteOne({ _id: previous });
  res.clearCookie(cookie, { ...options, path: '/api/auth' });
  res.cookie(cookie, token, { ...options, maxAge }).json({ user: profile(user) });
});

router.post('/auth/logout', async (req, res) => {
  await Session.deleteOne({ _id: sessionId(req) });
  res.clearCookie(cookie, { ...options, path: '/api/auth' });
  res.clearCookie(cookie, options).sendStatus(204);
});

router.use(['/admin/users','/admin/floating-buttons','/admin/products'], (req, res, next) => {
  const expected = process.env.PANEL_USERS_KEY;
  const supplied = req.get('x-panel-users-key');
  if (
    !expected ||
    !supplied ||
    !require('node:crypto').timingSafeEqual(Buffer.from(digest(expected), 'hex'), Buffer.from(digest(supplied), 'hex'))
  )
    return res.sendStatus(403);
  next();
});

router.use('/admin/products', require('./products').admin);
router.use('/admin/floating-buttons', require('./floating-buttons').admin);
router.get('/admin/users', async (req, res) => {
  const page = Math.max(1, Math.min(100000, parseInt(req.query.page, 10) || 1));
  const limit = [10, 25, 50, 100].includes(Number(req.query.limit)) ? Number(req.query.limit) : 25;
  const filter = {};
  const query = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 100) : '';
  if (query) {
    const escaped = query.replace(/[.*+?^$\{\}()|[\]\\]/g, '\\$&');
    filter.$or = [{ name: { $regex: escaped, $options: 'i' } }, { email: { $regex: escaped, $options: 'i' } }];
  }
  if (req.query.state === 'active') filter.active = { $ne: false };
  if (req.query.state === 'inactive') filter.active = false;
  const [users, total] = await Promise.all([
    User.find(filter, 'name email picture gender active createdAt lastLoginAt')
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    User.countDocuments(filter),
  ]);
  res.json({ users, total, more: page * limit < total });
});

function editableProfile(body, admin = false) {
  if (!body || typeof body.name !== 'string' || !body.name.trim() || body.name.trim().length > 100) {
    throw Error('Escribe un nombre de hasta 100 caracteres.');
  }
  const gender = body.gender ?? '';
  if (!['', 'Femenino', 'Masculino', 'No binario', 'Prefiero no indicar'].includes(gender))
    throw Error('GÃ©nero invÃ¡lido.');
  const values = { name: body.name.trim(), gender };
  if (!admin && body.picture !== undefined) {
    if (typeof body.picture !== 'string' || body.picture.length > 2048)
      throw Error('Usa un enlace HTTPS para la foto.');
    const picture = body.picture.trim();
    if (picture) {
      let url;
      try { url = new URL(picture); } catch { throw Error('Usa un enlace HTTPS para la foto.'); }
      if (url.protocol !== 'https:' || url.username || url.password)
        throw Error('Usa un enlace HTTPS para la foto.');
    }
    values.picture = picture;
  }
  return values;
}

router.patch('/auth/profile', async (req, res) => {
  const session = await Session.findOne({ _id: sessionId(req), expiresAt: { $gt: new Date() } }).lean();
  if (!session) return res.sendStatus(401);
  let values;
  try {
    values = editableProfile(req.body);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
  const user = await User.findOneAndUpdate(
    { _id: session.user, active: { $ne: false } },
    { $set: values },
    { new: true },
  );
  if (!user) return res.status(403).json({ error: 'Tu cuenta no estÃ¡ disponible.' });
  res.json({ user: profile(user) });
});

router.patch('/admin/users/:id', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.sendStatus(400);
  let values;
  try {
    values = editableProfile(req.body, true);
    if (typeof req.body.active !== 'boolean') throw Error('Estado invÃ¡lido.');
    values.active = req.body.active;
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
  const user = await User.findByIdAndUpdate(req.params.id, { $set: values }, { new: true });
  if (!user) return res.sendStatus(404);
  if (!user.active) await Session.deleteMany({ user: user._id });
  res.json({ user: profile(user) });
});

router.delete('/admin/users/:id', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.sendStatus(400);
  await require('../utils/comment-cascade').deleteUserWithComments(req.params.id);
  await Session.deleteMany({ user: req.params.id });
  res.sendStatus(204);
});

module.exports = router;
