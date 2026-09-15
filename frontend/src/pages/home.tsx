import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api, { errMsg } from '../api/client';
import { useLang } from '../i18n/lang';
import { Avatar, Clock, Empty, PageHead, Skel, Stat, getJSON, greeting, rs } from '../components/ui';

export function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();
  const submit = async (e: any) => {
    e.preventDefault(); setErr(''); setBusy(true);
    try {
      const { data } = await api.post('/api/auth/login', { username: username.trim(), password: password.trim() });
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      nav('/');
    } catch (e2: any) { setErr(errMsg(e2)); } finally { setBusy(false); }
  };
  return (
    <div style={{ maxWidth: 420, margin: '36px auto' }}>
      <div className="brand"><span style={{ fontSize: 32 }}>🪔</span><div><h1>Swarup Stationery Store</h1><small>স্বরূপ স্টেশনারি স্টোর • Daily shop notebook</small></div></div>
      <div className="puja-banner">✦ শুভ শারদীয়া ✦</div>
      <form onSubmit={submit} className="card" style={{ marginTop: 10, padding: 18 }}>
        <h3 style={{ margin: '0 0 4px' }}>Welcome back 🙏</h3>
        <p style={{ color: 'var(--muted)', fontSize: 13.5, margin: '0 0 6px' }}>Login to open your shop for today.</p>
        {import.meta.env.PROD && !import.meta.env.VITE_API_BASE_URL && (
          <p className="card" style={{ color: '#856404', background: '#fff3cd' }}>Shop server is not connected yet. The owner needs to set the backend URL and redeploy.</p>
        )}
        <label>Username</label><input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" placeholder="e.g. admin" />
        <label>Password</label><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" placeholder="••••••••" />
        {err && <p style={{ color: 'var(--rose-tx)' }}>{err}</p>}
        <button className="btn primary block" style={{ marginTop: 14 }} disabled={busy}>{busy ? 'Opening…' : 'Open Shop →'}</button>
      </form>
    </div>
  );
}

export function Home() {
  const { t, lang, setLang } = useLang();
  const [data, setData] = useState<any>(null);
  const [dash, setDash] = useState<any>(null);
  const [pricingCt, setPricingCt] = useState(0);
  const [err, setErr] = useState('');
  const nav = useNavigate();
  const user = getJSON('user', {} as any);
  useEffect(() => {
    api.get('/api/reports/today').then((r) => setData(r.data)).catch((e) => setErr(errMsg(e)));
    api.get('/api/dashboard').then((r) => setDash(r.data)).catch(() => {});
    api.get('/api/products', { params: { needsPricing: '1', limit: 1 } }).then((r) => setPricingCt(r.data.total)).catch(() => {});
  }, []);
  const hour = new Date().toLocaleTimeString('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit' });
  return (
    <div className="page">
      <div className="brand">
        <span style={{ fontSize: 30 }}>🪔</span>
        <div style={{ flex: 1 }}><h1>Swarup Stationery Store</h1><small>{user?.name || user?.username} • {user?.role}</small></div>
        <button className="btn sm" onClick={() => setLang(lang === 'en' ? 'bn' : 'en')}>{lang === 'en' ? 'বাংলা' : 'English'}</button>
      </div>
      <div className="puja-banner">✦ শুভ শারদীয়া ✦</div>
      <p className="greet">{greeting()}, <b>{user?.name || 'Shopkeeper'}</b> 🙏</p>
      <Clock />
      {err && <p style={{ color: 'var(--rose-tx)' }}>{err}</p>}
      {!data ? <Skel n={2} /> : (
        <>
          <div className="cards quad">
            <Stat icon="💰" label={t('todaysSales')} value={rs(data.totalSales)} sub={`${data.numSales || 0} bills • ${data.itemsSold || 0} items`} tone="accent" />
            <Stat icon="📈" label={t('todaysProfit')} value={rs(data.grossProfit)} sub={`Cost ${rs(data.totalCost)}`} tone="green" />
            <Stat icon="📒" label={t('todaysDue')} value={rs(data.dueGiven)} sub={`Collected ${rs(data.dueCollected)}`} tone="red" />
            <Stat icon="⚠️" label={t('lowStock')} value={String(data.lowStock ?? '—')} sub={`Outstanding ${rs(data.outstandingDue)}`} />
          </div>
          <div className="card">
            <b style={{ fontSize: 14 }}>💳 Today's collection</b>
            <div style={{ display: 'flex', gap: 12, marginTop: 8, flexWrap: 'wrap', fontSize: 14 }}>
              <span>💵 Cash <b>{rs(data.cash)}</b></span>
              <span>📱 UPI <b>{rs(data.upi)}</b></span>
              <span>🏦 Bank <b>{rs(data.bank)}</b></span>
            </div>
          </div>
        </>
      )}
      <div className="action-grid">
        <button className="btn primary" onClick={() => nav('/sell')}><span className="e">🛒</span>{t('sell')}</button>
        <button className="btn" onClick={() => nav('/purchase')}><span className="e">📦</span>{t('purchase')}</button>
        <button className="btn" onClick={() => nav('/khata')}><span className="e">📒</span>{t('khata')}</button>
        <button className="btn gold" onClick={() => nav('/reports')}><span className="e">📊</span>{t('todaysReport')}</button>
        <button className="btn" onClick={() => nav('/products/new')}><span className="e">➕</span>{t('addProduct')}</button>
        <button className="btn" onClick={() => nav('/khata')}><span className="e">💰</span>{t('receivePayment')}</button>
        <button className="btn" onClick={() => nav('/personal')}><span className="e">🧾</span>{t('personalPurchase')}</button>
        <button className="btn" onClick={() => nav('/invoices')}><span className="e">📸</span>{t('uploadBill')}</button>
      </div>

      <div className="section-t">⚠️ Needs attention</div>
      {!dash ? <Skel n={2} /> : (
        <>
          {(dash.lowItems || []).length === 0 && (dash.topDue || []).length === 0 && pricingCt === 0 && (
            <div className="card" style={{ borderLeft: '4px solid var(--green)' }}>✅ All good — no low stock, no pending dues.</div>
          )}
          {pricingCt > 0 && (
            <div className="alert-row" style={{ borderLeftColor: 'var(--blue)', cursor: 'pointer' }} onClick={() => nav('/products?needsPricing=1')}>
              <span style={{ fontSize: 22 }}>🏷️</span>
              <div className="grow"><b>{pricingCt} new products need sell prices</b><br /><small>Added from bills — set prices to sell at profit</small></div>
              <button className="btn sm gold">Set</button>
            </div>
          )}
          {(dash.lowItems || []).slice(0, 5).map((p: any) => (
            <div key={p._id} className="alert-row red">
              <span style={{ fontSize: 22 }}>📦</span>
              <div className="grow"><b>{p.name}</b><br /><small>Only {p.stock} {p.unit} left</small></div>
              <button className="btn sm gold" onClick={() => nav('/purchase')}>Restock</button>
            </div>
          ))}
          {(dash.topDue || []).slice(0, 5).map((c: any) => (
            <div key={c._id} className="alert-row" onClick={() => nav(`/khata/${c._id}`)} style={{ cursor: 'pointer' }}>
              <Avatar name={c.name} />
              <div className="grow"><b>{c.name}</b><br /><small>Due since earlier</small></div>
              <b className="due-amt neg">{rs(c.totalDue)}</b>
            </div>
          ))}
        </>
      )}

      <div className="section-t">🧾 Recent sales</div>
      <RecentSales />
    </div>
  );
}

