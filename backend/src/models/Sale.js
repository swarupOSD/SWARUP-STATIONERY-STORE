const mongoose = require('mongoose');

const SaleItemSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  name: { type: String, required: true }, // snapshot
  unit: { type: String, default: 'piece' },
  qty: { type: Number, required: true, min: 0 }, // sale packs (e.g. packets)
  baseQty: { type: Number, required: true, min: 0 }, // base units deducted
  rate: { type: Number, required: true, min: 0 }, // snapshot selling price per sale pack
  purchasePriceSnapshot: { type: Number, required: true, min: 0 }, // per base unit cost snapshot
  lineTotal: { type: Number, required: true, min: 0 },
  lineCost: { type: Number, required: true, min: 0 },
}, { _id: false });

const PaymentBreakdownSchema = new mongoose.Schema({
  method: { type: String, enum: ['CASH','UPI','PHONEPE','GPAY','BANK','OTHER_UPI','DUE','OTHER'], required: true },
  amount: { type: Number, required: true, min: 0 },
  ref: { type: String, default: '' },
}, { _id: false });

const SaleSchema = new mongoose.Schema({
  receiptNumber: { type: String, required: true, unique: true, index: true },
  idempotencyKey: { type: String, required: true, unique: true, index: true },
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', default: null, index: true },
  customerName: { type: String, default: 'Walk-in' },
  items: { type: [SaleItemSchema], required: true },
  subtotal: { type: Number, required: true, min: 0 },
  discount: { type: Number, default: 0, min: 0 },
  tax: { type: Number, default: 0, min: 0 },
  total: { type: Number, required: true, min: 0 },
  paid: { type: Number, required: true, min: 0 },
  due: { type: Number, required: true, min: 0 },
  change: { type: Number, default: 0, min: 0 },
  paymentMethod: { type: String, enum: ['CASH','UPI','PHONEPE','GPAY','BANK','OTHER_UPI','DUE','MIXED','OTHER'], required: true, index: true },
  paymentBreakdown: { type: [PaymentBreakdownSchema], default: [] },
  upiTxnId: { type: String, default: '' },
  profit: { type: Number, default: 0 },
  status: { type: String, enum: ['COMPLETED','VOIDED'], default: 'COMPLETED', index: true },
  voidReason: { type: String, default: '' },
  cashier: { type: String, default: '' },
  cashierId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  transactionDate: { type: String, required: true, index: true }, // YYYY-MM-DD IST
  transactionTime: { type: String, required: true }, // HH:MM:SS IST
  timezone: { type: String, default: 'Asia/Kolkata' },
}, { timestamps: true });

SaleSchema.index({ transactionDate: 1, status: 1 });
SaleSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Sale', SaleSchema);
