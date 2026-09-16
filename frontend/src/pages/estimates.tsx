import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api, { errMsg } from '../api/client';
import { Empty, PageHead, Sheet, Skel, rs, useConfirm, useToast, waLink } from '../components/ui';

type Line = { productId: string; name: string; qty: number; rate: number };

export function Estimates() {
  const toast = useToast();
  const confirm = useConfirm();
  const nav = useNavigate();
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [show, setShow] = useState(false);
  const [q, setQ] = useState('');
  const [found, setFound] = useState<any[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [cust, setCust] = useState('');
  const [phone, setPhone] = useState('');
  const [disc, setDisc] = useState('');
  const [busy, setBusy] = useState(false);
  const load = async () => {
    setLoading(true);
    try { const { data } = await api.get('/api/estimates', { params: { limit: 50 } }); setList(data.items); }
    catch (e: any) { toast(errMsg(e), 'err'); } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);
  const find = async (term: string) => {
    setQ(term);
    if (term.trim().length < 2) { setFound([]); return; }
    try { const { data } = await api.get('/api/products', { params: { q: term, limit: 10 } }); setFound(data.items); } catch {}
  };
  const subtotal = lines.reduce((s, l) => s + l.qty * l.rate, 0);
  const total = Math.max(0, subtotal - Number(disc || 0));
  const save = async () => {
    if (!lines.length) { toast('Item add koro', 'err'); return; }
    setBusy(true);
    try {
      await api.post('/api/estimates', { customerName: cust.trim(), phone: phone.trim(), items: lines.map((l) => ({ productId: l.productId, qty: l.qty })), discount: Number(disc || 0) });
      toast('Estimate ready ✓', 'ok'); setShow(false); setLines([]); setCust(''); setPhone(''); setDisc(''); setQ(''); load();
    } catch (e: any) { toast(errMsg(e), 'err'); } finally { setBusy(false); }
  };
  const convert = async (est: any) => {
    if (!await confirm({ title: 'Sell this estimate?', body: `${est.customerName || 'Customer'} • ${rs(est.total)} — POS cart-e jabe, dam abar miliye neoa hobe.`, okText: 'Sell →' })) return;
    try {
      await api.patch(`/api/estimates/${est._id}`, { status: 'CONVERTED' });
      const cart = est.items.map((i: any) => ({ productId: i.productId, name: i.name, qty: i.qty, rate: i.rate, stock: 9999, unit: '' }));
      localStorage.setItem('estimate-convert', JSON.stringify({ items: cart, customerName: est.customerName || '', discount: est.discount || 0 }));
      nav('/sell');
    } catch (e: any) { toast(errMsg(e), 'err'); }
  };
  const cancel = async (est: any) => {
    if (!await confirm({ title: 'Cancel estimate?', okText: 'Cancel it' })) return;
    try { await api.patch(`/api/estimates/${est._id}`, { status: 'CANCELLED' }); load(); } catch (e: any) { toast(errMsg(e), 'err'); }
  };
  const waText = (est: any) => `🧾 *Estimate — Swarup Stationery Store*\nCustomer: ${est.customerName || '-'}\n${est.items.map((i: any) => `• ${i.name} x${i.qty} = ₹${i.lineTotal}`).join('\n')}\nTotal: ₹${est.total}\nDam ${est.validTill ? est.validTill + ' porjonto' : 'ajker jonno'} valid. Dhonnobad! 🙏`;
  return (
    <div className="page">
      <PageHead title="Estimate (bulk order)" emoji="📝"><button className="btn primary sm" onClick={() => setShow(true)}>+ New</button></PageHead>
      <p><small style={{ color: 'var(--muted)' }}>School/party boro order-e age dam janiye dao — raji hole ek tap-e sale.</small></p>
      {loading ? <Skel n={3} /> : list.filter((e) => e.status === 'PENDING').length === 0 && list.length === 0 ? <Empty emoji="📝" title="No estimates" /> :
        (<>
          {list.filter((e) => e.status === 'PENDING').map((e: any) => (
            <div key={e._id} className="card" style={{ marginTop: 8 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <div className="grow" style={{ flex: 1 }}><b>{e.customerName || 'Walk-in'}</b> <small>• {new Date(e.createdAt).toLocaleDateString('en-IN')}</small><br /><small>{e.items.map((i: any) => `${i.name}×${i.qty}`).join(', ')}</small></div>
                <b>{rs(e.total)}</b>
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                <button className="btn sm primary" onClick={() => convert(e)}>🛒 Sell this</button>
                <a className="btn sm green" href={waLink(e.phone || '', waText(e))} target="_blank" rel="noreferrer">💬 WhatsApp</a>
                <button className="btn sm ghost" onClick={() => cancel(e)}>Cancel</button>
              </div>
            </div>
          ))}
          {list.filter((e) => e.status !== 'PENDING').length > 0 && (<>
            <div className="section-t">Purono</div>
            {list.filter((e) => e.status !== 'PENDING').slice(0, 10).map((e: any) => (
              <div key={e._id} className="lrow" style={{ opacity: .65 }}><div className="grow"><b className="t">{e.customerName || 'Walk-in'} • {rs(e.total)}</b><small>{e.status}</small></div></div>
            ))}
          </>)}
        </>)}
      {show && (
        <Sheet title="Notun estimate" onClose={() => setShow(false)} wide>
          <div className="row2">
            <div><label>Customer</label><input value={cust} onChange={(e) => setCust(e.target.value)} placeholder="School / party name" /></div>
            <div><label>Phone</label><input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" /></div>
          </div>
          <label>Product khujo</label><input value={q} onChange={(e) => find(e.target.value)} placeholder="Search…" />
          {found.map((p) => (
            <div key={p._id} className="lrow" style={{ cursor: 'pointer' }} onClick={() => { setLines((l) => [...l, { productId: p._id, name: p.name, qty: 1, rate: p.sellingPrice }]); setQ(''); setFound([]); }}>
              <div className="grow"><b className="t">{p.name}</b><small>{rs(p.sellingPrice)} • stk {p.stock}</small></div><span>＋</span>
            </div>
          ))}
          {lines.map((l, i) => (
            <div key={i} className="cartline">
              <div className="nm"><b>{l.name}</b><small>{rs(l.rate)} × {l.qty}</small></div>
              <input type="number" value={l.qty} style={{ maxWidth: 76 }} onChange={(e) => setLines((ls) => ls.map((x, j) => j === i ? { ...x, qty: Math.max(1, Number(e.target.value)) } : x))} />
              <b>{rs(l.qty * l.rate)}</b>
              <button className="btn sm ghost" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}>✕</button>
            </div>
          ))}
          <div className="row2" style={{ marginTop: 8 }}>
            <div><label>Discount ₹</label><input value={disc} onChange={(e) => setDisc(e.target.value)} inputMode="decimal" /></div>
            <div><label>Total</label><div style={{ fontSize: 20, fontWeight: 800 }}>{rs(total)}</div></div>
          </div>
          <button className="btn primary block" style={{ marginTop: 10 }} onClick={save} disabled={busy}>{busy ? 'Saving…' : '✓ Save estimate'}</button>
        </Sheet>
      )}
    </div>
  );
}
