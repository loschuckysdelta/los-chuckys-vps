const { Schema, model } = require('mongoose');
const { timestamps } = require('../utils/data');
const schema = new Schema(
  {
    collectionId: { type: Schema.Types.ObjectId, ref: 'Collection', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'SiteUser', required: true },
    parentId: { type: Schema.Types.ObjectId, ref: 'Comment', default: null },
    text: { type: String, trim: true, required: true, minlength: 1, maxlength: 500 },
    likesCount: { type: Number, default: 0, min: 0 },
    hidden: { type: Boolean, default: false },
    editedAt: { type: Date, default: null },
  },
  timestamps,
);
schema.index({ collectionId: 1, parentId: 1, created_at: -1 });
schema.index({ parentId: 1, created_at: 1 });
module.exports = model('Comment', schema);
