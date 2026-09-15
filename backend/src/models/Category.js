const mongoose = require('mongoose');

const CategorySchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true, trim: true },
  nameBn: { type: String, default: '' },
  icon: { type: String, default: '' },
  active: { type: Boolean, default: true },
}, { timestamps: true });

module.exports = mongoose.model('Category', CategorySchema);
