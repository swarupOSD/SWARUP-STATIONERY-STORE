import { useEffect, useState } from 'react';
import api, { errMsg } from '../api/client';
import { Empty, HBarChart, PageHead, Sheet, Skel, SplitBar, rs, useToast } from '../components/ui';

const istToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

export function Reports() {
  const toast = useToast();
  const [date, setDate] = useState(istToday());
  const [from, setFrom] = useState(istToday());
  const [to, setTo] = useState(istToday());
  const [mode, setMode] = useState<'day' | 'range'>('day');
  const [d, setD] = useState<any>(null);
  const [range, setRange] = useState<any[]>([]);
  const [lang, setLang] = useState<'en' | 'bn'>('en');
  const load = async () => {
    try {
      if (mode === 'day') { const { data } = await api.get('/api/reports/today', { params: { date } }); setD(data); }
      else { const { data } = await api.get('/api/reports/daily', { params: { from, to } }); setRange(data); }
    } catch (e: any) { toast(errMsg(e), 'err'); }
  };
  useEffect(() => { load(); }, []);
  const rTot = range.reduce((s, r) => ({ sales: s.sales + r.totalSales, profit: s.profit + r.grossProfit, bills: s.bills + r.numSales }), { sales: 0, profit: 0, bills: 0 });
  return (
    <div className="page">
      <PageHead title={mode === 'day' ? "Today's report" : 'Period report'} emoji="📊" />
      <div className="seg" style={{ marginBottom: 8 }}>
        {[['day', 'Single day'], ['range', 'Date range']].map(([v, l]) => <button key={v} className={mode === v ? 'on' : ''} onClick={() => setMode(v as any)}>{l}</button>)}
      </div>
      {mode === 'day' ? (
        <div style={{ display: 'flex', gap: 8 }}>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <button className="btn" onClick={() => { setDate(istToday()); setTimeout(load, 0); }}>Today</button>
          <button className="btn primary" onClick={load}>Load</button>
        </div>
      ) : (
        <div>
          <div className="row2"><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /><input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
          <button className="btn primary block" style={{ marginTop: 8 }} onClick={load}>Load range</button>
        </div>
      )}
      {mode === 'range' ? (
        <div style={{ marginTop: 10 }}>
          <div className="cards"><div className="card kpi accent"><small>💰 Sales</small><br /><b>{rs(Math.round(rTot.sales))}</b><div className="sub">{rTot.bills} bills</div></div>
            <div className="card kpi green"><small>📈 Profit</small><br /><b>{rs(Math.round(rTot.profit))}</b></div></div>
          <div className="table-wrap"><table><thead><tr><th>Date</th><th>Sales</th><th>Profit</th><th>Bills</th><th>Due</th></tr></thead>
            <tbody>{range.map((r: any) => <tr key={r.date}><td>{r.prettyDate || r.date}</td><td>{rs(r.totalSales)}</td><td>{rs(r.grossProfit)}</td><td>{r.numSales}</td><td>{rs(r.dueGiven)}</td></tr>)}</tbody>
          </table></div>
        </div>
      ) : !d ? <div style={{ marginTop: 10 }}><Skel n={4} /></div> : (
        <div style={{ marginTop: 10 }}>
          <div className="cards quad">
            <div className="card kpi accent"><small>💰 Sales</small><br /><b>{rs(d.totalSales)}</b><div className="sub">{d.numSales} bills • {d.itemsSold} items</div></div>
            <div className="card kpi green"><small>📈 Profit</small><br /><b>{rs(d.grossProfit)}</b><div className="sub">cost {rs(d.totalCost)}</div></div>
            <div className="card kpi"><small>💵 Cash</small><br /><b>{rs(d.cash)}</b></div>
            <div className="card kpi"><small>📱 UPI</small><br /><b>{rs(d.upi)}</b></div>
            <div className="card kpi red"><small>📒 Due given</small><br /><b>{rs(d.dueGiven)}</b></div>
            <div className="card kpi green"><small>🤝 Due collected</small><br /><b>{rs(d.dueCollected)}</b></div>
            <div className="card kpi"><small>🏦 Bank</small><br /><b>{rs(d.bank)}</b></div>
            <div className="card kpi"><small>🏷️ Discount</small><br /><b>{rs(d.discount)}</b></div>
          </div>
          <div className="card"><b style={{ fontSize: 14 }}>💳 Payment split</b>
            <SplitBar parts={[{ label: 'Cash', value: d.cash, color: '#1e7e34' }, { label: 'UPI', value: d.upi, color: '#175cd3' }, { label: 'Bank', value: d.bank, color: '#b8860b' }, { label: 'Due', value: d.dueGiven, color: '#8f1d26' }]} />
          </div>
          <div className="card" style={{ marginTop: 10 }}><b style={{ fontSize: 14 }}>⏰ Hour-wise sales</b>
            {d.byHour?.length ? <HBarChart data={d.byHour.map((h: any) => ({ label: h.hour, value: h.total }))} /> : <small style={{ color: 'var(--muted)' }}>No sales yet.</small>}
          </div>
          <div className="section-t">🏆 Product-wise</div>
          <div className="table-wrap"><table><thead><tr><th>Product</th><th>Qty</th><th>Revenue</th><th>Profit</th></tr></thead>
            <tbody>{(d.byProduct || []).map((p: any, i: number) => <tr key={i}><td>{p.name}</td><td>{p.qty}</td><td>{rs(p.revenue)}</td><td style={{ color: 'var(--green)', fontWeight: 700 }}>{rs(p.profit)}</td></tr>)}</tbody>
          </table></div>
          <div className="section-t">📤 Export ({lang === 'bn' ? 'বাংলা' : 'English'})</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className={`btn sm${lang === 'bn' ? ' primary' : ''}`} onClick={() => setLang('bn')}>বাংলা</button>
            <button className={`btn sm${lang === 'en' ? ' primary' : ''}`} onClick={() => setLang('en')}>English</button>
            <a className="btn sm gold" href={`/api/reports/daily.pdf?date=${date}`} target="_blank" rel="noreferrer">📄 Daily PDF</a>
            <a className="btn sm" href="/api/reports/export/sales?format=csv" target="_blank" rel="noreferrer">⬇ Sales CSV</a>
            <a className="btn sm" href="/api/reports/export/sales?format=json" target="_blank" rel="noreferrer">⬇ JSON</a>
          </div>
        </div>
      )}
    </div>
  );
}

