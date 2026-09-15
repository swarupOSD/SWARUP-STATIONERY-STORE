import { useEffect, useMemo, useState } from 'react';
import api, { errMsg } from '../api/client';
import { Img } from '../components/ui';
import { Scanner, VoiceSale } from '../components/scan';
import { useLang } from '../i18n/lang';

type CartLine = { productId: string; name: string; qty: number; rate: number; stock: number };

export function Sell() {
  const { t } = useLang();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [cats, setCats] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [method, setMethod] = useState('CASH');
  const [customerName, setCustomerName] = useState('');
  const [received, setReceived] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [qr, setQr] = useState<any>(null);
  const [done, setDone] = useState<any>(null);

  useEffect(() => { api.get('/api/categories').then((r) => setCats(r.data)).catch(() => {}); }, []);
  const search = async (term: string) => {
    setQ(term);
    try {
      const { data } = await api.get('/api/products', { params: { q: term, category: cat, limit: 60 } });
      setItems(data.items);
    } catch (e: any) { setErr(errMsg(e)); }
  };
  useEffect(() => { search(''); }, [cat]);

  const add = (p: any) => {
    setCart((c) => {
      const f = c.find((l) => l.productId === p._id);
      if (f) return c.map((l) => (l.productId === p._id ? { ...l, qty: l.qty + 1 } : l));
      return [...c, { productId: p._id, name: p.name, qty: 1, rate: p.sellingPrice, stock: p.stock }];
    });
  };
  const subtotal = useMemo(() => cart.reduce((s, l) => s + l.qty * l.rate, 0), [cart]);
  const change = received ? Math.max(0, Number(received) - subtotal) : 0;

  const checkout = async () => {
    setErr(''); setMsg('');
    try {
      const key = `sale-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const paid = method === 'CASH' ? (received ? Number(received) : subtotal) : method === 'DUE' ? 0 : subtotal;
      const { data } = await api.post('/api/sales', {
        items: cart.map((l) => ({ productId: l.productId, qty: l.qty })),
        paymentMethod: method,
        paymentBreakdown: method === 'MIXED' ? [{ method: 'CASH', amount: subtotal }] : [],
        paid, customerName: method === 'DUE' ? customerName : undefined,
        idempotencyKey: key,
      });
      setDone(data); setCart([]); setReceived(''); setMsg(`Sale completed ✓ ${data.receiptNumber}`);
      if (method === 'UPI') {
        api.get('/api/upi-qr', { params: { amount: data.total } }).then((r) => setQr(r.data)).catch(() => {});
      }
    } catch (e: any) { setErr(errMsg(e)); }
  };

  return (
    <div>
      <h2>🛒 {t('sell')}</h2>
      {!navigator.onLine && <div className="offline">Offline — sales need internet confirmation.</div>}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input style={{ flex: 2, minWidth: 160 }} placeholder={t('search')} value={q} onChange={(e) => search(e.target.value)} />
        <Scanner onResult={(txt) => search(txt)} />
        <VoiceSale onParsed={(found) => {
          const matched = (found || []).filter((f: any) => f.matchedProductId);
          if (!matched.length) { setErr('No products matched. Review voice result.'); return; }
          setCart(matched.map((m: any) => ({ productId: m.matchedProductId, name: m.matchedName, qty: m.qty, rate: m.price, stock: m.stock })));
          setMsg('Voice items added to cart — review, then pay.');
        }} />
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <select value={cat} onChange={(e) => setCat(e.target.value)}><option value="">All categories</option>{cats.map((c) => <option key={c._id} value={c.name}>{c.name}</option>)}</select>
      </div>
      <div className="grid-products" style={{ marginTop: 10 }}>
        {items.map((p) => (
          <div className="prod" key={p._id}>
            <Img src={p.imageUrl} alt={p.name} />
            <div className="p">
              <b>{p.name}</b><small>₹{p.sellingPrice} • Stock {p.stock} {p.unit}</small>
              {p.stock <= 0 ? <span className="badge-out">OUT OF STOCK</span> : p.stock <= (p.minStock ?? 5) ? <span className="badge-low">LOW STOCK</span> : null}
              <button className="add" onClick={() => add(p)}>+</button>
            </div>
          </div>
        ))}
      </div>
      {cart.length > 0 && (
        <div className="cart">
          {cart.map((l) => (
            <div key={l.productId} style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>{l.name} × {l.qty}</span><span>₹{l.qty * l.rate}</span>
            </div>
          ))}
          <b>Subtotal ₹{subtotal}</b>
          <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
            {['CASH', 'UPI', 'DUE', 'MIXED'].map((m) => <button key={m} className={method === m ? 'btn primary' : 'btn'} onClick={() => setMethod(m)}>{m}</button>)}
          </div>
          {method === 'DUE' && <input placeholder="Customer name (required)" value={customerName} onChange={(e) => setCustomerName(e.target.value)} style={{ marginTop: 8 }} />}
          {method === 'CASH' && <input placeholder={`Received (total ₹${subtotal})`} value={received} onChange={(e) => setReceived(e.target.value)} inputMode="numeric" style={{ marginTop: 8 }} />}
          {method === 'CASH' && received && <div>Change ₹{change}</div>}
          <button className="btn primary" style={{ width: '100%', marginTop: 8 }} onClick={checkout}>Complete sale ₹{subtotal}</button>
          {err && <p style={{ color: '#a00' }}>{err}</p>}
          {msg && <p style={{ color: '#1e7e34' }}>{msg}</p>}
          {qr?.qr && <div><p>Scan to Pay ₹{qr.amount} — {qr.upiId}</p><img src={qr.qr} alt="UPI QR" style={{ width: 200 }} /><p><small>Awaiting confirmation — admin confirms manually.</small></p></div>}
          {done && <a className="btn" href={`/api/sales/${done._id}/receipt.pdf`} target="_blank" rel="noreferrer">🧾 Receipt PDF</a>}
        </div>
      )}
      {done && !cart.length && <p style={{ color: '#1e7e34' }}>{msg}</p>}
      {err && !cart.length && <p style={{ color: '#a00' }}>{err}</p>}
    </div>
  );
}
