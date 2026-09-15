import { useEffect, useState } from 'react';
import api, { errMsg } from '../api/client';
import { Avatar, Empty, PageHead, Seg, Sheet, Skel, rs, useConfirm, useToast, waLink } from '../components/ui';

export function Purchase() {
  const toast = useToast();
  const confirm = useConfirm();
  const [products, setProducts] = useState<any[]>([]);
  const [q, setQ] = useState('');
  const [lines, setLines] = useState<any[]>([]);
  const [supplier, setSupplier] = useState('');
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [invoice, setInvoice] = useState('');
  const [source, setSource] = useState('Local Shop');
  const [owner, setOwner] = useState('Shop');
  const [addStock, setAddStock] = useState(true);
  const [billFile, setBillFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  const [detailId, setDetailId] = useState<string | null>(null);
  const openDetail = (id: string) => setDetailId(id);
  const find = async (term: string) => {
    setQ(term);
    try { const { data } = await api.get('/api/products', { params: { q: term, limit: 15 } }); setProducts(data.items); } catch {}
  };
  const loadHist = async () => { try { const { data } = await api.get('/api/purchases', { params: { limit: 10 } }); setHistory(data.items); } catch {} };
  useEffect(() => { find(''); loadHist(); api.get('/api/suppliers').then((r) => setSuppliers(r.data)).catch(() => {}); }, []);
  const total = lines.reduce((s, l) => s + l.qty * l.unitPrice, 0);
  const submit = async () => {
    if (!lines.length) { toast('Add at least one item', 'err'); return; }
    setBusy(true);
    try {
      let billUrl = '', billPublicId = '';
      if (billFile) {
        const fd = new FormData(); fd.append('file', billFile); fd.append('folder', 'bills');
        const up = await api.post('/api/uploads', fd);
        billUrl = up.data.url; billPublicId = up.data.publicId;
      }
      const { data } = await api.post('/api/purchases', { supplier, invoiceNumber: invoice, source, owner, addToStock: addStock, billUrl, billPublicId, items: lines });
      toast(`Purchase saved ✓ ${data.invoiceNumber}`, 'ok');
      setLines([]); setInvoice(''); setBillFile(null); loadHist(); find('');
    } catch (e: any) { toast(errMsg(e), 'err'); } finally { setBusy(false); }
  };
  const voidOne = async (id: string, inv: string) => {
    if (!await confirm({ title: `Void purchase ${inv}?`, body: 'Stock added by this purchase will be reversed.', okText: 'Void' })) return;
    try { await api.post(`/api/purchases/${id}/void`, {}); toast('Purchase voided', 'ok'); loadHist(); } catch (e: any) { toast(errMsg(e), 'err'); }
  };
  return (
    <div className="page">
      <PageHead title="Purchase" emoji="📦"><a className="btn gold sm" href="/suppliers">🏭 Supplier dues</a></PageHead>
      <div className="card">
        <div className="row2">
          <div><label>Where bought?</label><select value={source} onChange={(e) => setSource(e.target.value)}>{['Local Shop', 'Flipkart', 'Amazon', 'Supplier', 'Other'].map((s) => <option key={s}>{s}</option>)}</select></div>
          <div><label>Owner</label><select value={owner} onChange={(e) => setOwner(e.target.value)}>{['Shop', 'My Purchase', "Father's Purchase", "Mother's Purchase"].map((s) => <option key={s}>{s}</option>)}</select></div>
        </div>
        <div className="row2">
          <div><label>Supplier / shop</label><input list="suplist" value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="e.g. Mahamaya Stores" /><datalist id="suplist">{suppliers.map((s: any) => <option key={s._id} value={s.name} />)}</datalist></div>
          <div><label>Invoice no. (optional)</label><input value={invoice} onChange={(e) => setInvoice(e.target.value)} placeholder="Bill no." /></div>
        </div>
        <label>Find product</label><input value={q} onChange={(e) => find(e.target.value)} placeholder="Search to add…" />
        {q && products.slice(0, 6).map((p) => (
          <div key={p._id} className="lrow" style={{ cursor: 'pointer' }} onClick={() => { setLines((l) => [...l, { productId: p._id, name: p.name, qty: 1, unitPrice: p.purchasePrice, sellingPrice: p.sellingPrice, lineTotal: p.purchasePrice }]); setQ(''); }}>
            <div className="grow"><b className="t">{p.name}</b><small>stock {p.stock} • buy {rs(p.purchasePrice)}</small></div><span style={{ fontSize: 20 }}>＋</span>
          </div>
        ))}
        {lines.map((l, i) => (
          <div key={i} className="card" style={{ marginTop: 8, background: '#fff' }}>
            <b>{l.name}</b>
            <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
              <input type="number" value={l.qty} aria-label="qty" onChange={(e) => setLines((ls) => ls.map((x, j) => j === i ? { ...x, qty: Number(e.target.value), lineTotal: Number(e.target.value) * x.unitPrice } : x))} />
              <input type="number" value={l.unitPrice} aria-label="rate" onChange={(e) => setLines((ls) => ls.map((x, j) => j === i ? { ...x, unitPrice: Number(e.target.value), lineTotal: x.qty * Number(e.target.value) } : x))} />
              <input type="number" value={l.sellingPrice || ''} aria-label="sell" placeholder="Sell ₹" onChange={(e) => setLines((ls) => ls.map((x, j) => j === i ? { ...x, sellingPrice: Number(e.target.value) } : x))} />
              <button className="btn sm ghost" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}>✕</button>
            </div>
            <small>Qty • Buy ₹ • Sell ₹ → line {rs(l.qty * l.unitPrice)}</small>
          </div>
        ))}
        <label>Bill photo (optional)</label><input type="file" accept="image/*,.pdf" capture="environment" onChange={(e) => setBillFile(e.target.files?.[0] || null)} />
        <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" checked={addStock} onChange={(e) => setAddStock(e.target.checked)} style={{ width: 22 }} /> Add to shop stock <small>(increases stock once)</small></label>
        <div className="totals" style={{ marginTop: 8 }}><div className="tr grand"><span>Total</span><span>{rs(total)}</span></div></div>
        <button className="btn primary block" style={{ marginTop: 10 }} onClick={submit} disabled={busy}>{busy ? 'Saving…' : `✓ Save purchase ${rs(total)}`}</button>
      </div>
      <div className="section-t">🧾 Recent purchases</div>
      {history.map((h: any) => (
        <div key={h._id} className="lrow" style={{ cursor: 'pointer' }} onClick={() => openDetail(h._id)}>
          <span style={{ fontSize: 22 }}>{h.source === 'Flipkart' ? '🛍️' : '🧾'}</span>
          <div className="grow"><b className="t">{h.invoiceNumber} • {h.supplier || h.source}</b><small>{h.purchaseDate} • {h.items.length} items{h.status === 'VOIDED' ? ' • VOIDED' : ''}</small></div>
          <b>{rs(h.grandTotal)}</b>
        </div>
      ))}
      {detailId && <PurchaseDetail id={detailId} onClose={() => { setDetailId(null); loadHist(); }} onVoid={voidOne} />}
    </div>
  );
}

