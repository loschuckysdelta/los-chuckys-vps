const { isObjectIdOrHexString } = require('mongoose');
const Asset = require('../models/asset');

function incrementCounter(field) {
  return async (req, res) => {
    res.set('Cache-Control', 'no-store');
    if (req.method !== 'POST') return res.status(405).set('Allow', 'POST').end();
    if (!isObjectIdOrHexString(req.params.id)) {
      return res.status(400).json({ msg: 'ID de recurso inválido.' });
    }
    try {
      const asset = await Asset.findOneAndUpdate(
        { _id: req.params.id },
        { $inc: { [field]: 1 } },
        { new: true },
      ).select('_id views likes');
      if (!asset) return res.status(404).json({ msg: 'Recurso no encontrado.' });
      return res.json({ _id: asset._id, views: asset.views ?? 0, likes: asset.likes ?? 0 });
    } catch (err) {
      return res.status(500).json({ msg: 'No se pudo actualizar el contador.' });
    }
  };
}

module.exports = { incrementView: incrementCounter('views'), incrementLike: incrementCounter('likes') };
