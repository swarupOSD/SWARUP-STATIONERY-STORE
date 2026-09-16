const express = require('express');
const Product = require('../models/Product');
const Sale = require('../models/Sale');
const Purchase = require('../models/Purchase');
const { PriceHistory, Settings } = require('../models/Misc');
const StockMovement = require('../models/StockMovement');
const { auth, requirePerm, requireRole } = require('../middleware/auth');
const { audit } = require('../middleware/common');
const { istParts } = require('../utils/ist');
const { previewImageUrl } = require('../services/imageGuard');
const { suggestImages } = require('../services/imageSuggest');
const { suggestTemplate } = require('../services/ai');

const router = express.Router();
router.use(auth);

function templateFor(name) { return suggestTemplate(name || ''); }

// Suggest category/unit/pack from name+image only (never invents price/stock)
router.post('/suggest', (req, res) => {
  res.json(templateFor(req.body?.name));
});

// Safe image URL preview (SSRF-protected)
// Photo finder: candidate images for a product name. Shopkeeper picks (match guaranteed).
router.get('/image-suggest', async (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim();
    if (q.length < 2) return res.status(400).json({ error: 'Search text dao.' });
    res.json({ items: await suggestImages(q) });
  } catch (e) { next(e); }
});

router.post('/preview-image', async (req, res, next) => {  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'Image URL is required.' });
    const r = await previewImageUrl(String(url));
    if (!r.ok) return res.status(422).json({ ok: false, error: 'Image could not be loaded.', hint: r.hint, actions: ['Try another URL', 'Upload image', 'Use camera'] });
    res.json({ ok: true, resolvedUrl: r.resolvedUrl, contentType: r.contentType, message: 'Image loaded' });
  } catch (e) { next(e); }
});

router.get('/', async (req, res, next) => {
  try {
    const { q = '', category = '', low, out, needsPricing, active = 'true', page = '1', limit = '50' } = req.query;
    const filter = {};
    if (active === 'true') filter.active = true;
    else if (active === 'false') filter.active = false;
    // active=all (or anything else) => no active filter
    if (category) filter.category = category;
    if (needsPricing === '1') filter.needsPricing = true;
    if (q) {
      const rx = new RegExp(String(q).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ name: rx }, { nameBn: rx }, { sku: rx }, { barcode: rx }, { qrCode: rx }, { brand: rx }, { aliases: rx }];
    }
    const pg = Math.max(1, parseInt(page, 10) || 1);
    const lim = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
    let list = await Product.find(filter).sort({ name: 1 }).skip((pg - 1) * lim).limit(lim);
    const total = await Product.countDocuments(filter);
    if (low === '1') list = list.filter((p) => p.stock <= (p.minStock ?? 5));
    if (out === '1') list = list.filter((p) => p.stock <= 0);
    res.json({ items: list, total, page: pg, limit: lim });
  } catch (e) { next(e); }
});

router.get('/:id/history', async (req, res, next) => {
  try {
    const { PriceHistory } = require('../models/Misc');
    const StockMovement = require('../models/StockMovement');
    const [price, stock] = await Promise.all([
      PriceHistory.find({ productId: req.params.id }).sort({ createdAt: -1 }).limit(20),
      StockMovement.find({ productId: req.params.id }).sort({ createdAt: -1 }).limit(30),
    ]);
    res.json({ price, stock });
  } catch (e) { next(e); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const p = await Product.findById(req.params.id);
    if (!p) return res.status(404).json({ error: 'Product not found.' });
    res.json(p);
  } catch (e) { next(e); }
});

router.post('/', requirePerm('products.create'), async (req, res, next) => {
  try {
    const b = req.body;
    if (!b.name) return res.status(400).json({ error: 'Product name is required.' });
    if (b.purchasePrice === undefined || b.sellingPrice === undefined) return res.status(400).json({ error: 'Buy price and sell price must be confirmed.' });
    const t = templateFor(b.name);
    const doc = await Product.create({
      name: String(b.name).trim(), nameBn: b.nameBn || '', aliases: b.aliases || [],
      category: b.category || t.category, subcategory: b.subcategory || '',
      imageUrl: b.imageUrl || '', imagePublicId: b.imagePublicId || '', productLink: b.productLink || '',
      sku: b.sku || '', barcode: b.barcode || '', qrCode: b.qrCode || '',
      purchasePrice: Number(b.purchasePrice), sellingPrice: Number(b.sellingPrice),
      loosePrice: Math.max(0, Number(b.loosePrice || 0)),
      purchasedBy: ['Ami', 'Ma', 'Baba'].includes(b.purchasedBy) ? b.purchasedBy : '',
      fundedBy: String(b.fundedBy || '').slice(0, 60),
      stock: Number(b.stock || 0), minStock: b.minStock ?? 5,
      unit: b.unit || t.unit, packSize: Math.max(1, Number(b.packSize || t.packSize || 1)),
      supplier: b.supplier || '', brand: b.brand || '', tax: Number(b.tax || 0),
      discount: Number(b.discount || 0), notes: b.notes || '', active: b.active !== false,
      needsPricing: b.needsPricing === true,
    });
    const { date, time } = istParts();
    await StockMovement.create({ productId: doc._id, productName: doc.name, type: 'OPENING_STOCK', quantityDelta: doc.stock, before: 0, after: doc.stock, reference: 'create', reason: 'Opening stock', date, time, user: req.user.username });
    await audit(req.user, 'PRODUCT_CREATED', 'product', doc._id, { name: doc.name });
    res.status(201).json(doc);
  } catch (e) {
    if (e.code === 11000) return res.status(400).json({ error: 'SKU or barcode already exists.' });
    next(e);
  }
});

