import { useEffect, useState } from 'react';
import api, { errMsg } from '../api/client';

export function Reports() {
  const [date, setDate] = useState(new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }));
  const [d, setD] = useState<any>(null);
  const [lang, setLang] = useState<'en' | 'bn'>('en');
  const load = async () => {
    try { const { data } = await api.get('/api/reports/today', { params: { date } }); setD(data); } catch (e: any) { alert(errMsg(e)); }
  };
  useEffect(() => { load(); }, []);
  return (
    <div>
      <h2>📊 Today's Report</h2>
      <div style={{ display: 'flex', gap: 8 }}>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <button className="btn" onClick={load}>Load</button>
      </div>
      {d && (
        <div>
          <div className="cards">
            <div className="card"><small>Sales</small><br /><b>₹{d.totalSales}</b></div>
            <div className="card"><small>Profit</small><br /><b>₹{d.grossProfit}</b></div>
            <div className="card"><small>Cash</small><br /><b>₹{d.cash}</b></div>
            <div className="card"><small>UPI</small><br /><b>₹{d.upi}</b></div>
            <div className="card"><small>Due</small><br /><b>₹{d.dueGiven}</b></div>
            <div className="card"><small>Due Collected</small><br /><b>₹{d.dueCollected}</b></div>
          </div>
          <p>Bills {d.numSales} • Items {d.itemsSold} • Cost ₹{d.totalCost} • Discount ₹{d.discount}</p>
          <h3>Product-wise</h3>
          <table><tbody>{d.byProduct?.map((p: any, i: number) => <tr key={i}><td>{p.name} ×{p.qty}</td><td>₹{p.revenue}</td><td>profit ₹{p.profit}</td></tr>)}</tbody></table>
          <h3>Time-wise</h3>
          <table><tbody>{d.byHour?.map((h: any) => <tr key={h.hour}><td>{h.hour}:00</td><td>₹{h.total}</td></tr>)}</tbody></table>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button className={lang === 'bn' ? 'btn primary' : 'btn'} onClick={() => setLang('bn')}>বাংলা</button>
            <button className={lang === 'en' ? 'btn primary' : 'btn'} onClick={() => setLang('en')}>English</button>
            <a className="btn gold" href={`/api/reports/daily.pdf?date=${date}`} target="_blank" rel="noreferrer">📄 Daily PDF ({lang})</a>
          </div>
        </div>
      )}
    </div>
  );
}

export function Invoices() {
  const [file, setFile] = useState<File | null>(null);
  const [rawText, setRawText] = useState('');
  const [result, setResult] = useState<any>(null);
  const [err, setErr] = useState('');
  const [list, setList] = useState<any[]>([]);
  useEffect(() => { api.get('/api/invoices').then((r) => setList(r.data)).catch(() => {}); }, []);
  const upload = async () => {
    setErr('');
    if (!file) { setErr('Choose a bill file first.'); return; }
    const fd = new FormData(); fd.append('bill', file); fd.append('rawText', rawText);
    try {
      const { data } = await api.post('/api/invoices/upload', fd);
      setResult(data);
    } catch (e: any) { setErr(errMsg(e)); }
  };
  const commit = async () => {
    try {
      await api.post(`/api/invoices/${result.import._id}/commit`, { items: result.import.items, addToStock: true, confirmDuplicate: result.duplicateWarning });
      alert('Purchase saved ✓'); location.reload();
    } catch (e: any) { setErr(errMsg(e)); }
  };
  return (
    <div>
      <h2>🧾 Invoice Import</h2>
      <p><small>Upload → Read → Extract → Match → Review → Confirm → Save. Nothing is saved until you confirm.</small></p>
      <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.heic" onChange={(e) => setFile(e.target.files?.[0] || null)} />
      <label>Paste bill text / OCR (optional but improves extraction)</label>
      <textarea rows={4} value={rawText} onChange={(e) => setRawText(e.target.value)} placeholder="Supplier … Pen 10 x 8 = 80 …" />
      <button className="btn primary" style={{ width: '100%', marginTop: 8 }} onClick={upload}>Read Bill</button>
      {err && <p style={{ color: '#a00' }}>{err}</p>}
      {result && (
        <div className="card" style={{ marginTop: 10 }}>
          {result.mathIssues?.length > 0 && <p style={{ color: '#a00' }}>⚠ Bill total mismatch: {result.mathIssues.join('; ')}. Review before saving.</p>}
          {result.duplicateWarning && <p style={{ color: '#a00' }}>This invoice may already have been added.</p>}
          <p>Supplier: {result.import.supplier} • Invoice: {result.import.invoiceNumber} • Total ₹{result.import.grandTotal} ({result.source})</p>
          <table><thead><tr><th>Product</th><th>Qty</th><th>Rate</th><th>Total</th><th>Match</th></tr></thead>
            <tbody>{result.import.items.map((it: any, i: number) => <tr key={i}><td>{it.name}</td><td>{it.qty}</td><td>{it.unitPrice}</td><td>{it.lineTotal}</td><td>{result.matches?.[i]?.status}</td></tr>)}</tbody>
          </table>
          <button className="btn primary" style={{ width: '100%', marginTop: 8 }} onClick={commit}>Review OK — Confirm & Save</button>
        </div>
      )}
      <h3>Past imports</h3>
      {list.map((l: any) => <div key={l._id} className="card" style={{ marginTop: 6 }}><small>{l.supplier} • {l.invoiceNumber} • ₹{l.grandTotal} • {l.status}</small></div>)}
    </div>
  );
}

