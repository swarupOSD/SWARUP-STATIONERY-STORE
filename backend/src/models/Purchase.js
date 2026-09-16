const mongoose = require('mongoose');

const PurchaseItemSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', default: null },
  name: { type: String, required: true },
  qty: { type: Number, required: true, min: 0 }, // packs
  baseQty: { type: Number, default: 0 }, // base units added
  unitPrice: { type: Number, required: true, min: 0 },
  sellingPrice: { type: Number, default: 0 },
  lineTotal: { type: Number, required: true, min: 0 },
}, { _id: false });

const PurchaseSchema = new mongoose.Schema({
  invoiceNumber: { type: String, default: '', index: true },
  orderNumber: { type: String, default: '' },
  supplier: { type: String, default: '' },
  supplierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', default: null, index: true },
  source: { type: String, enum: ['Local Shop','Flipkart','Amazon','Supplier','Other'], default: 'Local Shop' },
  owner: { type: String, enum: ['Shop',"My Purchase","Father's Purchase","Mother's Purchase"], default: 'Shop' },
  items: { type: [PurchaseItemSchema], required: true },
  subtotal: { type: Number, required: true, min: 0 },
  discount: { type: Number, default: 0 },
  tax: { type: Number, default: 0 },
  shipping: { type: Number, default: 0 },
  grandTotal: { type: Number, required: true, min: 0 },
  paid: { type: Number, default: 0 },
  due: { type: Number, default: 0 },
  payMethod: { type: String, enum: ['', 'CASH', 'UPI', 'BANK', 'OTHER'], default: '' }, // cash na online
  fundedBy: { type: String, default: '' }, // kar taka: Cash / Amar PhonePe / ...
  addToStock: { type: Boolean, default: true },
  billUrl: { type: String, default: '' },
  billPublicId: { type: String, default: '' },
  fingerprint: { type: String, default: '', index: true },
  status: { type: String, enum: ['COMPLETED','VOIDED'], default: 'COMPLETED' },
  purchaseDate: { type: String, required: true, index: true },
  purchaseTime: { type: String, required: true },
  timezone: { type: String, default: 'Asia/Kolkata' },
  createdBy: { type: String, default: '' },
}, { timestamps: true });

PurchaseSchema.index({ supplier: 1, invoiceNumber: 1 });

module.exports = mongoose.model('Purchase', PurchaseSchema);
