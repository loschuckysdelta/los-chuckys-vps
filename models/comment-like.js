const { Schema, model } = require('mongoose');
const schema = new Schema({
  commentId: { type: Schema.Types.ObjectId, ref: 'Comment', required: true },
  userId: { type: Schema.Types.ObjectId, ref: 'SiteUser', required: true },
});
schema.index({ commentId: 1, userId: 1 }, { unique: true });
module.exports = model('CommentLike', schema);
