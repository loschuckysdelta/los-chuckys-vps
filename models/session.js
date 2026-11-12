const mongoose = require('mongoose');
module.exports =
  mongoose.models.SiteSession ||
  mongoose.model(
    'SiteSession',
    new mongoose.Schema({
      _id: String,
      user: mongoose.Schema.Types.ObjectId,
      expiresAt: { type: Date, expires: 0 },
    }),
  );
