const { Router } = require('express');
const { rateLimit } = require('express-rate-limit');
const mongoose = require('mongoose');
const auth = require('../middlewares/comment-auth');
const ctrl = require('../controllers/comment');
const router = Router();

router.use((req, res, next) => {
  if (
    !/^\/(collections\/[^/]+\/comments|comments(?:\/|$)|admin\/comments(?:\/|$)|admin\/users\/[^/]+\/comment-ban$)/.test(
      req.path,
    )
  )
    return next('router');
  next();
});

const limit = (max) =>
  rateLimit({
    windowMs: 60000,
    limit: max,
    keyGenerator: (req) => String(req.user._id),
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'Demasiadas solicitudes. Espera un minuto.' },
  });
const posting = limit(5),
  liking = limit(30),
  reporting = limit(5);
router.use((req, res, next) => {
  res.set('Cache-Control', 'private, no-store');
  next();
});

router.param('id', (req, res, next, id) =>
  mongoose.isValidObjectId(id) ? next() : res.status(400).json({ error: 'Identificador inválido.' }),
);

router.get('/admin/comments/hidden', auth.admin, ctrl.hidden);
router.patch('/admin/comments/:id/restore', auth.admin, ctrl.restore);
router.delete(
  '/admin/comments/:id',
  auth.admin,
  (req, res, next) => {
    req.isAdmin = true;
    next();
  },
  ctrl.remove,
);

router.post('/admin/users/:id/comment-ban', auth.admin, ctrl.ban);
router.use(auth.optionalAuth, auth.writeOrigin);
router.get('/collections/:id/comments', ctrl.list);
router.get('/comments/:id/replies', ctrl.replies);
router.post('/collections/:id/comments', auth.requireAuth, posting, ctrl.create);
router.patch('/comments/:id', auth.requireAuth, posting, ctrl.edit);
router.delete('/comments/:id', auth.requireAuth, ctrl.remove);
router.post('/comments/:id/like', auth.requireAuth, liking, ctrl.like);
router.post('/comments/:id/report', auth.requireAuth, reporting, ctrl.report);

router.use((error, req, res, next) =>
  res
    .status(error.status || 500)
    .json({ error: error.status ? error.message : 'No se pudo completar la operación. Inténtalo de nuevo.' }),
);

module.exports = router;
