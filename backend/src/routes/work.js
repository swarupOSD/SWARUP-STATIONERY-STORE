const express = require('express');
const Product = require('../models/Product');
const { Estimate, Attendance } = require('../models/Work');
const { auth, requirePerm, requireRole } = require('../middleware/auth');
const { audit } = require('../middleware/common');
const { istParts } = require('../utils/ist');

const router = express.Router();
router.use(auth);
const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

// ---------- Estimates ----------
router.get('/estimates', async (req, res, next) => {
  try {
    const { status = '', page = '1', limit = '30' } = req.query;
    const f = status ? { status } : {};
    const pg = Math.max(1, parseInt(page, 10) || 1), lim = Math.min(100, parseInt(limit, 10) || 30);
    const [items, total] = await Promise.all([
      Estimate.find(f).sort({ createdAt: -1 }).skip((pg - 1) * lim).limit(lim),
      Estimate.countDocuments(f),
    ]);
    res.json({ items, total, page: pg, limit: lim });
  } catch (e) { next(e); }
});

router.post('/estimates', requirePerm('sales.create'), async (req, res, next) => {
  try {
    const { customerId = null, customerName = '', phone = '', items = [], discount = 0, validTill = '', notes = '' } = req.body;
    if (!Array.isArray(items) || !items.length) return res.status(400).json({ error: 'Add at least one item.' });
    const ids = [...new Set(items.map((i) => i.productId).filter(Boolean))];
    const prods = await Product.find({ _id: { $in: ids } });
    const map = new Map(prods.map((p) => [String(p._id), p]));
    let subtotal = 0;
    const norm = [];
    for (const it of items) {
      const p = map.get(String(it.productId));
      if (!p || !p.active) return res.status(400).json({ error: 'Product unavailable in estimate.' });
      const qty = Math.floor(Number(it.qty));
      if (!(qty > 0)) return res.status(400).json({ error: `Invalid qty for ${p.name}.` });
      const rate = Number(p.sellingPrice); // shop rate snapshot
      const lineTotal = round2(qty * rate);
      subtotal = round2(subtotal + lineTotal);
      norm.push({ productId: p._id, name: p.name, qty, rate, lineTotal });
    }
    const disc = Math.min(subtotal, Math.max(0, round2(Number(discount || 0))));
    const doc = await Estimate.create({
      customerId: customerId || null, customerName: String(customerName || '').trim(), phone: String(phone || '').trim(),
      items: norm, subtotal, discount: disc, total: round2(subtotal - disc),
      validTill: String(validTill || ''), notes: String(notes || '').slice(0, 500), createdBy: req.user.username,
    });
    await audit(req.user, 'ESTIMATE_CREATED', 'estimate', doc._id, { total: doc.total });
    res.status(201).json(doc);
  } catch (e) { next(e); }
});

router.patch('/estimates/:id', requirePerm('sales.create'), async (req, res, next) => {
  try {
    const doc = await Estimate.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Estimate not found.' });
    if (req.body.status && ['PENDING', 'CONVERTED', 'CANCELLED'].includes(req.body.status)) doc.status = req.body.status;
    if (req.body.notes !== undefined) doc.notes = String(req.body.notes).slice(0, 500);
    if (req.body.validTill !== undefined) doc.validTill = String(req.body.validTill);
    await doc.save();
    res.json(doc);
  } catch (e) { next(e); }
});

// ---------- Attendance ----------
router.get('/attendance', async (req, res, next) => {
  try {
    const { month = '', date = '' } = req.query; // month YYYY-MM or exact date
    const f = {};
    if (date) f.date = date;
    else if (/^\d{4}-\d{2}$/.test(month || '')) f.date = new RegExp(`^${month}`);
    res.json(await require('../models/Work').Attendance.find(f).sort({ date: -1, name: 1 }).limit(500));
  } catch (e) { next(e); }
});

router.post('/attendance/checkin', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const { userId = null, name = '', status = 'Present', notes = '' } = req.body;
    if (!String(name).trim()) return res.status(400).json({ error: 'Name is required.' });
    if (!['Present', 'Half-day', 'Leave'].includes(status)) return res.status(400).json({ error: 'Invalid status.' });
    const { date, time } = istParts();
    const doc = await Attendance.findOneAndUpdate(
      userId ? { userId, date } : { name: String(name).trim(), date, userId: null },
      { $setOnInsert: { userId: userId || null, name: String(name).trim(), date, inTime: time, status, notes, markedBy: req.user.username } },
      { upsert: true, new: true }
    );
    await audit(req.user, 'ATTENDANCE_IN', 'attendance', doc._id, { name: doc.name, date });
    res.status(201).json(doc);
  } catch (e) { next(e); }
});

router.post('/attendance/checkout', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const { userId = null, name = '' } = req.body;
    const { date, time } = istParts();
    const f = userId ? { userId, date } : { name: String(name).trim(), date };
    const doc = await Attendance.findOneAndUpdate(f, { $set: { outTime: time } }, { new: true });
    if (!doc) return res.status(404).json({ error: 'No check-in today for this person.' });
    await audit(req.user, 'ATTENDANCE_OUT', 'attendance', doc._id, { name: doc.name });
    res.json(doc);
  } catch (e) { next(e); }
});

module.exports = router;
