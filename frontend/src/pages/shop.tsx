import { useEffect, useState } from 'react';
import api, { errMsg } from '../api/client';

export function Purchase() {
  const [products, setProducts] = useState<any[]>([]);
  const [q, setQ] = useState('');
  const [lines, setLines] = useState<any[]>([]);
  const [supplier, setSupplier] = useState('');
  const [source, setSource] = useState('Local Shop');
  const [owner, setOwner] = useState('Shop');
  const [addStock, setAddStock] = useState(true);
  const [msg, setMsg] = useState(''); const [err, setErr] = useState('');
  const find = async (term: string) => {
    setQ(term);
    const { data } = await api.get('/api/products', { params: { q: term, limit: 20 } });
    setProducts(data.items);
  };
  useEffect(() => { find(''); }, []);
  const total = lines.reduce((s, l) => s + l.qty * l.unitPrice, 0);
  const submit = async () => {
    setErr(''); setMsg('');
    try {
      const { data } = await api.post('/api/purchases', { supplier, source, owner, addToStock: addStock, items: lines });
      setMsg(`Purchase saved ✓ ${data.invoiceNumber}. Stock ${addStock ? 'increased' : 'unchanged'}.`);
      setLines([]);
    } catch (e: any) { setErr(errMsg(e)); }
  };
  return (
    <div>
      <h2>📦 Purchase</h2>
      <label>Where did you buy?</label>
      <select value={source} onChange={(e) => setSource(e.target.value)}>{['Local Shop','Flipkart','Amazon','Supplier','Other'].map((s) => <option key={s}>{s}</option>)}</select>
      <label>Owner</label>
      <select value={owner} onChange={(e) => setOwner(e.target.value)}>{['Shop','My Purchase',"Father's Purchase","Mother's Purchase"].map((s) => <option key={s}>{s}</option>)}</select>
      <label>Supplier</label><input value={supplier} onChange={(e) => setSupplier(e.target.value)} />
      <label>Find product</label><input value={q} onChange={(e) => find(e.target.value)} placeholder="Search…" />
      {products.slice(0, 8).map((p) => (
        <div key={p._id} style={{ display: 'flex', justifyContent: 'space-between', padding: 6, borderBottom: '1px solid #eee' }}>
          <span>{p.name} (stock {p.stock})</span>
          <button className="btn" onClick={() => setLines((l) => [...l, { productId: p._id, name: p.name, qty: 1, unitPrice: p.purchasePrice, sellingPrice: p.sellingPrice, lineTotal: p.purchasePrice }])}>Add</button>
        </div>
      ))}
      {lines.map((l, i) => (
        <div key={i} className="card" style={{ marginTop: 6 }}>
          <b>{l.name}</b>
          <div style={{ display: 'flex', gap: 6 }}>
            <input type="number" value={l.qty} onChange={(e) => setLines((ls) => ls.map((x, j) => j === i ? { ...x, qty: Number(e.target.value), lineTotal: Number(e.target.value) * x.unitPrice } : x))} />
            <input type="number" value={l.unitPrice} onChange={(e) => setLines((ls) => ls.map((x, j) => j === i ? { ...x, unitPrice: Number(e.target.value), lineTotal: x.qty * Number(e.target.value) } : x))} />
            <button className="btn" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}>✕</button>
          </div>
          <small>Line ₹{l.qty * l.unitPrice}</small>
        </div>
      ))}
      <label><input type="checkbox" checked={addStock} onChange={(e) => setAddStock(e.target.checked)} style={{ width: 24 }} /> Add to Shop Stock (YES increases stock once)</label>
      <h3>Total ₹{total}</h3>
      <button className="btn primary" style={{ width: '100%' }} onClick={submit}>Save Purchase</button>
      {msg && <p style={{ color: 'green' }}>{msg}</p>}{err && <p style={{ color: '#a00' }}>{err}</p>}
    </div>
  );
}

export function Khata() {
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all');
  const [items, setItems] = useState<any[]>([]);
  const load = async () => {
    const { data } = await api.get('/api/customers', { params: { q, filter } });
    setItems(data.items);
  };
  useEffect(() => { load(); }, [filter]);
  return (
    <div>
      <h2>📒 Khata</h2>
      <div style={{ display: 'flex', gap: 8 }}>
        <input placeholder="Search customer" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && load()} />
        <button className="btn" onClick={load}>Go</button>
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
        {['all', 'due', 'paid'].map((f) => <button key={f} className={filter === f ? 'btn primary' : 'btn'} onClick={() => setFilter(f)}>{f}</button>)}
      </div>
      {items.map((c) => (
        <a key={c._id} href={`/khata/${c._id}`} className="card" style={{ display: 'block', marginTop: 8, textDecoration: 'none', color: 'inherit' }}>
          <b>{c.name}</b> {c.phone && <small>{c.phone}</small>}
          <div>Due <b style={{ color: c.totalDue > 0 ? '#a00' : 'green' }}>₹{c.totalDue}</b> • Bought ₹{c.totalPurchased} • Paid ₹{c.totalPaid}</div>
        </a>
      ))}
    </div>
  );
}

export function CustomerDetail({ id }: { id: string }) {
  const [d, setD] = useState<any>(null);
  const [amt, setAmt] = useState('');
  const [method, setMethod] = useState('CASH');
  const [msg, setMsg] = useState(''); const [err, setErr] = useState('');
  const load = async () => { const { data } = await api.get(`/api/customers/${id}`); setD(data); };
  useEffect(() => { load(); }, [id]);
  const pay = async () => {
    setErr(''); setMsg('');
    try {
      await api.post(`/api/customers/${id}/payments`, { amount: Number(amt), method });
      setMsg('Payment received ✓'); setAmt(''); load();
    } catch (e: any) { setErr(errMsg(e)); }
  };
  if (!d) return <p>Loading…</p>;
  return (
    <div>
      <h2>{d.customer.name} — Due ₹{d.customer.totalDue}</h2>
      <p>Bought ₹{d.customer.totalPurchased} • Paid ₹{d.customer.totalPaid}</p>
      <div className="card">
        <h3>💰 Receive Payment</h3>
        <input placeholder="Amount" value={amt} onChange={(e) => setAmt(e.target.value)} inputMode="decimal" />
        <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>{['CASH','UPI','BANK'].map((m) => <button key={m} className={method === m ? 'btn primary' : 'btn'} onClick={() => setMethod(m)}>{m}</button>)}</div>
        <button className="btn primary" style={{ width: '100%', marginTop: 8 }} onClick={pay}>Save Payment</button>
        {msg && <p style={{ color: 'green' }}>{msg}</p>}{err && <p style={{ color: '#a00' }}>{err}</p>}
      </div>
      <a className="btn gold" style={{ marginTop: 8 }} href={`/api/customers/${id}/statement.pdf`} target="_blank" rel="noreferrer">📄 Statement PDF</a>
      <h3>Timeline</h3>
      {d.sales.map((s: any) => <div key={s._id} className="card" style={{ marginTop: 6 }}><small>{s.transactionDate} {s.transactionTime} • {s.receiptNumber}</small><div>Total ₹{s.total} • Paid ₹{s.paid} • Due ₹{s.due}</div></div>)}
      <h3>Payments</h3>
      {d.payments.map((p: any) => <div key={p._id} className="card" style={{ marginTop: 6 }}><small>{p.paymentDate} {p.paymentTime}</small><div>₹{p.amount} via {p.method}</div></div>)}
    </div>
  );
}
