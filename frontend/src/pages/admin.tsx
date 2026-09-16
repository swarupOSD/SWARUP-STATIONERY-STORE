import { useEffect, useState } from 'react';
import api, { errMsg } from '../api/client';
import { Empty, PageHead, Sheet, Skel, rs, useConfirm, useToast } from '../components/ui';

import { fxPrefs } from '../fx';

function FxToggles() {
  const [, bump] = useState(0);
  const flip = (k: 'sound' | 'buzz') => { (fxPrefs as any)[k] = !(fxPrefs as any)[k]; bump((x) => x + 1); };
  return (
    <div>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" checked={fxPrefs.sound} onChange={() => flip('sound')} style={{ width: 22 }} /> 🔊 Ka-ching sound</label>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" checked={fxPrefs.buzz} onChange={() => flip('buzz')} style={{ width: 22 }} /> 📳 Vibration</label>
    </div>
  );
}

export function SettingsPage() {
  const toast = useToast();
  const [s, setS] = useState<any>({});
  const [qrAmt, setQrAmt] = useState('100');
  const [qr, setQr] = useState<any>(null);
  useEffect(() => { api.get('/api/settings').then((r) => setS(r.data)).catch((e) => toast(errMsg(e), 'err')); }, []);
  const save = async () => {
    try { await api.patch('/api/settings', s); toast('Settings saved ✓', 'ok'); } catch (e: any) { toast(errMsg(e), 'err'); }
  };
  const upload = async (file: File, field: 'qrImageUrl' | 'logoUrl') => {
    const fd = new FormData(); fd.append('file', file); fd.append('folder', field === 'qrImageUrl' ? 'qr' : 'logo');
    try {
      const { data } = await api.post('/api/uploads', fd);
      setS({ ...s, [field]: data.url, [field === 'qrImageUrl' ? 'qrPublicId' : 'logoPublicId']: data.publicId });
      toast('Image saved ✓', 'ok');
    } catch (e: any) { toast(errMsg(e), 'err'); }
  };
  const testQr = async () => {
    try { const { data } = await api.get('/api/upi-qr', { params: { amount: Number(qrAmt) || 0 } }); setQr(data); }
    catch (e: any) { toast(errMsg(e), 'err'); }
  };
  const set = (k: string, v: any) => setS((p: any) => ({ ...p, [k]: v }));
  return (
    <div className="page" style={{ maxWidth: 640 }}>
      <PageHead title="Settings" emoji="⚙️" />
      <div className="section-t">🏪 Shop profile</div>
      <div className="card">
        <div className="row2">
          <div><label>Shop name</label><input value={s.shopName || ''} onChange={(e) => set('shopName', e.target.value)} /></div>
          <div><label>Bengali name</label><input value={s.shopNameBn || ''} onChange={(e) => set('shopNameBn', e.target.value)} /></div>
        </div>
        <label>Address</label><input value={s.address || ''} onChange={(e) => set('address', e.target.value)} />
        <div className="row2">
          <div><label>Phone</label><input value={s.phone || ''} onChange={(e) => set('phone', e.target.value)} /></div>
          <div><label>GST (optional)</label><input value={s.gst || ''} onChange={(e) => set('gst', e.target.value)} /></div>
        </div>
        <label>Receipt thank-you line</label><input value={s.receiptFooter || ''} onChange={(e) => set('receiptFooter', e.target.value)} />
        <label>Shop logo</label>
        {s.logoUrl && <img src={s.logoUrl} alt="logo" style={{ width: 90, borderRadius: 12, border: '1px solid var(--line)' }} />}
        <input type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0], 'logoUrl')} />
      </div>
      <div className="section-t">📱 UPI & QR</div>
      <div className="card">
        <div className="row2">
          <div><label>UPI ID *</label><input value={s.upiId || ''} onChange={(e) => set('upiId', e.target.value)} placeholder="shop@upi" /></div>
          <div><label>Payee name</label><input value={s.upiName || ''} onChange={(e) => set('upiName', e.target.value)} /></div>
        </div>
        <label>Static QR (your own QR photo — fallback)</label>
        {s.qrImageUrl && <img src={s.qrImageUrl} alt="shop qr" style={{ width: 150, borderRadius: 12, border: '1px solid var(--line)' }} />}
        <input type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0], 'qrImageUrl')} />
        <label>Test exact-amount QR</label>
        <div style={{ display: 'flex', gap: 8 }}><input value={qrAmt} onChange={(e) => setQrAmt(e.target.value)} inputMode="decimal" /><button className="btn gold" onClick={testQr}>Generate</button></div>
        {qr?.qr && <div style={{ textAlign: 'center', marginTop: 8 }}><img src={qr.qr} alt="test qr" style={{ width: 180 }} /><p><small>{qr.intent}</small></p></div>}
      </div>
      <div className="section-t">📦 Inventory rules</div>
      <div className="card">
        <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" checked={!!s.taxEnabled} onChange={(e) => set('taxEnabled', e.target.checked)} style={{ width: 22 }} /> Enable tax field</label>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" checked={!!s.negativeStockAllowed} onChange={(e) => set('negativeStockAllowed', e.target.checked)} style={{ width: 22 }} /> Allow negative stock (else blocked)</label>
        <label>Low-stock alert level</label><input type="number" value={s.lowStockThreshold ?? 5} onChange={(e) => set('lowStockThreshold', Number(e.target.value))} />
        <label>Default margin % for bill-added products</label><input type="number" value={s.defaultMarginPct ?? 0} onChange={(e) => set('defaultMarginPct', Number(e.target.value))} />
        <small style={{ color: 'var(--muted)' }}>New products from Flipkart bills get sell price = buy × (1 + margin%). You still review each price after.</small>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" checked={!!s.pujaMode} onChange={(e) => set('pujaMode', e.target.checked)} style={{ width: 22 }} /> 🪔 Puja Mode festive theme</label>
        <button className="btn primary block" style={{ marginTop: 12 }} onClick={save}>✓ Save all settings</button>
      </div>
      <div className="section-t">🎉 Moja (sound & vibration)</div>
      <div className="card">
        <FxToggles />
        <small style={{ color: 'var(--muted)' }}>Sale hole confetti + ka-ching + vibration — dokane moja lagbe!</small>
      </div>
    </div>
  );
}

