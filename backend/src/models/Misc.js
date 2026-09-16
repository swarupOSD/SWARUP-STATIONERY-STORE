const mongoose = require('mongoose');

const PriceHistorySchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
  oldPurchasePrice: { type: Number, default: 0 },
  newPurchasePrice: { type: Number, default: 0 },
  oldSellingPrice: { type: Number, default: 0 },
  newSellingPrice: { type: Number, default: 0 },
  changedBy: { type: String, default: '' },
  date: { type: String, required: true },
  time: { type: String, required: true },
}, { timestamps: true });

const AuditLogSchema = new mongoose.Schema({
  user: { type: String, default: '' },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  action: { type: String, required: true, index: true },
  entity: { type: String, default: '' },
  entityId: { type: String, default: '' },
  timestamp: { type: Date, default: Date.now, index: true },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: false });
AuditLogSchema.index({ timestamp: -1 });

const CounterSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  seq: { type: Number, default: 0 },
});

const SettingsSchema = new mongoose.Schema({
  key: { type: String, default: 'shop', unique: true },
  shopName: { type: String, default: 'Swarup Stationery Store' },
  shopNameBn: { type: String, default: 'স্বরূপ স্টেশনারি স্টোর' },
  address: { type: String, default: '' },
  phone: { type: String, default: '' },
  gst: { type: String, default: '' },
  upiId: { type: String, default: '' },
  upiName: { type: String, default: '' },
  qrImageUrl: { type: String, default: '' },
  qrPublicId: { type: String, default: '' },
  logoUrl: { type: String, default: '' },
  logoPublicId: { type: String, default: '' },
  receiptFooter: { type: String, default: 'Thank you! Visit again. ধন্যবাদ!' },
  taxEnabled: { type: Boolean, default: false },
  negativeStockAllowed: { type: Boolean, default: false },
  lowStockThreshold: { type: Number, default: 5 },
  language: { type: String, enum: ['en','bn'], default: 'en' },
  theme: { type: String, enum: ['puja','light','dark'], default: 'puja' },
  pujaMode: { type: Boolean, default: true },
  staffPermissions: { type: mongoose.Schema.Types.Mixed, default: {} },
  defaultMarginPct: { type: Number, default: 0, min: 0, max: 200 },
}, { timestamps: true });

const DailyClosingSchema = new mongoose.Schema({
  date: { type: String, required: true, unique: true }, // YYYY-MM-DD
  closed: { type: Boolean, default: true },
  closedBy: { type: String, default: '' },
  reopenReason: { type: String, default: '' },
  summary: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: true });

const DocumentSchema = new mongoose.Schema({
  title: { type: String, default: '' },
  category: { type: String, enum: ['Sales Reports','Purchase Bills','Customer Statements','Daily Reports','Personal Purchases','Invoices','Other Documents'], default: 'Other Documents', index: true },
  fileUrl: { type: String, required: true },
  publicId: { type: String, default: '' },
  mimeType: { type: String, default: '' },
  filename: { type: String, default: '' },
  supplier: { type: String, default: '' },
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', default: null },
  invoiceId: { type: String, default: '' },
  receiptNumber: { type: String, default: '' },
  docDate: { type: String, default: '' },
  uploadedBy: { type: String, default: '' },
}, { timestamps: true });

const InvoiceImportSchema = new mongoose.Schema({
  supplier: { type: String, default: '' },
  invoiceNumber: { type: String, default: '' },
  orderNumber: { type: String, default: '' },
  invoiceDate: { type: String, default: '' },
  paymentStatus: { type: String, default: '' },
  items: { type: mongoose.Schema.Types.Mixed, default: [] },
  subtotal: { type: Number, default: 0 },
  discount: { type: Number, default: 0 },
  tax: { type: Number, default: 0 },
  shipping: { type: Number, default: 0 },
  grandTotal: { type: Number, default: 0 },
  paid: { type: Number, default: 0 },
  due: { type: Number, default: 0 },
  fingerprint: { type: String, default: '', index: true },
  mathWarning: { type: String, default: '' },
  duplicateWarning: { type: Boolean, default: false },
  status: { type: String, enum: ['PENDING','REVIEWED','COMMITTED','REJECTED'], default: 'PENDING' },
  fileUrl: { type: String, default: '' },
  filePublicId: { type: String, default: '' },
  rawText: { type: String, default: '' },
  docType: { type: String, enum: ['flipkart', 'generic'], default: 'generic' },
  parseNotes: { type: [String], default: [] },
}, { timestamps: true });

const PersonalPurchaseSchema = new mongoose.Schema({
  owner: { type: String, enum: ['My Purchase',"Father's Purchase","Mother's Purchase"], required: true, index: true },
  productName: { type: String, required: true },
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', default: null },
  qty: { type: Number, required: true, min: 0 },
  price: { type: Number, required: true, min: 0 },
  total: { type: Number, required: true, min: 0 },
  supplier: { type: String, default: '' },
  source: { type: String, default: 'Local Shop' },
  paid: { type: Number, default: 0 },
  method: { type: String, enum: ['CASH', 'UPI', 'BANK', 'OTHER', ''], default: '' }, // cash na online
  account: { type: String, default: '' }, // kar account theke gelo: Amar PhonePe / Cash ...
  billUrl: { type: String, default: '' },
  billPublicId: { type: String, default: '' },
  addToStock: { type: Boolean, default: false },
  stockApplied: { type: Boolean, default: false },
  purchaseDate: { type: String, required: true, index: true },
  purchaseTime: { type: String, required: true },
  timezone: { type: String, default: 'Asia/Kolkata' },
  createdBy: { type: String, default: '' },
}, { timestamps: true });

module.exports = {
  PriceHistory: mongoose.model('PriceHistory', PriceHistorySchema),
  AuditLog: mongoose.model('AuditLog', AuditLogSchema),
  Counter: mongoose.model('Counter', CounterSchema),
  Settings: mongoose.model('Settings', SettingsSchema),
  DailyClosing: mongoose.model('DailyClosing', DailyClosingSchema),
  Document: mongoose.model('Document', DocumentSchema),
  InvoiceImport: mongoose.model('InvoiceImport', InvoiceImportSchema),
  PersonalPurchase: mongoose.model('PersonalPurchase', PersonalPurchaseSchema),
};
