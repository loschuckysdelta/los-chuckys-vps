const { Router } = require('express');
const collection = require('../controllers/collection');
const { incrementView, incrementLike } = require('../controllers/resource-counter');

const router = Router();

router.get('/', collection.getResources);
router.post('/:id/view', incrementView);
router.post('/:id/like', incrementLike);
router.all(['/:id/view', '/:id/like'], (req, res) => {
  res.set('Allow', 'POST').status(405).json({ msg: 'Usa POST para incrementar el contador.' });
});

module.exports = router;