function RecentSales() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const nav = useNavigate();
  useEffect(() => {
    api.get('/api/sales', { params: { limit: 6 } }).then((r) => setItems(r.data.items)).catch(() => {}).finally(() => setLoading(false));
  }, []);
  if (loading) return <Skel n={3} />;
  if (!items.length) return <Empty emoji="🧾" title="No sales yet today" sub="Tap SELL to make your first bill." action={<button className="btn primary" onClick={() => nav('/sell')}>🛒 Sell now</button>} />;
  return (
    <div>
      {items.map((s: any) => (
        <div key={s._id} className="lrow">
          <Avatar name={s.customerName || 'W'} gold={s.paymentMethod === 'DUE'} />
          <div className="grow"><b className="t">{s.receiptNumber} • {s.customerName}</b><small>{s.transactionTime} • {(s.items || []).length} items • {s.paymentMethod}{s.status === 'VOIDED' ? ' • VOIDED' : ''}</small></div>
          <div style={{ textAlign: 'right' }}><b>{rs(s.total)}</b>{s.due > 0 && <div><span className="badge-out">due {rs(s.due)}</span></div>}</div>
        </div>
      ))}
    </div>
  );
}

export function More() {
  const user = getJSON('user', {} as any);
  const nav = useNavigate();
  const go = (p: string) => nav(p);
  const item = (e: string, label: string, sub: string, path: string) => (
    <div className="lrow" style={{ cursor: 'pointer' }} onClick={() => go(path)}>
      <span style={{ fontSize: 24 }}>{e}</span>
      <div className="grow"><b className="t">{label}</b><small>{sub}</small></div>
      <span style={{ color: 'var(--muted)' }}>›</span>
    </div>
  );
  return (
    <div className="page">
      <PageHead title="More" emoji="⋯" />
      {item('📦', 'Products', 'Catalog, prices, stock, labels', '/products')}
      {item('🏭', 'Supplier dues', 'Credit bills, pay suppliers', '/suppliers')}
      {item('🧮', 'Sales history', 'Bills, returns, voids, receipts', '/sales')}
      {item('🧾', 'Upload bill', 'Invoice scan & import', '/invoices')}
      {item('👛', 'Personal purchases', 'Mine • Father • Mother', '/personal')}
      {item('📊', 'Reports', 'Daily, product, payment analytics', '/reports')}
      {item('⚙️', 'Settings', 'Shop, UPI QR, language, theme', '/settings')}
      {user?.role === 'ADMIN' && item('🛠', 'Admin panel', 'Users, audit, day close, health', '/admin')}
      <div className="lrow" style={{ cursor: 'pointer' }} onClick={() => { localStorage.clear(); location.href = '/login'; }}>
        <span style={{ fontSize: 24 }}>🚪</span>
        <div className="grow"><b className="t">Logout</b><small>{user?.username}</small></div>
      </div>
    </div>
  );
}