export function Admin() {
  const toast = useToast();
  const confirm = useConfirm();
  const [d, setD] = useState<any>(null);
  const [audit, setAudit] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [uname, setUname] = useState(''); const [upass, setUpass] = useState('');
  const [showUsers, setShowUsers] = useState(false);
  const [dayState, setDayState] = useState<any>(null);
  const [counted, setCounted] = useState('');
  const expectedCash = d?.today?.cash || 0;
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  useEffect(() => {
    api.get('/api/dashboard').then((r) => setD(r.data)).catch((e) => toast(errMsg(e), 'err'));
    api.get('/api/audit').then((r) => setAudit(r.data.items)).catch(() => {});
    api.get('/api/users').then((r) => setUsers(r.data)).catch(() => {});
    api.get(`/api/day/${today}`).then((r) => setDayState(r.data)).catch(() => {});
  }, []);
  const addUser = async () => {
    if (!uname.trim() || !upass) { toast('Enter username + password', 'err'); return; }
    try { await api.post('/api/users', { username: uname.trim(), password: upass, role: 'STAFF', permissions: ['sales.create', 'products.view', 'customers.create', 'payments.create', 'purchases.create'] }); toast('Staff added ✓', 'ok'); setUname(''); setUpass(''); api.get('/api/users').then((r) => setUsers(r.data)); }
    catch (e: any) { toast(errMsg(e), 'err'); }
  };
  const toggleUser = async (u: any) => {
    try { await api.patch(`/api/users/${u._id}`, { active: !u.active }); toast(u.active ? 'User disabled' : 'User enabled', 'ok'); api.get('/api/users').then((r) => setUsers(r.data)); }
    catch (e: any) { toast(errMsg(e), 'err'); }
  };
  const closeDay = async () => {
    if (!await confirm({ title: `Close business day ${today}?`, body: counted ? `Cash tally: expected ${rs(expectedCash)} vs counted ${rs(Number(counted))} (diff ${rs(Number(counted) - expectedCash)}).` : 'Backdated entries will be blocked until reopened.', okText: 'Close day' })) return;
    try {
      const body: any = {};
      if (counted !== '') { body.countedCash = Number(counted); body.expectedCash = expectedCash; }
      const { data } = await api.post(`/api/day/${today}/close`, body);
      setDayState(data); setCounted(''); toast('Day closed 🔒', 'ok');
    } catch (e: any) { toast(errMsg(e), 'err'); }
  };
  const reopenDay = async () => {
    const reason = prompt('Reopen reason (recorded in audit):');
    if (!reason) return;
    try { const { data } = await api.post(`/api/day/${today}/reopen`, { reason }); setDayState(data); toast('Day reopened', 'ok'); } catch (e: any) { toast(errMsg(e), 'err'); }
  };
  const printSlip = (day: any, t: any) => {
    const s = day?.summary || {};
    const w = window.open('', '_blank', 'width=420');
    if (!w) { toast('Popup blocked — allow popups to print', 'err'); return; }
    const r = (k: string, v: string) => `<div class="r"><span>${k}</span><span>${v}</span></div>`;
    w.document.write(`<html><head><title>Closing ${day?.date || today}</title><style>@page{size:80mm auto;margin:2mm}body{font-family:monospace;font-size:11px;width:72mm;margin:0;padding:2mm;color:#000}h3{text-align:center;font-size:13px;margin:2px 0}.c{text-align:center}.r{display:flex;justify-content:space-between}hr{border-top:1px dashed #000;margin:4px 0}</style></head><body><h3>Swarup Stationery Store</h3><p class="c">DAY CLOSE — ${day?.date || today}<br>closed by ${day?.closedBy || ''}</p><hr>${r('Sales', 'Rs.' + (t?.totalSales ?? 0))}${r('Profit', 'Rs.' + (t?.grossProfit ?? 0))}${r('Cash', 'Rs.' + (t?.cash ?? 0))}${r('UPI', 'Rs.' + (t?.upi ?? 0))}${r('Due given', 'Rs.' + (t?.dueGiven ?? 0))}${r('Collected', 'Rs.' + (t?.dueCollected ?? 0))}${r('Bills', String(t?.numSales ?? 0))}<hr>${r('Expected cash', 'Rs.' + (s.expectedCash ?? ''))}${r('Counted', 'Rs.' + (s.countedCash ?? ''))}${r('Diff', 'Rs.' + (s.diff ?? 0))}<p class="c">Subho Ratri! 🙏</p><script>onload=()=>{print();}</script></body></html>`);
    w.document.close();
  };
  const cards = [
    ['📦', 'Products', `${d?.lowItems?.length ?? '—'} low`, '/products'], ['🧮', 'Sales', `${d?.today?.numSales ?? '—'} bills today`, '/sales'],
    ['📒', 'Khata dues', rs(d?.today?.dueGiven ?? 0), '/khata'], ['🧾', 'Bills & import', 'scan invoices', '/invoices'],
    ['📊', 'Reports', rs(d?.today?.totalSales ?? 0), '/reports'], ['👥', 'Staff', `${users.length} users`, '#users'],
    ['🏭', 'Supplier dues', 'pay bills', '/suppliers'], ['⚙️', 'Settings', 'shop profile', '/settings'],
  ];
  return (
    <div className="page">
      <PageHead title="Admin panel" emoji="🛠">
        {dayState?.closed ? <span className="badge-out">🔒 Day closed</span> : <span className="badge-ok">🔓 Day open</span>}
      </PageHead>
      <p style={{ color: 'var(--muted)', fontSize: 13, margin: '0 0 4px 2px' }}>{new Date().toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} • full control, sabdhane chalao</p>
      {!d ? <Skel n={2} /> : (
        <div className="cards quad">
          <div className="card kpi accent"><small>💰 Today</small><br /><b>{rs(d.today?.totalSales)}</b></div>
          <div className="card kpi green"><small>📈 Profit</small><br /><b>{rs(d.today?.grossProfit)}</b></div>
          <div className="card kpi red"><small>📒 Due out</small><br /><b>{rs(d.today?.dueGiven)}</b></div>
          <div className="card kpi"><small>⚠️ Low stock</small><br /><b>{d.lowItems?.length ?? 0}</b></div>
        </div>
      )}
      <div className="action-grid">
        {cards.map(([e, l, s, p]) => <a key={l as string} className="btn" href={p as string} onClick={p === '#users' ? (ev) => { ev.preventDefault(); setShowUsers(true); } : undefined}><span className="e">{e}</span>{l}<small style={{ fontWeight: 400, fontSize: 11 }}>{s}</small></a>)}
      </div>
      <div className="section-t">🔒 Business day — {today}</div>
      <div className="card">
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <span style={{ fontSize: 26 }}>{dayState?.closed ? '🔒' : '🔓'}</span>
          <div style={{ flex: 1 }}><b>{dayState?.closed ? 'Closed' : 'Open'}</b><br /><small style={{ color: 'var(--muted)' }}>{dayState?.closed ? 'Backdated entries blocked' : 'Entries allowed'}</small></div>
          {dayState?.closed ? <button className="btn gold sm" onClick={reopenDay}>Reopen</button> : null}
        </div>
        {dayState?.closed ? (
          dayState?.summary?.countedCash !== undefined ? (
            <div style={{ marginTop: 8 }}>
              <div className="kv"><span>Expected cash</span><span>{rs(dayState.summary.expectedCash ?? expectedCash)}</span></div>
              <div className="kv"><span>Counted</span><span>{rs(dayState.summary.countedCash)}</span></div>
              <div className="kv"><span>Difference</span><b style={{ color: (dayState.summary.diff || 0) === 0 ? 'var(--green)' : 'var(--rose-tx)' }}>{rs(dayState.summary.diff || 0)}</b></div>
            </div>
          ) : <small style={{ color: 'var(--muted)' }}>Closed without cash tally.</small>
        ) : (
          <div style={{ marginTop: 8 }}>
            <div className="kv"><span>💵 Expected cash in drawer</span><b>{rs(expectedCash)}</b></div>
            <label>Counted cash ₹ (tally before closing)</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input value={counted} onChange={(e) => setCounted(e.target.value)} inputMode="decimal" placeholder="Count the drawer…" />
              <button className="btn primary" onClick={closeDay}>🔒 Close</button>
            </div>
            {counted !== '' && <div className={Number(counted) - expectedCash === 0 ? 'change-box' : ''} style={Number(counted) - expectedCash === 0 ? {} : { background: 'var(--amber-bg)', borderRadius: 12, padding: 10, textAlign: 'center', fontWeight: 800, marginTop: 8 }}>Difference: {rs(Number(counted || 0) - expectedCash)}</div>}
          </div>
        )}
        {dayState?.closed && <button className="btn gold block" style={{ marginTop: 10 }} onClick={() => printSlip(dayState, d?.today)}>🖨️ Print closing slip (80mm)</button>}
      </div>
      <AttendanceCard users={users} />
      <div className="section-t">📤 Data export & backup</div>      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {['sales', 'purchases', 'payments', 'products', 'customers'].map((t) => <a key={t} className="btn sm" href={`/api/reports/export/${t}?format=csv`} target="_blank" rel="noreferrer">⬇ {t}</a>)}
        <a className="btn sm gold" href="/api/reports/export/all" target="_blank" rel="noreferrer">💾 Full backup (JSON)</a>
      </div>
      <small style={{ color: 'var(--muted)' }}>Save the backup file monthly — products, sales, khata, everything.</small>
      <div className="section-t">🕵️ Audit log</div>
      {audit.length === 0 ? <Empty emoji="🕵️" title="No audit entries" /> :
        <div className="table-wrap"><table><thead><tr><th>When</th><th>Who</th><th>Action</th><th>Detail</th></tr></thead>
          <tbody>{audit.slice(0, 40).map((a: any) => <tr key={a._id}><td>{new Date(a.timestamp).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</td><td>{a.user}</td><td>{a.action}</td><td>{a.entity} {String(a.entityId || '').slice(-6)}</td></tr>)}</tbody>
        </table></div>}
      {showUsers && (
        <Sheet title="Staff & users" onClose={() => setShowUsers(false)} wide>
          {users.map((u: any) => (
            <div key={u._id} className="lrow">
              <div className="grow"><b className="t">{u.username} {u.role === 'ADMIN' ? '👑' : ''}</b><small>{u.name || ''} • {(u.permissions || []).length} permissions • {u.active ? 'active' : 'disabled'}</small></div>
              {u.role !== 'ADMIN' && <button className="btn sm ghost" onClick={() => toggleUser(u)}>{u.active ? 'Disable' : 'Enable'}</button>}
            </div>
          ))}
          <div className="section-t">Add staff</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input placeholder="username" value={uname} onChange={(e) => setUname(e.target.value)} />
            <input placeholder="password" type="password" value={upass} onChange={(e) => setUpass(e.target.value)} />
            <button className="btn primary" onClick={addUser}>Add</button>
          </div>
          <small style={{ color: 'var(--muted)' }}>Staff can sell, add products/purchases, manage khata. Voids, users, settings & day close stay admin-only.</small>
        </Sheet>
      )}
    </div>
  );
}

function AttendanceCard({ users }: { users: any[] }) {
  const toast = useToast();
  const [rows, setRows] = useState<any[]>([]);
  const [month, setMonth] = useState(new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }).slice(0, 7));
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const load = async (m: string) => {
    try { const { data } = await api.get('/api/attendance', { params: { month: m } }); setRows(data); } catch (e: any) { toast(errMsg(e), 'err'); }
  };
  useEffect(() => { load(month); }, [month]);
  const todayRows = rows.filter((r) => r.date === today);
  const mark = async (u: any, kind: 'in' | 'out') => {
    try {
      if (kind === 'in') await api.post('/api/attendance/checkin', { userId: u._id, name: u.username });
      else await api.post('/api/attendance/checkout', { userId: u._id });
      toast(kind === 'in' ? 'Present ✓' : 'Out ✓', 'ok'); load(month);
    } catch (e: any) { toast(errMsg(e), 'err'); }
  };
  const staff = users.filter((u) => u.role !== 'ADMIN' && u.active);
  return (
    <div style={{ marginTop: 6 }}>
      <div className="section-t">🕘 Hajira (attendance)</div>
      <div className="card">
        {staff.length === 0 ? <small style={{ color: 'var(--muted)' }}>Staff add korle ekhane hajira hobe.</small> :
          staff.map((u) => {
            const rec = todayRows.find((r) => String(r.userId) === String(u._id));
            return (
              <div key={u._id} className="kv">
                <span><b>{u.username}</b> <small>{rec ? `• in ${rec.inTime || '—'}${rec.outTime ? ` • out ${rec.outTime}` : ''}` : '• not marked'}</small></span>
                <span style={{ display: 'flex', gap: 6 }}>
                  {!rec && <button className="btn sm green" onClick={() => mark(u, 'in')}>✓ In</button>}
                  {rec && !rec.outTime && <button className="btn sm" onClick={() => mark(u, 'out')}>Out</button>}
                  {rec?.outTime && <span className="badge-ok">done</span>}
                </span>
              </div>
            );
          })}
        <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
          <label style={{ margin: 0 }}>Month</label>
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} style={{ maxWidth: 180 }} />
        </div>
      </div>
      {rows.length > 0 && (
        <div className="table-wrap" style={{ marginTop: 8 }}><table><thead><tr><th>Date</th><th>Name</th><th>In</th><th>Out</th><th>Status</th></tr></thead>
          <tbody>{rows.slice(0, 60).map((r: any) => <tr key={r._id}><td>{r.date}</td><td>{r.name}</td><td>{r.inTime || '—'}</td><td>{r.outTime || '—'}</td><td>{r.status}</td></tr>)}</tbody>
        </table></div>
      )}
    </div>
  );
}

export function SystemHealth() {  const [h, setH] = useState<any>(null);
  useEffect(() => { api.get('/api/system').then((r) => setH(r.data)).catch(() => {}); }, []);
  if (!h) return null;
  return (
    <div className="card" style={{ marginTop: 10 }}>
      <b style={{ fontSize: 14 }}>🖥 System</b>
      <div className="health-grid" style={{ marginTop: 8 }}>
        {Object.entries({ Backend: 'ok', Database: h.database, Cloudinary: h.cloudinary?.status || 'n/a', AI: h.ai?.configured ? 'ready' : 'fallback', Env: h.env, Version: h.version }).map(([k, v]) => (
          <div key={k} className="card"><small>{k}</small><br /><b style={{ fontSize: 14 }}>{String(v)}</b></div>
        ))}
      </div>
    </div>
  );
}
