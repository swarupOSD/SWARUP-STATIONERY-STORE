const mongoose = require('mongoose');

const StockMovementSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
  productName: { type: String, default: '' },
  type: { type: String, enum: ['PURCHASE','SALE','SALE_VOID','PURCHASE_VOID','ADJUSTMENT','PERSONAL_PURCHASE','PERSONAL_USE','RETURN','OPENING_STOCK'], required: true, index: true },
  quantityDelta: { type: Number, required: true }, // base units (+/-)
  before: { type: Number, required: true },
  after: { type: Number, required: true },
  reference: { type: String, default: '' },
  referenceId: { type: String, default: '' },
  reason: { type: String, default: '' },
  date: { type: String, required: true, index: true },
  time: { type: String, required: true },
  timezone: { type: String, default: 'Asia/Kolkata' },
  user: { type: String, default: '' },
}, { timestamps: true });

module.exports = mongoose.model('StockMovement', StockMovementSchema);
