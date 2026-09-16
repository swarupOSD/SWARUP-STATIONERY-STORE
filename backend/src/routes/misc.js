const express = require('express');
const multer = require('multer');
const Product = require('../models/Product');
const { PersonalPurchase, Settings, Document, DailyClosing, AuditLog } = require('../models/Misc');
const StockMovement = require('../models/StockMovement');
const Sale = require('../models/Sale');
const { auth, requireRole } = require('../middleware/auth');
const { audit } = require('../middleware/common');
const { istParts } = require('../utils/ist');
const { uploadBuffer, cloudinaryStatus, FOLDERS } = require('../services/storage');
const { parseVoiceSale } = require('../services/ai');
const { upiIntent, upiQrDataUrl } = require('../services/upi');
const Customer = require('../models/Customer');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });
const router = express.Router();

// ---- AI ----
router.post('/ai/voice-parse', auth, async (req, res, next) => {
  try {
    const { text = '' } = req.body;
    if (!text) return res.status(400).json({ error: 'Voice text is required.' });
    const parsed = await parseVoiceSale(String(text));
    // match to real products (never auto-create)
    const out = [];
    for (const it of parsed.items || []) {
      const p = await Product.findOne({ $or: [{ name: new RegExp(String(it.name).slice(0, 30).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') }, { aliases: it.name }] });
      out.push({ ...it, matchedProductId: p?._id || null, matchedName: p?.name || null, price: p?.sellingPrice ?? null, stock: p?.stock ?? null, status: p ? 'matched' : 'unmatched' });
    }
    res.json({ ...parsed, matched: out, note: 'Review and confirm — voice never creates a sale directly.' });
  } catch (e) { next(e); }
});

router.get('/ai/status', auth, async (req, res) => {
  res.json({ configured: Boolean(process.env.GEMINI_API_KEY), provider: 'gemini' });
});

// ---- Uploads ----
router.post('/uploads', auth, upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file.' });
    const folder = FOLDERS[req.body?.folder] ? FOLDERS[req.body.folder] : FOLDERS.products;
    const stored = await uploadBuffer(req.file.buffer, folder, req.file.originalname);
    await audit(req.user, 'DOCUMENT_UPLOADED', 'document', '', { url: stored.url });
    res.status(201).json(stored);
  } catch (e) { next(e); }
});

// ---- Settings ----
router.get('/settings', auth, async (req, res, next) => {
  try {
    let s = await Settings.findOne({ key: 'shop' });
    if (!s) s = await Settings.create({ key: 'shop' });
    const safe = s.toObject();
    res.json(safe);
  } catch (e) { next(e); }
});

router.patch('/settings', auth, requireRole('ADMIN'), async (req, res, next) => {
  try {
    let s = await Settings.findOne({ key: 'shop' });
    if (!s) s = await Settings.create({ key: 'shop' });
    const allowed = ['shopName','shopNameBn','address','phone','gst','upiId','upiName','qrImageUrl','qrPublicId','logoUrl','logoPublicId','receiptFooter','taxEnabled','negativeStockAllowed','lowStockThreshold','defaultMarginPct','language','theme','pujaMode','staffPermissions'];
    for (const k of allowed) if (req.body[k] !== undefined) s[k] = req.body[k];
    await s.save();
    await audit(req.user, 'SETTINGS_CHANGED', 'settings', s._id, { keys: Object.keys(req.body) });
    res.json(s);
  } catch (e) { next(e); }
});

router.get('/upi-qr', auth, async (req, res, next) => {
  try {
    const s = await Settings.findOne({ key: 'shop' });
    const amount = Number(req.query.amount || 0);
    if (!s?.upiId) return res.status(400).json({ error: 'Shop UPI ID not configured.', fallbackQr: s?.qrImageUrl || null });
    if (!(amount > 0)) return res.json({ staticQr: s.qrImageUrl || null, upiId: s.upiId, message: 'Static QR' });
    const intent = upiIntent({ upiId: s.upiId, name: s.upiName, amount });
    const qr = await upiQrDataUrl(intent);
    res.json({ intent, qr, amount, upiId: s.upiId, fallbackQr: s.qrImageUrl || null, note: 'Customer scans — admin confirms manually. No auto success claim.' });
  } catch (e) { next(e); }
});

// ---- Personal purchases ----
router.get('/personal-purchases', auth, async (req, res, next) => {
  try {
    const { owner = '' } = req.query;
    const f = owner ? { owner } : {};
    res.json(await PersonalPurchase.find(f).sort({ createdAt: -1 }).limit(200));
  } catch (e) { next(e); }
});

router.post('/personal-purchases', auth, async (req, res, next) => {
  try {
    const { owner, productName, productId = null, qty, price, supplier = '', source = 'Local Shop', paid = 0, billUrl = '', billPublicId = '', addToStock = false, method = '', account = '' } = req.body;
    if (!owner || !productName || !(qty > 0) || !(price >= 0)) return res.status(400).json({ error: 'Owner, product, qty and price are required.' });
    const { date, time } = istParts();
    const doc = await PersonalPurchase.create({ owner, productName, productId: productId || null, qty: Number(qty), price: Number(price), total: Number(qty) * Number(price), supplier, source, paid: Number(paid || 0), method: String(method || ''), account: String(account || '').slice(0, 60), billUrl, billPublicId, addToStock: Boolean(addToStock), stockApplied: false, purchaseDate: date, purchaseTime: time, createdBy: req.user.username });
    if (doc.addToStock && doc.productId) {
      const p = await Product.findById(doc.productId);
      if (p) {
        const before = p.stock, after = before + Math.round(Number(qty));
        p.stock = after; await p.save();
        await StockMovement.create({ productId: p._id, productName: p.name, type: 'PERSONAL_PURCHASE', quantityDelta: Math.round(Number(qty)), before, after, reference: String(doc._id), reason: `${owner} added to shop stock`, date, time, user: req.user.username });
        doc.stockApplied = true; await doc.save();
      }
    }
    await audit(req.user, 'PERSONAL_PURCHASE', 'personalPurchase', doc._id, { owner, productName });
    res.status(201).json(doc);
  } catch (e) { next(e); }
});

// ---- Documents library ----
router.get('/documents', auth, async (req, res, next) => {
  try {
    const { category = '', q = '' } = req.query;
    const f = {};
    if (category) f.category = category;
    if (q) f.$or = [{ title: new RegExp(q, 'i') }, { supplier: new RegExp(q, 'i') }, { invoiceId: new RegExp(q, 'i') }, { receiptNumber: new RegExp(q, 'i') }];
    res.json(await Document.find(f).sort({ createdAt: -1 }).limit(200));
  } catch (e) { next(e); }
});

// ---- Stock ledger ----
router.get('/stock-movements', auth, async (req, res, next) => {
  try {
    const { productId = '', page = '1', limit = '50' } = req.query;
    const f = productId ? { productId } : {};
    const pg = Math.max(1, parseInt(page, 10) || 1), lim = Math.min(100, parseInt(limit, 10) || 50);
    const [items, total] = await Promise.all([
      StockMovement.find(f).sort({ createdAt: -1 }).skip((pg - 1) * lim).limit(lim),
      StockMovement.countDocuments(f),
    ]);
    res.json({ items, total });
  } catch (e) { next(e); }
});

// ---- Audit ----
router.get('/audit', auth, requireRole('ADMIN'), async (req, res, next) => {
  try {
    const { page = '1', limit = '50' } = req.query;
    const pg = Math.max(1, parseInt(page, 10) || 1), lim = Math.min(100, parseInt(limit, 10) || 50);
    const [items, total] = await Promise.all([AuditLog.find().sort({ timestamp: -1 }).skip((pg - 1) * lim).limit(lim), AuditLog.countDocuments()]);
    res.json({ items, total });
  } catch (e) { next(e); }
});

// ---- Day lock ----
router.get('/day/:date', auth, async (req, res, next) => {
  try { res.json(await DailyClosing.findOne({ date: req.params.date }) || { date: req.params.date, closed: false }); } catch (e) { next(e); }
});
router.post('/day/:date/close', auth, requireRole('ADMIN'), async (req, res, next) => {
  try {
    const { countedCash, expectedCash } = req.body || {};
    const summary = {};
    if (countedCash !== undefined && countedCash !== '' && countedCash !== null) {
      summary.countedCash = Number(countedCash);
      if (!(summary.countedCash >= 0)) return res.status(400).json({ error: 'Counted cash must be a number.' });
      if (expectedCash !== undefined && expectedCash !== '') summary.expectedCash = Number(expectedCash);
      if (summary.expectedCash !== undefined) summary.diff = Math.round((summary.countedCash - summary.expectedCash) * 100) / 100;
      summary.countedBy = req.user.username;
    }
    const d = await DailyClosing.findOneAndUpdate({ date: req.params.date }, { $set: { closed: true, closedBy: req.user.username, summary } }, { upsert: true, new: true });
    await audit(req.user, 'DAY_CLOSED', 'day', req.params.date, summary);
    res.json(d);
  } catch (e) { next(e); }
});
router.post('/day/:date/reopen', auth, requireRole('ADMIN'), async (req, res, next) => {
  try {
    const { reason = '' } = req.body;
    if (!reason) return res.status(400).json({ error: 'Reopen reason is required.' });
    const d = await DailyClosing.findOneAndUpdate({ date: req.params.date }, { $set: { closed: false, reopenReason: reason } }, { upsert: true, new: true });
    await audit(req.user, 'DAY_REOPENED', 'day', req.params.date, { reason });
    res.json(d);
  } catch (e) { next(e); }
});

// ---- Admin dashboard ----
router.get('/dashboard', auth, async (req, res, next) => {
  try {
    const { todayIST } = require('../utils/ist');
    const date = todayIST();
    const { dailySummary } = require('./reports');
    const today = await dailySummary(date);
    const lowItems = await Product.find({ $expr: { $lte: ['$stock', '$minStock'] } }).limit(25);
    const topDue = await Customer.find({ totalDue: { $gt: 0 } }).sort({ totalDue: -1 }).limit(10);
    res.json({ today, lowItems, topDue });
  } catch (e) { next(e); }
});

// ---- System health ----
router.get('/system', auth, requireRole('ADMIN'), async (req, res) => {
  const db = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
  const cloud = await cloudinaryStatus();
  res.json({
    backend: 'ok', time: new Date().toISOString(), database: db,
    cloudinary: cloud, ai: { configured: Boolean(process.env.GEMINI_API_KEY) },
    version: '1.0.0', env: process.env.NODE_ENV || 'development',
  });
});

module.exports = router;
