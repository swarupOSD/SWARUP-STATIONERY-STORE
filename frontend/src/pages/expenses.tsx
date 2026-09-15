import { useEffect, useState } from 'react';
import api, { errMsg } from '../api/client';
import { Empty, PageHead, Sheet, Skel, rs, useConfirm, useToast } from '../components/ui';

const CATS = ['Rent', 'Electricity', 'Transport', 'Salary', 'Food/Tea', 'Repair', 'Fees/Tax', 'Other'];

export function Expenses() {
  const toast = useToast();
  const confirm = useConfirm();
  const [items, setItems] = useState<any[]>([]);
  const [sum, setSum] = useState(0);
  const [loading, setLoading] = useState(true);
  const [show, setShow] = useState(false);
  const [f, setF] = useState({ title: '', category: 'Other', amount: '', method: 'CASH', notes: '' });
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const load = async () => {
    setLoading(true);
    try { const { data } = await api.get('/api/expenses', { params: { limit: 60 } }); setItems(data.items); setSum(data.sum); }
    catch (e: any) { toast(errMsg(e), 'err'); } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);
  const save = async () => {
    if (!f.title.trim() || !(Number(f.amount) > 0)) { toast('Title + amount dao', 'err'); return; }
    try {
      await api.post('/api/expenses', { ...f, amount: Number(f.amount) });
      toast('Kharcha saved ✓', 'ok'); setShow(false); setF({ title: '', category: 'Other', amount: '', method: 'CASH', notes: '' }); load();
    } catch (e: any) { toast(errMsg(e), 'err'); }
  };
  const del = async (id: string, title: string) => {
    if (!await confirm({ title: `Delete "${title}"?`, okText: 'Delete' })) return;
    try { await api.delete(`/api/expenses/${id}`); toast('Deleted', 'ok'); load(); } catch (e: any) { toast(errMsg(e), 'err'); }
  };
  const todaySum = items.filter((x) => x.expenseDate === today).reduce((s, x) => s + x.amount, 0);
  return (
    <div className="page">
      <PageHead title="Kharcha (expenses)" emoji="💸"><button className="btn primary sm" onClick={() => setShow(true)}>+ Add</button></PageHead>
      <div className="cards">
        <div className="card kpi red"><small>💸 Ajker kharcha</small><br /><b>{rs(todaySum)}</b></div>
        <div className="card kpi"><small>🧾 Listed total</small><br /><b>{rs(Math.round(sum))}</b><div className="sub">{items.length} entries</div></div>
      </div>
      <p><small style={{ color: 'var(--muted)' }}>Dokkan chalano kharcha — vara, current, transport, salary, cha... (mal kena noy, ota Purchase-e). Daily report-e net profit theke bad jay.</small></p>
      {loading ? <Skel n={4} /> : items.length === 0 ? <Empty emoji="💸" title="No expenses yet" /> :
        items.map((x: any) => (
          <div key={x._id} className="lrow">
            <span style={{ fontSize: 22 }}>{x.category === 'Rent' ? '🏠' : x.category === 'Electricity' ? '💡' : x.category === 'Transport' ? '🛺' : x.category === 'Salary' ? '👷' : x.category === 'Food/Tea' ? '🍵' : '🧾'}</span>
            <div className="grow"><b className="t">{x.title}</b><small>{x.category} • {x.expenseDate} • {x.method}{x.notes ? ` • ${x.notes}` : ''}</small></div>
            <b>{rs(x.amount)}</b>
            <button className="btn sm ghost" onClick={() => del(x._id, x.title)}>✕</button>
          </div>
        ))}
      {show && (
        <Sheet title="Notun kharcha" onClose={() => setShow(false)}>
          <label>Ki babod? *</label><input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="e.g. Dokan vara, current bill" />
          <label>Category</label>
          <div className="chips">{CATS.map((c) => <button key={c} className={`chip${f.category === c ? ' on' : ''}`} onClick={() => setF({ ...f, category: c })}>{c}</button>)}</div>
          <div className="row2">
            <div><label>Amount ₹ *</label><input value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} inputMode="decimal" /></div>
            <div><label>Method</label><select value={f.method} onChange={(e) => setF({ ...f, method: e.target.value })}>{['CASH', 'UPI', 'BANK', 'OTHER'].map((m) => <option key={m}>{m}</option>)}</select></div>
          </div>
          <label>Note</label><input value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
          <button className="btn primary block" style={{ marginTop: 12 }} onClick={save}>✓ Save kharcha</button>
        </Sheet>
      )}
    </div>
  );
}
