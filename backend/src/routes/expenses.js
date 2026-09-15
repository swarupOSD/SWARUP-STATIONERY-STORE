const express = require('express');
const Expense = require('../models/Expense');
const { auth, requirePerm } = require('../middleware/auth');
const { audit } = require('../middleware/common');
const { istParts } = require('../utils/ist');

const router = express.Router();
router.use(auth);

router.get('/', async (req, res, next) => {
  try {
    const { date = '', category = '', page = '1', limit = '50' } = req.query;
    const f = {};
    if (date) f.expenseDate = date;
    if (category) f.category = category;
    const pg = Math.max(1, parseInt(page, 10) || 1), lim = Math.min(100, parseInt(limit, 10) || 50);
    const [items, total] = await Promise.all([
      Expense.find(f).sort({ expenseDate: -1, createdAt: -1 }).skip((pg - 1) * lim).limit(lim),
      Expense.countDocuments(f),
    ]);
    const sum = await Expense.aggregate([{ $match: f }, { $group: { _id: null, total: { $sum: '$amount' } } }]);
    res.json({ items, total, page: pg, limit: lim, sum: sum[0]?.total || 0 });
  } catch (e) { next(e); }
});

router.post('/', requirePerm('purchases.create'), async (req, res, next) => {
  try {
    const { title, category = 'Other', amount, method = 'CASH', notes = '' } = req.body;
    if (!String(title || '').trim() || !(Number(amount) > 0)) return res.status(400).json({ error: 'Title and valid amount are required.' });
    if (!['Rent', 'Electricity', 'Transport', 'Salary', 'Food/Tea', 'Repair', 'Fees/Tax', 'Other'].includes(category)) return res.status(400).json({ error: 'Invalid category.' });
    if (!['CASH', 'UPI', 'BANK', 'OTHER'].includes(method)) return res.status(400).json({ error: 'Invalid method.' });
    const { date, time } = istParts();
    const doc = await Expense.create({ title: String(title).trim(), category, amount: Number(amount), method, notes, expenseDate: date, expenseTime: time, addedBy: req.user.username });
    await audit(req.user, 'EXPENSE_ADDED', 'expense', doc._id, { title: doc.title, amount: doc.amount });
    res.status(201).json(doc);
  } catch (e) { next(e); }
});

router.delete('/:id', requirePerm('purchases.create'), async (req, res, next) => {
  try {
    const doc = await Expense.findByIdAndDelete(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Expense not found.' });
    await audit(req.user, 'EXPENSE_DELETED', 'expense', req.params.id, { title: doc.title, amount: doc.amount });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;
