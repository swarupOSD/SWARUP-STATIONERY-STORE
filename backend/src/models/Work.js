const mongoose = require('mongoose');

// Bulk/school order estimate → converts to POS cart, never auto-sells.
const EstimateItemSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  name: { type: String, required: true },
  qty: { type: Number, required: true, min: 1 },
  rate: { type: Number, required: true, min: 0 },
  lineTotal: { type: Number, required: true, min: 0 },
}, { _id: false });

const EstimateSchema = new mongoose.Schema({
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', default: null },
  customerName: { type: String, default: '' },
  phone: { type: String, default: '' },
  items: { type: [EstimateItemSchema], required: true },
  subtotal: { type: Number, required: true, min: 0 },
  discount: { type: Number, default: 0, min: 0 },
  total: { type: Number, required: true, min: 0 },
  validTill: { type: String, default: '' },
  notes: { type: String, default: '' },
  status: { type: String, enum: ['PENDING', 'CONVERTED', 'CANCELLED'], default: 'PENDING', index: true },
  createdBy: { type: String, default: '' },
}, { timestamps: true });

const AttendanceSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  name: { type: String, required: true, trim: true, index: true },
  date: { type: String, required: true, index: true }, // YYYY-MM-DD IST
  inTime: { type: String, default: '' },
  outTime: { type: String, default: '' },
  status: { type: String, enum: ['Present', 'Half-day', 'Leave'], default: 'Present' },
  notes: { type: String, default: '' },
  markedBy: { type: String, default: '' },
}, { timestamps: true });
AttendanceSchema.index({ userId: 1, date: 1 }, { unique: true, sparse: true });

module.exports = {
  Estimate: mongoose.model('Estimate', EstimateSchema),
  Attendance: mongoose.model('Attendance', AttendanceSchema),
};
