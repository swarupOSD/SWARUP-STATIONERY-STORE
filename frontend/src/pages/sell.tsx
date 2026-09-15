import { useEffect, useMemo, useState } from 'react';
import api, { errMsg } from '../api/client';
import { Avatar, Empty, Img, PageHead, QtyStepper, Sheet, Skel, rs, useDebounce, useToast, waLink } from '../components/ui';
import { Scanner, VoiceSale } from '../components/scan';
import { useLang } from '../i18n/lang';

type CartLine = { productId: string; name: string; qty: number; rate: number; stock: number; unit: string };
type Customer = { _id: string; name: string; phone?: string; totalDue: number };

const METHODS = [
  { v: 'CASH', label: '💵 Cash' }, { v: 'UPI', label: '📱 UPI' },
  { v: 'DUE', label: '📒 Due' }, { v: 'MIXED', label: '🔀 Mixed' },
];
const ALL_METHODS = ['CASH', 'UPI', 'PHONEPE', 'GPAY', 'BANK', 'OTHER_UPI'];

export function Sell() {
  const { t } = useLang();
  const toast = useToast();
  const [q, setQ] = useState('');
  const dq = useDebounce(q);
  const [cat, setCat] = useState('');
  const [cats, setCats] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [cart, setCart] = useState<CartLine[]>(() => JSON.parse(localStorage.getItem('cart') || '[]'));
  const [held, setHeld] = useState<CartLine[] | null>(() => JSON.parse(localStorage.getItem('heldCart') || 'null'));
  const [disc, setDisc] = useState('');
  const [discPct, setDiscPct] = useState('');
  const [method, setMethod] = useState('CASH');
  const [upiMethod, setUpiMethod] = useState('UPI');
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [custQ, setCustQ] = useState('');
  const [custList, setCustList] = useState<Customer[]>([]);
  const [newCust, setNewCust] = useState('');
  const [received, setReceived] = useState('');
  const [mix, setMix] = useState({ CASH: '', UPI: '', BANK: '' });
  const [busy, setBusy] = useState(false);
  const [qr, setQr] = useState<any>(null);
  const [done, setDone] = useState<any>(null);
  const [showPay, setShowPay] = useState(false);

  useEffect(() => { localStorage.setItem('cart', JSON.stringify(cart)); }, [cart]);
  useEffect(() => { api.get('/api/categories').then((r) => setCats(r.data)).catch(() => {}); }, []);
  useEffect(() => {
    setLoading(true);
    api.get('/api/products', { params: { q: dq, category: cat, limit: 60 } })
      .then((r) => setItems(r.data.items)).catch((e) => toast(errMsg(e), 'err')).finally(() => setLoading(false));
  }, [dq, cat]);

  const findCustomers = async (term: string) => {
    setCustQ(term);
    if (term.trim().length < 1) { setCustList([]); return; }
    try { const { data } = await api.get('/api/customers', { params: { q: term } }); setCustList(data.items); } catch {}
  };

  const add = (p: any, qty = 1) => {
    if (p.stock <= 0) { toast(`${p.name} is out of stock`, 'err'); return; }
    setCart((c) => {
      const f = c.find((l) => l.productId === p._id);
      if (f) return c.map((l) => (l.productId === p._id ? { ...l, qty: l.qty + qty } : l));
      return [...c, { productId: p._id, name: p.name, qty, rate: p.sellingPrice, stock: p.stock, unit: p.unit }];
    });
  };
  const setQty = (id: string, qty: number) => setCart((c) => qty <= 0 ? c.filter((l) => l.productId !== id) : c.map((l) => (l.productId === id ? { ...l, qty } : l)));

  const subtotal = useMemo(() => cart.reduce((s, l) => s + l.qty * l.rate, 0), [cart]);
  const discount = useMemo(() => {
    const flat = Number(disc || 0);
    const pct = Math.min(100, Math.max(0, Number(discPct || 0)));
    return Math.min(subtotal, Math.round((flat + (subtotal * pct) / 100) * 100) / 100);
  }, [disc, discPct, subtotal]);
  const total = Math.max(0, Math.round((subtotal - discount) * 100) / 100);
  const mixSum = ['CASH', 'UPI', 'BANK'].reduce((s, k) => s + Number((mix as any)[k] || 0), 0);
  const change = method === 'CASH' && received ? Math.max(0, Number(received) - total) : 0;

  const holdCart = () => {
    if (!cart.length) return;
    localStorage.setItem('heldCart', JSON.stringify(cart)); setHeld(cart); setCart([]);
    toast('Cart kept on hold', 'ok');
  };
  const resumeHeld = () => { if (held) { setCart(held); setHeld(null); localStorage.removeItem('heldCart'); } };

  const fetchQr = async (amount: number) => {
    try { const { data } = await api.get('/api/upi-qr', { params: { amount } }); setQr(data); }
    catch (e: any) { setQr({ error: errMsg(e) }); }
  };

  const checkout = async () => {
    if (!cart.length || busy) return;
    if (method === 'DUE' && !customer && !newCust.trim()) { toast('Select or add a customer for due sale', 'err'); return; }
    if (method === 'MIXED' && Math.abs(mixSum - total) > 0.01) { toast(`Split must equal total ${rs(total)}`, 'err'); return; }
    setBusy(true);
    try {
      const key = `sale-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      let paid = total, breakdown: any[] = [];
      if (method === 'CASH') { paid = received ? Number(received) : total; breakdown = [{ method: 'CASH', amount: paid }]; }
      else if (method === 'DUE') { paid = 0; breakdown = [{ method: 'DUE', amount: total }]; }
      else if (method === 'MIXED') { paid = mixSum; breakdown = (['CASH', 'UPI', 'BANK'] as const).filter((k) => Number(mix[k]) > 0).map((k) => ({ method: k, amount: Number(mix[k]) })); }
      else { breakdown = [{ method: upiMethod, amount: total }]; }
      const { data } = await api.post('/api/sales', {
        items: cart.map((l) => ({ productId: l.productId, qty: l.qty })),
        discount, paymentMethod: method === 'UPI' ? upiMethod : method,
        paymentBreakdown: breakdown, paid,
        customerId: customer?._id, customerName: customer?.name || newCust.trim() || undefined,
        idempotencyKey: key,
      });
      setDone(data); setCart([]); localStorage.removeItem('cart');
      setReceived(''); setMix({ CASH: '', UPI: '', BANK: '' }); setDisc(''); setDiscPct('');
      setCustomer(null); setNewCust(''); setShowPay(false);
      toast(`Sale completed ✓ ${data.receiptNumber}`, 'ok');
      if (method === 'UPI') fetchQr(data.total);
    } catch (e: any) { toast(errMsg(e), 'err'); } finally { setBusy(false); }
  };

  return (
    <div className="page">
      <PageHead title={t('sell')} emoji="🛒">
        <Scanner onResult={(txt) => setQ(txt)} />
        <VoiceSale onParsed={(found) => {
          const matched = (found || []).filter((f: any) => f.matchedProductId);
          if (!matched.length) { toast('No products matched. Review voice result.', 'err'); return; }
          matched.forEach((m: any) => add({ _id: m.matchedProductId, name: m.matchedName, sellingPrice: m.price, stock: m.stock ?? 99, unit: '' }, m.qty));
          toast('Voice items added — review, then pay', 'ok');
        }} />
      </PageHead>
      {!navigator.onLine && <div className="offline">Offline — sales need internet confirmation.</div>}
      <div className="toolbar">
        <input placeholder={t('search')} value={q} onChange={(e) => setQ(e.target.value)} />
        {held && <button className="btn sm gold" onClick={resumeHeld}>▶ Resume held ({held.length})</button>}
      </div>
      <div className="chips">
        <button className={`chip${!cat ? ' on' : ''}`} onClick={() => setCat('')}>All</button>
        {cats.map((c) => <button key={c._id} className={`chip${cat === c.name ? ' on' : ''}`} onClick={() => setCat(cat === c.name ? '' : c.name)}>{c.icon || '🏷️'} {c.name}</button>)}
      </div>
      {loading ? <Skel n={4} /> : items.length === 0 ? <Empty emoji="🔍" title="No products found" sub="Try another name, SKU or barcode." /> : (
        <div className="grid-products">
          {items.map((p) => {
            const margin = p.purchasePrice > 0 ? Math.round(((p.sellingPrice - p.purchasePrice) / p.purchasePrice) * 100) : 0;
            return (
              <div className="prod" key={p._id}>
                <Img src={p.imageUrl} alt={p.name} />
                <div className="p">
                  <span className="nm">{p.name}</span>
                  <span className="pr"><b>{rs(p.sellingPrice)}</b><span>stk {p.stock}</span></span>
                  <span style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                    {p.stock <= 0 ? <span className="badge-out">OUT</span> : p.stock <= (p.minStock ?? 5) ? <span className="badge-low">LOW</span> : null}
                    {margin > 0 && <span className="margin-tag">+{margin}%</span>}
                  </span>
                  <button className="add" onClick={() => add(p)}>+ Add</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {cart.length > 0 && (
        <div className="cart">
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 4 }}>
            <b style={{ flex: 1 }}>🧺 Cart ({cart.reduce((s, l) => s + l.qty, 0)} items)</b>
            <button className="btn sm ghost" onClick={holdCart}>⏸ Hold</button>
            <button className="btn sm ghost" onClick={() => setCart([])}>Clear</button>
          </div>
          {cart.map((l) => (
            <div key={l.productId} className="cartline">
              <div className="nm"><b>{l.name}</b><small>{rs(l.rate)} × {l.qty} = {rs(l.qty * l.rate)}</small></div>
              <QtyStepper qty={l.qty} onChange={(qq) => setQty(l.productId, qq)} />
            </div>
          ))}
          <div className="row2" style={{ marginTop: 8 }}>
            <input placeholder="Discount ₹" value={disc} onChange={(e) => setDisc(e.target.value)} inputMode="decimal" />
            <input placeholder="Discount %" value={discPct} onChange={(e) => setDiscPct(e.target.value)} inputMode="decimal" />
          </div>
          <div className="totals" style={{ marginTop: 6 }}>
            <div className="tr"><span>Subtotal</span><span>{rs(subtotal)}</span></div>
            {discount > 0 && <div className="tr"><span>Discount</span><span>− {rs(discount)}</span></div>}
            <div className="tr grand"><span>Total</span><span>{rs(total)}</span></div>
          </div>
          <button className="btn primary block" style={{ marginTop: 10 }} onClick={() => setShowPay(true)}>Collect {rs(total)} →</button>
        </div>
      )}

      {showPay && (
        <Sheet title={`Payment • ${rs(total)}`} onClose={() => setShowPay(false)}>
          <div className="paytabs">
            {METHODS.map((m) => <button key={m.v} className={`btn${method === m.v ? ' on' : ''}`} onClick={() => setMethod(m.v)}>{m.label}</button>)}
          </div>
          {method === 'UPI' && (
            <div>
              <div className="chips">{ALL_METHODS.filter((m) => m !== 'CASH' && m !== 'DUE').map((m) => <button key={m} className={`chip${upiMethod === m ? ' on' : ''}`} onClick={() => setUpiMethod(m)}>{m}</button>)}</div>
              <button className="btn gold block" onClick={() => fetchQr(total)}>🔳 Show customer QR for {rs(total)}</button>
            </div>
          )}
          {method === 'CASH' && (
            <div>
              <label>Cash received</label>
              <input placeholder={`Total ${rs(total)}`} value={received} onChange={(e) => setReceived(e.target.value)} inputMode="decimal" />
              {received && <div className="change-box">Return change: {rs(change)}</div>}
            </div>
          )}
          {method === 'MIXED' && (
            <div>
              <label>Split (must total {rs(total)})</label>
              <div className="row2">
                <input placeholder="Cash ₹" value={mix.CASH} onChange={(e) => setMix({ ...mix, CASH: e.target.value })} inputMode="decimal" />
                <input placeholder="UPI ₹" value={mix.UPI} onChange={(e) => setMix({ ...mix, UPI: e.target.value })} inputMode="decimal" />
              </div>
              <input placeholder="Bank ₹" value={mix.BANK} onChange={(e) => setMix({ ...mix, BANK: e.target.value })} inputMode="decimal" style={{ marginTop: 8 }} />
              <div className="kv"><span>Split total</span><b>{rs(mixSum)}</b></div>
              {Math.abs(mixSum - total) < 0.01 && total > 0 && <span className="badge-ok">✓ Balanced</span>}
            </div>
          )}
          {(method === 'DUE' || customer) && (
            <div>
              <label>Customer {method === 'DUE' ? '(required)' : '(optional)'}</label>
              {customer ? (
                <div className="lrow"><Avatar name={customer.name} /><div className="grow"><b className="t">{customer.name}</b><small>Due {rs(customer.totalDue)}</small></div><button className="btn sm ghost" onClick={() => setCustomer(null)}>✕</button></div>
              ) : (
                <>
                  <input placeholder="Search customer…" value={custQ} onChange={(e) => findCustomers(e.target.value)} />
                  {custList.map((c) => (
                    <div key={c._id} className="lrow" style={{ cursor: 'pointer' }} onClick={() => { setCustomer(c); setCustList([]); setCustQ(''); }}>
                      <Avatar name={c.name} /><div className="grow"><b className="t">{c.name}</b><small>{c.phone || ''} • Due {rs(c.totalDue)}</small></div>
                    </div>
                  ))}
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <input placeholder="Or new customer name" value={newCust} onChange={(e) => setNewCust(e.target.value)} />
                  </div>
                </>
              )}
            </div>
          )}
          {method !== 'DUE' && !customer && (
            <button className="btn sm ghost" style={{ marginTop: 8 }} onClick={() => (document.querySelector<HTMLInputElement>('input[placeholder="Search customer…"]') as any)?.focus()}>+ Attach customer (optional)</button>
          )}
          <button className="btn primary block" style={{ marginTop: 12 }} onClick={checkout} disabled={busy}>{busy ? 'Saving…' : `✓ Complete • ${rs(total)}`}</button>
        </Sheet>
      )}

      {qr && !qr.error && qr.qr && (
        <Sheet title={`Scan to pay ${rs(qr.amount)}`} onClose={() => setQr(null)}>
          <div style={{ textAlign: 'center' }}><img src={qr.qr} alt="UPI QR" style={{ width: 220, borderRadius: 12, border: '1px solid var(--line)' }} />
            <p><b>{qr.upiId}</b></p>
            <p><small>Customer scans & pays → you confirm money received, then Complete.</small></p></div>
        </Sheet>
      )}
      {qr?.error && <Sheet title="QR unavailable" onClose={() => setQr(null)}><p>{qr.error}</p></Sheet>}

      {done && <ReceiptSheet sale={done} onClose={() => { setDone(null); setQr(null); }} />}
    </div>
  );
}

export function ReceiptSheet({ sale, onClose }: { sale: any; onClose: () => void }) {
  const toast = useToast();
  const waText = `🧾 *Swarup Stationery Store*\nReceipt: ${sale.receiptNumber}\n${sale.items.map((i: any) => `• ${i.name} x${i.qty} = ₹${i.lineTotal}`).join('\n')}\nTotal: ₹${sale.total} | Paid: ₹${sale.paid}${sale.due ? ` | Due: ₹${sale.due}` : ''}\nThank you! Visit again 🙏 ধন্যবাদ!`;
  const print = () => {
    const w = window.open('', '_blank', 'width=420');
    if (!w) { toast('Popup blocked — allow popups to print', 'err'); return; }
    w.document.write(`<html><head><title>${sale.receiptNumber}</title><style>body{font-family:monospace;padding:16px}h3{text-align:center}.r{display:flex;justify-content:space-between}hr{border-top:2px dashed #999}</style></head><body><h3>🪔 Swarup Stationery Store</h3><p style="text-align:center">${sale.receiptNumber}<br>${sale.transactionDate} ${sale.transactionTime} IST<br>Customer: ${sale.customerName}</p><hr>${sale.items.map((i: any) => `<div class="r"><span>${i.name} x${i.qty}</span><span>₹${i.lineTotal}</span></div>`).join('')}<hr><div class="r"><b>Total</b><b>₹${sale.total}</b></div><div class="r"><span>Paid (${sale.paymentMethod})</span><span>₹${sale.paid}</span></div>${sale.due ? `<div class="r"><span>Due</span><span>₹${sale.due}</span></div>` : ''}${sale.change ? `<div class="r"><span>Change</span><span>₹${sale.change}</span></div>` : ''}<p style="text-align:center">Thank you! Visit again 🙏</p><script>onload=()=>{print();}</script></body></html>`);
    w.document.close();
  };
  return (
    <Sheet title="Sale completed ✓" onClose={onClose}>
      <div className="receipt">
        <div className="rh"><div style={{ fontSize: 26 }}>🪔</div><h3>Swarup Stationery Store</h3><div>{sale.receiptNumber}</div><small>{sale.transactionDate} {sale.transactionTime} IST • {sale.cashier}</small></div>
        {sale.items.map((i: any, idx: number) => <div key={idx} className="rl"><span>{i.name} × {i.qty}</span><span>₹{i.lineTotal}</span></div>)}
        <div className="rl"><span>Subtotal</span><span>₹{sale.subtotal}</span></div>
        {!!sale.discount && <div className="rl"><span>Discount</span><span>− ₹{sale.discount}</span></div>}
        <div className="rl rt"><span>Total</span><span>₹{sale.total}</span></div>
        <div className="rl"><span>Paid ({sale.paymentMethod})</span><span>₹{sale.paid}</span></div>
        {!!sale.due && <div className="rl"><span>Due ({sale.customerName})</span><span>₹{sale.due}</span></div>}
        {!!sale.change && <div className="rl"><span>Change</span><span>₹{sale.change}</span></div>}
        <div className="rf">Thank you! Visit again 🙏 ধন্যবাদ!</div>
      </div>
      <div className="btnrow no-print" style={{ marginTop: 12 }}>
        <button className="btn" onClick={print}>🖨 Print</button>
        <a className="btn" href={`/api/sales/${sale._id}/receipt.pdf`} target="_blank" rel="noreferrer">📄 PDF</a>
        <a className="btn green" href={waLink('', waText)} target="_blank" rel="noreferrer">💬 WhatsApp</a>
        <button className="btn primary" onClick={onClose}>🧾 New sale</button>
      </div>
    </Sheet>
  );
}
