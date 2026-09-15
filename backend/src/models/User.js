const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
  name: { type: String, default: '' },
  passwordHash: { type: String, required: true },
  role: { type: String, enum: ['ADMIN', 'STAFF'], default: 'STAFF', index: true },
  permissions: { type: [String], default: [] }, // for STAFF configurable, e.g. ['sales.create','products.view']
  active: { type: Boolean, default: true },
}, { timestamps: true });

module.exports = mongoose.model('User', UserSchema);