function PurchaseDetail({ id, onClose, onVoid }: { id: string; onClose: () => void; onVoid: (id: string, inv: string) => void }) {
  const [p, setP] = useState<any>(null);
  useEffect(() => { api.get(`/api/purchases/${id}`).then((r) => setP(r.data)).catch(() => {}); }, [id]);
  if (!p) return <Sheet title="Purchase" onClose={onClose}><Skel n={3} /></Sheet>;
  return (
    <Sheet title={`${p.invoiceNumber}`} onClose={onClose} wide>
      <div className="kv"><span>Supplier</span><b>{p.supplier || '—'} ({p.source})</b></div>
      {p.orderNumber && <div className="kv"><span>Order</span><span>{p.orderNumber}</span></div>}
      <div className="kv"><span>Date</span><span>{p.purchaseDate} {p.purchaseTime}</span></div>
      <div className="kv"><span>By</span><span>{p.createdBy}</span></div>
      <div className="table-wrap" style={{ marginTop: 8 }}><table><thead><tr><th>Item</th><th>Qty</th><th>Buy ₹</th><th>Total</th></tr></thead>
        <tbody>{p.items.map((it: any, i: number) => <tr key={i}><td>{it.name}</td><td>{it.qty}</td><td>{rs(it.unitPrice)}</td><td>{rs(it.lineTotal)}</td></tr>)}</tbody>
      </table></div>
      <div className="totals" style={{ marginTop: 8 }}>
        <div className="tr"><span>Subtotal</span><span>{rs(p.subtotal)}</span></div>
        {!!p.tax && <div className="tr"><span>Tax</span><span>{rs(p.tax)}</span></div>}
        {!!p.shipping && <div className="tr"><span>Shipping</span><span>{rs(p.shipping)}</span></div>}
        {!!p.discount && <div className="tr"><span>Discount</span><span>− {rs(p.discount)}</span></div>}
        <div className="tr grand"><span>Grand total</span><span>{rs(p.grandTotal)}</span></div>
        <div className="tr"><span>Paid / Due</span><span>{rs(p.paid)} / {rs(p.due)}</span></div>
      </div>
      <div className="btnrow" style={{ marginTop: 10 }}>
        {p.billUrl && <a className="btn gold" href={p.billUrl} target="_blank" rel="noreferrer">🧾 View bill</a>}
        {p.status !== 'VOIDED' ? <button className="btn" onClick={() => { onClose(); onVoid(p._id, p.invoiceNumber); }}>Void</button> : <span className="badge-out">VOIDED</span>}
      </div>
    </Sheet>
  );
}

