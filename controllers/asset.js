const { response } = require('express');
const Asset = require('../models/asset');
const { deleteAsset } = require('../middlewares/storage');

const create_asset = async (req, res = response) => {
  try {
    const data = req.body;

    if (!data?.collectionId) return res.status(400).json({ msg: 'collectionId requerido.' });
    if (!data?.type) return res.status(400).json({ msg: 'type requerido.' });
    if (!data?.file?.public_id || !data?.file?.secure_url) {
      return res.status(400).json({ msg: 'file.public_id y file.secure_url requeridos.' });
    }

    const asset = new Asset({
      collectionId: data.collectionId,
      file: data.file,
      type: data.type,
      status: typeof data.status === 'boolean' ? data.status : String(data.status) === 'true',
      order: Number(data.order ?? 0),
      views: data.views ?? 0,
      likes: data.likes ?? 0,
    });

    const saved = await asset.save();
    return res.json(saved);
  } catch (err) {
    return res.status(500).json({ msg: err?.message });
  }
};

const update_asset = async (req, res = response) => {
  try {
    const data = req.body;
    const id = data._id || req.params.id;

    const asset = await Asset.findById(id);
    if (!asset) return res.status(404).json({ msg: 'Asset no encontrado.' });

    const nextType = String(data.type || asset.type || '');
    const nextFile = data.file;
    const previousFile = asset.file;

    if (nextFile?.public_id && nextFile?.secure_url) {
      asset.file = nextFile;
    }

    if (typeof data.collectionId !== 'undefined') asset.collectionId = data.collectionId;
    if (nextType) asset.type = nextType;

    if (typeof data.status !== 'undefined') {
      asset.status = typeof data.status === 'boolean' ? data.status : String(data.status) === 'true';
    }

    if (typeof data.order !== 'undefined') asset.order = Number(data.order);
    if (typeof data.views !== 'undefined') asset.views = data.views ?? 0;
    if (typeof data.likes !== 'undefined') asset.likes = data.likes ?? 0;

    const updated = await asset.save();
    if (previousFile?.public_id && previousFile.public_id !== updated.file?.public_id) {
      await deleteAsset(previousFile.public_id);
    }
    return res.json(updated);
  } catch (err) {
    return res.status(500).json({ msg: err?.message });
  }
};

const read_assets = async (req, res = response) => {
  try {
    const { collectionId, type, status } = req.query;

    const q = {};
    if (collectionId) q.collectionId = collectionId;
    if (type) q.type = type;
    if (typeof status !== 'undefined') q.status = String(status) === 'true';

    const assets = await Asset.find(q).sort({ order: 1 });
    return res.json(assets);
  } catch (err) {
    return res.status(500).json({ msg: err?.message });
  }
};

const get_asset = async (req, res = response) => {
  try {
    const id = req.params.id;
    const asset = await Asset.findById(id);
    if (!asset) return res.status(404).json({ msg: 'Asset no encontrado.' });
    return res.json(asset);
  } catch (err) {
    return res.status(500).json({ msg: err?.message });
  }
};

const delete_asset = async (req, res = response) => {
  try {
    const id = req.params.id;
    const reg = await require('../utils/comment-cascade').deleteAsset(id);
    if (!reg) return res.status(404).json({ msg: 'Asset no encontrado.' });

    if (reg?.file?.public_id) {
      const resourceType = reg.file?.resource_type || (reg.type === 'video' ? 'video' : 'image');
      await deleteAsset(reg.file.public_id, resourceType);
    }

    return res.json(true);
  } catch (err) {
    return res.status(500).json({ msg: err?.message });
  }
};

const update_assets_order = async (req, res = response) => {
  try {
    const { collectionId, items } = req.body;

    if (!collectionId) return res.status(400).json({ msg: 'collectionId requerido.' });
    if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ msg: 'Items inválidos.' });

    const bulk = items.map((x) => ({
      updateOne: {
        filter: { _id: x._id, collectionId },
        update: { $set: { order: x.order } },
      },
    }));

    await Asset.bulkWrite(bulk, { ordered: true });

    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ msg: err?.message });
  }
};

module.exports = {
  create_asset,
  get_asset,
  read_assets,
  update_asset,
  delete_asset,
  update_assets_order,
};
