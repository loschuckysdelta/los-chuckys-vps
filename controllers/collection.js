const { response } = require('express');
const Collection = require('../models/collection');
const Asset = require('../models/asset');
const Category = require('../models/category');
const { isObjectIdOrHexString } = require('mongoose');
async function validateCategory(data) {
  if (data.categoryId === undefined) return;
  if (data.categoryId === null || data.categoryId === '' || data.categoryId === 'null') {
    data.categoryId = null;
    return;
  }
  if (!isObjectIdOrHexString(data.categoryId) || !(await Category.exists({ _id: data.categoryId }))) {
    throw Object.assign(new Error('Categoría inválida o inexistente.'), { status: 400 });
  }
}
const { deleteAsset, uploadAsset, publicUrl, cleanCollectionFolder } = require('../middlewares/storage');

const create_collection = async (req, res = response) => {
  try {
    const data = req.body;
    await validateCategory(data);

    const collection = new Collection({
      ...data,
      banner: {},
    });

    if (req.files?.banner) {
      const file = req.files.banner;
      const folder = `${collection._id}`;
      collection.banner = await uploadAsset(file, folder, 'image');
    }
    let saved;
    try {
      saved = await collection.save();
    } catch (err) {
      if (collection.banner?.public_id) await deleteAsset(collection.banner.public_id);
      throw err;
    }
    return res.json(saved);
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(400).json({ msg: 'El slug ya existe.' });
    }
    return res.status(err.status || 500).json({ msg: err?.message });
  }
};

const update_collection = async (req, res = response) => {
  try {
    const data = req.body;
    const id = data._id || req.params.id;
    await validateCategory(data);

    const collection = await Collection.findById(id);
    if (!collection) {
      return res.status(404).json({ msg: 'Collection no encontrada.' });
    }

    const previousBanner = collection.banner;
    if (req.files?.banner) {
      const file = req.files.banner;
      const folder = `${collection._id}`;
      const bannerInfo = await uploadAsset(file, folder, 'image');
      data.banner = bannerInfo;
    }

    Object.assign(collection, data);

    let updated;
    try {
      updated = await collection.save();
    } catch (err) {
      if (req.files?.banner && data.banner?.public_id) await deleteAsset(data.banner.public_id);
      throw err;
    }
    if (req.files?.banner && previousBanner?.public_id) {
      await deleteAsset(previousBanner.public_id);
    }
    return res.json(updated);
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(400).json({ msg: 'El slug ya existe.' });
    }
    return res.status(err.status || 500).json({ msg: err?.message });
  }
};

const read_collections = async (req, res = response) => {
  try {
    const collections = await Collection.find().sort({ order: 1 });
    const totals = await Asset.aggregate([
      { $match: { collectionId: { $in: collections.map((item) => item._id) } } },
      {
        $group: {
          _id: '$collectionId',
          views: { $sum: { $ifNull: ['$views', 0] } },
          likes: { $sum: { $ifNull: ['$likes', 0] } },
        },
      },
    ]);
    const byCollection = new Map(totals.map((item) => [String(item._id), item]));
    return res.json(
      collections.map((item) => ({
        ...item.toJSON(),
        views: byCollection.get(String(item._id))?.views ?? 0,
        likes: byCollection.get(String(item._id))?.likes ?? 0,
      })),
    );
  } catch (err) {
    return res.status(err.status || 500).json({ msg: err?.message });
  }
};

const get_collection = async (req, res = response) => {
  try {
    const id = req.params.id;
    const collection = await Collection.findById(id);
    if (!collection) {
      return res.status(404).json({ msg: 'Collection no encontrada.' });
    }
    return res.json(collection);
  } catch (err) {
    return res.status(err.status || 500).json({ msg: err?.message });
  }
};

const delete_collection = async (req, res = response) => {
  try {
    const id = req.params.id;

    const collectionAssets = await Asset.find({ collectionId: id }, '_id').lean();
    const assetsCount = collectionAssets.length;
    if (assetsCount > 0) {
      return res.status(400).json({
        msg: 'Para eliminar esto, primero tienes que eliminar los items de esta galería.',
      });
    }

    const reg = await require('../utils/comment-cascade').mutation(async (session) => {
      await require('../utils/comment-cascade').deleteCommentsByCollections(
        [id],
        session,
      );
      return Collection.findByIdAndDelete(id, { session });
    });
    if (!reg) {
      return res.status(404).json({ msg: 'Collection no encontrada.' });
    }

    if (reg?.banner?.public_id) {
      const resourceType = reg.banner?.resource_type || 'image';
      await deleteAsset(reg.banner.public_id, resourceType);
    }
    await cleanCollectionFolder(id);

    return res.json(true);
  } catch (err) {
    return res.status(err.status || 500).json({ msg: err?.message });
  }
};

const update_collections_order = async (req, res = response) => {
  try {
    const { items } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ msg: 'Items inválidos.' });
    }

    const bulk = items.map((x) => ({
      updateOne: {
        filter: { _id: x._id },
        update: { $set: { order: x.order } },
      },
    }));

    await Collection.bulkWrite(bulk, { ordered: true });

    return res.json({ success: true });
  } catch (err) {
    return res.status(err.status || 500).json({ msg: err?.message });
  }
};

const getResources = async (req, res = response) => {
  try {
    const { gallery } = req.query;

    if (gallery) {
      const collection = await Collection.findOne({ slug: gallery, status: true })
        .select('title subtitle banner categoryId')
        .populate('categoryId', 'title');

      if (!collection) {
        return res.status(404).json({ msg: 'Galería no encontrada' });
      }

      const assets = await Asset.find({ collectionId: collection._id, status: true })
        .sort({ order: 1, _id: 1 })
        .select('title file type order views likes');

      return res.json({
        collectionId: collection._id,
        title: collection.title,
        description: collection.subtitle,
        category: collection.categoryId?.title ?? null,
        banner: publicUrl(collection.banner),
        resources: assets.map((a) => ({
          _id: a._id,
          title: a.title || '',
          type: a.type,
          url: publicUrl(a.file),
          views: a.views ?? 0,
          likes: a.likes ?? 0,
        })),
      });
    }

    const collections = await Collection.find({ status: true })
      .sort({ order: 1 })
      .select('title subtitle slug banner categoryId')
      .populate('categoryId', 'title');

    const totals = await Asset.aggregate([
      { $match: { collectionId: { $in: collections.map((item) => item._id) } } },
      {
        $group: {
          _id: '$collectionId',
          views: { $sum: { $ifNull: ['$views', 0] } },
          likes: { $sum: { $ifNull: ['$likes', 0] } },
        },
      },
    ]);
    const totalsByCollection = new Map(totals.map((item) => [String(item._id), item]));

    return res.json(
      collections.map((item) => ({
        title: item.title,
        subtitle: item.subtitle,
        slug: item.slug,
        category: item.categoryId?.title ?? null,
        views: totalsByCollection.get(String(item._id))?.views ?? 0,
        likes: totalsByCollection.get(String(item._id))?.likes ?? 0,
        image: publicUrl(item.banner),
      })),
    );
  } catch (err) {
    return res.status(500).json({ msg: err.message });
  }
};

module.exports = {
  create_collection,
  get_collection,
  read_collections,
  update_collection,
  delete_collection,
  update_collections_order,
  getResources,
};
