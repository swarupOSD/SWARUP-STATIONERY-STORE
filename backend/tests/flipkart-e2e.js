// Live Flipkart PDF flow test — ISOLATED test database only. Run: E2E_BASE=http://127.0.0.1:5055 node tests/flipkart-e2e.js
const assert = require('node:assert/strict');
const PDFDocument = require('pdfkit');
const fs = require('fs');

const BASE = process.env.E2E_BASE || 'http://127.0.0.1:5055';

function makePdf(path) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40 });
    const w = fs.createWriteStream(path);
    doc.pipe(w);
    doc.fontSize(18).text('Flipkart Internet Private Limited');
    doc.fontSize(14).text('Tax Invoice');
    doc.fontSize(11).text('Invoice No: FKTEST20260915');
    doc.text('Order ID: OD998877665544332211');
    doc.text('Invoice Date: 14-09-2026');
    doc.moveDown();
    doc.text('Description of Goods');
    doc.text('Reynolds Trimax Gel Pen Blue  10  250.00  0.00  250.00');
    doc.text('Classmate Long Notebook 172 Pages  5  300.00  25.00  275.00');
    doc.moveDown();
    doc.text('IGST  63.00');
    doc.text('Shipping Charges  40.00');
    doc.text('Grand Total  628.00');
    doc.end();
    w.on('finish', resolve); w.on('error', reject);
  });
}

(async () => {
  const pdfPath = 'C:\\Users\\user\\AppData\\Local\\Temp\\opencode\\fktest.pdf';
  await makePdf(pdfPath);
  const buf = fs.readFileSync(pdfPath);

  // login (fresh test-db admin seeded by server env)
  let r = await fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'e2eadmin', password: 'E2ePass123!' }) });
  assert.equal(r.status, 200, 'login');
  const token = (await r.json()).token;
  const H = { Authorization: `Bearer ${token}` };

  // pre-create one product to test fuzzy matching (pen already in shop)
  await fetch(BASE + '/api/products', { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Reynolds Trimax Gel Pen', category: 'Stationery', unit: 'piece', packSize: 1, purchasePrice: 20, sellingPrice: 25, stock: 5 }) });

  // upload PDF
  const fd = new FormData();
  fd.append('bill', new Blob([buf], { type: 'application/pdf' }), 'flipkart-invoice.pdf');
  r = await fetch(BASE + '/api/invoices/upload', { method: 'POST', headers: H, body: fd });
  const up = await r.json();
  assert.equal(r.status, 201, 'upload: ' + JSON.stringify(up).slice(0, 300));
  assert.equal(up.docType, 'flipkart', 'must detect flipkart, got ' + up.docType);
  assert.equal(up.import.items.length, 2, 'must parse 2 items, got ' + up.import.items.length);
  assert.equal(up.import.invoiceNumber, 'FKTEST20260915');
  assert.equal(up.import.orderNumber, 'OD998877665544332211');
  const matched = up.matches.filter((m) => m.status === 'matched');
  const fresh = up.matches.filter((m) => m.status === 'will-create');
  assert.equal(matched.length, 1, 'pen should fuzzy-match, got ' + JSON.stringify(up.matches));
  assert.equal(fresh.length, 1, 'notebook should be new');

  // commit: auto-create + stock
  r = await fetch(BASE + '/api/invoices/' + up.import._id + '/commit', { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify({ items: up.import.items, addToStock: true }) });
  const done = await r.json();
  assert.equal(r.status, 201, 'commit: ' + JSON.stringify(done).slice(0, 400));
  assert.equal(done.created.length, 1);
  assert.equal(done.matched.length, 1);
  assert.equal(done.purchase.source, 'Flipkart');
  assert.ok(done.stock.units >= 15, 'stock applied, got ' + JSON.stringify(done.stock));
  assert.equal(done.purchase.status, 'COMPLETED');
  // verify new product exists with stock and needsPricing
  r = await fetch(BASE + '/api/products?q=Classmate', { headers: H });
  const found = (await r.json()).items;
  assert.equal(found.length, 1, 'notebook product created');
  assert.equal(found[0].stock, 5, 'notebook stock +5, got ' + found[0].stock);
  assert.equal(found[0].needsPricing, true, 'needs pricing flagged');
  assert.equal(found[0].category, 'Stationery');
  // pen stock grew by 10
  r = await fetch(BASE + '/api/products?q=Reynolds Trimax Gel Pen', { headers: H });
  const pen = (await r.json()).items[0];
  assert.equal(pen.stock, 15, 'pen stock 5+10=15, got ' + pen.stock);
  // duplicate re-upload blocked
  const fd2 = new FormData();
  fd2.append('bill', new Blob([buf], { type: 'application/pdf' }), 'flipkart-invoice.pdf');
  r = await fetch(BASE + '/api/invoices/upload', { method: 'POST', headers: H, body: fd2 });
  const up2 = await r.json();
  assert.equal(up2.duplicateWarning, true, 'duplicate flagged');
  console.log('FLIPKART E2E PASS: pdf-read, parse, fuzzy-match, auto-create, stock, purchase, dup-check');
  process.exit(0);
})().catch((e) => { console.error('FLIPKART E2E FAIL:', e.message); process.exit(1); });
