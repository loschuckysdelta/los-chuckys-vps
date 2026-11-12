const { Router } = require('express');
const { isObjectIdOrHexString } = require('mongoose');
const Category = require('../models/category');
const Collection = require('../models/collection');
const router = Router();
const handle = (fn) => async (req, res) => {
  try {
    await fn(req, res);
  } catch (err) {
    res.status(err.name === 'ValidationError' || err.name === 'CastError' ? 400 : 500).json({ msg: err.message });
  }
};
router.param('id', (req, res, next, id) => {
  if (!isObjectIdOrHexString(id)) return res.status(400).json({ msg: 'Categoría inválida.' });
  next();
});
router.get(
  '/',
  handle(async (req, res) => res.json(await Category.find().sort({ order: 1, _id: 1 }))),
);
router.post(
  '/',
  handle(async (req, res) => {
    res.status(201).json(await Category.create({ title: req.body.title, order: req.body.order ?? 0 }));
  }),
);
router.put(
  '/order',
  handle(async (req, res) => {
    const items = req.body?.items;
    if (
      !Array.isArray(items) ||
      !items.length ||
      items.some(
        (item) => !item || !isObjectIdOrHexString(item._id) || !Number.isSafeInteger(item.order) || item.order < 1,
      ) ||
      new Set(items.map((item) => String(item._id).toLowerCase())).size !== items.length ||
      items.some((item, index) => item.order !== index + 1)
    ) {
      return res.status(400).json({ msg: 'Orden de categorías inválido.' });
    }
    const ids = items.map((item) => item._id);
    const count = await Category.countDocuments({ _id: { $in: ids } });
    if (count !== items.length || (await Category.countDocuments()) !== items.length) {
      return res.status(409).json({ msg: 'Las categorías cambiaron. Actualiza la lista antes de ordenar.' });
    }
    await Category.bulkWrite(
      items.map((item) => ({
        updateOne: {
          filter: { _id: item._id },
          update: { $set: { order: item.order } },
        },
      })),
    );
    res.json({ success: true });
  }),
);
router.put(
  '/:id',
  handle(async (req, res) => {
    const category = await Category.findById(req.params.id);
    if (!category) return res.status(404).json({ msg: 'Categoría no encontrada.' });
    if (req.body.title !== undefined) category.title = req.body.title;
    if (req.body.order !== undefined) category.order = req.body.order;
    res.json(await category.save());
  }),
);
router.delete(
  '/:id',
  handle(async (req, res) => {
    if (!(await Category.exists({ _id: req.params.id }))) {
      return res.status(404).json({ msg: 'Categoría no encontrada.' });
    }
    await Collection.updateMany({ categoryId: req.params.id }, { $set: { categoryId: null } });
    const category = await Category.findByIdAndDelete(req.params.id);
    if (!category) return res.status(404).json({ msg: 'Categoría no encontrada.' });
    res.json(true);
  }),
);
module.exports = router;
