const express = require('express');
const multer = require('multer');
const crypto = require('crypto');
const Product = require('../models/Product');
const Purchase = require('../models/Purchase');
const Supplier = require('../models/Supplier');
const Category = require('../models/Category');
const { InvoiceImport, Settings, Document } = require('../models/Misc');
const { auth, requirePerm } = require('../middleware/auth');
const { audit } = require('../middleware/common');
const { istParts } = require('../utils/ist');
const { uploadBuffer, FOLDERS } = require('../services/storage');
const { extractInvoiceText, validateInvoiceMath, suggestTemplate } = require('../services/ai');
const { extractPdfText, isFlipkart, parseFlipkart } = require('../services/flipkart');
const { applyPurchaseStock } = require('../services/stockApply');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 }, fileFilter: (req, f, cb) => {
  const ok = /pdf|jpeg|jpg|png|webp|heic|heif|octet-stream/i.test(f.mimetype) || /\.(pdf|jpe?g|png|webp|heic|heif)$/i.test(f.originalname);
  cb(ok ? null : new Error('Only PDF/JPG/PNG/HEIC allowed.'), ok);
}});

const router = express.Router();
router.use(auth);
const STOP = new Set(['pack', 'packet', 'combo', 'new', 'with', 'free', 'set', 'pcs', 'pc', 'the', 'and', 'for', 'per']);
const escRx = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Fuzzy product match: exact → alias → token overlap (≥50% significant tokens).
async function findProduct(name) {
  const clean = String(name || '').trim();
  if (clean.length < 2) return null;
  let p = await Product.findOne({ $or: [{ name: new RegExp(`^${escRx(clean.slice(0, 60))}$`, 'i') }, { aliases: clean }] });
  if (p) return p;
  const toks = clean.toLowerCase().replace(/[^a-z0-9\u0980-\u09FF ]/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w));
  if (!toks.length) return null;
  const cands = await Product.find({ active: true, $or: toks.slice(0, 6).map((t) => ({ name: new RegExp(escRx(t), 'i') })) }).limit(25);
  let best = null, bestScore = 0;
  for (const c of cands) {
    const ct = c.name.toLowerCase().split(/[^a-z0-9\u0980-\u09FF]+/);
    const hit = toks.filter((t) => ct.some((x) => x === t || (x.length > 3 && t.length > 3 && (x.startsWith(t) || t.startsWith(x)))));
    const score = hit.length / toks.length;
    if (score > bestScore) { bestScore = score; best = c; }
  }
  return bestScore >= 0.5 ? best : null;
}

async function ensureCategory(name) {
  const n = String(name || 'Other').trim() || 'Other';
  let c = await Category.findOne({ name: new RegExp(`^${escRx(n)}$`, 'i') });
  if (!c) c = await Category.create({ name: n });
  return c.name;
}

async function ensureSupplier(name) {
  const n = String(name || '').trim();
  if (!n) return null;
  let s = await Supplier.findOne({ name: new RegExp(`^${escRx(n)}$`, 'i') });
  if (!s) s = await Supplier.create({ name: n });
  return s;
}

// Upload bill -> store original, read PDF text, parse (Flipkart-aware), return review. Never auto-commits.
router.post('/upload', upload.single('bill'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Upload a PDF/JPG/PNG bill.' });
    const stored = await uploadBuffer(req.file.buffer, FOLDERS.bills, req.file.originalname);
    await Document.create({ title: req.file.originalname, category: 'Invoices', fileUrl: stored.url, publicId: stored.publicId, mimeType: req.file.mimetype, filename: req.file.originalname, uploadedBy: req.user.username, docDate: new Date().toISOString().slice(0, 10) });

    const isPdf = /pdf/i.test(req.file.mimetype) || /\.pdf$/i.test(req.file.originalname);
    let pdfText = '';
    if (isPdf) pdfText = await extractPdfText(req.file.buffer);
    const pasted = String(req.body?.rawText || req.body?.ocrText || '').trim();
    const rawText = [pasted, pdfText].filter(Boolean).join('\n');
    if (!rawText) {
      return res.status(422).json({ error: 'Could not read this file.', hint: 'If it is a photo/scanned bill, paste the bill text below or type the items manually, then upload again.' });
    }

    let inv, docType = 'generic', parseNotes = [], source = 'heuristic', debug = null;
    if (isFlipkart(rawText)) {
      inv = parseFlipkart(rawText);
      docType = 'flipkart'; source = 'flipkart-parser'; parseNotes = inv.notes || []; debug = inv.debug || null;
      delete inv.notes; delete inv.debug;
    } else {
      const extracted = await extractInvoiceText(rawText);
      inv = extracted.data || {};
      source = extracted.source || source;
      if (extracted.warning) parseNotes.push(extracted.warning);
    }

    const mathIssues = validateInvoiceMath(inv);
    if (!inv.items?.length) {
      return res.status(422).json({ error: 'No items found in this bill.', hint: 'For Flipkart use the downloaded invoice PDF. For photos, paste the bill text (name qty × rate) and upload again, or add the purchase manually.', debug: debug || null, parseNotes, textPreview: rawText.slice(0, 1500), textChars: rawText.length });
    }
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
      fileUrl: stored.url, filePublicId: stored.publicId, rawText: rawText.slice(0, 20000),
      docType, parseNotes,
    });
    const matches = [];
    for (const it of doc.items) {
      const p = await findProduct(it.name);
      matches.push({ billName: it.name, matchedProductId: p?._id || null, matchedName: p?.name || null, status: p ? 'matched' : 'will-create' });
    }
    const willCreate = matches.filter((m) => m.status === 'will-create').length;
    await audit(req.user, 'INVOICE_IMPORTED', 'invoice', doc._id, { supplier: doc.supplier, invoiceNumber: doc.invoiceNumber, docType });
    res.status(201).json({
      import: doc, mathIssues, duplicateWarning: Boolean(dup), matches, source, docType, parseNotes, debug,
      textPreview: rawText.slice(0, 1500), textChars: rawText.length,
      message: docType === 'flipkart'
        ? `Flipkart invoice read: ${doc.items.length} items (${matches.length - willCreate} matched, ${willCreate} new). Review once, then confirm — products & stock get added.`
        : 'Review extracted bill, then confirm to save.',
    });
  } catch (e) { next(e); }
});

