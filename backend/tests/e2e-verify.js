// E2E verification on an ISOLATED test database. Never touches production data.
const assert = require('node:assert/strict');

const BASE = process.env.E2E_BASE || 'http://127.0.0.1:5055';
const ADMIN = { username: 'e2eadmin', password: 'E2ePass123!' };

async function api(path, { method = 'GET', token, body } = {}) {
  const r = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  return { status: r.status, j };
}

(async () => {
  // login
  let t = await api('/api/auth/login', { method: 'POST', body: ADMIN });
  assert.equal(t.status, 200, 'login: ' + JSON.stringify(t.j));
  const token = t.j.token;

  // 1. create cigarette product: 3 packets x 10 = 30 base units
  let p = await api('/api/products', { method: 'POST', token, body: { name: 'E2E Cigarette Packet', category: 'Cigarettes', unit: 'packet', packSize: 10, purchasePrice: 120, sellingPrice: 150, stock: 30, minStock: 5 } });
  assert.equal(p.status, 201, 'create product: ' + JSON.stringify(p.j));
  const prodId = p.j._id;

  // create pen + chocolate for realistic basket
  const pen = await api('/api/products', { method: 'POST', token, body: { name: 'E2E Pen', category: 'Stationery', unit: 'piece', packSize: 1, purchasePrice: 8, sellingPrice: 10, stock: 100 } });
  const choc = await api('/api/products', { method: 'POST', token, body: { name: 'E2E Chocolate', category: 'Chocolate', unit: 'piece', packSize: 1, purchasePrice: 15, sellingPrice: 20, stock: 100 } });

  // 2. purchase: pen x100 @8 add to stock YES -> 200
  const invNo = 'E2E-INV-' + Date.now();
  const pur = await api('/api/purchases', { method: 'POST', token, body: { supplier: 'E2E Supplier', invoiceNumber: invNo, items: [{ productId: pen.j._id, name: 'E2E Pen', qty: 100, baseQty: 100, unitPrice: 8, lineTotal: 800 }], paid: 800, addToStock: true } });
  assert.equal(pur.status, 201, 'purchase: ' + JSON.stringify(pur.j));
  let penNow = await api(`/api/products/${pen.j._id}`, { token });
  assert.equal(penNow.j.stock, 200, 'purchase stock exactly +100, got ' + penNow.j.stock);

  // duplicate invoice blocked
  const dup = await api('/api/purchases', { method: 'POST', token, body: { supplier: 'E2E Supplier', invoiceNumber: invNo, items: [{ productId: pen.j._id, name: 'E2E Pen', qty: 1, baseQty: 1, unitPrice: 8, lineTotal: 8 }], paid: 8, addToStock: false } });
  assert.equal(dup.status, 409, 'duplicate invoice should be 409, got ' + dup.status);

  // 3. sell 1 cigarette (single unit product? sell via packet product qty in packs: need loose-cig product)
  const loose = await api('/api/products', { method: 'POST', token, body: { name: 'E2E Loose Cigarette', category: 'Cigarettes', unit: 'cigarette', packSize: 1, purchasePrice: 12, sellingPrice: 15, stock: 30 } });
  const s1 = await api('/api/sales', { method: 'POST', token, body: { items: [{ productId: loose.j._id, qty: 1 }], paymentMethod: 'CASH', paid: 15, idempotencyKey: 'e2e-s1-' + Date.now() } });
  assert.equal(s1.status, 201, 'sale1: ' + JSON.stringify(s1.j));
  let looseNow = await api(`/api/products/${loose.j._id}`, { token });
  assert.equal(looseNow.j.stock, 29, 'sell 1 cig: 30->29, got ' + looseNow.j.stock);

  // sell 1 packet (packSize 10) -> 30-10=20 on packet product
  const s2 = await api('/api/sales', { method: 'POST', token, body: { items: [{ productId: prodId, qty: 1 }], paymentMethod: 'CASH', paid: 150, idempotencyKey: 'e2e-s2-' + Date.now() } });
  assert.equal(s2.status, 201, 'sale2: ' + JSON.stringify(s2.j));
  let packNow = await api(`/api/products/${prodId}`, { token });
  assert.equal(packNow.j.stock, 20, 'sell 1 packet: 30->20, got ' + packNow.j.stock);

  // 4. realistic mixed basket: pen x3 + choc x2 + cig x1 = 30+40+15=85; cash 50 + upi 35 mixed
  const s3key = 'e2e-s3-' + Date.now();
  const s3 = await api('/api/sales', { method: 'POST', token, body: { items: [{ productId: pen.j._id, qty: 3 }, { productId: choc.j._id, qty: 2 }, { productId: loose.j._id, qty: 1 }], paymentMethod: 'MIXED', paymentBreakdown: [{ method: 'CASH', amount: 50 }, { method: 'UPI', amount: 35 }], idempotencyKey: s3key } });
  assert.equal(s3.status, 201, 'sale3 mixed: ' + JSON.stringify(s3.j));
  assert.equal(s3.j.total, 85);
  assert.equal(s3.j.paid, 85);
  assert.equal(s3.j.due, 0);
  // idempotency: repeat same key -> same sale, no dup
  const s3dup = await api('/api/sales', { method: 'POST', token, body: { items: [{ productId: pen.j._id, qty: 3 }], paymentMethod: 'CASH', paid: 30, idempotencyKey: s3key } });
  assert.equal(s3dup.j._id, s3.j._id, 'idempotent repeat must return same sale');

  // 5. due sale -> khata
  const s4 = await api('/api/sales', { method: 'POST', token, body: { items: [{ productId: pen.j._id, qty: 5 }, { productId: choc.j._id, qty: 2 }], paymentMethod: 'DUE', paid: 20, customerName: 'E2E Rahul', idempotencyKey: 'e2e-s4-' + Date.now() } });
  assert.equal(s4.status, 201, 'due sale: ' + JSON.stringify(s4.j));
  assert.equal(s4.j.total, 90); assert.equal(s4.j.due, 70);
  const custId = s4.j.customerId;
  const khata = await api(`/api/customers/${custId}`, { token });
  assert.equal(khata.j.customer.totalDue, 70, 'khata due 70');

  // 6. receive payment 30 -> due 40; overpay blocked
  const pay = await api(`/api/customers/${custId}/payments`, { method: 'POST', token, body: { amount: 30, method: 'CASH' } });
  assert.equal(pay.status, 201);
  assert.equal(pay.j.customer.totalDue, 40);
  const over = await api(`/api/customers/${custId}/payments`, { method: 'POST', token, body: { amount: 100, method: 'CASH' } });
  assert.equal(over.status, 400, 'overpay must be rejected');

  // 7. void sale reverses stock exactly once
  const beforeVoid = (await api(`/api/products/${choc.j._id}`, { token })).j.stock;
  const v = await api(`/api/sales/${s3.j._id}/void`, { method: 'POST', token, body: { reason: 'e2e test void' } });
  assert.equal(v.status, 200);
  const afterVoid = (await api(`/api/products/${choc.j._id}`, { token })).j.stock;
  assert.equal(afterVoid, beforeVoid + 2, `void must restore 2 choc (${beforeVoid}->${afterVoid})`);

  // 8. reports + receipt pdf + health
  const rep = await api('/api/reports/today', { token });
  assert.equal(rep.status, 200);
  assert.ok(rep.j.totalSales >= 0 && rep.j.byProduct, 'report shape');
  const h = await api('/api/health', {});
  assert.equal(h.j.ok, true);
  const pdf = await fetch(BASE + `/api/sales/${s1.j._id}/receipt.pdf`, { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(pdf.status, 200);
  assert.ok((pdf.headers.get('content-type') || '').includes('pdf'));

  console.log('E2E PASS: stock/pack/mixed/due/khata/void/report/pdf/idempotency/duplicate all verified');
  process.exit(0);
})().catch((e) => { console.error('E2E FAIL:', e.message); process.exit(1); });
