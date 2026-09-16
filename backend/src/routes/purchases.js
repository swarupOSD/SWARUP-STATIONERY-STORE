const express = require('express');
const crypto = require('crypto');
const Product = require('../models/Product');
const Purchase = require('../models/Purchase');
const StockMovement = require('../models/StockMovement');
const { DailyClosing } = require('../models/Misc');
const { auth, requirePerm } = require('../middleware/auth');
const { audit } = require('../middleware/common');
const { istParts } = require('../utils/ist');
const { nextPurchaseRef } = require('../services/receipt');

const router = express.Router();
router.use(auth);
const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

function fingerprint(supplier, invoiceNumber, orderNumber, grandTotal) {
  return crypto.createHash('sha256').update(`${String(supplier).toLowerCase().trim()}|${String(invoiceNumber).toLowerCase().trim()}|${String(orderNumber).toLowerCase().trim()}|${Number(grandTotal)}`).digest('hex');
}

router.post('/', requirePerm('purchases.create'), async (req, res, next) => {
  try {
    const { supplier = '', supplierId = null, invoiceNumber = '', orderNumber = '', source = 'Local Shop', owner = 'Shop', items = [], discount = 0, tax = 0, shipping = 0, paid = 0, addToStock = true, billUrl = '', billPublicId = '', payMethod = '', fundedBy = '' } = req.body;
    if (!items.length) return res.status(400).json({ error: 'Add at least one item.' });
    const { date, time } = istParts();
    const closed = await DailyClosing.findOne({ date });
    if (closed?.closed) return res.status(400).json({ error: `Business day ${date} is closed.` });

    let subtotal = 0;
    const norm = [];
    for (const it of items) {
      const qty = Number(it.qty), up = Number(it.unitPrice);
      if (!(qty > 0) || !(up >= 0)) return res.status(400).json({ error: `Invalid qty/price for ${it.name || 'item'}.` });
      const lineTotal = round2(it.lineTotal !== undefined ? Number(it.lineTotal) : qty * up);
      subtotal = round2(subtotal + lineTotal);
      norm.push({ productId: it.productId || null, name: String(it.name || 'Item'), qty, baseQty: Number(it.baseQty || qty), unitPrice: up, sellingPrice: Number(it.sellingPrice || 0), lineTotal });
    }
    const grandTotal = round2(subtotal + Number(tax || 0) + Number(shipping || 0) - Number(discount || 0));
    const fp = fingerprint(supplier, invoiceNumber, orderNumber, grandTotal);
    if (invoiceNumber || orderNumber) {
      const or = [];
      if (invoiceNumber && supplier) or.push({ supplier, invoiceNumber, status: 'COMPLETED' });
      if (orderNumber && supplier) or.push({ supplier, orderNumber, status: 'COMPLETED' });
      or.push({ fingerprint: fp, status: 'COMPLETED' });
      const dup = await Purchase.findOne({ $or: or });
      if (dup && !req.body?.confirmDuplicate) return res.status(409).json({ error: 'This invoice may already have been added.', duplicate: true, purchaseId: dup._id });
    }
    const inv = invoiceNumber || await nextPurchaseRef();
    const doc = await Purchase.create({
      invoiceNumber: inv, orderNumber, supplier, supplierId: supplierId || null, source, owner,
      items: norm, subtotal, discount: Number(discount || 0), tax: Number(tax || 0), shipping: Number(shipping || 0),
      grandTotal, paid: Number(paid || 0), due: round2(Math.max(0, grandTotal - Number(paid || 0))),
      payMethod: ['', 'CASH', 'UPI', 'BANK', 'OTHER'].includes(payMethod) ? payMethod : '',
      fundedBy: String(fundedBy || '').slice(0, 60),
      addToStock: Boolean(addToStock), billUrl, billPublicId, fingerprint: fp,
      purchaseDate: date, purchaseTime: time, createdBy: req.user.username,
    });
    if (doc.addToStock) {
      for (const it of norm) {
        if (!it.productId) continue;
        const p = await Product.findById(it.productId);
        if (!p) continue;
        const addBase = Math.round(Number(it.baseQty || it.qty) * 1);
        const before = p.stock, after = before + addBase;
        p.stock = after;
        if (it.sellingPrice > 0) p.sellingPrice = it.sellingPrice;
        await p.save();
        await StockMovement.create({ productId: p._id, productName: p.name, type: 'PURCHASE', quantityDelta: addBase, before, after, reference: inv, referenceId: String(doc._id), reason: `Purchase ${inv}`, date, time, user: req.user.username });
      }
    }
    await audit(req.user, 'PURCHASE_CREATED', 'purchase', doc._id, { invoiceNumber: inv, grandTotal });
    res.status(201).json(doc);
  } catch (e) { next(e); }
});

router.get('/', async (req, res, next) => {
  try {
    const { date = '', supplier = '', owner = '', page = '1', limit = '30' } = req.query;
    const f = {};
    if (date) f.purchaseDate = date;
    if (owner) f.owner = owner;
    if (supplier) f.supplier = new RegExp(String(supplier).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const pg = Math.max(1, parseInt(page, 10) || 1), lim = Math.min(100, parseInt(limit, 10) || 30);
    const [items, total] = await Promise.all([Purchase.find(f).sort({ createdAt: -1 }).skip((pg - 1) * lim).limit(lim), Purchase.countDocuments(f)]);
    res.json({ items, total, page: pg, limit: lim });
  } catch (e) { next(e); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const doc = await Purchase.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Purchase not found.' });
    res.json(doc);
  } catch (e) { next(e); }
});

router.post('/:id/void', requirePerm('purchases.void'), async (req, res, next) => {
  try {
    const doc = await Purchase.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Purchase not found.' });
    if (doc.status === 'VOIDED') return res.status(400).json({ error: 'Already voided.' });
    const { date, time } = istParts();
    if (doc.addToStock) {
      for (const it of doc.items) {
        if (!it.productId) continue;
        const p = await Product.findById(it.productId);
        if (!p) continue;
        const before = p.stock, after = before - Number(it.baseQty || it.qty);
        p.stock = after; await p.save();
        await StockMovement.create({ productId: p._id, productName: p.name, type: 'PURCHASE_VOID', quantityDelta: -Number(it.baseQty || it.qty), before, after, reference: doc.invoiceNumber, referenceId: String(doc._id), reason: req.body?.reason || 'Purchase void', date, time, user: req.user.username });
      }
    }
    doc.status = 'VOIDED'; await doc.save();
    await audit(req.user, 'PURCHASE_VOIDED', 'purchase', doc._id, { invoiceNumber: doc.invoiceNumber });
    res.json(doc);
  } catch (e) { next(e); }
});

module.exports = router;