router.patch('/:id', requirePerm('products.update'), async (req, res, next) => {
  try {
    const p = await Product.findById(req.params.id);
    if (!p) return res.status(404).json({ error: 'Product not found.' });
    const oldPP = p.purchasePrice, oldSP = p.sellingPrice, oldStock = p.stock;
    const editable = ['name','nameBn','aliases','category','subcategory','imageUrl','imagePublicId','productLink','sku','barcode','qrCode','purchasePrice','sellingPrice','loosePrice','purchasedBy','fundedBy','minStock','unit','packSize','supplier','brand','tax','discount','notes','needsPricing','active'];
    for (const k of editable) if (req.body[k] !== undefined) p[k] = req.body[k];
    if (p.purchasedBy && !['Ami', 'Ma', 'Baba'].includes(p.purchasedBy)) p.purchasedBy = '';
    p.loosePrice = Math.max(0, Number(p.loosePrice || 0));
    // stock changes go through adjust endpoint; ignore direct stock here unless admin adjustment flag
    await p.save();
    if (Number(oldPP) !== Number(p.purchasePrice) || Number(oldSP) !== Number(p.sellingPrice)) {
      const { date, time } = istParts();
      await PriceHistory.create({ productId: p._id, oldPurchasePrice: oldPP, newPurchasePrice: p.purchasePrice, oldSellingPrice: oldSP, newSellingPrice: p.sellingPrice, changedBy: req.user.username, date, time });
      await audit(req.user, 'PRICE_CHANGED', 'product', p._id, { oldSP, newSP: p.sellingPrice });
    }
    await audit(req.user, 'PRODUCT_UPDATED', 'product', p._id, { name: p.name, stockIgnored: oldStock });
    res.json(p);
  } catch (e) { next(e); }
});

router.post('/:id/adjust', requirePerm('products.update'), async (req, res, next) => {
  try {
    const p = await Product.findById(req.params.id);
    if (!p) return res.status(404).json({ error: 'Product not found.' });
    const delta = Number(req.body.delta);
    const reason = String(req.body.reason || 'Manual adjustment');
    if (!Number.isFinite(delta) || delta === 0) return res.status(400).json({ error: 'Adjustment quantity is required.' });
    const settings = await Settings.findOne({ key: 'shop' });
    const before = p.stock, after = before + delta;
    if (after < 0 && !settings?.negativeStockAllowed) return res.status(400).json({ error: 'Stock cannot go negative. Enable it in Settings if needed.' });
    p.stock = after; await p.save();
    const { date, time } = istParts();
    await StockMovement.create({ productId: p._id, productName: p.name, type: 'ADJUSTMENT', quantityDelta: delta, before, after, reference: 'adjust', reason, date, time, user: req.user.username });
    await audit(req.user, 'STOCK_ADJUSTED', 'product', p._id, { delta, before, after, reason });
    res.json(p);
  } catch (e) { next(e); }
});

// Niye gelam (personal/family use): stock decreases with ledger. Ke nilo recorded.
router.post('/:id/take', requirePerm('products.update'), async (req, res, next) => {
  try {
    const p = await Product.findById(req.params.id);
    if (!p) return res.status(404).json({ error: 'Product not found.' });
    const { qty, who = 'Ami', reason = '' } = req.body;
    const q = Math.floor(Number(qty));
    if (!(q > 0)) return res.status(400).json({ error: 'Qty dao.' });
    if (!['Ami', 'Ma', 'Baba'].includes(who)) return res.status(400).json({ error: 'Ke nilo select koro (Ami/Ma/Baba).' });
    const packSize = Math.max(1, Number(p.packSize || 1));
    const baseQty = q * packSize;
    if (p.stock - baseQty < 0) return res.status(400).json({ error: `Stock-e matro ${p.stock} ache.` });
    const before = p.stock, after = before - baseQty;
    p.stock = after; await p.save();
    const { date, time } = istParts();
    await StockMovement.create({ productId: p._id, productName: p.name, type: 'PERSONAL_USE', quantityDelta: -baseQty, before, after, reference: `take-${who}`, reason: `${who} nilo${reason ? ': ' + String(reason).slice(0, 100) : ''}`, date, time, user: req.user.username });
    await audit(req.user, 'STOCK_TAKEN', 'product', p._id, { who, qty: q, before, after });
    res.json(p);
  } catch (e) { next(e); }
});

// Delete product (ADMIN): only if it has NO history. Else deactivate instead.
router.delete('/:id', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const p = await Product.findById(req.params.id);
    if (!p) return res.status(404).json({ error: 'Product not found.' });
    const [moves, sales, buys] = await Promise.all([
      StockMovement.countDocuments({ productId: p._id, type: { $ne: 'OPENING_STOCK' } }),
      Sale.countDocuments({ 'items.productId': p._id }),
      Purchase.countDocuments({ 'items.productId': p._id }),
    ]);
    if (moves > 0 || sales > 0 || buys > 0) {
      return res.status(400).json({ error: `"${p.name}"-er bikri/kena history ache — delete hobe na. Bodle Inactive kore dao, hisab safe thakbe.`, hasHistory: true });
    }
    await StockMovement.deleteMany({ productId: p._id });
    await Product.deleteOne({ _id: p._id });
    await audit(req.user, 'PRODUCT_DELETED', 'product', p._id, { name: p.name });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;
