const express = require('express');
const mongoose = require('mongoose');
const Sale = require('../models/Sale');
const { header, footer, sendPdf } = require('../services/pdf');
const { Settings } = require('../models/Misc');
const { auth } = require('../middleware/auth');

const router = express.Router();

router.get('/health', async (req, res) => {
  const db = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
  res.json({ ok: true, time: new Date().toISOString(), database: db });
});

// Receipt PDF (public shape but require auth)
router.get('/sales/:id/receipt.pdf', auth, async (req, res, next) => {
  try {
    const s = await Sale.findById(req.params.id);
    if (!s) return res.status(404).json({ error: 'Sale not found.' });
    const settings = await Settings.findOne({ key: 'shop' });
    sendPdf(res, `${s.receiptNumber}.pdf`, (doc) => {
      header(doc, settings, `Receipt ${s.receiptNumber}`);
      doc.fontSize(9).text(`${s.transactionDate} ${s.transactionTime} IST  |  Cashier: ${s.cashier}  |  Customer: ${s.customerName}`);
      doc.moveDown(0.3);
      s.items.forEach((i) => doc.fontSize(10).text(`${i.name} x ${i.qty} @ Rs.${i.rate} = Rs.${i.lineTotal}`));
      doc.moveDown(0.3);
      doc.fontSize(10).text(`Subtotal Rs.${s.subtotal}  Discount Rs.${s.discount}  Total Rs.${s.total}`);
      doc.text(`Paid Rs.${s.paid}  Due Rs.${s.due}  Change Rs.${s.change}  via ${s.paymentMethod}`);
      footer(doc, settings);
    });
  } catch (e) { next(e); }
});

module.exports = router;