export function Invoices() {
  const toast = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [rawText, setRawText] = useState('');
  const [result, setResult] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [list, setList] = useState<any[]>([]);
  useEffect(() => { api.get('/api/invoices').then((r) => setList(r.data)).catch(() => {}); }, []);
  const upload = async () => {
    if (!file) { toast('Choose a bill file first', 'err'); return; }
    setBusy(true);
    const fd = new FormData(); fd.append('bill', file); fd.append('rawText', rawText);
    try { const { data } = await api.post('/api/invoices/upload', fd); setResult(data); }
    catch (e: any) { toast(errMsg(e), 'err'); } finally { setBusy(false); }
  };
  const editLine = (i: number, k: string, v: string) => {
    setResult((r: any) => ({ ...r, import: { ...r.import, items: r.import.items.map((it: any, j: number) => j === i ? { ...it, [k]: Number(v) } : it) } }));
  };
  const commit = async () => {
    try {
      await api.post(`/api/invoices/${result.import._id}/commit`, { items: result.import.items, addToStock: true, confirmDuplicate: !!result.duplicateWarning });
      toast('Purchase saved ✓', 'ok'); location.reload();
    } catch (e: any) { toast(errMsg(e), 'err'); }
  };
  return (
    <div className="page">
      <PageHead title="Invoice import" emoji="🧾" />
      <div className="card">
        <div className="kv"><span>1. Upload</span><span>→ 2. Review</span></div>
        <div className="kv"><span>3. Correct</span><span>→ 4. Confirm & save</span></div>
        <p><small style={{ color: 'var(--muted)' }}>Nothing is saved or stocked until you confirm. Uncertain lines stay unmatched for you to map.</small></p>
        <label>Bill file (PDF / photo)</label><input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.heic" capture="environment" onChange={(e) => setFile(e.target.files?.[0] || null)} />
        <label>Bill text (optional — improves extraction)</label>
        <textarea rows={3} value={rawText} onChange={(e) => setRawText(e.target.value)} placeholder="Supplier … Pen 10 x 8 = 80 …" />
        <button className="btn primary block" style={{ marginTop: 10 }} onClick={upload} disabled={busy}>{busy ? 'Reading…' : '🔍 Read bill'}</button>
      </div>
      {result && (
        <div className="card" style={{ marginTop: 10, borderLeft: '4px solid var(--gold)' }}>
          {result.mathIssues?.length > 0 && <p style={{ color: 'var(--rose-tx)' }}>⚠ Bill total mismatch: {result.mathIssues.join('; ')}. Correct below before saving.</p>}
          {result.duplicateWarning && <p style={{ color: 'var(--rose-tx)' }}>⛔ This invoice may already have been added.</p>}
          <div className="kv"><span>Supplier</span><b>{result.import.supplier || '—'}</b></div>
          <div className="kv"><span>Invoice</span><b>{result.import.invoiceNumber || '—'} • {rs(result.import.grandTotal)}</b></div>
          <small style={{ color: 'var(--muted)' }}>Source: {result.source}. Tap qty/rate to correct.</small>
          <div className="table-wrap" style={{ marginTop: 8 }}><table><thead><tr><th>Product</th><th>Qty</th><th>Rate</th><th>Total</th><th>Match</th></tr></thead>
            <tbody>{result.import.items.map((it: any, i: number) => (
              <tr key={i}><td>{it.name}</td>
                <td><input type="number" value={it.qty} style={{ width: 64, minHeight: 36 }} onChange={(e) => editLine(i, 'qty', e.target.value)} /></td>
                <td><input type="number" value={it.unitPrice} style={{ width: 76, minHeight: 36 }} onChange={(e) => editLine(i, 'unitPrice', e.target.value)} /></td>
                <td>{rs(it.qty * it.unitPrice)}</td>
                <td>{result.matches?.[i]?.status === 'matched' ? <span className="badge-ok">✓</span> : <span className="badge-low">review</span>}</td>
              </tr>))}</tbody>
          </table></div>
          <button className="btn primary block" style={{ marginTop: 10 }} onClick={commit}>✓ Review OK — confirm & save</button>
        </div>
      )}
      <div className="section-t">Past imports</div>
      {list.map((l: any) => <div key={l._id} className="lrow"><span style={{ fontSize: 20 }}>🧾</span><div className="grow"><b className="t">{l.supplier || '—'} • {l.invoiceNumber || '—'}</b><small>{rs(l.grandTotal)} • {l.status}</small></div></div>)}
    </div>
  );
}

