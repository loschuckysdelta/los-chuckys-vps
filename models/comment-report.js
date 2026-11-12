const { Schema, model } = require('mongoose');
const { timestamps } = require('../utils/data');
const schema = new Schema(
  {
    commentId: { type: Schema.Types.ObjectId, ref: 'Comment', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'SiteUser', required: true },
    reason: { type: String, required: true, trim: true, maxlength: 500 },
  },
  { timestamps: { ...timestamps.timestamps, updatedAt: false } },
);
schema.index({ commentId: 1, userId: 1 }, { unique: true });
module.exports = model('CommentReport', schema);
