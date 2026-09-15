const express = require('express');
const Category = require('../models/Category');
const Supplier = require('../models/Supplier');
const Purchase = require('../models/Purchase');
const { SupplierPayment } = require('../models/Dues');
const { auth, requirePerm } = require('../middleware/auth');
const { audit } = require('../middleware/common');
const { istParts } = require('../utils/ist');

const router = express.Router();
router.use(auth);

const DEFAULTS = ['Stationery','Grocery','Chocolate','Biscuits','Candy','Cold Drinks','Snacks','Cigarettes','Gutka','Tobacco','Mouth Freshener','Elachi','Personal Care','Household','Other'];

router.get('/categories', async (req, res, next) => {
  try {
    let cats = await Category.find({ active: true }).sort({ name: 1 });
    if (!cats.length) {
      // backfill flag on legacy docs, then seed defaults (race/duplicate safe)
      await Category.updateMany({ active: { $exists: false } }, { $set: { active: true } });
      try {
        await Category.insertMany(DEFAULTS.map((n) => ({ name: n, active: true })), { ordered: false });
      } catch (e) { if (e.code !== 11000) throw e; }
      cats = await Category.find({ active: true }).sort({ name: 1 });
    }
    res.json(cats);
  } catch (e) { next(e); }
});

router.post('/categories', async (req, res, next) => {
  try {
    const { name, nameBn = '', icon = '' } = req.body;
    if (!name) return res.status(400).json({ error: 'Category name is required.' });
    const c = await Category.create({ name: String(name).trim(), nameBn, icon });
    await audit(req.user, 'CATEGORY_CREATED', 'category', c._id, { name: c.name });
    res.status(201).json(c);
  } catch (e) {
    if (e.code === 11000) return res.status(400).json({ error: 'Category already exists.' });
    next(e);
  }
});

router.get('/suppliers', async (req, res, next) => {
  try { res.json(await Supplier.find().sort({ name: 1 }).limit(200)); } catch (e) { next(e); }
});

router.post('/suppliers', async (req, res, next) => {
  try {
    const { name, phone = '', address = '', notes = '' } = req.body;
    if (!name) return res.status(400).json({ error: 'Supplier name is required.' });
    res.status(201).json(await Supplier.create({ name, phone, address, notes }));
  } catch (e) { next(e); }
});

// Supplier dues: outstanding purchase dues grouped by supplier name.
// (Supplier payments allocate into bill dues FIFO at pay time, so Σ due is already net.)
async function supplierDues() {
  const [purchases, suppliers] = await Promise.all([
    Purchase.find({ status: 'COMPLETED', supplier: { $ne: '' } }).select('supplier grandTotal paid due purchaseDate invoiceNumber').lean(),
    Supplier.find().lean(),
  ]);
  const map = new Map();
  for (const p of purchases) {
    const e = map.get(p.supplier) || { name: p.supplier, bought: 0, due: 0, bills: 0, lastDate: '' };
    e.bought += p.grandTotal || 0; e.due += p.due || 0; e.bills += 1;
    if (!e.lastDate || p.purchaseDate > e.lastDate) e.lastDate = p.purchaseDate;
    map.set(p.supplier, e);
  }
  const docs = new Map(suppliers.map((s) => [s.name, s]));
  return [...map.values()]
    .map((e) => ({ ...e, bought: Math.round(e.bought * 100) / 100, due: Math.round(e.due * 100) / 100, supplierId: docs.get(e.name)?._id || null, phone: docs.get(e.name)?.phone || '' }))
    .sort((a, b) => b.due - a.due);
}

router.get('/suppliers/dues', async (req, res, next) => {
  try { res.json(await supplierDues()); } catch (e) { next(e); }
});

router.get('/suppliers/ledger', async (req, res, next) => {
  try {
    const { name = '' } = req.query;
    if (!name) return res.status(400).json({ error: 'Supplier name is required.' });
    const [purchases, payments, supplier] = await Promise.all([
      Purchase.find({ status: 'COMPLETED', supplier: name }).sort({ purchaseDate: 1 }).limit(200),
      SupplierPayment.find({ supplierName: name }).sort({ paymentDate: 1 }).limit(200),
      Supplier.findOne({ name }),
    ]);
    const due = Math.max(0, Math.round((purchases.reduce((s, p) => s + (p.due || 0), 0)) * 100) / 100);
    res.json({ supplier, purchases, payments, due });
  } catch (e) { next(e); }
});

// Pay supplier: validates against outstanding, allocates oldest bills first.
router.post('/suppliers/pay', requirePerm('purchases.create'), async (req, res, next) => {
  try {
    const { supplierName = '', amount, method = 'CASH', reference = '', notes = '' } = req.body;
    const amt = Number(amount);
    if (!supplierName.trim() || !(amt > 0)) return res.status(400).json({ error: 'Supplier and valid amount are required.' });
    if (!['CASH', 'UPI', 'BANK', 'OTHER'].includes(method)) return res.status(400).json({ error: 'Invalid method.' });
    const name = supplierName.trim();
    const dues = await supplierDues();
    const outstanding = dues.find((d) => d.name === name)?.due || 0;
    if (amt - outstanding > 0.01) return res.status(400).json({ error: `Amount exceeds due of ₹${outstanding}.` });
    const { date, time } = istParts();
    let supplier = await Supplier.findOne({ name });
    if (!supplier) supplier = await Supplier.create({ name });
    let left = amt;
    const allocations = [];
    const bills = await Purchase.find({ status: 'COMPLETED', supplier: name, due: { $gt: 0 } }).sort({ purchaseDate: 1, createdAt: 1 });
    for (const b of bills) {
      if (left <= 0) break;
      const take = Math.min(b.due, left);
      b.due = Math.round((b.due - take) * 100) / 100;
      b.paid = Math.round((b.paid + take) * 100) / 100;
      await b.save();
      allocations.push({ purchaseId: b._id, invoiceNumber: b.invoiceNumber, amount: take });
      left = Math.round((left - take) * 100) / 100;
    }
    const pay = await SupplierPayment.create({ supplierId: supplier._id, supplierName: name, amount: amt, method, reference, notes, paymentDate: date, paymentTime: time, paidBy: req.user.username, allocations });
    await audit(req.user, 'SUPPLIER_PAID', 'supplier', supplier._id, { supplier: name, amount: amt, method });
    res.status(201).json({ payment: pay, remaining: Math.round((outstanding - amt) * 100) / 100 });
  } catch (e) { next(e); }
});

module.exports = router;