export function Personal() {
  const [owner, setOwner] = useState("My Purchase");
  const [items, setItems] = useState<any[]>([]);
  const [f, setF] = useState<any>({ productName: '', qty: 1, price: 0, supplier: '' });
  const [addStock, setAddStock] = useState(false);
  const load = async () => { const { data } = await api.get('/api/personal-purchases', { params: { owner } }); setItems(data); };
  useEffect(() => { load(); }, [owner]);
  const save = async () => {
    await api.post('/api/personal-purchases', { ...f, owner, qty: Number(f.qty), price: Number(f.price), addToStock: addStock });
    setF({ productName: '', qty: 1, price: 0, supplier: '' }); load();
  };
  return (
    <div>
      <h2>🧾 Personal Purchases</h2>
      <div style={{ display: 'flex', gap: 6 }}>{["My Purchase", "Father's Purchase", "Mother's Purchase"].map((o) => <button key={o} className={owner === o ? 'btn primary' : 'btn'} onClick={() => setOwner(o)}>{o.replace("'s Purchase", '')}</button>)}</div>
      <div className="card" style={{ marginTop: 8 }}>
        <label>Product</label><input value={f.productName} onChange={(e) => setF({ ...f, productName: e.target.value })} />
        <div style={{ display: 'flex', gap: 6 }}><input type="number" value={f.qty} onChange={(e) => setF({ ...f, qty: e.target.value })} /><input type="number" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} /></div>
        <label><input type="checkbox" checked={addStock} onChange={(e) => setAddStock(e.target.checked)} style={{ width: 24 }} /> Add to Shop Stock</label>
        <button className="btn primary" style={{ width: '100%', marginTop: 8 }} onClick={save}>Save</button>
      </div>
      {items.map((p: any) => <div key={p._id} className="card" style={{ marginTop: 6 }}><b>{p.productName}</b> ×{p.qty} ₹{p.total} <small>{p.purchaseDate} {p.addToStock ? '(stock+)' : ''}</small></div>)}
    </div>
  );
}

export function More() {
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  return (
    <div>
      <h2>More</h2>
      <div className="btnrow">
        <a className="btn" href="/products">📦 Products</a>
        <a className="btn" href="/invoices">🧾 Upload Bill</a>
        <a className="btn" href="/personal">🧾 Personal</a>
        <a className="btn" href="/reports">📊 Reports</a>
        <a className="btn" href="/sales">🧮 Sales History</a>
        <a className="btn" href="/settings">⚙️ Settings</a>
        {user?.role === 'ADMIN' && <a className="btn gold" href="/admin">🛠 Admin Panel</a>}
        <button className="btn" onClick={() => { localStorage.clear(); location.href = '/login'; }}>Logout</button>
      </div>
    </div>
  );
}

export function SalesHistory() {
  const [items, setItems] = useState<any[]>([]);
  useEffect(() => { api.get('/api/sales').then((r) => setItems(r.data.items)); }, []);
  return (
    <div><h2>Sales History</h2>
      {items.map((s: any) => <div key={s._id} className="card" style={{ marginTop: 6 }}><small>{s.transactionDate} {s.transactionTime} • {s.receiptNumber} • {s.status}</small><div>Total ₹{s.total} • Paid ₹{s.paid} • Due ₹{s.due} • {s.paymentMethod}</div><a href={`/api/sales/${s._id}/receipt.pdf`} target="_blank" rel="noreferrer">Receipt</a></div>)}
    </div>
  );
}
