const { createHash, timingSafeEqual } = require('node:crypto');
const User = require('../models/user');
const Session = require('../models/session');
async function optionalAuth(req, res, next) {
  const token = (req.headers.cookie || '').match(/(?:^|;\s*)chucky_session=([0-9a-f]{64})(?:;|$)/)?.[1];
  if (token) {
    const session = await Session.findOne({
      _id: createHash('sha256').update(token).digest('hex'),
      expiresAt: { $gt: new Date() },
    }).lean();
    if (session) req.user = await User.findOne({ _id: session.user, active: { $ne: false } }).lean();
    if (req.user) {
      const moderators = (process.env.GOOGLE_ADMIN_SUBS || '')
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean);
      req.isAdmin = moderators.includes(req.user.googleSub);
    }
  }
  next();
}
function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Inicia sesión para continuar.' });
  next();
}
function admin(req, res, next) {
  const expected = process.env.PANEL_USERS_KEY,
    supplied = req.get('x-panel-users-key');
  const hash = (value) => createHash('sha256').update(value).digest();
  if (!expected || !supplied || !timingSafeEqual(hash(expected), hash(supplied)))
    return res.status(403).json({ error: 'Acceso administrativo requerido.' });
  next();
}
function writeOrigin(req, res, next) {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    const allowed = (process.env.AUTH_ORIGINS || '').split(',').map((s) => s.trim());
    if (!allowed.includes(req.get('origin')) || !req.is('application/json'))
      return res.status(403).json({ error: 'Origen no autorizado.' });
  }
  next();
}
module.exports = { optionalAuth, requireAuth, admin, writeOrigin };
