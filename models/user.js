const mongoose = require('mongoose');
module.exports =
  mongoose.models.SiteUser ||
  mongoose.model(
    'SiteUser',
    new mongoose.Schema(
      {
        googleSub: { type: String, required: true, unique: true },
        email: { type: String, required: true },
        name: String,
        picture: String,
        lastLoginAt: Date,
        gender: { type: String, default: '' },
        active: { type: Boolean, default: true },
        commentBan: { type: Date, default: null },
      },
      { timestamps: true, collection: 'users' },
    ),
  );
