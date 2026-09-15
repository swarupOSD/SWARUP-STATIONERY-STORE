const express = require('express');
const Sale = require('../models/Sale');
const Purchase = require('../models/Purchase');
const Payment = require('../models/Payment');
const Product = require('../models/Product');
const Customer = require('../models/Customer');
const { Settings } = require('../models/Misc');
const { auth } = require('../middleware/auth');
const { istParts, todayIST, prettyDateIST } = require('../utils/ist');
const { header, footer, sendPdf } = require('../services/pdf');

const router = express.Router();
router.use(auth);

async function dailySummary(dateStr) {
  const sales = await Sale.find({ transactionDate: dateStr, status: 'COMPLETED' });
  const payments = await Payment.find({ paymentDate: dateStr });
  let totalSales = 0, totalCost = 0, discount = 0, cash = 0, upi = 0, bank = 0, dueGiven = 0, itemsSold = 0;
  const byProduct = new Map(), byHour = new Map(), byMethod = {};
  for (const s of sales) {
    totalSales += s.total; discount += s.discount || 0; dueGiven += s.due || 0; itemsSold += s.items.reduce((a, i) => a + i.qty, 0);
    totalCost += s.items.reduce((a, i) => a + (i.lineCost || 0), 0);
    for (const b of s.paymentBreakdown || []) {
      const m = b.method;
      byMethod[m] = (byMethod[m] || 0) + b.amount;
      if (['CASH'].includes(m)) cash += b.amount;
      else if (['UPI','PHONEPE','GPAY','OTHER_UPI'].includes(m)) upi += b.amount;
      else if (['BANK'].includes(m)) bank += b.amount;
    }
    if (s.paymentMethod === 'CASH' && !(s.paymentBreakdown || []).length) cash += s.paid;
    for (const it of s.items) {
      const e = byProduct.get(String(it.productId)) || { name: it.name, qty: 0, revenue: 0, cost: 0 };
      e.qty += it.qty; e.revenue += it.lineTotal; e.cost += it.lineCost || 0;
      byProduct.set(String(it.productId), e);
    }
    const hh = (s.transactionTime || '00:00:00').slice(0, 2);
    byHour.set(hh, (byHour.get(hh) || 0) + s.total);
  }
  let dueCollected = 0;
  for (const p of payments) dueCollected += p.amount;
  const profit = Math.round((totalSales - discount * 0 - totalCost - 0) * 100) / 100 - 0; // profit = revenue - COGS - discount already in total
  const grossProfit = Math.round((sales.reduce((a, s) => a + (s.profit || 0), 0)) * 100) / 100;
  return {
    date: dateStr, prettyDate: prettyDateIST(dateStr),
    totalSales: Math.round(totalSales * 100) / 100,
    totalCost: Math.round(totalCost * 100) / 100,
    grossProfit, discount: Math.round(discount * 100) / 100,
    cash: Math.round(cash * 100) / 100, upi: Math.round(upi * 100) / 100, bank: Math.round(bank * 100) / 100,
    dueGiven: Math.round(dueGiven * 100) / 100, dueCollected: Math.round(dueCollected * 100) / 100,
    numSales: sales.length, itemsSold, byMethod,
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

module.exports = router;
module.exports.dailySummary = dailySummary;
