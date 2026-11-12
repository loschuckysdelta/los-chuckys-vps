const { Schema, model } = require('mongoose');
const { timestamps } = require('../utils/data');
const { storedFile, serializeMedia } = require('../utils/media-url');

const CollectionSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    categoryId: { type: Schema.Types.ObjectId, ref: 'Category', default: null },
    subtitle: { type: String, trim: true, default: '' },
    banner: { type: Object, default: {}, set: storedFile },
    status: { type: Boolean, default: true },
    order: { type: Number, default: 0 },
    slug: { type: String, required: true, unique: true, trim: true },
  },
  timestamps,
);

CollectionSchema.set('toJSON', { transform: serializeMedia('banner') });
module.exports = model('Collection', CollectionSchema);
