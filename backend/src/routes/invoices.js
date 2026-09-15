const express = require('express');
const multer = require('multer');
const crypto = require('crypto');
const Product = require('../models/Product');
const Purchase = require('../models/Purchase');
const { InvoiceImport, Settings, Document } = require('../models/Misc');
const { auth, requirePerm } = require('../middleware/auth');
const { audit } = require('../middleware/common');
const { uploadBuffer, FOLDERS } = require('../services/storage');
const { extractInvoiceText, validateInvoiceMath } = require('../services/ai');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 }, fileFilter: (req, f, cb) => {
  const ok = /pdf|jpeg|jpg|png|webp|heic|heif|octet-stream/i.test(f.mimetype) || /\.(pdf|jpe?g|png|webp|heic|heif)$/i.test(f.originalname);
  cb(ok ? null : new Error('Only PDF/JPG/PNG/HEIC allowed.'), ok);
}});

const router = express.Router();
router.use(auth);

// Upload bill -> store original, extract (OCR/AI), return review object. Never auto-commits.
router.post('/upload', upload.single('bill'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Upload a PDF/JPG/PNG bill.' });
    const stored = await uploadBuffer(req.file.buffer, FOLDERS.bills, req.file.originalname);
    await Document.create({ title: req.file.originalname, category: 'Invoices', fileUrl: stored.url, publicId: stored.publicId, mimeType: req.file.mimetype, filename: req.file.originalname, uploadedBy: req.user.username, docDate: new Date().toISOString().slice(0, 10) });
    const rawText = req.body?.rawText || req.body?.ocrText || '';
    const extracted = await extractInvoiceText(rawText || `Filename: ${req.file.originalname}. (No OCR text provided — review manually.)`);
    const inv = extracted.data || {};
    const mathIssues = validateInvoiceMath(inv);
    const fp = crypto.createHash('sha256').update(`${(inv.supplier || '').toLowerCase()}|${(inv.invoiceNumber || '').toLowerCase()}|${(inv.orderNumber || '').toLowerCase()}|${Number(inv.grandTotal || 0)}`).digest('hex');
    const or = [{ fingerprint: fp, status: 'COMPLETED' }];
    if ((inv.invoiceNumber || inv.orderNumber) && inv.supplier) {
      if (inv.invoiceNumber) or.push({ supplier: inv.supplier, invoiceNumber: inv.invoiceNumber, status: 'COMPLETED' });
      if (inv.orderNumber) or.push({ supplier: inv.supplier, orderNumber: inv.orderNumber, status: 'COMPLETED' });
    }
    const dup = await Purchase.findOne({ $or: or });
    const doc = await InvoiceImport.create({
      supplier: inv.supplier || '', invoiceNumber: inv.invoiceNumber || '', orderNumber: inv.orderNumber || '',
      invoiceDate: inv.invoiceDate || '', paymentStatus: inv.paymentStatus || '', items: inv.items || [],
      subtotal: Number(inv.subtotal || 0), discount: Number(inv.discount || 0), tax: Number(inv.tax || 0),
      shipping: Number(inv.shipping || 0), grandTotal: Number(inv.grandTotal || 0), paid: Number(inv.paid || 0), due: Number(inv.due || 0),
      fingerprint: fp, mathWarning: mathIssues.join('; '), duplicateWarning: Boolean(dup),
      fileUrl: stored.url, filePublicId: stored.publicId, rawText: String(rawText).slice(0, 20000),
    });
    // match against real products (never auto-create)
    const matches = [];
    for (const it of doc.items) {
      const p = await Product.findOne({ $or: [{ name: new RegExp(String(it.name).slice(0, 30).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') }] });
      matches.push({ billName: it.name, matchedProductId: p?._id || null, matchedName: p?.name || null, status: p ? 'matched' : 'unmatched' });
    }
    await audit(req.user, 'INVOICE_IMPORTED', 'invoice', doc._id, { supplier: doc.supplier, invoiceNumber: doc.invoiceNumber });
    res.status(201).json({ import: doc, mathIssues, duplicateWarning: Boolean(dup), matches, source: extracted.source, warning: extracted.warning, message: mathIssues.length ? '⚠ Bill total mismatch — review before saving.' : 'Review extracted bill, then confirm to save.' });
  } catch (e) { next(e); }
});

router.get('/', async (req, res, next) => {
  try { res.json(await InvoiceImport.find().sort({ createdAt: -1 }).limit(100)); } catch (e) { next(e); }
});

router.post('/:id/commit', requirePerm('purchases.create'), async (req, res, next) => {
  try {
    const doc = await InvoiceImport.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Import not found.' });
    if (doc.status === 'COMMITTED') return res.status(400).json({ error: 'Already committed.' });
    if (doc.duplicateWarning && !req.body?.confirmDuplicate) return res.status(409).json({ error: 'This invoice may already have been added. Confirm to proceed.', duplicate: true });
    const edited = req.body?.items || doc.items;
    // forward to purchases logic via internal create (reuse validation lightly)
    const PurchaseModel = Purchase;
    const subtotal = edited.reduce((s, i) => s + Number(i.lineTotal || 0), 0);
    const grandTotal = subtotal + Number(doc.tax || 0) + Number(doc.shipping || 0) - Number(doc.discount || 0);
    const created = await PurchaseModel.create({
      invoiceNumber: doc.invoiceNumber || `BILL-${Date.now()}`, orderNumber: doc.orderNumber || '', supplier: doc.supplier || '',
      source: 'Supplier', owner: 'Shop', items: edited.map((i) => ({ name: i.name, qty: Number(i.qty), baseQty: Number(i.qty), unitPrice: Number(i.unitPrice), sellingPrice: 0, lineTotal: Number(i.lineTotal) })),
      subtotal, discount: doc.discount, tax: doc.tax, shipping: doc.shipping, grandTotal, paid: doc.paid, due: grandTotal - doc.paid,
      addToStock: req.body?.addToStock !== false, billUrl: doc.fileUrl, billPublicId: doc.filePublicId, fingerprint: doc.fingerprint,
      purchaseDate: doc.invoiceDate || new Date().toISOString().slice(0, 10), purchaseTime: '12:00:00', createdBy: req.user.username,
    });
    doc.status = 'COMMITTED'; await doc.save();
    await audit(req.user, 'INVOICE_COMMITTED', 'purchase', created._id, { invoiceNumber: created.invoiceNumber });
    res.status(201).json(created);
  } catch (e) { next(e); }
});

module.exports = router;
