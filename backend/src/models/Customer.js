const mongoose = require('mongoose');

const CustomerSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, index: true },
  phone: { type: String, default: '', index: true },
  address: { type: String, default: '' },
  notes: { type: String, default: '' },
  totalPurchased: { type: Number, default: 0 },
  totalPaid: { type: Number, default: 0 },
  totalDue: { type: Number, default: 0 },
}, { timestamps: true });

CustomerSchema.index({ name: 'text', phone: 'text' });

module.exports = mongoose.model('Customer', CustomerSchema);
