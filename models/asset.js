const { Schema, model } = require('mongoose');
const { timestamps } = require('../utils/data');
const { storedFile, serializeMedia } = require('../utils/media-url');

const AssetSchema = new Schema(
  {
    collectionId: { type: Schema.Types.ObjectId, ref: 'Collection', required: true },
    file: { type: Object, required: true, set: storedFile },
    type: { type: String, enum: ['image', 'video'], required: true },
    status: { type: Boolean, default: true },
    order: { type: Number, default: 0 },
    views: { type: Number, default: 0, min: 0, validate: Number.isSafeInteger },
    likes: { type: Number, default: 0, min: 0, validate: Number.isSafeInteger },
  },
  timestamps,
);

AssetSchema.set('toJSON', { transform: serializeMedia('file') });
module.exports = model('Asset', AssetSchema);
