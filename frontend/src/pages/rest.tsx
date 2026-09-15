import { useEffect, useState } from 'react';
import api, { errMsg } from '../api/client';
import { Empty, HBarChart, PageHead, QtyStepper, Sheet, Skel, SplitBar, rs, useToast } from '../components/ui';

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
            <a className="card kpi" style={{ textDecoration: 'none', color: 'inherit' }} href="/expenses"><small>💸 Kharcha</small><br /><b>{rs(d.expensesTotal || 0)}</b><div className="sub">net {rs(d.netProfit ?? d.grossProfit)} ›</div></a>            <div className="card kpi"><small>💵 Cash</small><br /><b>{rs(d.cash)}</b></div>
            <div className="card kpi"><small>📱 UPI</small><br /><b>{rs(d.upi)}</b></div>
            <div className="card kpi red"><small>📒 Due given</small><br /><b>{rs(d.dueGiven)}</b></div>
            <div className="card kpi green"><small>🤝 Due collected</small><br /><b>{rs(d.dueCollected)}</b></div>
            <div className="card kpi"><small>🏦 Bank</small><br /><b>{rs(d.bank)}</b></div>
            <div className="card kpi"><small>🏷️ Discount</small><br /><b>{rs(d.discount)}</b></div>
            {(d.returnsCount > 0) && <div className="card kpi red"><small>↩ Returns</small><br /><b>− {rs(d.returnsTotal)}</b><div className="sub">{d.returnsCount} returns (already adjusted)</div></div>}
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
            <a className="btn sm green" href={`https://wa.me/?text=${encodeURIComponent(`🪔 *Swarup Stationery Store* — ${d.prettyDate || date}\nSales: ₹${d.totalSales} | Profit: ₹${d.grossProfit}\nCash: ₹${d.cash} | UPI: ₹${d.upi}\nDue given: ₹${d.dueGiven} | Collected: ₹${d.dueCollected}\nBills: ${d.numSales}`)}`} target="_blank" rel="noreferrer">💬 WhatsApp</a>
          </div>
          <DeadStock />
        </div>
      )}
    </div>
  );
}

