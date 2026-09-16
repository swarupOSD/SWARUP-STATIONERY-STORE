const express = require('express');
const Sale = require('../models/Sale');
const Purchase = require('../models/Purchase');
const Payment = require('../models/Payment');
const Product = require('../models/Product');
const Customer = require('../models/Customer');
const Supplier = require('../models/Supplier');
const { Settings } = require('../models/Misc');
const { auth } = require('../middleware/auth');
const { istParts, todayIST, prettyDateIST } = require('../utils/ist');
const { header, footer, sendPdf } = require('../services/pdf');

const router = express.Router();
router.use(auth);

async function dailySummary(dateStr) {
  const { Return } = require('../models/Dues');
  const Expense = require('../models/Expense');
  const sales = await Sale.find({ transactionDate: dateStr, status: 'COMPLETED' });
  const payments = await Payment.find({ paymentDate: dateStr });
  const returns = await Return.find({ returnDate: dateStr });
  const { SupplierPayment } = require('../models/Dues');
  const expenses = await Expense.find({ expenseDate: dateStr });
  const supplierPayments = await SupplierPayment.find({ paymentDate: dateStr });
  let totalSales = 0, totalCost = 0, discount = 0, cash = 0, upi = 0, bank = 0, dueGiven = 0, itemsSold = 0;
  let cashIn = 0, cashOut = 0;
  const byProduct = new Map(), byHour = new Map(), byMethod = {}, byAccount = {}, bySeller = {};
  for (const s of sales) {
    totalSales += s.total; discount += s.discount || 0; dueGiven += s.due || 0; itemsSold += s.items.reduce((a, i) => a + i.qty, 0);
    totalCost += s.items.reduce((a, i) => a + (i.lineCost || 0), 0);
    for (const b of s.paymentBreakdown || []) {
      const m = b.method;
      byMethod[m] = (byMethod[m] || 0) + b.amount;
      if (b.account) byAccount[b.account] = Math.round(((byAccount[b.account] || 0) + b.amount) * 100) / 100;
      if (['CASH'].includes(m)) { cash += b.amount; cashIn += b.amount; }
      else if (['UPI','PHONEPE','GPAY','OTHER_UPI'].includes(m)) upi += b.amount;
      else if (['BANK'].includes(m)) bank += b.amount;
    }
    if (s.paymentMethod === 'CASH' && !(s.paymentBreakdown || []).length) { cash += s.paid; cashIn += s.paid; }
    const seller = s.soldBy || 'Ami';
    bySeller[seller] = bySeller[seller] || { name: seller, bills: 0, total: 0 };
    bySeller[seller].bills += 1; bySeller[seller].total = Math.round((bySeller[seller].total + s.total) * 100) / 100;
    for (const it of s.items) {
      const e = byProduct.get(String(it.productId)) || { name: it.name, qty: 0, revenue: 0, cost: 0 };
      e.qty += it.qty; e.revenue += it.lineTotal; e.cost += it.lineCost || 0;
      byProduct.set(String(it.productId), e);
    }
    const hh = (s.transactionTime || '00:00:00').slice(0, 2);
    byHour.set(hh, (byHour.get(hh) || 0) + s.total);
  }
  let dueCollected = 0;
  for (const p of payments) {
    dueCollected += p.amount;
    if (p.account) byAccount[p.account] = Math.round(((byAccount[p.account] || 0) + p.amount) * 100) / 100;
    if (p.method === 'CASH') cashIn += p.amount;
  }
  for (const e of expenses) if (e.method === 'CASH') cashOut += e.amount;
  for (const sp of supplierPayments) if (sp.method === 'CASH') cashOut += sp.amount;
  let returnsTotal = 0, returnsCost = 0, returnsCount = 0;
  for (const r of returns) { returnsTotal += r.refundTotal || 0; returnsCost += r.refundCost || 0; returnsCount += 1; if (r.refundMethod === 'CASH') cashOut += r.refundTotal || 0; }
  totalSales = Math.round((totalSales - returnsTotal) * 100) / 100;
  totalCost = Math.round((totalCost - returnsCost) * 100) / 100;
  const profit = Math.round((totalSales - discount * 0 - totalCost - 0) * 100) / 100 - 0; // profit = revenue - COGS - discount already in total
  const grossProfit = Math.round((sales.reduce((a, s) => a + (s.profit || 0), 0) - (returnsTotal - returnsCost)) * 100) / 100;
  const expensesTotal = Math.round(expenses.reduce((s, e) => s + (e.amount || 0), 0) * 100) / 100;
  const netProfit = Math.round((grossProfit - expensesTotal) * 100) / 100;
  return {
    date: dateStr, prettyDate: prettyDateIST(dateStr),
    totalSales: Math.round(totalSales * 100) / 100,
    totalCost: Math.round(totalCost * 100) / 100,
    grossProfit, discount: Math.round(discount * 100) / 100,
    expensesTotal, netProfit,
    returnsTotal: Math.round(returnsTotal * 100) / 100, returnsCount,
    cash: Math.round(cash * 100) / 100, upi: Math.round(upi * 100) / 100, bank: Math.round(bank * 100) / 100,
    dueGiven: Math.round(dueGiven * 100) / 100, dueCollected: Math.round(dueCollected * 100) / 100,
    numSales: sales.length, itemsSold, byMethod, byAccount,
    bySeller: Object.values(bySeller),
    drawer: { in: Math.round(cashIn * 100) / 100, out: Math.round(cashOut * 100) / 100, expected: Math.round((cashIn - cashOut) * 100) / 100 },
    byProduct: [...byProduct.values()].map((e) => ({ ...e, profit: Math.round((e.revenue - e.cost) * 100) / 100 })),
    byHour: [...byHour.entries()].sort().map(([h, v]) => ({ hour: h, total: Math.round(v * 100) / 100 })),
  };
}

