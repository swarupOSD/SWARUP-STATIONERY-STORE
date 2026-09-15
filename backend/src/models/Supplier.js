const mongoose = require('mongoose');

const SupplierSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, index: true },
  phone: { type: String, default: '' },
  address: { type: String, default: '' },
  notes: { type: String, default: '' },
}, { timestamps: true });

module.exports = mongoose.model('Supplier', SupplierSchema);
