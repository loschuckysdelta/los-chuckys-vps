const { Schema, model } = require('mongoose');
const { timestamps } = require('../utils/data');

module.exports = model('Category', new Schema({
  title: { type: String, required: true, trim: true },
  order: { type: Number, default: 0, min: 0, validate: Number.isSafeInteger },
}, { ...timestamps, versionKey: false }), 'category');
