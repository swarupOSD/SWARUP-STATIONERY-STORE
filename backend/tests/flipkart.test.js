const test = require('node:test');
const assert = require('node:assert/strict');
const { isFlipkart, parseFlipkart, cleanName, toISODate, money } = require('../src/services/flipkart');

const SAMPLE = `
Flipkart Internet Private Limited
Tax Invoice
Invoice No: FADSKL1234567890
Order ID: OD123456789012345678
Invoice Date: 12-09-2026
Description of Goods            Qty    Gross Amount    Discount    Total
1  Reynolds Trimax Gel Pen Blue [HSN: 96081019]    10    250.00    0.00    250.00
2  Classmate Long Notebook 172 Pages    5    300.00    25.00    275.00
IGST  63.00
Shipping Charges  40.00
Grand Total  628.00
`;

test('detects flipkart invoice', () => {
  assert.equal(isFlipkart(SAMPLE), true);
  assert.equal(isFlipkart('Local kirana bill pen 10'), false);
});

test('parses flipkart header fields', () => {
  const r = parseFlipkart(SAMPLE);
  assert.equal(r.supplier, 'Flipkart');
  assert.equal(r.invoiceNumber, 'FADSKL1234567890');
  assert.equal(r.orderNumber, 'OD123456789012345678');
  assert.equal(r.invoiceDate, '2026-09-12');
});

test('parses flipkart line items', () => {
  const r = parseFlipkart(SAMPLE);
  assert.equal(r.items.length, 2);
  assert.match(r.items[0].name, /Reynolds/i);
  assert.ok(!r.items[0].name.includes('HSN'));
  assert.equal(r.items[0].qty, 10);
  assert.equal(r.items[0].unitPrice, 25); // derived: 250 / 10
  assert.equal(r.items[0].lineTotal, 250);
  assert.equal(r.items[1].qty, 5);
  assert.equal(r.items[1].unitPrice, 55); // derived: 275 / 5
  assert.equal(r.items[1].lineTotal, 275);
});

test('parses flipkart totals', () => {
  const r = parseFlipkart(SAMPLE);
  assert.equal(r.grandTotal, 628);
  assert.equal(r.tax, 63);
  assert.equal(r.shipping, 40);
  assert.equal(r.subtotal, 525);
  assert.equal(r.paid, 628);
  assert.equal(r.due, 0);
});

test('helpers: cleanName, toISODate, money', () => {
  assert.equal(cleanName('1  Pen [HSN: 96081019]  '), 'Pen');
  assert.equal(toISODate('05/01/26'), '2026-01-05');
  assert.equal(money('₹1,234.50'), 1234.5);
});

const SINGLE_SPACE = `
Flipkart Tax Invoice
Invoice No: FKAA11BB22CC33
Order ID: OD111122223333444455
Invoice Date: 01-09-2026
Sl No Description HSN Qty Gross Amount Discount Total
1 Reynolds Trimax Gel Pen Blue 96081019 10 250.00 0.00 250.00
2 Classmate Long Notebook 172 Pages 48202000 5 300.00 25.00 275.00
Total Qty: 15
Grand Total Rs. 628.00
`;

test('variant: single-space columns + HSN codes + TOTAL QTY', () => {
  const r = parseFlipkart(SINGLE_SPACE);
  assert.equal(r.items.length, 2);
  assert.equal(r.items[0].name, 'Reynolds Trimax Gel Pen Blue');
  assert.equal(r.items[0].qty, 10);
  assert.equal(r.items[1].unitPrice, 55);
  assert.equal(r.grandTotal, 628);
  assert.equal(r.debug.headerFound, true);
  assert.equal(r.debug.rowsMatched, 2);
});

const RUPEE_WRAP = `
Flipkart Internet Private Limited Tax Invoice
Invoice No F K 99 X 77
Order ID: OD999988887777666655
Dated: 02-09-2026
Product Details
Reynolds Trimax Gel
Pen Blue  10  ₹250.00  ₹250.00
Sugar  1.0  ₹45.00  ₹45.00
Net Amount ₹340.00
`;

test('variant: wrapped names + rupee signs + decimal qty', () => {
  const r = parseFlipkart(RUPEE_WRAP);
  assert.equal(r.items.length, 2);
  assert.match(r.items[0].name, /Reynolds Trimax Gel Pen Blue/);
  assert.equal(r.items[0].qty, 10);
  assert.equal(r.items[1].name, 'Sugar');
  assert.equal(r.items[1].qty, 1);
  assert.equal(r.grandTotal, 340);
});

test('variant: qty mismatch note', () => {
  const r = parseFlipkart(SINGLE_SPACE.replace('Total Qty: 15', 'Total Qty: 99'));
  assert.ok(r.notes.some((n) => /total qty 99/i.test(n)));
});

test('variant: scanned-like garbage yields diagnostics', () => {
  const r = parseFlipkart('Flipkart Order ID: OD123456789012345678\nrandom words no numbers here\nTotal 100.00');
  assert.equal(r.items.length, 0);
  assert.ok(r.debug.chars > 0);
  assert.ok(r.notes.length > 0);
});
