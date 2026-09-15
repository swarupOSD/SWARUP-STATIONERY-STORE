const mongoose = require('mongoose');

const UNITS = ['piece','packet','box','bottle','can','pouch','kg','gram','liter','ml','dozen','pack','cigarette','other'];

const ProductSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, index: true },
  nameBn: { type: String, default: '' },
  aliases: { type: [String], default: [], index: true },
  category: { type: String, default: 'Other', index: true },
  subcategory: { type: String, default: '' },
  imageUrl: { type: String, default: '' },
  imagePublicId: { type: String, default: '' },
  productLink: { type: String, default: '' },
  sku: { type: String, default: '', index: true, sparse: true, trim: true },
  barcode: { type: String, default: '', index: true, sparse: true, trim: true },
  qrCode: { type: String, default: '' },
  purchasePrice: { type: Number, required: true, min: 0 },
  sellingPrice: { type: Number, required: true, min: 0 },
  stock: { type: Number, required: true, default: 0 }, // base units (e.g. cigarettes)
  minStock: { type: Number, default: 5 },
  unit: { type: String, enum: UNITS, default: 'piece' },
  packSize: { type: Number, default: 1, min: 1 }, // base units per sale pack (e.g. 10 cigarettes per packet)
  supplier: { type: String, default: '' },
  brand: { type: String, default: '' },
  tax: { type: Number, default: 0, min: 0 },
  discount: { type: Number, default: 0, min: 0 },
  notes: { type: String, default: '' },
  active: { type: Boolean, default: true, index: true },
}, { timestamps: true });

ProductSchema.index({ name: 'text', nameBn: 'text', brand: 'text', aliases: 'text' });

module.exports = mongoose.model('Product', ProductSchema);
module.exports.UNITS = UNITS;
