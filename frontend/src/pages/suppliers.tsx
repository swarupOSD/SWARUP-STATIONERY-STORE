import { useEffect, useState } from 'react';
import api, { errMsg } from '../api/client';
import { Avatar, Empty, PageHead, Sheet, Skel, rs, useToast } from '../components/ui';

export function Suppliers() {
  const toast = useToast();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<string | null>(null);
  const load = async () => {
    setLoading(true);
    try { const { data } = await api.get('/api/suppliers/dues'); setItems(data); }
    catch (e: any) { toast(errMsg(e), 'err'); } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);
  const total = items.reduce((s, x) => s + (x.due || 0), 0);
  return (
    <div className="page">
      <PageHead title="Supplier dues" emoji="🏭" />
      <div className="cards">
        <div className="card kpi red"><small>💸 To pay</small><br /><b>{rs(Math.round(total))}</b><div className="sub">{items.filter((x) => x.due > 0).length} suppliers pending</div></div>
        <div className="card kpi"><small>🧾 Bought total</small><br /><b>{rs(Math.round(items.reduce((s, x) => s + (x.bought || 0), 0)))}</b></div>
      </div>
      {loading ? <Skel n={4} /> : items.length === 0 ? <Empty emoji="🏭" title="No supplier purchases" sub="Buy on credit and dues appear here." /> :
        items.map((s: any) => (
          <div key={s.name} className="lrow" style={{ cursor: 'pointer' }} onClick={() => setDetail(s.name)}>
            <Avatar name={s.name} gold={s.due > 0} />
            <div className="grow"><b className="t">{s.name}</b><small>{s.bills} bills • bought {rs(s.bought)}{s.lastDate ? ` • last ${s.lastDate}` : ''}</small></div>
            <div className={`due-amt ${s.due > 0 ? 'neg' : 'zero'}`}>{s.due > 0 ? rs(s.due) : '✓ Clear'}</div>
          </div>
        ))}
      {detail && <SupplierDetail name={detail} onClose={() => { setDetail(null); load(); }} />}
    </div>
  );
}

function SupplierDetail({ name, onClose }: { name: string; onClose: () => void }) {
  const toast = useToast();
  const [d, setD] = useState<any>(null);
  const [amt, setAmt] = useState('');
  const [method, setMethod] = useState('CASH');
  const [ref, setRef] = useState('');
  const load = async () => { try { const { data } = await api.get('/api/suppliers/ledger', { params: { name } }); setD(data); } catch (e: any) { toast(errMsg(e), 'err'); } };
  useEffect(() => { load(); }, [name]);
  const pay = async () => {
    if (!(Number(amt) > 0)) { toast('Enter amount', 'err'); return; }
    try {
      const { data } = await api.post('/api/suppliers/pay', { supplierName: name, amount: Number(amt), method, reference: ref });
      toast(`Paid ${rs(Number(amt))} ✓ — remaining ${rs(data.remaining)}`, 'ok');
      setAmt(''); setRef(''); load();
    } catch (e: any) { toast(errMsg(e), 'err'); }
  };
  if (!d) return <Sheet title={name} onClose={onClose}><Skel n={3} /></Sheet>;
  return (
    <Sheet title={name} onClose={onClose} wide>
      <div className="card kpi red"><small>💸 Outstanding</small><br /><b>{rs(d.due)}</b></div>
      <div className="card" style={{ marginTop: 8 }}>
        <h3>💰 Pay supplier</h3>
        <input placeholder={`Amount (max ${rs(d.due)})`} value={amt} onChange={(e) => setAmt(e.target.value)} inputMode="decimal" />
        <div className="chips" style={{ marginTop: 8 }}>
          <button className="chip" onClick={() => setAmt(String(d.due))}>Full {rs(d.due)}</button>
          {[500, 1000, 2000, 5000].map((v) => <button key={v} className="chip" onClick={() => setAmt(String(v))}>₹{v}</button>)}
        </div>
        <div className="chips">{['CASH', 'UPI', 'BANK', 'OTHER'].map((m) => <button key={m} className={`chip${method === m ? ' on' : ''}`} onClick={() => setMethod(m)}>{m}</button>)}</div>
        <label>Ref / note</label><input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="UTR / remark" />
        <button className="btn primary block" style={{ marginTop: 10 }} onClick={pay}>✓ Pay — oldest bills first</button>
        <small style={{ color: 'var(--muted)' }}>Payment auto-adjusts your unpaid bills, oldest first.</small>
      </div>
      <div className="section-t">🧾 Unpaid bills</div>
      {d.purchases.filter((p: any) => p.due > 0).map((p: any) => (
        <div key={p._id} className="kv"><span>{p.invoiceNumber} <small>• {p.purchaseDate}</small></span><b className="due-amt neg">{rs(p.due)} <small>/ {rs(p.grandTotal)}</small></b></div>
      ))}
      {d.purchases.filter((p: any) => p.due > 0).length === 0 && <small style={{ color: 'var(--green)' }}>✅ All bills clear.</small>}
      <div className="section-t">💸 Payments made</div>
      {d.payments.length === 0 ? <small style={{ color: 'var(--muted)' }}>None yet.</small> :
        d.payments.map((p: any) => <div key={p._id} className="kv"><span>{rs(p.amount)} via {p.method} <small>• {p.paymentDate}</small></span><small>{p.reference || ''}</small></div>)}
    </Sheet>
  );
}
