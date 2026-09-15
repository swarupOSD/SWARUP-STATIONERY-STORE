const mongoose = require('mongoose');

// Shop running costs (NOT stock): rent, electricity, transport, salary, tea...
const ExpenseSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  category: {
    type: String, enum: ['Rent', 'Electricity', 'Transport', 'Salary', 'Food/Tea', 'Repair', 'Fees/Tax', 'Other'],
    default: 'Other', index: true,
  },
  amount: { type: Number, required: true, min: 0.01 },
  method: { type: String, enum: ['CASH', 'UPI', 'BANK', 'OTHER'], default: 'CASH' },
  notes: { type: String, default: '' },
  expenseDate: { type: String, required: true, index: true }, // YYYY-MM-DD IST
  expenseTime: { type: String, required: true },
  timezone: { type: String, default: 'Asia/Kolkata' },
  addedBy: { type: String, default: '' },
}, { timestamps: true });

module.exports = mongoose.model('Expense', ExpenseSchema);
