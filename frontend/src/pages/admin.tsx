import { useEffect, useState } from 'react';
import api, { errMsg } from '../api/client';

export function SettingsPage() {
  const [s, setS] = useState<any>({});
  const [msg, setMsg] = useState(''); const [err, setErr] = useState('');
  const [health, setHealth] = useState<any>(null);
  useEffect(() => {
    api.get('/api/settings').then((r) => setS(r.data)).catch(() => {});
    api.get('/api/system').then((r) => setHealth(r.data)).catch(() => {});
  }, []);
  const save = async () => {
    setErr(''); setMsg('');
    try { await api.patch('/api/settings', s); setMsg('Saved ✓'); } catch (e: any) { setErr(errMsg(e)); }
  };
  const upload = async (file: File, field: 'qrImageUrl' | 'logoUrl') => {
    const fd = new FormData(); fd.append('file', file); fd.append('folder', field === 'qrImageUrl' ? 'qr' : 'logo');
    const { data } = await api.post('/api/uploads', fd);
    setS({ ...s, [field]: data.url, [field === 'qrImageUrl' ? 'qrPublicId' : 'logoPublicId']: data.publicId });
  };
  const set = (k: string, v: any) => setS((p: any) => ({ ...p, [k]: v }));
  return (
    <div style={{ maxWidth: 560 }}>
      <h2>⚙️ Settings</h2>
      <label>Shop name</label><input value={s.shopName || ''} onChange={(e) => set('shopName', e.target.value)} />
      <label>Address</label><input value={s.address || ''} onChange={(e) => set('address', e.target.value)} />
      <label>Phone</label><input value={s.phone || ''} onChange={(e) => set('phone', e.target.value)} />
      <label>UPI ID</label><input value={s.upiId || ''} onChange={(e) => set('upiId', e.target.value)} placeholder="shop@upi" />
      <label>UPI name</label><input value={s.upiName || ''} onChange={(e) => set('upiName', e.target.value)} />
      <label>Shop QR image (static fallback)</label>
      {s.qrImageUrl && <img src={s.qrImageUrl} alt="shop qr" style={{ width: 160 }} />}
      <input type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0], 'qrImageUrl')} />
      <label>Receipt footer</label><input value={s.receiptFooter || ''} onChange={(e) => set('receiptFooter', e.target.value)} />
      <label><input type="checkbox" checked={!!s.taxEnabled} onChange={(e) => set('taxEnabled', e.target.checked)} style={{ width: 24 }} /> Tax enabled</label>
      <label><input type="checkbox" checked={!!s.negativeStockAllowed} onChange={(e) => set('negativeStockAllowed', e.target.checked)} style={{ width: 24 }} /> Allow negative stock</label>
      <label><input type="checkbox" checked={!!s.pujaMode} onChange={(e) => set('pujaMode', e.target.checked)} style={{ width: 24 }} /> 🪔 Puja Mode</label>
      <button className="btn primary" style={{ width: '100%', marginTop: 10 }} onClick={save}>Save Settings</button>
      {msg && <p style={{ color: 'green' }}>{msg}</p>}{err && <p style={{ color: '#a00' }}>{err}</p>}
      {health && <div className="card" style={{ marginTop: 10 }}><h3>System Health</h3><pre style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>{JSON.stringify(health, null, 2)}</pre></div>}
    </div>
  );
}

export function Admin() {
  const [d, setD] = useState<any>(null);
  const [audit, setAudit] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [uname, setUname] = useState(''); const [upass, setUpass] = useState('');
  useEffect(() => {
    api.get('/api/dashboard').then((r) => setD(r.data)).catch(() => {});
    api.get('/api/audit').then((r) => setAudit(r.data.items)).catch(() => {});
    api.get('/api/users').then((r) => setUsers(r.data)).catch(() => {});
  }, []);
  const addUser = async () => {
    await api.post('/api/users', { username: uname, password: upass, role: 'STAFF' });
    setUname(''); setUpass(''); location.reload();
  };
  return (
    <div>
      <h2>🛠 Admin Panel</h2>
      <div className="btnrow">
        <a className="btn" href="/products">Products</a><a className="btn" href="/sales">Sales</a>
        <a className="btn" href="/purchase">Purchases</a><a className="btn" href="/khata">Khata</a>
        <a className="btn" href="/reports">Reports</a><a className="btn" href="/invoices">Invoice Import</a>
        <a className="btn" href="/settings">Settings</a>
        <a className="btn" href="/api/reports/export/sales?format=csv">Export Sales CSV</a>
        <a className="btn" href="/api/reports/export/products?format=csv">Export Products CSV</a>
      </div>
      {d && <div className="cards"><div className="card"><small>Sales today</small><br /><b>₹{d.today?.totalSales}</b></div><div className="card"><small>Profit</small><br /><b>₹{d.today?.grossProfit}</b></div><div className="card"><small>Low stock lines</small><br /><b>{d.lowItems?.length}</b></div></div>}
      <h3>Low stock</h3>{d?.lowItems?.map((p: any) => <div key={p._id}>{p.name} — {p.stock}</div>)}
      <h3>Users</h3>
      {users.map((u: any) => <div key={u._id}>{u.username} • {u.role} • {u.active ? 'active' : 'disabled'}</div>)}
      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}><input placeholder="new staff username" value={uname} onChange={(e) => setUname(e.target.value)} /><input placeholder="password" type="password" value={upass} onChange={(e) => setUpass(e.target.value)} /><button className="btn primary" onClick={addUser}>Add</button></div>
      <h3>Audit log</h3>
      {audit.slice(0, 30).map((a: any) => <div key={a._id}><small>{new Date(a.timestamp).toLocaleString('en-IN')} • {a.user} • {a.action} • {a.entity}</small></div>)}
    </div>
  );
}