function DeadStock() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<any>(null);
  useEffect(() => { api.get('/api/reports/dead-stock', { params: { days } }).then((r) => setData(r.data)).catch(() => {}); }, [days]);
  return (
    <div style={{ marginTop: 6 }}>
      <div className="section-t">💤 Dead stock — not sold in {days} days</div>
      <div className="chips">{[30, 60, 90].map((v) => <button key={v} className={`chip${days === v ? ' on' : ''}`} onClick={() => setDays(v)}>{v} days</button>)}</div>
      {!data ? <Skel n={2} /> : data.count === 0 ? <div className="card" style={{ borderLeft: '4px solid var(--green)' }}>✅ Everything in stock is moving.</div> : (
        <>
          <div className="card kpi"><small>💤 Stuck value</small><br /><b>{rs(data.value)}</b><div className="sub">{data.count} products — put on offer / stop reordering</div></div>
          <div className="table-wrap" style={{ marginTop: 8 }}><table><thead><tr><th>Product</th><th>Stock</th><th>Value</th><th>Last sold</th></tr></thead>
            <tbody>{data.items.slice(0, 20).map((p: any) => <tr key={p._id}><td>{p.name}</td><td>{p.stock}</td><td>{rs(p.stockValue)}</td><td>{p.lastSold ? new Date(p.lastSold).toLocaleDateString('en-IN') : 'never'}</td></tr>)}</tbody>
          </table></div>
        </>
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
  const [addStock, setAddStock] = useState(true);
  const [done, setDone] = useState<any>(null);
  const [unread, setUnread] = useState<any>(null);
  const [meta, setMeta] = useState({ supplier: '', invoiceNumber: '', orderNumber: '', invoiceDate: '' });
  useEffect(() => { api.get('/api/invoices').then((r) => setList(r.data)).catch(() => {}); }, []);
  const upload = async () => {
    if (!file) { toast('Choose the Flipkart PDF first', 'err'); return; }
    setBusy(true); setDone(null); setUnread(null);
    const fd = new FormData(); fd.append('bill', file); fd.append('rawText', rawText);
    try {
      const { data } = await api.post('/api/invoices/upload', fd);
      setResult(data);
      setMeta({ supplier: data.import.supplier || '', invoiceNumber: data.import.invoiceNumber || '', orderNumber: data.import.orderNumber || '', invoiceDate: data.import.invoiceDate || '' });
      if (data.docType === 'flipkart') toast(`Flipkart bill read: ${data.import.items.length} items ✓`, 'ok');
    } catch (e: any) {
      const d = e?.response?.data;
      if (e?.response?.status === 422 && d) setUnread(d);
      else toast(d?.hint || errMsg(e), 'err');
    } finally { setBusy(false); }
  };
  const addRow = () => {
    setResult((r: any) => ({ ...r, import: { ...r.import, items: [...r.import.items, { name: '', qty: 1, unitPrice: 0, lineTotal: 0 }] }, matches: [...(r.matches || []), { billName: '', status: 'will-create' }] }));
  };
  const editLine = (i: number, k: string, v: string) => {
    setResult((r: any) => ({ ...r, import: { ...r.import, items: r.import.items.map((it: any, j: number) => j === i ? { ...it, [k]: k === 'name' ? v : Number(v) } : it) } }));
  };
  const fk = result?.docType === 'flipkart';
  const matchedCt = result?.matches?.filter((m: any) => m.status === 'matched').length || 0;
  const newCt = (result?.matches?.length || 0) - matchedCt;
  const stockUnits = result?.import.items.reduce((s: number, it: any) => s + Number(it.qty || 0), 0) || 0;
  const commit = async () => {
    try {
      const { data } = await api.post(`/api/invoices/${result.import._id}/commit`, {
        items: result.import.items, addToStock: addStock, confirmDuplicate: !!result.duplicateWarning,
        ...meta, source: fk ? 'Flipkart' : undefined,
      });
      setDone(data); setResult(null); setFile(null); setRawText('');
      api.get('/api/invoices').then((r) => setList(r.data)).catch(() => {});
    } catch (e: any) { toast(errMsg(e), 'err'); }
  };
  return (
    <div className="page">
      <PageHead title="Add Flipkart bill" emoji="📦" />
      <div className="card" style={{ borderLeft: '4px solid var(--gold)' }}>
        <b>Flipkart → Shop in one tap</b>
        <p style={{ color: 'var(--muted)', fontSize: 13.5, margin: '4px 0 0' }}>1. Download the invoice PDF from Flipkart &nbsp;→&nbsp; 2. Upload here &nbsp;→&nbsp; 3. Review once &nbsp;→&nbsp; 4. Confirm — every product gets added with stock.</p>
        <label>Flipkart invoice PDF *</label><input type="file" accept=".pdf" onChange={(e) => setFile(e.target.files?.[0] || null)} />
        {file && <small>📄 {file.name} ({Math.round(file.size / 1024)} KB)</small>}
        <details style={{ marginTop: 8 }}><summary style={{ fontSize: 13.5, color: 'var(--muted)' }}>Photo bill or unclear PDF? Add bill text (optional)</summary>
          <textarea rows={3} value={rawText} onChange={(e) => setRawText(e.target.value)} placeholder="Paste bill text…" style={{ marginTop: 6 }} />
        </details>
        <button className="btn primary block" style={{ marginTop: 10 }} onClick={upload} disabled={busy}>{busy ? '📖 Reading PDF…' : '🔍 Read bill'}</button>
      </div>
      {result && (
        <div className="card" style={{ marginTop: 10, borderLeft: `4px solid ${fk ? '#175cd3' : 'var(--gold)'}` }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <b style={{ flex: 1 }}>{fk ? '🛍️ Flipkart invoice detected' : '🧾 Bill read'}</b>
            {fk && <span className="badge-info">auto product adder</span>}
          </div>
          {result.mathIssues?.length > 0 && <p style={{ color: 'var(--rose-tx)' }}>⚠ Bill total mismatch: {result.mathIssues.join('; ')}. Correct below before saving.</p>}
          {result.duplicateWarning && <p style={{ color: 'var(--rose-tx)' }}>⛔ This invoice may already have been added.</p>}
          {(result.parseNotes || []).map((n: string, i: number) => <p key={i} style={{ color: 'var(--amber-tx)' }}><small>ℹ {n}</small></p>)}
          <div className="row2">
            <div><label>Supplier</label><input value={meta.supplier} onChange={(e) => setMeta({ ...meta, supplier: e.target.value })} /></div>
            <div><label>Invoice no.</label><input value={meta.invoiceNumber} onChange={(e) => setMeta({ ...meta, invoiceNumber: e.target.value })} /></div>
          </div>
          <div className="row2">
            <div><label>Order ID</label><input value={meta.orderNumber} onChange={(e) => setMeta({ ...meta, orderNumber: e.target.value })} /></div>
            <div><label>Bill date</label><input type="date" value={meta.invoiceDate} onChange={(e) => setMeta({ ...meta, invoiceDate: e.target.value })} /></div>
          </div>
          <div className="kv"><span>Items</span><b>{result.import.items.length} • <span style={{ color: 'var(--green)' }}>{matchedCt} in shop</span> • <span style={{ color: 'var(--blue)' }}>{newCt} new</span></b></div>
          <div className="kv"><span>Bill total</span><b>{rs(result.import.grandTotal)}</b></div>
          <small style={{ color: 'var(--muted)' }}>Tap a name/qty/rate to correct. New products get a smart category + your default margin; you set final prices after.</small>
          <div className="table-wrap" style={{ marginTop: 8 }}><table><thead><tr><th>Product</th><th>Qty</th><th>Rate</th><th>Total</th><th>Status</th></tr></thead>
            <tbody>{result.import.items.map((it: any, i: number) => (
              <tr key={i}><td><input value={it.name} style={{ minWidth: 140, minHeight: 36 }} onChange={(e) => editLine(i, 'name', e.target.value)} /></td>
                <td><input type="number" value={it.qty} style={{ width: 62, minHeight: 36 }} onChange={(e) => editLine(i, 'qty', e.target.value)} /></td>
                <td><input type="number" value={it.unitPrice} style={{ width: 76, minHeight: 36 }} onChange={(e) => editLine(i, 'unitPrice', e.target.value)} /></td>
                <td>{rs(it.qty * it.unitPrice)}</td>
                <td>{result.matches?.[i]?.status === 'matched' ? <span className="badge-ok" title={result.matches[i].matchedName}>✓ in shop</span> : <span className="badge-info">＋ new</span>}</td>
              </tr>))}</tbody>
          </table></div>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}><input type="checkbox" checked={addStock} onChange={(e) => setAddStock(e.target.checked)} style={{ width: 22 }} /> Add all to shop stock <b>(+{stockUnits} units)</b></label>
          <button className="btn ghost block" style={{ marginTop: 8 }} onClick={addRow}>＋ Add item manually</button>
          <button className="btn primary block" style={{ marginTop: 8 }} onClick={commit}>✓ Confirm — add {newCt} new + stock {matchedCt} matched</button>
          <ReadDebug result={result} />
        </div>
      )}
      {unread && (
        <div className="card" style={{ marginTop: 10, borderLeft: '4px solid var(--rose-tx)' }}>
          <b>😕 Couldn't find products in this file</b>
          <p style={{ color: 'var(--muted)', fontSize: 13.5 }}>{unread.hint}</p>
          <ReadDebug result={unread} />
          <div className="btnrow" style={{ marginTop: 8 }}>
            <a className="btn" href="/purchase">＋ Add manually</a>
            <button className="btn gold" onClick={() => setUnread(null)}>Try another file</button>
          </div>
          <p><small>Tip: paste the bill text in the box above, keep the PDF attached, and press Read bill again.</small></p>
        </div>
      )}
      {done && (
        <Sheet title="Bill added ✓" onClose={() => setDone(null)}>
          <div className="card kpi green"><small>🎉 {done.message}</small></div>
          {done.created?.length > 0 && (<><div className="section-t">＋ New products ({done.created.length})</div>
            {done.created.map((c: any) => <div key={c.productId} className="kv"><span>{c.name} <small>• {c.category}</small></span><b>{rs(c.sellingPrice)}</b></div>)}</>)}
          {done.matched?.length > 0 && (<><div className="section-t">✓ Matched ({done.matched.length})</div>
            {done.matched.slice(0, 8).map((c: any, i: number) => <div key={i} className="kv"><span>{c.name}</span><small>stock updated</small></div>)}
            {done.matched.length > 8 && <small>…and {done.matched.length - 8} more</small>}</>)}
          {done.needsPricing > 0 && <a className="btn gold block" style={{ marginTop: 10 }} href="/products?needsPricing=1">🏷️ Set sell prices ({done.needsPricing})</a>}
          <div className="btnrow" style={{ marginTop: 10 }}>
            <a className="btn" href="/purchase">View purchase</a>
            <button className="btn primary" onClick={() => setDone(null)}>Done</button>
          </div>
        </Sheet>
      )}
      <div className="section-t">Past imports</div>
      {list.map((l: any) => <div key={l._id} className="lrow"><span style={{ fontSize: 20 }}>{l.docType === 'flipkart' ? '🛍️' : '🧾'}</span><div className="grow"><b className="t">{l.supplier || '—'} • {l.invoiceNumber || l.orderNumber || '—'}</b><small>{rs(l.grandTotal)} • {l.status}</small></div></div>)}
    </div>
  );
}

function ReadDebug({ result }: { result: any }) {
  const dbg = result?.debug;
  if (!dbg && !result?.textPreview) return null;
  return (
    <details style={{ marginTop: 10 }}>
      <summary style={{ fontSize: 13.5, color: 'var(--muted)', cursor: 'pointer' }}>🔍 What the app read from the file{dbg ? ` — ${dbg.rowsMatched}/${dbg.rowsSeen} rows, ${dbg.lines} lines` : ''}</summary>
      {dbg && <div className="kv"><span>Table header</span><b>{dbg.headerFound ? 'found ✓' : 'not found'}</b></div>}
      {result?.textPreview && <pre style={{ whiteSpace: 'pre-wrap', fontSize: 11.5, background: '#fff', border: '1px solid var(--line)', borderRadius: 10, padding: 10, maxHeight: 220, overflow: 'auto' }}>{result.textPreview}</pre>}
      <small style={{ color: 'var(--muted)' }}>If this looks wrong (empty/garbled), the PDF is likely a photo-scan — paste the bill text above and retry.</small>
    </details>
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
  const [retSale, setRetSale] = useState<any>(null);
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
        items.map((s: any) => {
          const retCt = (s.returned || []).reduce((a: number, r: any) => a + (r.qty || 0), 0);
          return (
            <div key={s._id} className="lrow" style={s.status === 'VOIDED' ? { opacity: .6 } : {}}>
              <span style={{ fontSize: 22 }}>{s.status === 'VOIDED' ? '🚫' : '🧾'}</span>
              <div className="grow"><b className="t">{s.receiptNumber} • {s.customerName}</b><small>{s.transactionTime} • {s.paymentMethod}{s.due ? ` • due ${rs(s.due)}` : ''}{retCt > 0 ? ` • ↩ ${retCt} returned` : ''}</small></div>
              <div style={{ textAlign: 'right' }}><b>{rs(s.total)}</b>
                <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                  <a className="btn sm ghost" href={`/api/sales/${s._id}/receipt.pdf`} target="_blank" rel="noreferrer">PDF</a>
                  {s.status !== 'VOIDED' && <button className="btn sm ghost" onClick={() => setRetSale(s)}>↩ Return</button>}
                  {s.status !== 'VOIDED' && <button className="btn sm ghost" onClick={() => voidSale(s)}>Void</button>}
                </div>
              </div>
            </div>
          );
        })}
      {retSale && <ReturnSheet sale={retSale} onClose={() => { setRetSale(null); load(); }} />}
    </div>
  );
}

function ReturnSheet({ sale, onClose }: { sale: any; onClose: () => void }) {
  const toast = useToast();
  const already = new Map<string, number>((sale.returned || []).map((r: any): [string, number] => [String(r.productId), Number(r.qty || 0)]));
  const [qty, setQty] = useState<Record<string, number>>({});
  const [reason, setReason] = useState('');
  const [method, setMethod] = useState('CASH');
  const [busy, setBusy] = useState(false);
  const lines = sale.items.map((it: any) => {
    const max = it.qty - (already.get(String(it.productId)) || 0);
    return { ...it, max, sel: Math.min(qty[String(it.productId)] || 0, Math.max(0, max)) };
  }).filter((l: any) => l.max > 0);
  const refund = lines.reduce((s: number, l: any) => s + l.sel * l.rate, 0);
  const submit = async () => {
    const items = lines.filter((l: any) => l.sel > 0).map((l: any) => ({ productId: l.productId, qty: l.sel }));
    if (!items.length) { toast('Choose return quantity', 'err'); return; }
    setBusy(true);
    try {
      const { data } = await api.post(`/api/sales/${sale._id}/return`, { items, reason, refundMethod: method });
      toast(`Return saved — refund ${rs(data.refundTotal)} ✓`, 'ok'); onClose();
    } catch (e: any) { toast(errMsg(e), 'err'); } finally { setBusy(false); }
  };
  if (!lines.length) return <Sheet title="Nothing returnable" onClose={onClose}><p>All items on this bill were already returned.</p></Sheet>;
  return (
    <Sheet title={`↩ Return • ${sale.receiptNumber}`} onClose={onClose}>
      {lines.map((l: any) => (
        <div key={String(l.productId)} className="cartline">
          <div className="nm"><b>{l.name}</b><small>sold {l.qty} @ {rs(l.rate)} • returnable {l.max}</small></div>
          <QtyStepper qty={l.sel} onChange={(v) => setQty({ ...qty, [String(l.productId)]: Math.min(v, l.max) })} />
          <b>{rs(l.sel * l.rate)}</b>
        </div>
      ))}
      <label>Reason</label><input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Damaged / wrong item…" />
      <label>Refund by</label>
      <div className="chips">{['CASH', 'UPI', 'BANK', 'ADJUST_DUE'].map((m) => <button key={m} className={`chip${method === m ? ' on' : ''}`} onClick={() => setMethod(m)}>{m === 'ADJUST_DUE' ? 'Adjust due' : m}</button>)}</div>
      <div className="totals"><div className="tr grand"><span>Refund</span><span>{rs(refund)}</span></div></div>
      <p><small>Stock goes back up • khata auto-adjusts{method === 'ADJUST_DUE' ? ' • customer due reduced' : ' • cash returned to customer'}.</small></p>
      <button className="btn primary block" onClick={submit} disabled={busy}>{busy ? 'Saving…' : `✓ Confirm return ${rs(refund)}`}</button>
    </Sheet>
  );
}
