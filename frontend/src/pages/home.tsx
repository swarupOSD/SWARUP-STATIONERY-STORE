import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api, { errMsg } from '../api/client';
import { useLang } from '../i18n/lang';
import { Clock } from '../components/ui';

export function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const nav = useNavigate();
  const submit = async (e: any) => {
    e.preventDefault(); setErr('');
    try {
      const { data } = await api.post('/api/auth/login', { username, password });
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      nav('/');
    } catch (e2: any) { setErr(errMsg(e2)); }
  };
  return (
    <div style={{ maxWidth: 420, margin: '40px auto' }}>
      <div className="brand"><span style={{ fontSize: 30 }}>🪔</span><div><h1>Swarup Stationery Store</h1><small>স্বরূপ স্টেশনারি স্টোর</small></div></div>
      {import.meta.env.PROD && !import.meta.env.VITE_API_BASE_URL && (
        <p className="card" style={{ color: '#856404', background: '#fff3cd' }}>Shop server is not connected yet. The owner needs to set the backend URL and redeploy.</p>
      )}
      <form onSubmit={submit} className="card" style={{ marginTop: 12 }}>
        <label>Username</label><input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" />
        <label>Password</label><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        {err && <p style={{ color: '#a00' }}>{err}</p>}
        <button className="btn primary" style={{ width: '100%', marginTop: 12 }}>Login</button>
      </form>
    </div>
  );
}

export function Home() {
  const { t, lang, setLang } = useLang();
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState('');
  const nav = useNavigate();
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  useEffect(() => { api.get('/api/reports/today').then((r) => setData(r.data)).catch((e) => setErr(errMsg(e))); }, []);
  return (
    <div>
      <div className="brand">
        <span style={{ fontSize: 28 }}>🪔</span>
        <div style={{ flex: 1 }}><h1>Swarup Stationery Store</h1><small>{user?.name || user?.username} • {user?.role}</small></div>
        <button className="btn" onClick={() => setLang(lang === 'en' ? 'bn' : 'en')}>{lang === 'en' ? 'বাংলা' : 'English'}</button>
      </div>
      <div className="puja-banner">✦ শুভ শারদীয়া ✦ SUBTLE ALPANA ✦</div>
      <Clock />
      {err && <p style={{ color: '#a00' }}>{err}</p>}
      <div className="cards">
        <div className="card"><small>{t('todaysSales')}</small><br /><b>₹{data?.totalSales ?? '—'}</b></div>
        <div className="card"><small>{t('todaysProfit')}</small><br /><b>₹{data?.grossProfit ?? '—'}</b></div>
        <div className="card"><small>{t('todaysDue')}</small><br /><b>₹{data?.dueGiven ?? '—'}</b></div>
        <div className="card"><small>{t('lowStock')}</small><br /><b>{data?.lowStock ?? '—'}</b></div>
      </div>
      <div className="btnrow">
        <button className="btn primary big" onClick={() => nav('/sell')}>🛒 {t('sell')}</button>
        <button className="btn" onClick={() => nav('/purchase')}>📦 {t('purchase')}</button>
        <button className="btn" onClick={() => nav('/khata')}>📒 {t('khata')}</button>
        <button className="btn gold" onClick={() => nav('/reports')}>📊 {t('todaysReport')}</button>
        <button className="btn" onClick={() => nav('/products/new')}>+ {t('addProduct')}</button>
        <button className="btn" onClick={() => nav('/khata')}>💰 {t('receivePayment')}</button>
        <button className="btn" onClick={() => nav('/personal')}>🧾 {t('personalPurchase')}</button>
      </div>
    </div>
  );
}
