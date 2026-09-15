const express = require('express');
const mongoose = require('mongoose');
const Product = require('../models/Product');
const Sale = require('../models/Sale');
const Customer = require('../models/Customer');
const StockMovement = require('../models/StockMovement');
const { DailyClosing, Settings } = require('../models/Misc');
const { auth, requirePerm } = require('../middleware/auth');
const { audit } = require('../middleware/common');
const { istParts } = require('../utils/ist');
const { nextReceiptNumber } = require('../services/receipt');

const router = express.Router();
router.use(auth);

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

async function assertDayOpen(dateStr) {
  const d = await DailyClosing.findOne({ date: dateStr });
  if (d?.closed) { const e = new Error('Day closed'); e.status = 400; e.publicMessage = `Business day ${dateStr} is closed. Reopen it from Admin to add backdated entries.`; throw e; }
}

// POST /api/sales — server calculates everything; idempotent via idempotencyKey
router.post('/', requirePerm('sales.create'), async (req, res, next) => {
  try {
    const { items = [], discount = 0, tax = 0, paymentMethod, paymentBreakdown = [], paid, customerId = null, customerName = '', idempotencyKey, upiTxnId = '', receivedAmount } = req.body;
    if (!idempotencyKey) return res.status(400).json({ error: 'idempotencyKey is required.' });
    if (!Array.isArray(items) || !items.length) return res.status(400).json({ error: 'Add at least one product.' });
    if (!paymentMethod) return res.status(400).json({ error: 'Choose a payment method.' });

    // idempotency: return existing sale
    const existing = await Sale.findOne({ idempotencyKey });
    if (existing) return res.status(200).json(existing);

    const { date, time } = istParts();
    await assertDayOpen(date);

    const settings = await Settings.findOne({ key: 'shop' });
    const negAllowed = Boolean(settings?.negativeStockAllowed);

    // Load products
    const ids = items.map((i) => i.productId).filter(Boolean);
    const prods = await Product.find({ _id: { $in: ids } });
    const map = new Map(prods.map((p) => [String(p._id), p]));
    if (prods.length !== ids.length) return res.status(400).json({ error: 'One or more products were not found.' });

    // Build snapshots server-side
    let subtotal = 0, totalCost = 0;
    const saleItems = [];
    for (const it of items) {
      const p = map.get(String(it.productId));
      if (!p || !p.active) return res.status(400).json({ error: `Product unavailable: ${it.productId}` });
      const qty = Number(it.qty); // sale packs
      if (!Number.isFinite(qty) || qty <= 0) return res.status(400).json({ error: `Invalid quantity for ${p.name}.` });
      const packSize = Math.max(1, Number(p.packSize || 1));
      const baseQty = Math.round(qty * packSize);
      const rate = Number(p.sellingPrice); // server price, ignore client rate
      const lineTotal = round2(qty * rate);
      const costPerBase = Number(p.purchasePrice) / packSize;
      const lineCost = round2(baseQty * costPerBase);
      if (p.stock - baseQty < 0 && !negAllowed) return res.status(400).json({ error: `${p.name} has only ${p.stock} in stock. Not enough for ${baseQty}.` });
      subtotal = round2(subtotal + lineTotal);
      totalCost = round2(totalCost + lineCost);
      saleItems.push({ productId: p._id, name: p.name, unit: p.unit, qty, baseQty, rate, purchasePriceSnapshot: Number(p.purchasePrice), lineTotal, lineCost });
    }
    const disc = round2(Math.max(0, Number(discount || 0)));
    const tx = settings?.taxEnabled ? round2(Math.max(0, Number(tax || 0))) : 0;
    const total = round2(subtotal - disc + tx);
    if (total < 0) return res.status(400).json({ error: 'Discount cannot exceed subtotal.' });

    // Payments server-validated
    const METHODS = ['CASH','UPI','PHONEPE','GPAY','BANK','OTHER_UPI','DUE','MIXED','OTHER'];
    if (!METHODS.includes(paymentMethod)) return res.status(400).json({ error: 'Invalid payment method.' });
    let breakdown = (paymentBreakdown || []).map((b) => ({ method: b.method, amount: round2(Number(b.amount || 0)), ref: b.ref || '' }));
    let paidAmt = paid !== undefined ? round2(Number(paid)) : round2(breakdown.reduce((s, b) => s + b.amount, 0));

    if (paymentMethod === 'MIXED') {
      const sum = round2(breakdown.reduce((s, b) => s + b.amount, 0));
      if (Math.abs(sum - paidAmt) > 0.01 && paid !== undefined) return res.status(400).json({ error: 'Mixed payment breakdown must equal paid amount.' });
      paidAmt = sum;
    } else if (paymentMethod === 'DUE') {
      if (!breakdown.length) breakdown = [{ method: 'DUE', amount: round2(total - paidAmt), ref: '' }];
    } else {
      if (!breakdown.length) breakdown = [{ method: paymentMethod === 'OTHER' ? 'OTHER' : paymentMethod, amount: paidAmt || total, ref: upiTxnId }];
      if (paid === undefined) paidAmt = total;
    }
    if (paidAmt > total + 0.001 && paymentMethod !== 'CASH') return res.status(400).json({ error: 'Paid amount cannot exceed total (except cash with change).' });
    if (paidAmt > total && paymentMethod === 'CASH') {
      // change supported
    }
    const due = round2(Math.max(0, total - paidAmt));
    const change = round2(Math.max(0, paidAmt - total));
    const paidCapped = round2(total - due);
    const sumBd = round2(breakdown.reduce((s, b) => s + b.amount, 0));
    // For cash-with-change, breakdown may equal received; normalize check loosely
    if (paymentMethod !== 'CASH' && Math.abs(sumBd - (paymentMethod === 'DUE' ? paidCapped + due : paidCapped)) > 1.01 && paymentMethod !== 'DUE' && paymentMethod !== 'MIXED') {
      // allow small tolerance; breakdown should equal paid
      if (Math.abs(sumBd - paidCapped) > 0.51) return res.status(400).json({ error: 'Payment breakdown does not match paid amount.' });
    }

    let customer = null;
    if (customerId) {
      customer = await Customer.findById(customerId);
      if (!customer) return res.status(400).json({ error: 'Customer not found.' });
    } else if (due > 0) {
      if (!customerName) return res.status(400).json({ error: 'Select or create a customer for due sale.' });
      customer = await Customer.create({ name: String(customerName).trim() });
    }

    const profit = round2(subtotal - disc - totalCost);
    const receiptNumber = await nextReceiptNumber();

    const salePayload = {
      receiptNumber, idempotencyKey, customerId: customer?._id || null, customerName: customer?.name || customerName || 'Walk-in',
      items: saleItems, subtotal, discount: disc, tax: tx, total, paid: paidCapped, due, change,
      paymentMethod, paymentBreakdown: breakdown, upiTxnId, profit, status: 'COMPLETED',
      cashier: req.user.username, cashierId: req.user._id, transactionDate: date, transactionTime: time, timezone: 'Asia/Kolkata',
    };

    const isTxnUnsupported = (e) => /replica set|transaction numbers|mongos|no longer support transactions/i.test(e?.message || '');

    // Commit step. With a session -> atomic transaction (Atlas/replica set).
    // Without -> sequential + compensation (standalone MongoDB): stock updates are
    // tracked and rolled back if a later step fails; idempotency key prevents dupes.
    async function commitWith(ses) {
      const o = ses ? { session: ses } : undefined;
      const applied = [];
      try {
        for (const si of saleItems) {
          const p = map.get(String(si.productId));
          const before = p.stock;
          const after = before - si.baseQty;
          if (o) await Product.updateOne({ _id: p._id }, { $set: { stock: after } }, o);
          else await Product.updateOne({ _id: p._id, stock: before }, { $set: { stock: after } });
          applied.push({ productId: p._id, name: p.name, baseQty: si.baseQty, before, after });
          if (o) await StockMovement.create([{ productId: p._id, productName: p.name, type: 'SALE', quantityDelta: -si.baseQty, before, after, reference: receiptNumber, reason: `Sale ${receiptNumber}`, date, time, user: req.user.username }], o);
          else await StockMovement.create({ productId: p._id, productName: p.name, type: 'SALE', quantityDelta: -si.baseQty, before, after, reference: receiptNumber, reason: `Sale ${receiptNumber}`, date, time, user: req.user.username });
        }
        const docs = o ? await Sale.create([salePayload], o) : [await Sale.create(salePayload)];
        if (customer && due > 0) {
          if (o) await Customer.updateOne({ _id: customer._id }, { $inc: { totalPurchased: total, totalPaid: paidCapped, totalDue: due } }, o);
          else await Customer.updateOne({ _id: customer._id }, { $inc: { totalPurchased: total, totalPaid: paidCapped, totalDue: due } });
        } else if (customer) {
          if (o) await Customer.updateOne({ _id: customer._id }, { $inc: { totalPurchased: total, totalPaid: paidCapped } }, o);
          else await Customer.updateOne({ _id: customer._id }, { $inc: { totalPurchased: total, totalPaid: paidCapped } });
        }
        return docs[0];
      } catch (e) {
        if (!ses) {
          // compensate: restore any stock already decremented (exactly-once)
          for (const a of applied) {
            try {
              await Product.updateOne({ _id: a.productId }, { $inc: { stock: a.baseQty } });
              await StockMovement.create({ productId: a.productId, productName: a.name, type: 'ADJUSTMENT', quantityDelta: a.baseQty, before: a.after, after: a.before, reference: receiptNumber, reason: `Rollback of failed sale ${receiptNumber}`, date, time, user: req.user.username });
            } catch { /* best effort */ }
          }
          // refresh in-memory stock snapshot
          for (const [k, p] of map) { try { const fresh = await Product.findById(k).lean(); if (fresh) p.stock = fresh.stock; } catch {} }
        }
        throw e;
      }
    }

    let session = null;
    try {
      session = await mongoose.startSession().catch(() => null);
      if (session) {
        let sale = null, txnErr = null;
        try {
          session.startTransaction();
          sale = await commitWith(session);
          await session.commitTransaction();
        } catch (e) { txnErr = e; try { await session.abortTransaction(); } catch {} }
        if (txnErr) {
          if (txnErr.code === 11000) throw txnErr;
          if (isTxnUnsupported(txnErr)) sale = await commitWith(null); // fallback: compensated ops
          else throw txnErr;
        }
        await audit(req.user, 'SALE_CREATED', 'sale', sale._id, { receiptNumber, total, paid: paidCapped, due });
        return res.status(sale ? 201 : 500).json(sale);
      }
      const sale = await commitWith(null);
      await audit(req.user, 'SALE_CREATED', 'sale', sale._id, { receiptNumber, total, paid: paidCapped, due });
      return res.status(201).json(sale);
    } finally { if (session) await session.endSession().catch(() => {}); }
  } catch (e) {
    if (e.code === 11000) {
      const dup = await Sale.findOne({ idempotencyKey: req.body?.idempotencyKey });
      if (dup) return res.status(200).json(dup);
      return res.status(409).json({ error: 'Duplicate sale. Not created twice.' });
    }
    if (e.status) return res.status(e.status).json({ error: e.publicMessage || e.message });
    next(e);
  }
});