export function Khata() {
  const toast = useToast();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<'all' | 'due' | 'paid'>('all');
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [nm, setNm] = useState(''); const [ph, setPh] = useState('');
  const load = async () => {
    setLoading(true);
    try { const { data } = await api.get('/api/customers', { params: { q, filter, limit: 100 } }); setItems(data.items); }
    catch (e: any) { toast(errMsg(e), 'err'); } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [filter]);
  const addCust = async () => {
    if (!nm.trim()) { toast('Enter customer name', 'err'); return; }
    try { await api.post('/api/customers', { name: nm.trim(), phone: ph.trim() }); setNm(''); setPh(''); setShowAdd(false); toast('Customer added ✓', 'ok'); load(); }
    catch (e: any) { toast(errMsg(e), 'err'); }
  };
  const totalDue = items.reduce((s, c) => s + (c.totalDue || 0), 0);
  return (
    <div className="page">
      <PageHead title="Khata" emoji="📒"><button className="btn primary sm" onClick={() => setShowAdd(true)}>+ Customer</button></PageHead>
      <div className="cards">
        <div className="card kpi red"><small>👥 Total due</small><br /><b>{rs(Math.round(totalDue))}</b><div className="sub">{items.filter((c) => c.totalDue > 0).length} customers pending</div></div>
        <div className="card kpi green"><small>✅ Fully paid</small><br /><b>{items.filter((c) => (c.totalDue || 0) <= 0).length}</b><div className="sub">clear accounts</div></div>
      </div>
      <div className="toolbar">
        <input placeholder="Search name / phone" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && load()} />
        <button className="btn" onClick={load}>Go</button>
      </div>
      <Seg value={filter} onChange={setFilter} options={[{ v: 'all', label: 'All' }, { v: 'due', label: 'Due' }, { v: 'paid', label: 'Paid' }]} />
      {loading ? <Skel n={4} /> : items.length === 0 ? <Empty emoji="📒" title="No customers" sub="Add your first khata customer." action={<button className="btn primary" onClick={() => setShowAdd(true)}>+ Add customer</button>} /> :
        items.map((c) => (
          <a key={c._id} href={`/khata/${c._id}`} className="lrow">
            <Avatar name={c.name} gold={c.totalDue > 0} />
            <div className="grow"><b className="t">{c.name}</b><small>{c.phone || '—'} • bought {rs(c.totalPurchased)}</small></div>
            <div style={{ textAlign: 'right' }}><div className={`due-amt ${c.totalDue > 0 ? 'neg' : 'zero'}`}>{c.totalDue > 0 ? rs(c.totalDue) : '✓ Paid'}</div></div>
          </a>
        ))}
      {showAdd && (
        <Sheet title="New customer" onClose={() => setShowAdd(false)}>
          <label>Name *</label><input value={nm} onChange={(e) => setNm(e.target.value)} placeholder="e.g. Rahul" />
          <label>Phone (for call / WhatsApp)</label><input value={ph} onChange={(e) => setPh(e.target.value)} inputMode="tel" placeholder="98XXXXXXXX" />
          <button className="btn primary block" style={{ marginTop: 12 }} onClick={addCust}>✓ Add to Khata</button>
        </Sheet>
      )}
    </div>
  );
}