router.get('/', async (req, res, next) => {
  try { res.json(await InvoiceImport.find().sort({ createdAt: -1 }).limit(100)); } catch (e) { next(e); }
});

// Commit: resolve/create products, create purchase, apply stock once, return summary.
router.post('/:id/commit', requirePerm('purchases.create'), async (req, res, next) => {
  try {
    const doc = await InvoiceImport.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Import not found.' });
    if (doc.status === 'COMMITTED') return res.status(400).json({ error: 'Already committed.' });
    if (doc.duplicateWarning && !req.body?.confirmDuplicate) return res.status(409).json({ error: 'This invoice may already have been added. Confirm to proceed.', duplicate: true });

    const edited = req.body?.items || doc.items;
    const autoCreate = req.body?.autoCreate !== false;
    const addToStock = req.body?.addToStock !== false;
    const settings = await Settings.findOne({ key: 'shop' });
    const margin = Math.min(200, Math.max(0, Number(settings?.defaultMarginPct || 0)));
    const { date, time } = istParts();
    const supplierName = String(req.body?.supplier || doc.supplier || '').trim();
    const supplierDoc = await ensureSupplier(supplierName);
    const source = req.body?.source || (doc.docType === 'flipkart' ? 'Flipkart' : 'Supplier');

    const created = [], matched = [], norm = [];
    for (const it of edited) {
      const qty = Number(it.qty), up = Number(it.unitPrice);
      if (!(qty > 0) || !(up >= 0)) return res.status(400).json({ error: `Invalid qty/price for ${it.name || 'item'}.` });
      const lineTotal = Math.round((it.lineTotal !== undefined ? Number(it.lineTotal) : qty * up) * 100) / 100;
      let productId = it.productId || null, productName = String(it.name || 'Item');
      if (productId) {
        const p = await Product.findById(productId);
        if (!p) return res.status(400).json({ error: `Product not found for ${productName}.` });
        matched.push({ billName: productName, productId: p._id, name: p.name });
      } else {
        const p = await findProduct(productName);
        if (p) {
          productId = p._id;
          matched.push({ billName: productName, productId: p._id, name: p.name });
        } else if (autoCreate && productName.trim().length >= 2) {
          const tpl = suggestTemplate(productName);
          const category = await ensureCategory(it.category || tpl.category);
          const selling = Math.round(up * (1 + margin / 100) * 100) / 100;
          const np = await Product.create({
            name: productName.trim(), category, unit: tpl.unit, packSize: tpl.packSize,
            purchasePrice: up, sellingPrice: selling, stock: 0, supplier: supplierName,
            needsPricing: true, notes: `Auto-added from ${source} bill ${doc.invoiceNumber || doc.orderNumber || ''}`.trim(),
          });
          productId = np._id;
          created.push({ billName: productName, productId: np._id, name: np.name, category, sellingPrice: selling });
          await audit(req.user, 'PRODUCT_CREATED', 'product', np._id, { name: np.name, via: 'invoice-import' });
        } else {
          return res.status(400).json({ error: `"${productName}" matches no product. Enable auto-create or map it first.` });
        }
      }
      norm.push({ productId, name: productName, qty, baseQty: Number(it.baseQty || qty), unitPrice: up, sellingPrice: 0, lineTotal });
    }

    const subtotal = Math.round(norm.reduce((s, i) => s + i.lineTotal, 0) * 100) / 100;
    const grandTotal = Math.round((subtotal + Number(doc.tax || 0) + Number(doc.shipping || 0) - Number(doc.discount || 0)) * 100) / 100;
    const paid = doc.docType === 'flipkart' ? grandTotal : Number(doc.paid || 0);
    const createdDoc = await Purchase.create({
      invoiceNumber: doc.invoiceNumber || `BILL-${Date.now()}`, orderNumber: doc.orderNumber || '',
      supplier: supplierName, supplierId: supplierDoc?._id || null,
      source, owner: 'Shop', items: norm,
      subtotal, discount: doc.discount, tax: doc.tax, shipping: doc.shipping, grandTotal,
      paid, due: Math.round((grandTotal - paid) * 100) / 100,
      addToStock, billUrl: doc.fileUrl, billPublicId: doc.filePublicId, fingerprint: doc.fingerprint,
      purchaseDate: doc.invoiceDate || date, purchaseTime: time, createdBy: req.user.username,
    });

    let stock = { lines: 0, units: 0 };
    if (addToStock) {
      stock = await applyPurchaseStock({ items: norm, ref: createdDoc.invoiceNumber, purchaseId: createdDoc._id, date, time, username: req.user.username });
    }
    doc.status = 'COMMITTED'; await doc.save();
    await audit(req.user, 'INVOICE_COMMITTED', 'purchase', createdDoc._id, { invoiceNumber: createdDoc.invoiceNumber, created: created.length, matched: matched.length, stock });
    res.status(201).json({
      purchase: createdDoc, created, matched, stock,
      needsPricing: created.length,
      message: `Added ${created.length} new + ${matched.length} matched products • stock +${stock.units} units.`,
    });
  } catch (e) { next(e); }
});

module.exports = router;