router.get('/today', async (req, res, next) => {
  try {
    const date = req.query.date || todayIST();
    const summary = await dailySummary(date);
    const lowStock = await Product.countDocuments({ $expr: { $lte: ['$stock', '$minStock'] } });
    const outstandingDue = (await Customer.aggregate([{ $group: { _id: null, due: { $sum: '$totalDue' } } }]))[0]?.due || 0;
    res.json({ ...summary, lowStock, outstandingDue });
  } catch (e) { next(e); }
});

router.get('/daily', async (req, res, next) => {
  try {
    const { from = todayIST(), to = todayIST() } = req.query;
    const out = [];
    const d0 = new Date(from), d1 = new Date(to);
    for (let d = new Date(d0); d <= d1; d.setDate(d.getDate() + 1)) {
      const ds = d.toISOString().slice(0, 10);
      out.push(await dailySummary(ds));
      if (out.length > 62) break;
    }
    res.json(out);
  } catch (e) { next(e); }
});

router.get('/daily.pdf', async (req, res, next) => {
  try {
    const date = req.query.date || todayIST();
    const s = await dailySummary(date);
    const settings = await Settings.findOne({ key: 'shop' });
    sendPdf(res, `daily-${date}.pdf`, (doc) => {
      header(doc, settings, `Daily Report — ${s.prettyDate}`);
      const { time } = istParts();
      doc.fontSize(9).text(`Generated: ${date} ${time} IST`);
      doc.moveDown(0.3);
      doc.fontSize(11).text(`Sales Rs.${s.totalSales}   Cost Rs.${s.totalCost}   Profit Rs.${s.grossProfit}`);
      doc.fontSize(10).text(`Cash Rs.${s.cash}   UPI Rs.${s.upi}   Bank Rs.${s.bank}   Due Rs.${s.dueGiven}   Due Collected Rs.${s.dueCollected}`);
      doc.fontSize(10).text(`Bills: ${s.numSales}   Items: ${s.itemsSold}`);
      doc.moveDown(0.4);
      doc.fontSize(11).text('Product-wise', { underline: true });
      s.byProduct.slice(0, 60).forEach((p) => doc.fontSize(9).text(`${p.name} x${p.qty}  Rs.${p.revenue}  cost Rs.${p.cost}  profit Rs.${p.profit}`));
      doc.moveDown(0.3);
      doc.fontSize(11).text('Time-wise', { underline: true });
      s.byHour.forEach((h) => doc.fontSize(9).text(`${h.hour}:00 — Rs.${h.total}`));
      footer(doc, settings);
    });
  } catch (e) { next(e); }
});

router.get('/export/:type', async (req, res, next) => {
  try {
    if (req.user.role !== 'ADMIN') return res.status(403).json({ error: 'Admin only.' });
    const { type } = req.params;
    if (type === 'all') return fullBackup(req, res, next);
    const { format = 'json' } = req.query;
    const Models = { sales: Sale, purchases: Purchase, payments: Payment, products: Product, customers: Customer };
    const M = Models[type];
    if (!M) return res.status(400).json({ error: 'Unknown export type.' });
    const rows = await M.find().limit(5000).lean();
    if (format === 'csv') {
      const keys = Object.keys(rows[0] || { _id: 1 });
      const csv = [keys.join(',')].concat(rows.map((r) => keys.map((k) => JSON.stringify(r[k] ?? '')).join(','))).join('\n');
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${type}.csv"`);
      return res.send(csv);
    }
    res.json(rows);
  } catch (e) { next(e); }
});