export function CustomerDetail({ id }: { id: string }) {
  const toast = useToast();
  const [d, setD] = useState<any>(null);
  const [tab, setTab] = useState<'all' | 'dues' | 'payments'>('all');
  const [showPay, setShowPay] = useState(false);
  const [amt, setAmt] = useState('');
  const [method, setMethod] = useState('CASH');
  const [ref, setRef] = useState('');
  const load = async () => { try { const { data } = await api.get(`/api/customers/${id}`); setD(data); } catch (e: any) { toast(errMsg(e), 'err'); } };
  useEffect(() => { load(); }, [id]);
  const pay = async () => {
    if (!(Number(amt) > 0)) { toast('Enter amount', 'err'); return; }
    try {
      await api.post(`/api/customers/${id}/payments`, { amount: Number(amt), method, reference: ref });
      toast(`Received ${rs(Number(amt))} ✓`, 'ok'); setAmt(''); setRef(''); setShowPay(false); load();
    } catch (e: any) { toast(errMsg(e), 'err'); }
  };
  if (!d) return <div className="page"><Skel n={4} /></div>;
  const c = d.customer;
  const reminder = `🙏 Namaskar ${c.name}! Swarup Stationery Store থেকে বলছি। আপনার বাকি ${rs(c.totalDue)} হয়েছে। সুবিধামতো দিয়ে দেবেন। ধন্যবাদ! (Due: ${rs(c.totalDue)})`;
  return (
    <div className="page">
      <PageHead title={c.name} emoji="👤">
        {c.phone && <a className="btn sm" href={`tel:${c.phone}`}>📞 Call</a>}
        {c.phone && <a className="btn sm green" href={waLink(c.phone, reminder)} target="_blank" rel="noreferrer">💬 Remind</a>}
      </PageHead>
      <div className="cards quad">
        <div className="card kpi"><small>🛒 Bought</small><br /><b>{rs(c.totalPurchased)}</b></div>
        <div className="card kpi green"><small>💰 Paid</small><br /><b>{rs(c.totalPaid)}</b></div>
        <div className="card kpi red"><small>📒 Due</small><br /><b>{rs(c.totalDue)}</b></div>
        <div className="card kpi accent"><small>🧾 Bills</small><br /><b>{d.sales.length}</b></div>
      </div>
      <div className="btnrow">
        <button className="btn primary big" onClick={() => setShowPay(true)}>💰 Receive payment</button>
        <a className="btn gold" href={`/api/customers/${id}/statement.pdf`} target="_blank" rel="noreferrer">📄 Statement PDF</a>
      </div>
      <div style={{ marginTop: 10 }}><Seg value={tab} onChange={setTab} options={[{ v: 'all', label: 'All' }, { v: 'dues', label: 'Dues' }, { v: 'payments', label: 'Payments' }]} /></div>
      {(tab === 'all' || tab === 'dues') && d.sales.map((s: any) => (
        <div key={s._id} className="lrow">
          <span style={{ fontSize: 22 }}>🧾</span>
          <div className="grow"><b className="t">{s.receiptNumber} • {s.transactionDate} {s.transactionTime}</b><small>{s.items.map((i: any) => `${i.name}×${i.qty}`).join(', ')}</small></div>
          <div style={{ textAlign: 'right' }}><b>{rs(s.total)}</b>{s.due > 0 ? <div><span className="badge-out">due {rs(s.due)}</span></div> : <div><span className="badge-ok">paid</span></div>}</div>
        </div>
      ))}
      {(tab === 'all' || tab === 'payments') && d.payments.map((p: any) => (
        <div key={p._id} className="lrow">
          <span style={{ fontSize: 22 }}>💰</span>
          <div className="grow"><b className="t">{rs(p.amount)} via {p.method}</b><small>{p.paymentDate} {p.paymentTime}{p.reference ? ` • ${p.reference}` : ''}</small></div>
        </div>
      ))}
      {showPay && (
        <Sheet title={`Receive ${rs(c.totalDue)} due`} onClose={() => setShowPay(false)}>
          <label>Amount ₹ (max {rs(c.totalDue)})</label>
          <input value={amt} onChange={(e) => setAmt(e.target.value)} inputMode="decimal" placeholder={String(c.totalDue)} />
          <div className="chips" style={{ marginTop: 8 }}>
            {[25, 50, 100, 200, 500].map((v) => <button key={v} className="chip" onClick={() => setAmt(String(v))}>₹{v}</button>)}
            <button className="chip" onClick={() => setAmt(String(c.totalDue))}>Full {rs(c.totalDue)}</button>
          </div>
          <label>Method</label>
          <div className="chips">{['CASH', 'UPI', 'PHONEPE', 'GPAY', 'BANK'].map((m) => <button key={m} className={`chip${method === m ? ' on' : ''}`} onClick={() => setMethod(m)}>{m}</button>)}</div>
          <label>UPI ref / note (optional)</label><input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="UTR / remark" />
          <button className="btn primary block" style={{ marginTop: 12 }} onClick={pay}>✓ Save payment</button>
        </Sheet>
      )}
    </div>
  );
}