router.get('/', async (req, res, next) => {
  try {
    const { date = '', customer = '', method = '', page = '1', limit = '30' } = req.query;
    const f = {};
    if (date) f.transactionDate = date;
    if (method) f.paymentMethod = method;
    if (customer) f.customerName = new RegExp(String(customer).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const pg = Math.max(1, parseInt(page, 10) || 1), lim = Math.min(100, parseInt(limit, 10) || 30);
    const [items, total] = await Promise.all([
      Sale.find(f).sort({ createdAt: -1 }).skip((pg - 1) * lim).limit(lim),
      Sale.countDocuments(f),
    ]);
    res.json({ items, total, page: pg, limit: lim });
  } catch (e) { next(e); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const s = await Sale.findById(req.params.id);
    if (!s) return res.status(404).json({ error: 'Sale not found.' });
    res.json(s);
  } catch (e) { next(e); }
});

// Void: reverse stock exactly once
router.post('/:id/void', requirePerm('sales.void'), async (req, res, next) => {
  try {
    const s = await Sale.findById(req.params.id);
    if (!s) return res.status(404).json({ error: 'Sale not found.' });
    if (s.status === 'VOIDED') return res.status(400).json({ error: 'Sale already voided.' });
    const { reason = 'Voided by admin' } = req.body;
    const { date, time } = istParts();
    for (const si of s.items) {
      const p = await Product.findById(si.productId);
      if (!p) continue;
      const before = p.stock, after = before + si.baseQty;
      p.stock = after; await p.save();
      await StockMovement.create({ productId: p._id, productName: p.name, type: 'SALE_VOID', quantityDelta: si.baseQty, before, after, reference: s.receiptNumber, referenceId: String(s._id), reason, date, time, user: req.user.username });
    }
    if (s.customerId && s.due > 0) {
      await Customer.updateOne({ _id: s.customerId }, { $inc: { totalPurchased: -s.total, totalPaid: -s.paid, totalDue: -s.due } });
    } else if (s.customerId) {
      await Customer.updateOne({ _id: s.customerId }, { $inc: { totalPurchased: -s.total, totalPaid: -s.paid } });
    }
    s.status = 'VOIDED'; s.voidReason = reason; await s.save();
    await audit(req.user, 'SALE_VOIDED', 'sale', s._id, { receiptNumber: s.receiptNumber, reason });
    res.json(s);
  } catch (e) { next(e); }
});

module.exports = router;
