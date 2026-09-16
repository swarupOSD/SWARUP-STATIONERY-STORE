const express = require('express');
const Customer = require('../models/Customer');
const Payment = require('../models/Payment');
const Sale = require('../models/Sale');
const { auth, requirePerm, requireRole } = require('../middleware/auth');
const { audit } = require('../middleware/common');
const { istParts } = require('../utils/ist');
const { header, footer, sendPdf } = require('../services/pdf');
const { Settings } = require('../models/Misc');

const router = express.Router();
router.use(auth);

router.get('/', async (req, res, next) => {
  try {
    const { q = '', filter = 'all', area = '', page = '1', limit = '50' } = req.query;
    const f = {};
    if (q) f.$or = [{ name: new RegExp(String(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') }, { phone: new RegExp(String(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') }];
    if (filter === 'due') f.totalDue = { $gt: 0 };
    if (filter === 'paid') f.totalDue = { $lte: 0 };
    if (area) f.area = area;
    const pg = Math.max(1, parseInt(page, 10) || 1), lim = Math.min(100, parseInt(limit, 10) || 50);
    const [items, total] = await Promise.all([Customer.find(f).sort({ totalDue: -1, name: 1 }).skip((pg - 1) * lim).limit(lim), Customer.countDocuments(f)]);
    res.json({ items, total, page: pg, limit: lim });
  } catch (e) { next(e); }
});

router.post('/', requirePerm('customers.create'), async (req, res, next) => {
  try {
    const { name, phone = '', address = '', area = '', notes = '', creditLimit = 0 } = req.body;
    if (!name) return res.status(400).json({ error: 'Customer name is required.' });
    const c = await Customer.create({ name: String(name).trim(), phone, address, area: String(area || '').trim(), notes, creditLimit: Math.max(0, Number(creditLimit || 0)) });
    await audit(req.user, 'CUSTOMER_CREATED', 'customer', c._id, { name: c.name });
    res.status(201).json(c);
  } catch (e) { next(e); }
});

router.patch('/:id', requirePerm('customers.create'), async (req, res, next) => {
  try {
    const c = await Customer.findById(req.params.id);
    if (!c) return res.status(404).json({ error: 'Customer not found.' });
    for (const k of ['name', 'phone', 'address', 'area', 'notes']) if (req.body[k] !== undefined) c[k] = req.body[k];
    if (req.body.creditLimit !== undefined) c.creditLimit = Math.max(0, Number(req.body.creditLimit || 0));
    await c.save();
    await audit(req.user, 'CUSTOMER_UPDATED', 'customer', c._id, { name: c.name });
    res.json(c);
  } catch (e) { next(e); }
});

// Delete customer (ADMIN): only with zero due and no bills/payments.
router.delete('/:id', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const c = await Customer.findById(req.params.id);
    if (!c) return res.status(404).json({ error: 'Customer not found.' });
    if (c.totalDue > 0) return res.status(400).json({ error: `"${c.name}"-er ${c.totalDue} taka baki — age clear koro.` });
    const [sales, pays] = await Promise.all([
      Sale.countDocuments({ customerId: c._id }),
      Payment.countDocuments({ customerId: c._id }),
    ]);
    if (sales > 0 || pays > 0) return res.status(400).json({ error: `"${c.name}"-er len-den history ache — delete hobe na.` });
    await Customer.deleteOne({ _id: c._id });
    await audit(req.user, 'CUSTOMER_DELETED', 'customer', c._id, { name: c.name });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// Distinct areas for route-wise collection filter.
router.get('/meta/areas', async (req, res, next) => {
  try { res.json(await Customer.distinct('area', { area: { $ne: '' } })); } catch (e) { next(e); }
});

// Takada list: due bills past their promised date, grouped by customer.
router.get('/dues/overdue', async (req, res, next) => {
  try {
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    const bills = await Sale.find({ status: 'COMPLETED', due: { $gt: 0 }, dueDate: { $ne: '' } }).sort({ dueDate: 1 }).limit(300).lean();
    const byCust = new Map();
    for (const b of bills) {
      const k = String(b.customerId || b.customerName);
      const e = byCust.get(k) || { customerId: b.customerId, customerName: b.customerName, due: 0, oldest: null, bills: [] };
      e.due = Math.round((e.due + b.due) * 100) / 100;
      e.bills.push({ receiptNumber: b.receiptNumber, due: b.due, dueDate: b.dueDate, total: b.total });
      if (b.dueDate) {
        if (!e.oldest || b.dueDate < e.oldest) e.oldest = b.dueDate;
        e.overdue = (b.dueDate < today) || e.overdue;
      }
      byCust.set(k, e);
    }
    res.json([...byCust.values()].sort((a, b) => (b.overdue ? 1 : 0) - (a.overdue ? 1 : 0) || (a.oldest || '').localeCompare(b.oldest || '')));
  } catch (e) { next(e); }
});

router.get('/:id', async (req, res, next) => {  try {
    const c = await Customer.findById(req.params.id);
    if (!c) return res.status(404).json({ error: 'Customer not found.' });
    const [sales, payments] = await Promise.all([
      Sale.find({ customerId: c._id }).sort({ createdAt: -1 }).limit(200),
      Payment.find({ customerId: c._id }).sort({ createdAt: -1 }).limit(200),
    ]);
    res.json({ customer: c, sales, payments });
  } catch (e) { next(e); }
});

// Receive payment: due decreases, never below zero
router.post('/:id/payments', requirePerm('payments.create'), async (req, res, next) => {
  try {
    const c = await Customer.findById(req.params.id);
    if (!c) return res.status(404).json({ error: 'Customer not found.' });
    const { amount, method, reference = '', notes = '', account = '' } = req.body;
    const amt = Number(amount);
    if (!(amt > 0)) return res.status(400).json({ error: 'Enter a valid amount.' });
    if (!['CASH','UPI','PHONEPE','GPAY','BANK','OTHER_UPI','OTHER'].includes(method)) return res.status(400).json({ error: 'Choose a payment method.' });
    if (amt - c.totalDue > 0.01) return res.status(400).json({ error: `Amount exceeds due of ₹${c.totalDue}.` });
    const { date, time } = istParts();
    const p = await Payment.create({ customerId: c._id, customerName: c.name, amount: amt, method, reference, notes, account: String(account || '').slice(0, 60), paymentDate: date, paymentTime: time, receivedBy: req.user.username });
    c.totalPaid += amt; c.totalDue = Math.max(0, Math.round((c.totalDue - amt) * 100) / 100);
    await c.save();
    await audit(req.user, 'PAYMENT_RECEIVED', 'payment', p._id, { customer: c.name, amount: amt, method });
    res.status(201).json({ payment: p, customer: c });
  } catch (e) { next(e); }
});

router.get('/:id/statement.pdf', async (req, res, next) => {
  try {
    const c = await Customer.findById(req.params.id);
    if (!c) return res.status(404).json({ error: 'Customer not found.' });
    const settings = await Settings.findOne({ key: 'shop' });
    const { from = '', to = '' } = req.query;
    const sf = { customerId: c._id };
    if (from || to) { /* date filter on transactionDate */ }
    const sales = await Sale.find(sf).sort({ createdAt: 1 }).limit(500);
    const payments = await Payment.find({ customerId: c._id }).sort({ createdAt: 1 }).limit(500);
    sendPdf(res, `statement-${c.name}.pdf`, (doc) => {
      header(doc, settings, `Customer Statement — ${c.name}${c.phone ? ' (' + c.phone + ')' : ''}`);
      doc.fontSize(10).text(`Total Purchased: Rs.${c.totalPurchased}   Total Paid: Rs.${c.totalPaid}   Due: Rs.${c.totalDue}`);
      doc.moveDown(0.5);
      doc.fontSize(11).text('Purchases', { underline: true });
      sales.forEach((s) => doc.fontSize(9).text(`${s.transactionDate} ${s.transactionTime}  ${s.receiptNumber}  Total Rs.${s.total}  Paid Rs.${s.paid}  Due Rs.${s.due}`));
      doc.moveDown(0.5);
      doc.fontSize(11).text('Payments', { underline: true });
      payments.forEach((p) => doc.fontSize(9).text(`${p.paymentDate} ${p.paymentTime}  Rs.${p.amount} via ${p.method} ${p.reference || ''}`));
      footer(doc, settings);
    });
  } catch (e) { next(e); }
});

module.exports = router;
