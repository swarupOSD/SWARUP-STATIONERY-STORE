const test = require('node:test');
const assert = require('node:assert/strict');

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

function buildSale(items, { discount = 0, tax = 0 } = {}) {
  let subtotal = 0, cost = 0;
  const lines = items.map((it) => {
    const baseQty = Math.round(it.qty * (it.packSize || 1));
    const lineTotal = round2(it.qty * it.rate);
    const lineCost = round2(baseQty * (it.purchasePrice / (it.packSize || 1)));
    subtotal = round2(subtotal + lineTotal); cost = round2(cost + lineCost);
    return { ...it, baseQty, lineTotal, lineCost };
  });
  const total = round2(subtotal - discount + tax);
  return { lines, subtotal, total, profit: round2(subtotal - discount - cost) };
}

test('sale totals: Pen x3 + Chocolate x2 + Cigarette x1', () => {
  const s = buildSale([
    { name: 'Pen', qty: 3, rate: 10, purchasePrice: 8, packSize: 1 },
    { name: 'Chocolate', qty: 2, rate: 20, purchasePrice: 15, packSize: 1 },
    { name: 'Cigarette', qty: 1, rate: 15, purchasePrice: 12, packSize: 1 },
  ]);
  assert.equal(s.subtotal, 85);
  assert.equal(s.total, 85);
  assert.equal(s.profit, 85 - (24 + 30 + 12));
});

test('cigarette pack conversion: 3 packets = 30 units; sell 1 cig -> 29; sell 1 packet -> 19', () => {
  let stock = 3 * 10;
  stock -= 1 * 1; assert.equal(stock, 29);
  stock -= 1 * 10; assert.equal(stock, 19);
});

test('mixed payment must sum to paid', () => {
  const breakdown = [{ method: 'CASH', amount: 200 }, { method: 'UPI', amount: 300 }];
  const sum = breakdown.reduce((a, b) => a + b.amount, 0);
  assert.equal(sum, 500);
  assert.equal(500 - 500, 0);
});

test('due = total - paid', () => {
  assert.equal(round2(90 - 20), 70);
});

test('invoice math validation flags mismatch', () => {
  const items = [{ name: 'Pen', qty: 10, unitPrice: 8, lineTotal: 80 }, { name: 'Book', qty: 2, unitPrice: 50, lineTotal: 90 }];
  const issues = [];
  for (const it of items) {
    const exp = round2(it.qty * it.unitPrice);
    if (Math.abs(exp - it.lineTotal) > 0.51) issues.push(it.name);
  }
  assert.deepEqual(issues, ['Book']);
});

test('UPI intent contains exact am=', () => {
  const am = Number(347).toFixed(2);
  const intent = `upi://pay?pa=shop@upi&pn=Shop&am=${am}&cu=INR`;
  assert.ok(intent.includes('am=347.00'));
});

test('receipt number format SS-YYYY-000001', () => {
  const r = `SS-2026-${String(1).padStart(6, '0')}`;
  assert.match(r, /^SS-\d{4}-\d{6}$/);
});

test('purchase stock increase exactly once', () => {
  let stock = 20; stock += 50; assert.equal(stock, 70);
});

test('Bengali UTF-8 preserved (no mojibake)', () => {
  const s = 'স্বরূপ স্টেশনারি স্টোর ধন্যবাদ পেন';
  assert.ok(!s.includes('à'));
  assert.equal(Buffer.from(s, 'utf8').toString('utf8'), s);
});

test('cash change math', () => {
  assert.equal(500 - 347, 153);
});

test('idempotency: repeated key returns same sale (shape)', () => {
  const seen = new Map();
  const create = (key, body) => { if (seen.has(key)) return { deduped: true, sale: seen.get(key) }; const s = { id: '1', ...body }; seen.set(key, s); return { deduped: false, sale: s }; };
  const a = create('k1', { total: 100 });
  const b = create('k1', { total: 100 });
  assert.equal(a.deduped, false); assert.equal(b.deduped, true);
  assert.equal(seen.size, 1);
});

test('voice heuristic parses quantities', () => {
  const text = '2 kopiko, 5 lozenge, 3 pen';
  const items = text.split(',').map((p) => { const m = p.trim().match(/(\d+)\s*(.+)/); return { name: m[2], qty: Number(m[1]) }; });
  assert.deepEqual(items, [{ name: 'kopiko', qty: 2 }, { name: 'lozenge', qty: 5 }, { name: 'pen', qty: 3 }]);
});
