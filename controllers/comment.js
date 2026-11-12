const mongoose = require('mongoose');
const Comment = require('../models/comment');
const Like = require('../models/comment-like');
const Report = require('../models/comment-report');
const Collection = require('../models/collection');
const User = require('../models/user');
const { cleanText } = require('../utils/comment-validation');
const { mutation, deleteTree } = require('../utils/comment-cascade');
const fail = (status, message) => {
  throw Object.assign(Error(message), { status });
};
async function album(id, session = null) {
  const found = await Collection.findOne({ _id: id, status: true }).session(session).lean();
  if (!found) fail(404, 'Álbum no disponible.');
}
async function visible(id, session = null) {
  const comment = await Comment.findOne({ _id: id, hidden: false }).session(session);
  if (!comment) fail(404, 'Comentario no disponible.');
  await album(comment.collectionId, session);
  if (comment.parentId && !(await Comment.exists({ _id: comment.parentId, hidden: false }).session(session)))
    fail(404, 'Comentario no disponible.');
  return comment;
}
async function allowedUser(id, session) {
  const user = await User.findOne({ _id: id, active: { $ne: false } }).session(session);
  if (!user) fail(401, 'Tu sesión ya no está disponible.');
  return user;
}
async function textFor(req, collectionId, exclude, session) {
  const user = await allowedUser(req.user._id, session);
  if (user.commentBan && user.commentBan > new Date())
    fail(403, 'Tienes temporalmente bloqueada la publicación de comentarios.');
  const text = cleanText(req.body.text);
  const filter = { userId: user._id, collectionId };
  if (exclude) filter._id = { $ne: exclude };
  const last = await Comment.findOne(filter).sort({ created_at: -1, _id: -1 }).session(session).lean();
  if (last?.text === text) fail(400, 'Ya publicaste ese mismo comentario.');
  return text;
}
async function serialize(req, rows) {
  const likes = req.user
    ? await Like.find({ userId: req.user._id, commentId: { $in: rows.map((row) => row._id) } }, 'commentId').lean()
    : [];
  const liked = new Set(likes.map((row) => String(row.commentId)));
  return rows.map((row) => {
    const isOwner = !!req.user && String(row.userId?._id) === String(req.user._id);
    return {
      id: String(row._id),
      collectionId: String(row.collectionId),
      parentId: row.parentId ? String(row.parentId) : null,
      text: row.text,
      likesCount: row.likesCount,
      editedAt: row.editedAt,
      createdAt: row.created_at,
      author: { name: row.userId?.name || 'Usuario eliminado', picture: row.userId?.picture || '' },
      isOwner,
      canDelete: isOwner || !!req.isAdmin,
      liked: liked.has(String(row._id)),
    };
  });
}
async function page(req, filter, ascending = false) {
  const number = Math.max(1, Math.min(100000, parseInt(req.query.page, 10) || 1));
  const direction = ascending ? 1 : -1;
  const cursor = req.query.after;
  if (cursor) {
    const [time, id] = String(cursor).split('~');
    const date = new Date(time);
    if (!mongoose.isValidObjectId(id) || !Number.isFinite(date.getTime())) fail(400, 'Cursor inválido.');
    const op = ascending ? '$gt' : '$lt';
    filter = { ...filter, $or: [{ created_at: { [op]: date } }, { created_at: date, _id: { [op]: id } }] };
  }
  const rows = await Comment.find(filter)
    .sort({ created_at: direction, _id: direction })
    .skip(cursor ? 0 : (number - 1) * 20)
    .limit(21)
    .populate('userId', 'name picture')
    .lean();
  const items = await serialize(req, rows.slice(0, 20));
  const last = items.at(-1);
  return {
    items,
    hasMore: rows.length > 20,
    next: rows.length > 20 ? last.createdAt.toISOString() + '~' + last.id : null,
  };
}
exports.list = async (req, res) => {
  const id = req.params.id;
  await album(id);
  const result = await page(req, { collectionId: id, parentId: null, hidden: false });
  const roots = result.items.map((item) => new mongoose.Types.ObjectId(item.id));
  const counts = await Comment.aggregate([
    { $match: { collectionId: new mongoose.Types.ObjectId(id), parentId: { $in: roots }, hidden: false } },
    { $group: { _id: '$parentId', count: { $sum: 1 } } },
  ]);
  const byId = new Map(counts.map((row) => [String(row._id), row.count]));
  for (const item of result.items) item.replyCount = byId.get(item.id) || 0;
  if (!req.query.after && (!req.query.page || Number(req.query.page) === 1)) {
    const totals = await Comment.aggregate([
      { $match: { collectionId: new mongoose.Types.ObjectId(id), hidden: false } },
      { $group: { _id: '$parentId', count: { $sum: 1 } } },
      {
        $lookup: {
          from: Comment.collection.name,
          localField: '_id',
          foreignField: '_id',
          as: 'parent',
          pipeline: [{ $project: { hidden: 1 } }],
        },
      },
      { $match: { $or: [{ _id: null }, { 'parent.hidden': false }] } },
      { $group: { _id: null, count: { $sum: '$count' } } },
    ]);
    result.total = totals[0]?.count || 0;
  }
  res.json(result);
};
exports.replies = async (req, res) => {
  const parent = await visible(req.params.id);
  if (parent.parentId) fail(400, 'Selecciona el comentario principal.');
  res.json(await page(req, { parentId: parent._id, hidden: false }, true));
};
exports.create = async (req, res) => {
  const result = await mutation(async (session) => {
    await album(req.params.id, session);
    let parentId = req.body.parentId || null;
    if (parentId) {
      if (!mongoose.isValidObjectId(parentId)) fail(400, 'Respuesta inválida.');
      const parent = await visible(parentId, session);
      if (parent.parentId || String(parent.collectionId) !== req.params.id)
        fail(400, 'El comentario principal no corresponde a este álbum.');
    }
    const text = await textFor(req, req.params.id, null, session);
    const [comment] = await Comment.create([{ collectionId: req.params.id, userId: req.user._id, parentId, text }], {
      session,
    });
    return comment;
  });
  const populated = await Comment.findById(result._id).populate('userId', 'name picture').lean();
  const [item] = await serialize(req, [populated]);
  res.status(201).json({ id: String(result._id), item: { ...item, replies: [] } });
};
exports.edit = async (req, res) => {
  const comment = await mutation(async (session) => {
    const current = await visible(req.params.id, session);
    if (String(current.userId) !== String(req.user._id)) fail(403, 'Solo el autor puede editar.');
    const text = await textFor(req, current.collectionId, current._id, session);
    return Comment.findOneAndUpdate(
      { _id: current._id, userId: req.user._id },
      { $set: { text, editedAt: new Date() } },
      { new: true, session },
    );
  });
  res.json({ text: comment.text, editedAt: comment.editedAt });
};
exports.remove = async (req, res) => {
  await mutation(async (session) => {
    const filter = { _id: req.params.id };
    if (!req.isAdmin) {
      await allowedUser(req.user._id, session);
      filter.userId = req.user._id;
    }
    const comment = await Comment.findOne(filter).session(session);
    if (!comment) fail(404, 'Comentario no encontrado o sin permiso.');
    await deleteTree([comment._id], session);
  });
  res.sendStatus(204);
};
exports.like = async (req, res) => {
  const result = await mutation(async (session) => {
    await allowedUser(req.user._id, session);
    const comment = await visible(req.params.id, session);
    const filter = { commentId: comment._id, userId: req.user._id };
    const deleted = await Like.findOneAndDelete(filter, { session });
    if (deleted) {
      await Comment.updateOne({ _id: comment._id, likesCount: { $gt: 0 } }, { $inc: { likesCount: -1 } }, { session });
    } else {
      await Like.create([filter], { session });
      await Comment.updateOne({ _id: comment._id }, { $inc: { likesCount: 1 } }, { session });
    }
    const fresh = await Comment.findById(comment._id).session(session).lean();
    return { liked: !deleted, likesCount: fresh.likesCount };
  }).catch(async (error) => {
    if (error.code !== 11000) throw error;
    const comment = await visible(req.params.id);
    return { liked: true, likesCount: comment.likesCount };
  });
  res.json(result);
};
exports.report = async (req, res) => {
  await mutation(async (session) => {
    await allowedUser(req.user._id, session);
    const comment = await visible(req.params.id, session);
    if (String(comment.userId) === String(req.user._id)) fail(400, 'No puedes reportar tu comentario.');
    const reason = cleanText(req.body.reason);
    const report = await Report.updateOne(
      { commentId: comment._id, userId: req.user._id },
      { $setOnInsert: { reason } },
      { upsert: true, session },
    );
    if (!report.upsertedCount) fail(409, 'Ya reportaste este comentario');
    if ((await Report.countDocuments({ commentId: comment._id }).session(session)) >= 3)
      await Comment.updateOne({ _id: comment._id }, { $set: { hidden: true } }, { session });
  });
  res.json({ ok: true });
};
exports.hidden = async (req, res) => res.json(await page(req, { hidden: true }));
exports.restore = async (req, res) => {
  await mutation(async (session) => {
    await Report.deleteMany({ commentId: req.params.id }, { session });
    await Comment.updateOne({ _id: req.params.id }, { $set: { hidden: false } }, { session });
  });
  res.sendStatus(204);
};
exports.ban = async (req, res) => {
  const date = req.body.commentBan === null ? null : new Date(req.body.commentBan);
  if (date && (!Number.isFinite(date.getTime()) || date <= new Date())) fail(400, 'Selecciona una fecha futura.');
  const user = await User.findByIdAndUpdate(req.params.id, { $set: { commentBan: date } });
  if (!user) fail(404, 'Usuario no encontrado.');
  res.sendStatus(204);
};
