const mongoose = require('mongoose');
const Comment = require('../models/comment');
const Like = require('../models/comment-like');
const Report = require('../models/comment-report');
const Asset = require('../models/asset');
const User = require('../models/user');
const Session = require('../models/session');
// Serializa las mutaciones locales. En replica set, MongoDB asegura además la transacción.
let tail = Promise.resolve();
async function mutation(work) {
  const previous = tail;
  let release;
  tail = new Promise((resolve) => {
    release = resolve;
  });
  await previous;
  try {
    const hello = await mongoose.connection.db.admin().command({ hello: 1 });
    if (hello.setName || hello.msg === 'isdbgrid') {
      const session = await mongoose.startSession();
      try {
        return await session.withTransaction(() => work(session));
      } finally {
        await session.endSession();
      }
    }
    return await work(null);
  } finally {
    release();
  }
}
async function deleteTree(ids, session) {
  const replies = await Comment.find({ parentId: { $in: ids } }, '_id')
    .session(session)
    .lean();
  const all = [...ids, ...replies.map((row) => row._id)];
  await Like.deleteMany({ commentId: { $in: all } }, { session });
  await Report.deleteMany({ commentId: { $in: all } }, { session });
  await Comment.deleteMany({ _id: { $in: all } }, { session });
}
async function deleteCommentsByCollections(collectionIds, session) {
  const comments = await Comment.find({ collectionId: { $in: collectionIds } }, '_id')
    .session(session)
    .lean();
  await deleteTree(
    comments.map((row) => row._id),
    session,
  );
}
async function deleteAsset(id) {
  return mutation(async (session) => {
    const asset = await Asset.findById(id).session(session);
    if (!asset) return null;
    await Asset.deleteOne({ _id: id }, { session });
    return asset;
  });
}
async function deleteUserWithComments(id) {
  return mutation(async (session) => {
    const comments = await Comment.find({ userId: id }, '_id').session(session).lean();
    await deleteTree(
      comments.map((row) => row._id),
      session,
    );
    const likes = await Like.find({ userId: id }).session(session).lean();
    for (const like of likes) {
      await Comment.updateOne(
        { _id: like.commentId, likesCount: { $gt: 0 } },
        { $inc: { likesCount: -1 } },
        { session },
      );
    }
    await Like.deleteMany({ userId: id }, { session });
    await Report.deleteMany({ userId: id }, { session });
    await Session.deleteMany({ user: id }, { session });
    await User.deleteOne({ _id: id }, { session });
  });
}
module.exports = { mutation, deleteTree, deleteCommentsByCollections, deleteAsset, deleteUserWithComments };
