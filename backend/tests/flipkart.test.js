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