export function Personal() {
  const toast = useToast();
  const [owner, setOwner] = useState("My Purchase");
  const [items, setItems] = useState<any[]>([]);
  const [f, setF] = useState<any>({ productName: '', qty: 1, price: 0, supplier: '' });
  const [addStock, setAddStock] = useState(false);
  const owners = ["My Purchase", "Father's Purchase", "Mother's Purchase"];
  const load = async () => { try { const { data } = await api.get('/api/personal-purchases', { params: { owner } }); setItems(data); } catch (e: any) { toast(errMsg(e), 'err'); } };
  useEffect(() => { load(); }, [owner]);
  const save = async () => {
    if (!f.productName.trim() || !(Number(f.qty) > 0)) { toast('Enter product + qty', 'err'); return; }
    try {
      await api.post('/api/personal-purchases', { ...f, owner, qty: Number(f.qty), price: Number(f.price), addToStock: addStock });
      toast('Saved ✓', 'ok'); setF({ productName: '', qty: 1, price: 0, supplier: '' }); load();
    } catch (e: any) { toast(errMsg(e), 'err'); }
  };
  const month = items.reduce((s, p) => s + (p.total || 0), 0);
  return (
    <div className="page">
      <PageHead title="Personal purchases" emoji="👛" />
      <div className="chips">{owners.map((o) => <button key={o} className={`chip${owner === o ? ' on' : ''}`} onClick={() => setOwner(o)}>{o.replace("'s Purchase", "'s")}</button>)}</div>
      <div className="card kpi accent"><small>🧾 {owner} total (listed)</small><br /><b>{rs(Math.round(month))}</b></div>
      <div className="card" style={{ marginTop: 10 }}>
        <label>What was bought?</label><input value={f.productName} onChange={(e) => setF({ ...f, productName: e.target.value })} placeholder="e.g. Rice 5kg" />
        <div className="row2"><div><label>Qty</label><input type="number" value={f.qty} onChange={(e) => setF({ ...f, qty: e.target.value })} /></div>
          <div><label>Price ₹ (each)</label><input type="number" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} /></div></div>
        <label>Shop / supplier</label><input value={f.supplier} onChange={(e) => setF({ ...f, supplier: e.target.value })} />
        <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" checked={addStock} onChange={(e) => setAddStock(e.target.checked)} style={{ width: 22 }} /> Also add to shop stock</label>
        <div className="totals"><div className="tr grand"><span>Total</span><span>{rs(Number(f.qty || 0) * Number(f.price || 0))}</span></div></div>
        <button className="btn primary block" style={{ marginTop: 10 }} onClick={save}>✓ Save</button>
      </div>
      {items.map((p: any) => <div key={p._id} className="lrow"><span style={{ fontSize: 20 }}>🧺</span><div className="grow"><b className="t">{p.productName} × {p.qty}</b><small>{p.purchaseDate} {p.purchaseTime}{p.addToStock ? ' • +stock' : ''}</small></div><b>{rs(p.total)}</b></div>)}
    </div>
  );
}

