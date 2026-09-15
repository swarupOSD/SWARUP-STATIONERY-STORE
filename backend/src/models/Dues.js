const mongoose = require('mongoose');

const SupplierPaymentSchema = new mongoose.Schema({
  supplierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', default: null, index: true },
  supplierName: { type: String, required: true, trim: true, index: true },
  amount: { type: Number, required: true, min: 0.01 },
  method: { type: String, enum: ['CASH', 'UPI', 'BANK', 'OTHER'], default: 'CASH' },
  reference: { type: String, default: '' },
  notes: { type: String, default: '' },
  paymentDate: { type: String, required: true, index: true },
  paymentTime: { type: String, required: true },
  timezone: { type: String, default: 'Asia/Kolkata' },
  paidBy: { type: String, default: '' },
  // FIFO allocation across purchase dues, kept for audit
  allocations: [{ purchaseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Purchase' }, invoiceNumber: { type: String, default: '' }, amount: { type: Number, default: 0 } }],
}, { timestamps: true });

const ReturnSchema = new mongoose.Schema({
  saleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Sale', required: true, index: true },
  receiptNumber: { type: String, default: '', index: true },
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', default: null },
  customerName: { type: String, default: '' },
  items: [{
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    name: { type: String, default: '' },
    qty: { type: Number, required: true, min: 0 },
    baseQty: { type: Number, default: 0 },
    rate: { type: Number, default: 0 },
    lineTotal: { type: Number, default: 0 },
    lineCost: { type: Number, default: 0 },
  }],
  refundTotal: { type: Number, required: true, min: 0 },
  refundCost: { type: Number, default: 0 },
  refundMethod: { type: String, enum: ['CASH', 'UPI', 'BANK', 'ADJUST_DUE', 'OTHER'], default: 'CASH' },
  reason: { type: String, default: '' },
  returnDate: { type: String, required: true, index: true },
  returnTime: { type: String, required: true },
  timezone: { type: String, default: 'Asia/Kolkata' },
  handledBy: { type: String, default: '' },
}, { timestamps: true });

module.exports = {
  SupplierPayment: mongoose.model('SupplierPayment', SupplierPaymentSchema),
  Return: mongoose.model('Return', ReturnSchema),
};