// Buy list: low/out-of-stock products with suggested order qty + last buy price.
router.get('/buy-list', async (req, res, next) => {
  try {
    const low = await Product.find({ active: true, $expr: { $lte: ['$stock', '$minStock'] } })
      .select('name stock minStock purchasePrice unit packSize supplier category').limit(200).lean();
    const ids = low.map((p) => p._id);
    const lastBuys = ids.length ? await Purchase.aggregate([
      { $match: { status: 'COMPLETED', 'items.productId': { $in: ids } } },
      { $unwind: '$items' },
      { $match: { 'items.productId': { $in: ids } } },
      { $sort: { createdAt: -1 } },
      { $group: { _id: '$items.productId', unitPrice: { $first: '$items.unitPrice' }, supplier: { $first: '$supplier' } } },
    ]) : [];
    const lbMap = new Map(lastBuys.map((x) => [String(x._id), x]));
    const items = low.map((p) => {
      const lb = lbMap.get(String(p._id)) || {};
      const suggest = Math.max(1, (p.minStock ?? 5) * 2 - p.stock);
      return {
        productId: p._id, name: p.name, stock: p.stock, minStock: p.minStock, unit: p.unit,
        lastPrice: lb.unitPrice ?? p.purchasePrice, supplier: lb.supplier || p.supplier || '',
        suggestQty: suggest, estCost: Math.round(suggest * (lb.unitPrice ?? p.purchasePrice) * 100) / 100,
      };
    });
    res.json({ count: items.length, estTotal: Math.round(items.reduce((s, x) => s + x.estCost, 0) * 100) / 100, items });
  } catch (e) { next(e); }
});

// Dead stock: active products with stock that haven't sold in N days.
router.get('/dead-stock', async (req, res, next) => {
  try {
    const days = Math.min(365, Math.max(7, parseInt(req.query.days, 10) || 30));
    const since = new Date(Date.now() - days * 86400000);
    const soldIds = await Sale.distinct('items.productId', { status: 'COMPLETED', createdAt: { $gte: since } });
    const set = new Set(soldIds.map(String));
    const stocked = await Product.find({ active: true, stock: { $gt: 0 } }).select('name stock sellingPrice purchasePrice packSize category').lean();
    const lastSold = await Sale.aggregate([
      { $match: { status: 'COMPLETED' } },
      { $unwind: '$items' },
      { $group: { _id: '$items.productId', last: { $max: '$createdAt' } } },
    ]);
    const lastMap = new Map(lastSold.map((x) => [String(x._id), x.last]));
    const dead = stocked
      .filter((p) => !set.has(String(p._id)))
      .map((p) => ({
        _id: p._id, name: p.name, category: p.category, stock: p.stock,
        stockValue: Math.round(p.stock * (p.purchasePrice / Math.max(1, p.packSize || 1))),
        lastSold: lastMap.get(String(p._id)) || null,
      }))
      .sort((a, b) => b.stockValue - a.stockValue);
    res.json({ days, count: dead.length, value: dead.reduce((s, x) => s + x.stockValue, 0), items: dead.slice(0, 200) });
  } catch (e) { next(e); }
});

// Full JSON backup (admin): all business collections in one file.
async function fullBackup(req, res, next) {
  try {
    const { SupplierPayment, Return } = require('../models/Dues');
    const pick = (q) => q.limit(5000).lean();
    const [products, customers, sales, purchases, payments, suppliers, categories, supplierPayments, returns] = await Promise.all([
      pick(Product.find()), pick(Customer.find()), pick(Sale.find()), pick(Purchase.find()), pick(Payment.find()),
      pick(Supplier.find()), pick(require('../models/Category').find()), pick(SupplierPayment.find()), pick(Return.find()),
    ]);
    const settings = await Settings.findOne({ key: 'shop' }).lean();
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="swarup-backup-${todayIST()}.json"`);
    res.json({ app: 'swarup-store', version: 1, exportedAt: new Date().toISOString(), settings, products, customers, sales, purchases, payments, suppliers, categories, supplierPayments, returns });
  } catch (e) { next(e); }
}

module.exports = router;
module.exports.dailySummary = dailySummary;
