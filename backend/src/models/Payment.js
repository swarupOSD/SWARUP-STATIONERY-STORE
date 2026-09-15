const mongoose = require('mongoose');

const PaymentSchema = new mongoose.Schema({
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true, index: true },
  customerName: { type: String, default: '' },
  amount: { type: Number, required: true, min: 0.01 },
  method: { type: String, enum: ['CASH','UPI','PHONEPE','GPAY','BANK','OTHER_UPI','OTHER'], required: true },
  reference: { type: String, default: '' },
  notes: { type: String, default: '' },
  paymentDate: { type: String, required: true, index: true },
  paymentTime: { type: String, required: true },
  timezone: { type: String, default: 'Asia/Kolkata' },
  receivedBy: { type: String, default: '' },
}, { timestamps: true });

module.exports = mongoose.model('Payment', PaymentSchema);
