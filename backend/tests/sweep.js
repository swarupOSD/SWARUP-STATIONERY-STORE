// Endpoint sweep: FULL=1 runs write-paths too (use isolated test DB only!).
// Usage: BASE=http://127.0.0.1:5000 U=admin P=Swarup@2026 node tests/sweep.js
const assert = require('node:assert/strict');
const BASE = process.env.BASE || 'http://127.0.0.1:5000';
const FULL = process.env.FULL === '1';
const fails = [];
let token = '';

async function call(method, path, body, { auth = true, form = false } = {}) {
  const H = {};
  if (auth) H.Authorization = `Bearer ${token}`;
  if (body && !form) H['Content-Type'] = 'application/json';
  const r = await fetch(BASE + path, { method, headers: H, body: body ? (form ? body : JSON.stringify(body)) : undefined });
  const ct = r.headers.get('content-type') || '';
  const data = ct.includes('json') ? await r.json().catch(() => ({})) : await r.text().catch(() => '');
  return { status: r.status, data };
}
async function check(name, fn) {
  try { await fn(); console.log('  ok', name); }
  catch (e) { fails.push(name + ' :: ' + e.message); console.log('  FAIL', name, '::', e.message); }
}

(async () => {
  const u = await call('POST', '/api/auth/login', { username: process.env.U || 'admin', password: process.env.P || 'x' }, { auth: false });
  assert.equal(u.status, 200, 'login ' + JSON.stringify(u.data).slice(0, 120));
  token = u.data.token;
  console.log('login ok as', u.data.user.username, u.data.user.role);

  await check('bad login 401', async () => {
    const r = await call('POST', '/api/auth/login', { username: 'nope', password: 'nope' }, { auth: false });
    assert.equal(r.status, 401);
  });
  await check('me', async () => { const r = await call('GET', '/api/auth/me'); assert.equal(r.status, 200); });
  await check('health', async () => { const r = await call('GET', '/api/health', null, { auth: false }); assert.equal(r.data.ok, true); });
  await check('dashboard', async () => { const r = await call('GET', '/api/dashboard'); assert.equal(r.status, 200); assert.ok('today' in r.data); });
  await check('reports/today', async () => { const r = await call('GET', '/api/reports/today'); assert.equal(r.status, 200); });
  await check('reports/daily range', async () => { const r = await call('GET', '/api/reports/daily?from=2026-09-01&to=2026-09-15'); assert.equal(r.status, 200); assert.ok(Array.isArray(r.data)); });
  await check('daily.pdf', async () => { const r = await call('GET', '/api/reports/daily.pdf?date=2026-09-15'); assert.equal(r.status, 200); });
  await check('export csv', async () => { const r = await call('GET', '/api/reports/export/products?format=csv'); assert.equal(r.status, 200); });
  await check('products list', async () => { const r = await call('GET', '/api/products?limit=5'); assert.equal(r.status, 200); assert.ok(Array.isArray(r.data.items)); });
  await check('products needsPricing', async () => { const r = await call('GET', '/api/products?needsPricing=1&limit=1'); assert.equal(r.status, 200); });
  await check('categories', async () => { const r = await call('GET', '/api/categories'); assert.equal(r.status, 200); });
  await check('suppliers', async () => { const r = await call('GET', '/api/suppliers'); assert.equal(r.status, 200); });
  await check('sales list', async () => { const r = await call('GET', '/api/sales?limit=5'); assert.equal(r.status, 200); });
  await check('purchases list', async () => { const r = await call('GET', '/api/purchases?limit=5'); assert.equal(r.status, 200); });
  await check('customers list', async () => { const r = await call('GET', '/api/customers?limit=5'); assert.equal(r.status, 200); });
  await check('invoices list', async () => { const r = await call('GET', '/api/invoices'); assert.equal(r.status, 200); });
  await check('documents', async () => { const r = await call('GET', '/api/documents'); assert.equal(r.status, 200); });
  await check('stock-movements', async () => { const r = await call('GET', '/api/stock-movements?limit=5'); assert.equal(r.status, 200); });
  await check('audit (admin)', async () => { const r = await call('GET', '/api/audit?limit=5'); assert.equal(r.status, 200); });
  await check('settings', async () => { const r = await call('GET', '/api/settings'); assert.equal(r.status, 200); });
  await check('upi-qr no-config shape', async () => {
    const r = await call('GET', '/api/upi-qr?amount=100');
    assert.ok([200, 400].includes(r.status), 'status ' + r.status);
  });
  await check('day state', async () => { const r = await call('GET', '/api/day/2026-09-15'); assert.equal(r.status, 200); });
  await check('ai status', async () => { const r = await call('GET', '/api/ai/status'); assert.equal(r.status, 200); });
  await check('voice heuristic', async () => { const r = await call('POST', '/api/ai/voice-parse', { text: '2 kopiko, 5 lozenge' }); assert.equal(r.status, 200); assert.ok((r.data.matched || r.data.items || []).length > 0); });
  await check('suggest', async () => { const r = await call('POST', '/api/products/suggest', { name: 'Cigarette packet' }); assert.equal(r.status, 200); });
  await check('preview-image bad url 4xx', async () => {
    const r = await call('POST', '/api/products/preview-image', { url: 'https://www.google.com/search?q=pen' });
    assert.ok(r.status >= 400, 'got ' + r.status);
  });
  await check('receipt pdf (first sale)', async () => {
    const s = await call('GET', '/api/sales?limit=1');
    if (!s.data.items?.length) { console.log('    (no sales yet, skipped)'); return; }
    const r = await call('GET', `/api/sales/${s.data.items[0]._id}/receipt.pdf`);
    assert.equal(r.status, 200);
  });
  await check('statement pdf (first customer)', async () => {
    const s = await call('GET', '/api/customers?limit=1');
    if (!s.data.items?.length) { console.log('    (no customers yet, skipped)'); return; }
    const r = await call('GET', `/api/customers/${s.data.items[0]._id}/statement.pdf`);
    assert.equal(r.status, 200);
  });
  await check('purchase detail (first)', async () => {
    const s = await call('GET', '/api/purchases?limit=1');
    if (!s.data.items?.length) { console.log('    (no purchases yet, skipped)'); return; }
    const r = await call('GET', `/api/purchases/${s.data.items[0]._id}`);
    assert.equal(r.status, 200);
  });

  if (FULL) {
    // ---- write paths: isolated DB only ----
    await check('create product', async () => {
      const r = await call('POST', '/api/products', { name: 'Sweep Test Pen', category: 'Stationery', unit: 'piece', packSize: 1, purchasePrice: 8, sellingPrice: 10, stock: 50 });
      assert.equal(r.status, 201); global.__pid = r.data._id;
    });
    await check('product history', async () => { const r = await call('GET', `/api/products/${global.__pid}/history`); assert.equal(r.status, 200); assert.ok('price' in r.data && 'stock' in r.data); });
    await check('negative stock blocked', async () => {
      const r = await call('POST', '/api/sales', { items: [{ productId: global.__pid, qty: 9999 }], paymentMethod: 'CASH', paid: 99990, idempotencyKey: 'sw-neg-' + Date.now() });
      assert.ok(r.status >= 400, 'got ' + r.status);
    });
    await check('due needs customer 400', async () => {
      const r = await call('POST', '/api/sales', { items: [{ productId: global.__pid, qty: 1 }], paymentMethod: 'DUE', paid: 0, idempotencyKey: 'sw-due-' + Date.now() });
      assert.equal(r.status, 400);
    });
    await check('mixed mismatch 400', async () => {
      const r = await call('POST', '/api/sales', { items: [{ productId: global.__pid, qty: 1 }], paymentMethod: 'MIXED', paymentBreakdown: [{ method: 'CASH', amount: 1 }], idempotencyKey: 'sw-mix-' + Date.now() });
      assert.equal(r.status, 400);
    });
    await check('sale + idempotent replay', async () => {
      const key = 'sw-idem-' + Date.now();
      const b = { items: [{ productId: global.__pid, qty: 2 }], paymentMethod: 'CASH', paid: 20, idempotencyKey: key };
      const a = await call('POST', '/api/sales', b); assert.equal(a.status, 201);
      const c = await call('POST', '/api/sales', b); assert.equal(c.status, 200); assert.equal(c.data._id, a.data._id);
      global.__sale = a.data._id;
    });
    await check('sale void restores once', async () => {
      const before = (await call('GET', `/api/products/${global.__pid}`)).data.stock;
      await call('POST', `/api/sales/${global.__sale}/void`, { reason: 'sweep' });
      const after = (await call('GET', `/api/products/${global.__pid}`)).data.stock;
      assert.equal(after, before + 2);
      const again = await call('POST', `/api/sales/${global.__sale}/void`, { reason: 'x' });
      assert.equal(again.status, 400);
    });
    await check('purchase + void', async () => {
      const p = await call('POST', '/api/purchases', { supplier: 'Sweep', invoiceNumber: 'SW-' + Date.now(), items: [{ productId: global.__pid, name: 'Sweep Test Pen', qty: 5, baseQty: 5, unitPrice: 8, lineTotal: 40 }], paid: 40, addToStock: true });
      assert.equal(p.status, 201);
      const dup = await call('POST', '/api/purchases', { supplier: 'Sweep', invoiceNumber: p.data.invoiceNumber, items: [{ name: 'x', qty: 1, unitPrice: 1, lineTotal: 1 }], paid: 1 });
      assert.equal(dup.status, 409);
      const v = await call('POST', `/api/purchases/${p.data._id}/void`, {});
      assert.equal(v.status, 200);
    });
    await check('khata overpay blocked', async () => {
      const c = await call('POST', '/api/customers', { name: 'Sweep Cust' }); assert.equal(c.status, 201);
      const bad = await call('POST', `/api/customers/${c.data._id}/payments`, { amount: 50, method: 'CASH' });
      assert.equal(bad.status, 400);
    });
    await check('invoice bad type 400', async () => {
      const fd = new FormData();
      fd.append('bill', new Blob(['not a real file'], { type: 'text/plain' }), 'x.txt');
      const r = await call('POST', '/api/invoices/upload', fd, { form: true });
      assert.equal(r.status, 400);
    });
    await check('invoice unreadable 422', async () => {
      // 1px PNG: valid type, zero extractable items
      const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
      const fd = new FormData();
      fd.append('bill', new Blob([png], { type: 'image/png' }), 'blank.png');
      const r = await call('POST', '/api/invoices/upload', fd, { form: true });
      assert.equal(r.status, 422);
    });
    await check('settings margin patch', async () => {
      const r = await call('PATCH', '/api/settings', { defaultMarginPct: 10 });
      assert.equal(r.status, 200); assert.equal(r.data.defaultMarginPct, 10);
      await call('PATCH', '/api/settings', { defaultMarginPct: 0 });
    });
    await check('day close blocks + reopen', async () => {
      const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
      await call('POST', `/api/day/${today}/close`, {});
      const blocked = await call('POST', '/api/sales', { items: [{ productId: global.__pid, qty: 1 }], paymentMethod: 'CASH', paid: 10, idempotencyKey: 'sw-day-' + Date.now() });
      assert.equal(blocked.status, 400);
      const noReason = await call('POST', `/api/day/${today}/reopen`, {});
      assert.equal(noReason.status, 400);
      const re = await call('POST', `/api/day/${today}/reopen`, { reason: 'sweep test' });
      assert.equal(re.status, 200);
    });
    await check('day close with cash tally', async () => {
      const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
      const rep = await call('GET', '/api/reports/today');
      const exp = rep.data.cash || 0;
      const c = await call('POST', `/api/day/${today}/close`, { countedCash: exp + 10, expectedCash: exp });
      assert.equal(c.status, 200); assert.equal(c.data.summary.diff, 10);
      await call('POST', `/api/day/${today}/reopen`, { reason: 'sweep tally done' });
    });
    await check('item return restores stock + khata', async () => {
      const key = 'sw-ret-' + Date.now();
      const a = await call('POST', '/api/sales', { items: [{ productId: global.__pid, qty: 4 }], paymentMethod: 'DUE', paid: 10, customerName: 'Sweep Ret', idempotencyKey: key });
      assert.equal(a.status, 201);
      const before = (await call('GET', `/api/products/${global.__pid}`)).data.stock;
      const bad = await call('POST', `/api/sales/${a.data._id}/return`, { items: [{ productId: global.__pid, qty: 9 }], refundMethod: 'CASH' });
      assert.equal(bad.status, 400);
      const r1 = await call('POST', `/api/sales/${a.data._id}/return`, { items: [{ productId: global.__pid, qty: 3 }], reason: 'sweep', refundMethod: 'ADJUST_DUE' });
      assert.equal(r1.status, 201); assert.equal(r1.data.refundTotal, 30);
      const after = (await call('GET', `/api/products/${global.__pid}`)).data.stock;
      assert.equal(after, before + 3);
      const kh = await call('GET', `/api/customers/${a.data.customerId}`);
      assert.equal(kh.data.customer.totalDue, 0, 'due 30-30=0, got ' + kh.data.customer.totalDue);
      const r2 = await call('POST', `/api/sales/${a.data._id}/return`, { items: [{ productId: global.__pid, qty: 1 }], refundMethod: 'CASH' });
      assert.equal(r2.status, 201);
      const r3 = await call('POST', `/api/sales/${a.data._id}/return`, { items: [{ productId: global.__pid, qty: 1 }], refundMethod: 'CASH' });
      assert.equal(r3.status, 400, 'over-return must fail');
      const rep = await call('GET', '/api/reports/today');
      assert.ok(rep.data.returnsCount >= 2, 'returns counted');
    });
    await check('supplier dues + FIFO pay', async () => {      const inv = 'SWSUP-' + Date.now();
      const p1 = await call('POST', '/api/purchases', { supplier: 'Sweep Supplier', invoiceNumber: inv + 'A', items: [{ name: 'Sweep Test Pen', productId: global.__pid, qty: 10, baseQty: 10, unitPrice: 8, lineTotal: 80 }], paid: 0, addToStock: false });
      assert.equal(p1.status, 201);
      const p2 = await call('POST', '/api/purchases', { supplier: 'Sweep Supplier', invoiceNumber: inv + 'B', items: [{ name: 'Sweep Test Pen', productId: global.__pid, qty: 10, baseQty: 10, unitPrice: 8, lineTotal: 80 }], paid: 30, addToStock: false });
      assert.equal(p2.status, 201);
      const dues = await call('GET', '/api/suppliers/dues');
      const mine = dues.data.find((x) => x.name === 'Sweep Supplier');
      assert.equal(mine.due, 130);
      const over = await call('POST', '/api/suppliers/pay', { supplierName: 'Sweep Supplier', amount: 200, method: 'CASH' });
      assert.equal(over.status, 400);
      const pay = await call('POST', '/api/suppliers/pay', { supplierName: 'Sweep Supplier', amount: 100, method: 'UPI', reference: 'UTR1' });
      assert.equal(pay.status, 201); assert.equal(pay.data.remaining, 30);
      assert.equal(pay.data.payment.allocations.length, 2, 'split across 2 bills FIFO');
      assert.equal(pay.data.payment.allocations[0].amount, 80);
      const led = await call('GET', '/api/suppliers/ledger?name=Sweep Supplier');
      assert.equal(led.data.due, 30);
      assert.equal(led.data.payments.length, 1);
    });
    await check('credit limit blocks due sale', async () => {
      const c = await call('POST', '/api/customers', { name: 'Sweep Limit', creditLimit: 50 });
      assert.equal(c.status, 201);
      const blocked = await call('POST', '/api/sales', { items: [{ productId: global.__pid, qty: 10 }], paymentMethod: 'DUE', paid: 0, customerId: c.data._id, idempotencyKey: 'sw-lim-' + Date.now() });
      assert.equal(blocked.status, 400);
      const ok = await call('POST', '/api/sales', { items: [{ productId: global.__pid, qty: 3 }], paymentMethod: 'DUE', paid: 0, customerId: c.data._id, idempotencyKey: 'sw-lim2-' + Date.now() });
      assert.equal(ok.status, 201);
      const upd = await call('PATCH', `/api/customers/${c.data._id}`, { creditLimit: 500 });
      assert.equal(upd.status, 200); assert.equal(upd.data.creditLimit, 500);
    });
    await check('dead stock + backup (admin)', async () => {
      const dz = await call('GET', '/api/reports/dead-stock?days=30');
      assert.equal(dz.status, 200); assert.ok('items' in dz.data);
      const bk = await call('GET', '/api/reports/export/all');
      assert.equal(bk.status, 200);       assert.ok(Array.isArray(bk.data.products) && Array.isArray(bk.data.sales));
    });
    await check('estimates + attendance + area + drawer', async () => {
      const e = await call('POST', '/api/estimates', { customerName: 'Sweep School', items: [{ productId: global.__pid, qty: 5 }] });
      assert.equal(e.status, 201); assert.ok(e.data.total > 0);
      const st = await call('PATCH', `/api/estimates/${e.data._id}`, { status: 'CONVERTED' });
      assert.equal(st.status, 200);
      const staff = await call('POST', '/api/users', { username: 'sweepstaff', password: 'x123456', role: 'STAFF' });
      assert.equal(staff.status, 201);
      const ci = await call('POST', '/api/attendance/checkin', { userId: staff.data.id || staff.data._id, name: 'sweepstaff' });
      assert.equal(ci.status, 201);
      const co = await call('POST', '/api/attendance/checkout', { userId: staff.data.id || staff.data._id });
      assert.equal(co.status, 200); assert.ok(co.data.outTime);
      const au = await call('GET', '/api/attendance?date=' + new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }));
      assert.equal(au.status, 200);
      const areas = await call('GET', '/api/customers/meta/areas');
      assert.equal(areas.status, 200);
      const rep = await call('GET', '/api/reports/today');
      assert.ok(rep.data.drawer && Array.isArray(rep.data.bySeller), 'drawer+seller in report');
    });
    await check('expenses + net profit + buy list', async () => {      const bad = await call('POST', '/api/expenses', { title: '', amount: 0 });
      assert.equal(bad.status, 400);
      const e1 = await call('POST', '/api/expenses', { title: 'Sweep rent', category: 'Rent', amount: 100, method: 'CASH' });
      assert.equal(e1.status, 201);
      const l = await call('GET', '/api/expenses');
      assert.equal(l.status, 200); assert.ok(l.data.sum >= 100);
      const rep = await call('GET', '/api/reports/today');
      assert.ok(rep.data.expensesTotal >= 100, 'expenses in report');
      assert.equal(rep.data.netProfit, Math.round((rep.data.grossProfit - rep.data.expensesTotal) * 100) / 100);
      const bl = await call('GET', '/api/reports/buy-list');
      assert.equal(bl.status, 200); assert.ok('items' in bl.data);
      const del = await call('DELETE', `/api/expenses/${e1.data._id}`);
      assert.equal(del.status, 200);
    });
    await check('soldBy + dueDate + account + take + overdue', async () => {      const c = await call('POST', '/api/customers', { name: 'Sweep Due' });
      const s = await call('POST', '/api/sales', { items: [{ productId: global.__pid, qty: 2 }], paymentMethod: 'DUE', paid: 0, customerId: c.data._id, soldBy: 'Ma', dueDate: '2026-09-20', paymentBreakdown: [], idempotencyKey: 'sw-fam-' + Date.now() });
      assert.equal(s.status, 201);
      assert.equal(s.data.soldBy, 'Ma');
      assert.equal(s.data.dueDate, '2026-09-20');
      const badSeller = await call('POST', '/api/sales', { items: [{ productId: global.__pid, qty: 1 }], paymentMethod: 'CASH', paid: 10, soldBy: 'Kaka', idempotencyKey: 'sw-fam2-' + Date.now() });
      assert.equal(badSeller.status, 400);
      const od = await call('GET', '/api/customers/dues/overdue');
      assert.equal(od.status, 200);
      // take from stock
      const stk0 = (await call('GET', `/api/products/${global.__pid}`)).data.stock;
      const tk = await call('POST', `/api/products/${global.__pid}/take`, { qty: 2, who: 'Baba', reason: 'sweep' });
      assert.equal(tk.status, 200);
      assert.equal(tk.data.stock, stk0 - 2);
      const tkBad = await call('POST', `/api/products/${global.__pid}/take`, { qty: 1, who: 'Kaka' });
      assert.equal(tkBad.status, 400);
      // khata payment with account
      const pay = await call('POST', `/api/customers/${c.data._id}/payments`, { amount: 10, method: 'UPI', account: 'Mar PhonePe' });
      assert.equal(pay.status, 201); assert.equal(pay.data.payment.account, 'Mar PhonePe');
      const rep = await call('GET', '/api/reports/today');
      assert.ok(rep.data.byAccount && rep.data.byAccount['Mar PhonePe'] >= 10, 'account split');
      // personal with method/account
      const pp = await call('POST', '/api/personal-purchases', { owner: "Father's Purchase", productName: 'Sweep Rice', qty: 1, price: 50, method: 'UPI', account: 'Babar PhonePe' });
      assert.equal(pp.status, 201); assert.equal(pp.data.account, 'Babar PhonePe');
      // new categories seeded
      const cats = await call('GET', '/api/categories');
      const names = cats.data.map((x) => x.name);
      assert.ok(names.includes('Pooja Items') && names.includes('School Supplies'), 'new categories');
    });
    await check('loose (khuchra) sale + purchasedBy/fundedBy', async () => {
      // product: packet of 10, sell 125, loose 15
      const pr = await call('POST', '/api/products', { name: 'Sweep Cig', category: 'Cigarettes', unit: 'packet', packSize: 10, purchasePrice: 100, sellingPrice: 125, loosePrice: 15, stock: 30, purchasedBy: 'Baba', fundedBy: 'Cash' });
      assert.equal(pr.status, 201);
      assert.equal(pr.data.purchasedBy, 'Baba');
      const pid = pr.data._id;
      // sell 1 packet + 3 loose: stock 30 -> 20 -> 17
      const s1 = await call('POST', '/api/sales', { items: [{ productId: pid, qty: 1, unitKind: 'pack' }], paymentMethod: 'CASH', paid: 125, idempotencyKey: 'sw-loose1-' + Date.now() });
      assert.equal(s1.status, 201); assert.equal(s1.data.total, 125);
      assert.equal((await call('GET', `/api/products/${pid}`)).data.stock, 20);
      const s2 = await call('POST', '/api/sales', { items: [{ productId: pid, qty: 3, unitKind: 'piece' }], paymentMethod: 'CASH', paid: 45, idempotencyKey: 'sw-loose2-' + Date.now() });
      assert.equal(s2.status, 201); assert.equal(s2.data.total, 45);
      assert.equal((await call('GET', `/api/products/${pid}`)).data.stock, 17);
      // piece on non-split product rejected
      const bad = await call('POST', '/api/sales', { items: [{ productId: global.__pid, qty: 1, unitKind: 'piece' }], paymentMethod: 'CASH', paid: 10, idempotencyKey: 'sw-loose3-' + Date.now() });
      assert.equal(bad.status, 400);
      // return 2 loose pcs: stock 17 -> 19, then over-return blocked
      const rt = await call('POST', `/api/sales/${s2.data._id}/return`, { items: [{ productId: pid, qty: 2, unitKind: 'piece' }], refundMethod: 'CASH' });
      assert.equal(rt.status, 201); assert.equal(rt.data.refundTotal, 30);
      assert.equal((await call('GET', `/api/products/${pid}`)).data.stock, 19);
      const rt2 = await call('POST', `/api/sales/${s2.data._id}/return`, { items: [{ productId: pid, qty: 2, unitKind: 'piece' }], refundMethod: 'CASH' });
      assert.equal(rt2.status, 400);
      // edit buyer/funder later
      const pe = await call('PATCH', `/api/products/${pid}`, { purchasedBy: 'Ma', fundedBy: 'Amar PhonePe', loosePrice: 16 });
      assert.equal(pe.status, 200); assert.equal(pe.data.purchasedBy, 'Ma');
    });
  }

  console.log(fails.length ? `\nSWEEP DONE: ${fails.length} FAILURES\n- ` + fails.join('\n- ') : '\nSWEEP PASS: all checked endpoints OK');
  process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error('SWEEP ERROR:', e.message); process.exit(1); });