export function SalesHistory() {
  const toast = useToast();
  const [items, setItems] = useState<any[]>([]);
  const [date, setDate] = useState(istToday());
  const [loading, setLoading] = useState(true);
  const load = async () => {
    setLoading(true);
    try { const { data } = await api.get('/api/sales', { params: { date, limit: 50 } }); setItems(data.items); }
    catch (e: any) { toast(errMsg(e), 'err'); } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [date]);
  const voidSale = async (s: any) => {
    const reason = prompt(`Void ${s.receiptNumber}? Stock will be restored. Reason:`);
    if (reason === null) return;
    try { await api.post(`/api/sales/${s._id}/void`, { reason: reason || 'Voided' }); toast('Sale voided, stock restored', 'ok'); load(); }
    catch (e: any) { toast(errMsg(e), 'err'); }
  };
  const dayTotal = items.filter((s) => s.status !== 'VOIDED').reduce((a, s) => a + s.total, 0);
  return (
    <div className="page">
      <PageHead title="Sales history" emoji="🧮" />
      <div className="toolbar"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /><div className="card" style={{ padding: '8px 14px' }}>Day total <b>{rs(dayTotal)}</b></div></div>
      {loading ? <Skel n={4} /> : items.length === 0 ? <Empty emoji="🧾" title="No sales this day" /> :
        items.map((s: any) => (
          <div key={s._id} className="lrow" style={s.status === 'VOIDED' ? { opacity: .6 } : {}}>
            <span style={{ fontSize: 22 }}>{s.status === 'VOIDED' ? '🚫' : '🧾'}</span>
            <div className="grow"><b className="t">{s.receiptNumber} • {s.customerName}</b><small>{s.transactionTime} • {s.paymentMethod}{s.due ? ` • due ${rs(s.due)}` : ''}</small></div>
            <div style={{ textAlign: 'right' }}><b>{rs(s.total)}</b>
              <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                <a className="btn sm ghost" href={`/api/sales/${s._id}/receipt.pdf`} target="_blank" rel="noreferrer">PDF</a>
                {s.status !== 'VOIDED' && <button className="btn sm ghost" onClick={() => voidSale(s)}>Void</button>}
              </div>
            </div>
          </div>
        ))}
    </div>
  );
}
