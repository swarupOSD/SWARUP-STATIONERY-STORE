import { useEffect, useState } from 'react';
import api, { errMsg } from '../api/client';
import { SELLERS, Avatar, Empty, Img, PageHead, QtyStepper, Sheet, Skel, rs, useConfirm, useDebounce, useToast } from '../components/ui';

export function Products() {
  const toast = useToast();
  const [q, setQ] = useState('');
  const dq = useDebounce(q);
  const [cat, setCat] = useState('');
  const [cats, setCats] = useState<any[]>([]);
  const [filter, setFilter] = useState<'all' | 'low' | 'out' | 'pricing' | 'inactive'>('all');
  const [sort, setSort] = useState('name');
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<any>(null);
  const [showCats, setShowCats] = useState(false);

  useEffect(() => { api.get('/api/categories').then((r) => setCats(r.data)).catch(() => {}); }, []);
  const qp = new URLSearchParams(location.search).get('needsPricing');
  useEffect(() => { if (qp === '1') setFilter('pricing'); }, []);
  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/api/products', { params: { q: dq, category: cat, limit: 120, active: filter === 'inactive' ? 'false' : 'true', ...(filter === 'pricing' ? { needsPricing: '1' } : {}) } });
      let list = data.items;
      if (filter === 'low') list = list.filter((p: any) => p.stock > 0 && p.stock <= (p.minStock ?? 5));
      if (filter === 'out') list = list.filter((p: any) => p.stock <= 0);
      list = [...list].sort((a: any, b: any) => sort === 'price' ? b.sellingPrice - a.sellingPrice : sort === 'stock' ? a.stock - b.stock : sort === 'margin' ? margin(b) - margin(a) : a.name.localeCompare(b.name));
      setItems(list);
    } catch (e: any) { toast(errMsg(e), 'err'); } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [dq, cat, filter, sort]);
  const margin = (p: any) => (p.purchasePrice > 0 ? Math.round(((p.sellingPrice - p.purchasePrice) / p.purchasePrice) * 100) : 0);
  const stockVal = items.reduce((s, p) => s + p.stock * (p.purchasePrice / Math.max(1, p.packSize || 1)), 0);

  return (
    <div className="page">
      <PageHead title="Products" emoji="📦"><a className="btn primary sm" href="/products/new">+ Add</a></PageHead>
      <div className="toolbar">
        <input placeholder="Search name / বাংলা / SKU / barcode / brand" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={sort} onChange={(e) => setSort(e.target.value)} style={{ flex: '0 0 130px' }}>
          <option value="name">A–Z</option><option value="price">Price ↓</option><option value="stock">Stock ↑</option><option value="margin">Margin ↓</option>
        </select>
      </div>
      <div className="chips">
        <button className={`chip${!cat ? ' on' : ''}`} onClick={() => setCat('')}>All</button>
        {cats.map((c) => <button key={c._id} className={`chip${cat === c.name ? ' on' : ''}`} onClick={() => setCat(cat === c.name ? '' : c.name)}>{c.name}</button>)}
        <button className={`chip${filter === 'low' ? ' on' : ''}`} onClick={() => setFilter(filter === 'low' ? 'all' : 'low')}>⚠️ Low</button>
        <button className={`chip${filter === 'out' ? ' on' : ''}`} onClick={() => setFilter(filter === 'out' ? 'all' : 'out')}>🚫 Out</button>
        <button className={`chip${filter === 'pricing' ? ' on' : ''}`} onClick={() => setFilter(filter === 'pricing' ? 'all' : 'pricing')}>🏷️ Set price</button>
        <button className={`chip${filter === 'inactive' ? ' on' : ''}`} onClick={() => setFilter(filter === 'inactive' ? 'all' : 'inactive')}>🚫 Inactive</button>
        <button className="chip" onClick={() => setShowCats(true)}>🗂 Categories</button>
      </div>
      <p style={{ color: 'var(--muted)', fontSize: 13 }}>{items.length} products • stock value ≈ {rs(Math.round(stockVal))}</p>
      {loading ? <Skel n={4} /> : items.length === 0 ? <Empty emoji="📦" title="No products" sub="Add your first product to start selling." action={<a className="btn primary" href="/products/new">+ Add product</a>} /> : (
        <div className="grid-products">
          {items.map((p) => (
            <div className="prod" key={p._id} onClick={() => setDetail(p)} style={{ cursor: 'pointer' }}>
              <Img src={p.imageUrl} alt={p.name} />
              <div className="p">
                <span className="nm">{p.name}</span>
                <span className="pr"><b>{rs(p.sellingPrice)}</b><span className="margin-tag">+{margin(p)}%</span></span>
                <span className="pr"><span>stk {p.stock} {p.unit}</span>{p.needsPricing ? <span className="badge-info">SET PRICE</span> : p.stock <= 0 ? <span className="badge-out">OUT</span> : p.stock <= (p.minStock ?? 5) ? <span className="badge-low">LOW</span> : <span className="badge-ok">OK</span>}</span>
              </div>
            </div>
          ))}
        </div>
      )}
      {detail && <ProductDetail p={detail} onClose={() => { setDetail(null); load(); }} />}
      {showCats && <CategoryManager onClose={() => { setShowCats(false); api.get('/api/categories').then((r) => setCats(r.data)).catch(() => {}); }} />}
    </div>
  );
}

function CategoryManager({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [cats, setCats] = useState<any[]>([]);
  const [nm, setNm] = useState('');
  const load = async () => { try { const { data } = await api.get('/api/categories'); setCats(data); } catch (e: any) { toast(errMsg(e), 'err'); } };
  useEffect(() => { load(); }, []);
  const add = async () => {
    if (!nm.trim()) return;
    try { await api.post('/api/categories', { name: nm.trim() }); setNm(''); toast('Category added ✓', 'ok'); load(); }
    catch (e: any) { toast(errMsg(e), 'err'); }
  };
  const del = async (c: any) => {
    if (!await confirm({ title: `"${c.name}" delete?`, body: 'Product thakle delete hobe na.', okText: 'Delete' })) return;
    try { await api.delete(`/api/categories/${c._id}`); toast('Deleted ✓', 'ok'); load(); }
    catch (e: any) { toast(errMsg(e), 'err'); }
  };
  return (
    <Sheet title="🗂 Categories" onClose={onClose}>
      <div style={{ display: 'flex', gap: 8 }}>
        <input value={nm} onChange={(e) => setNm(e.target.value)} placeholder="Notun category…" />
        <button className="btn primary" onClick={add}>Add</button>
      </div>
      {cats.map((c) => (
        <div key={c._id} className="kv"><span>{c.icon || '🏷️'} {c.name}</span><button className="btn sm ghost" style={{ color: 'var(--rose-tx)' }} onClick={() => del(c)}>Delete</button></div>
      ))}
    </Sheet>
  );
}

function ProductDetail({ p, onClose }: { p: any; onClose: () => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [hist, setHist] = useState<any>(null);
  const [delta, setDelta] = useState('');
  const [reason, setReason] = useState('');
  const [counted, setCounted] = useState('');
  const [takeQty, setTakeQty] = useState('');
  const [takeWho, setTakeWho] = useState('Ami');
  const [takeWhy, setTakeWhy] = useState('');
  const [newPrice, setNewPrice] = useState('');
  const [labels, setLabels] = useState(false);
  useEffect(() => { api.get(`/api/products/${p._id}/history`).then((r) => setHist(r.data)).catch(() => {}); }, [p._id]);
  const adjust = async () => {
    const d = Number(delta);
    if (!d) { toast('Enter + or − quantity', 'err'); return; }
    if (!await confirm({ title: `Adjust stock by ${d > 0 ? '+' : ''}${d}?`, body: `${p.name}: ${p.stock} → ${p.stock + d}` })) return;
    try { await api.post(`/api/products/${p._id}/adjust`, { delta: d, reason: reason || 'Manual adjustment' }); toast('Stock updated ✓', 'ok'); onClose(); }
    catch (e: any) { toast(errMsg(e), 'err'); }
  };
  const setExact = async () => {
    if (counted === '' || !(Number(counted) >= 0)) { toast('Counted qty dao', 'err'); return; }
    const d = Number(counted) - p.stock;
    if (d === 0) { toast('Already matches ✓', 'ok'); return; }
    if (!await confirm({ title: `Set stock to ${counted}?`, body: `${p.name}: ${p.stock} → ${counted} (diff ${d > 0 ? '+' : ''}${d})` })) return;
    try { await api.post(`/api/products/${p._id}/adjust`, { delta: d, reason: 'Physical count' }); toast('Stock miliye nilam ✓', 'ok'); onClose(); }
    catch (e: any) { toast(errMsg(e), 'err'); }
  };
  return (
    <Sheet title={p.name} onClose={onClose} wide>
      <div style={{ display: 'flex', gap: 12 }}>
        <div style={{ width: 110, borderRadius: 12, overflow: 'hidden', border: '1px solid var(--line)' }}><Img src={p.imageUrl} alt={p.name} h={110} /></div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 20, fontWeight: 800 }}>{rs(p.sellingPrice)} <small style={{ color: 'var(--muted)', fontWeight: 400 }}>cost {rs(p.purchasePrice)}</small></div>
          <div style={{ marginTop: 4 }}>{p.stock <= 0 ? <span className="badge-out">OUT OF STOCK</span> : p.stock <= (p.minStock ?? 5) ? <span className="badge-low">LOW STOCK</span> : <span className="badge-ok">IN STOCK</span>} <small> {p.stock} {p.unit} • min {p.minStock}</small></div>
          <div style={{ marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <a className="btn sm" href={`/products/${p._id}`}>✏️ Edit</a>
            <button className="btn sm gold" onClick={() => setLabels(true)}>🏷️ Labels</button>
            <button className="btn sm ghost" onClick={async () => {
              try { await api.patch(`/api/products/${p._id}`, { active: !p.active }); toast(p.active ? 'Inactive holo — dokane dekhabe na' : 'Active holo ✓', 'ok'); onClose(); }
              catch (e: any) { toast(errMsg(e), 'err'); }
            }}>{p.active ? '🚫 Inactive koro' : '✅ Active koro'}</button>
            <button className="btn sm ghost" style={{ color: 'var(--rose-tx)' }} onClick={async () => {
              if (!await confirm({ title: `"${p.name}" delete?`, body: 'History thakle delete hobe na — tokhon Inactive koro.', okText: 'Delete' })) return;
              try { await api.delete(`/api/products/${p._id}`); toast('Deleted ✓', 'ok'); onClose(); }
              catch (e: any) { toast(errMsg(e), 'err'); }
            }}>🗑 Delete</button>
          </div>
        </div>
      </div>
      <div className="kv"><span>Category</span><span>{p.category}{p.subcategory ? ` / ${p.subcategory}` : ''}</span></div>
      <div className="kv"><span>Pack</span><span>1 {p.unit === 'packet' ? 'packet' : p.unit} = {p.packSize || 1} pcs</span></div>
      {(p.packSize || 1) > 1 && <div className="kv"><span>Loose (per pc)</span><b>{rs(p.loosePrice > 0 ? p.loosePrice : p.sellingPrice / (p.packSize || 1))}</b></div>}
      {p.purchasedBy && <div className="kv"><span>Ke kineche</span><span>{p.purchasedBy === 'Ami' ? '🙋 Ami' : p.purchasedBy === 'Ma' ? '👩 Ma' : '👨 Baba'}</span></div>}
      {p.fundedBy && <div className="kv"><span>Kar takay</span><span>{p.fundedBy}</span></div>}
      {p.brand && <div className="kv"><span>Brand</span><span>{p.brand}</span></div>}
      {(p.sku || p.barcode) && <div className="kv"><span>SKU / Barcode</span><span>{p.sku || p.barcode}</span></div>}
      {p.supplier && <div className="kv"><span>Supplier</span><span>{p.supplier}</span></div>}
      <div className="section-t">📷 Chhobi bodlao</div>
      <PhotoFinder name={p.name} onPick={async (url, page) => {
        try { await api.patch(`/api/products/${p._id}`, { imageUrl: url, ...(page ? { productLink: page } : {}) }); toast('Chhobi saved ✓', 'ok'); onClose(); }
        catch (e: any) { toast(errMsg(e), 'err'); }
      }} />

      {p.needsPricing && (
        <div className="card" style={{ marginTop: 8, borderLeft: '4px solid var(--blue)', background: '#fff' }}>
          <b>🏷️ Set your sell price</b> <small>(cost {rs(p.purchasePrice)})</small>
          <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
            <input placeholder="Sell ₹" value={newPrice} onChange={(e) => setNewPrice(e.target.value)} inputMode="decimal" />
            <button className="btn primary" onClick={async () => {
              if (!(Number(newPrice) > 0)) { toast('Enter sell price', 'err'); return; }
              try { await api.patch(`/api/products/${p._id}`, { sellingPrice: Number(newPrice), needsPricing: false }); toast('Price set ✓', 'ok'); onClose(); }
              catch (e: any) { toast(errMsg(e), 'err'); }
            }}>Set</button>
          </div>
        </div>
      )}

      <div className="section-t">⚖️ Stock check (miliye nin)</div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input placeholder="+10 / −5" value={delta} onChange={(e) => setDelta(e.target.value)} inputMode="numeric" />
        <input placeholder="Reason" value={reason} onChange={(e) => setReason(e.target.value)} />
        <button className="btn gold" onClick={adjust}>Apply</button>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <input placeholder={`Counted: ekhon hate ${p.stock}`} value={counted} onChange={(e) => setCounted(e.target.value)} inputMode="numeric" />
        <button className="btn" onClick={setExact}>Set exact</button>
      </div>
      <small style={{ color: 'var(--muted)' }}>Dokane gune ja pelen tai bosan — parthokyo auto-adjust hobe.</small>

      <div className="section-t">🏠 Niye gelam (bari/personal use)</div>
      <div className="card" style={{ background: '#fff' }}>
        <label style={{ marginTop: 0 }}>Ke nilo?</label>
        <div className="chips">{SELLERS.map((s) => <button key={s} className={`chip${takeWho === s ? ' on' : ''}`} onClick={() => setTakeWho(s)}>{s}</button>)}</div>
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <input placeholder={`Qty (${p.unit})`} value={takeQty} onChange={(e) => setTakeQty(e.target.value)} inputMode="numeric" />
          <input placeholder="Keno? (optional)" value={takeWhy} onChange={(e) => setTakeWhy(e.target.value)} />
        </div>
        <button className="btn gold block" style={{ marginTop: 8 }} onClick={async () => {
          if (!(Number(takeQty) > 0)) { toast('Qty dao', 'err'); return; }
          if (!await confirm({ title: `${takeWho} ${takeQty} ${p.unit} nilo?`, body: `${p.name}: stock ${p.stock} → kombe. Eta sale noy.`, okText: 'Nilo ✓' })) return;
          try { await api.post(`/api/products/${p._id}/take`, { qty: Number(takeQty), who: takeWho, reason: takeWhy }); toast('Note kora holo ✓', 'ok'); onClose(); }
          catch (e: any) { toast(errMsg(e), 'err'); }
        }}>✓ {takeWho} nilo — stock theke bad dao</button>
      </div>

      <div className="section-t">💲 Price history</div>
      {!hist ? <Skel n={1} /> : (hist.price || []).length === 0 ? <small style={{ color: 'var(--muted)' }}>No price changes recorded.</small> : (
        <div className="table-wrap"><table><thead><tr><th>Date</th><th>Buy</th><th>Sell</th><th>By</th></tr></thead>
          <tbody>{hist.price.map((h: any, i: number) => <tr key={i}><td>{h.date}</td><td>{rs(h.oldPurchasePrice)} → {rs(h.newPurchasePrice)}</td><td>{rs(h.oldSellingPrice)} → {rs(h.newSellingPrice)}</td><td>{h.changedBy}</td></tr>)}</tbody>
        </table></div>
      )}
      <div className="section-t">📒 Stock ledger</div>
      {!hist ? <Skel n={2} /> : (hist.stock || []).length === 0 ? <small style={{ color: 'var(--muted)' }}>No movements yet.</small> : (
        hist.stock.slice(0, 12).map((m: any, i: number) => (
          <div key={i} className="kv"><span><b style={{ color: m.quantityDelta < 0 ? 'var(--rose-tx)' : 'var(--green)' }}>{m.quantityDelta > 0 ? '+' : ''}{m.quantityDelta}</b> {m.type} <small>• {m.date} {m.time}</small></span><span>{m.before} → {m.after}</span></div>
        ))
      )}
      {labels && <LabelSheet p={p} onClose={() => setLabels(false)} />}
    </Sheet>
  );
}

export function PhotoFinder({ name, onPick }: { name: string; onPick: (url: string, page: string) => void }) {
  const toast = useToast();
  const [q, setQ] = useState(name);
  const [items, setItems] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const find = async () => {
    if (q.trim().length < 2) return;
    setBusy(true);
    try {
      const { data } = await api.get('/api/products/image-suggest', { params: { q: q.trim() } });
      setItems(data.items || []); setDone(true);
      if (!(data.items || []).length) toast('Kichu pelam na — nam bodle try koro', 'err');
    } catch (e: any) { toast(errMsg(e), 'err'); } finally { setBusy(false); }
  };
  useEffect(() => { setQ(name); }, [name]);
  return (
    <div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Product nam…" />
        <button className="btn gold" onClick={find} disabled={busy}>{busy ? '…' : '🔍 Find'}</button>
      </div>
      {done && items.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
          {items.map((c, i) => (
            <div key={i} style={{ border: '1px solid var(--line)', borderRadius: 10, overflow: 'hidden', cursor: 'pointer', background: '#fff' }} onClick={() => { onPick(c.murl, c.purl || ''); toast('Chhobi bosano ✓', 'ok'); }}>
              <img src={c.murl} alt={c.title} loading="lazy" style={{ width: '100%', height: 110, objectFit: 'contain', background: '#f4f6f9' }} onError={(e) => { (e.target as any).style.display = 'none'; }} />
              <div style={{ fontSize: 11, padding: 4, color: 'var(--muted)' }}>{(c.title || '').slice(0, 50)}</div>
            </div>
          ))}
        </div>
      )}
      {done && <small style={{ color: 'var(--muted)' }}>Mil-jawa chhobi-te tap koro — thik-ta bosbe ✓</small>}
    </div>
  );
}

function LabelSheet({ p, onClose }: { p: any; onClose: () => void }) {
  const toast = useToast();
  const [copies, setCopies] = useState(12);
  const code = String(p.barcode || p.sku || `SS${String(p._id).slice(-8).toUpperCase()}`).replace(/\s/g, '');
  useEffect(() => {
    let ok = true;
    import('jsbarcode').then((m: any) => {
      if (!ok) return;
      const J = m.default || m;
      document.querySelectorAll<SVGSVGElement>('.lbl-barcode').forEach((el) => {
        try { J(el, code, { format: 'CODE128', width: 2, height: 44, displayValue: true, fontSize: 13 }); } catch {}
      });
    }).catch(() => toast('Barcode lib failed to load', 'err'));
    return () => { ok = false; };
  }, [copies]);
  const print = () => {
    const w = window.open('', '_blank', 'width=600');
    if (!w) { toast('Popup blocked — allow popups to print', 'err'); return; }
    const one = document.querySelector('.lbl-barcode')?.outerHTML || '';
    const label = `<div style="width:180px;border:1px dashed #999;border-radius:8px;padding:8px;margin:6px;display:inline-block;text-align:center;font-family:sans-serif"><div style="font-weight:800;font-size:13px">${p.name}</div><div style="font-size:15px">Rs.${p.sellingPrice}</div>${one}</div>`;
    w.document.write(`<html><head><title>Labels — ${p.name}</title></head><body>${label.repeat(Math.min(48, Math.max(1, copies)))}<script>onload=()=>{print();}<\/script></body></html>`);
    w.document.close();
  };
  return (
    <Sheet title={`🏷️ Labels • ${p.name}`} onClose={onClose}>
      {!p.barcode && !p.sku && <p><small style={{ color: 'var(--amber-tx)' }}>No barcode saved — using shop code {code}. Add a real barcode in Edit for scanning.</small></p>}
      <div className="kv"><span>Code</span><b>{code}</b></div>
      <label>Copies (1–48)</label>
      <input type="number" min={1} max={48} value={copies} onChange={(e) => setCopies(Math.min(48, Math.max(1, Number(e.target.value) || 1)))} />
      <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 12, padding: 12, textAlign: 'center', marginTop: 8 }}>
        <b>{p.name}</b><div>Rs.{p.sellingPrice}</div>
        <svg className="lbl-barcode" />
      </div>
      <button className="btn primary block" style={{ marginTop: 10 }} onClick={print}>🖨️ Print {copies} labels</button>
    </Sheet>
  );
}

export function ProductForm({ editId }: { editId?: string }) {
  const toast = useToast();
  const [f, setF] = useState<any>({ name: '', purchasePrice: '', sellingPrice: '', stock: '', category: '', unit: '', packSize: 1, imageUrl: '' });
  const [cats, setCats] = useState<any[]>([]);
  const [preview, setPreview] = useState('');
  const [msg, setMsg] = useState('');
  const set = (k: string, v: any) => setF((s: any) => ({ ...s, [k]: v }));
  useEffect(() => {
    api.get('/api/categories').then((r) => setCats(r.data)).catch(() => {});
    if (editId) api.get(`/api/products/${editId}`).then((r) => { setF(r.data); setPreview(r.data.imageUrl || ''); });
  }, [editId]);
  const suggest = async () => {
    if (!f.name) return;
    try {
      const { data } = await api.post('/api/products/suggest', { name: f.name });
      setF((s: any) => ({ ...s, category: s.category || data.category, unit: s.unit || data.unit, packSize: s.packSize || data.packSize }));
      setMsg(`Suggested: ${data.category} • ${data.unit} • pack ${data.packSize}`);
    } catch {}
  };
  const checkImage = async () => {
    setMsg('Loading image…');
    try {
      const { data } = await api.post('/api/products/preview-image', { url: f.imageUrl });
      setPreview(data.resolvedUrl); setMsg('✓ Image loaded');
    } catch (e: any) { setPreview(''); setMsg(''); toast(e?.response?.data?.hint || errMsg(e), 'err'); }
  };
  const uploadFile = async (file: File) => {
    const fd = new FormData(); fd.append('file', file); fd.append('folder', 'products');
    try { const { data } = await api.post('/api/uploads', fd); set('imageUrl', data.url); setPreview(data.url); toast('✓ Image uploaded', 'ok'); }
    catch (e: any) { toast(errMsg(e), 'err'); }
  };
  const save = async () => {
    try {
      if (editId) await api.patch(`/api/products/${editId}`, f);
      else await api.post('/api/products', { ...f, purchasePrice: Number(f.purchasePrice), sellingPrice: Number(f.sellingPrice), stock: Number(f.stock || 0) });
      toast('Saved ✓', 'ok'); location.href = '/products';
    } catch (e: any) { toast(errMsg(e), 'err'); }
  };
  const margin = f.purchasePrice > 0 && f.sellingPrice !== '' ? Math.round(((Number(f.sellingPrice) - Number(f.purchasePrice)) / Number(f.purchasePrice)) * 100) : null;
  return (
    <div className="page" style={{ maxWidth: 600 }}>
      <PageHead title={editId ? 'Edit product' : 'Add product'} emoji={editId ? '✏️' : '➕'} />
      <div className="card">
        <label>Product name *</label><input value={f.name} onChange={(e) => set('name', e.target.value)} onBlur={suggest} placeholder="e.g. Cigarette packet, Kopiko, Pen" />
        {msg && <small style={{ color: 'var(--green)' }}>{msg}</small>}
        <div className="row2">
          <div><label>Bengali name</label><input value={f.nameBn || ''} onChange={(e) => set('nameBn', e.target.value)} placeholder="পেন" /></div>
          <div><label>Brand</label><input value={f.brand || ''} onChange={(e) => set('brand', e.target.value)} /></div>
        </div>
        <label>Photo</label>
        <div style={{ display: 'flex', gap: 8 }}><input value={f.imageUrl || ''} onChange={(e) => set('imageUrl', e.target.value)} placeholder="Paste image URL…" /><button className="btn gold" onClick={checkImage}>Check</button></div>
        {preview && <img src={preview} alt="preview" style={{ width: '100%', maxHeight: 200, objectFit: 'contain', background: '#fff', border: '1px solid var(--line)', borderRadius: 12, marginTop: 8 }} />}
        <label style={{ marginTop: 8 }}>Upload / camera</label><input type="file" accept="image/*" capture="environment" onChange={(e) => e.target.files?.[0] && uploadFile(e.target.files[0])} />
        <label style={{ marginTop: 8 }}>🔍 Online theke chhobi (tap kore bosao)</label>
        <PhotoFinder name={f.name || ''} onPick={(url, page) => { set('imageUrl', url); setPreview(url); if (page) set('productLink', page); }} />
        <div className="row2">
          <div><label>Buy price ₹ *</label><input value={f.purchasePrice} onChange={(e) => set('purchasePrice', e.target.value)} inputMode="decimal" /></div>
          <div><label>Sell price ₹ * (packet)</label><input value={f.sellingPrice} onChange={(e) => set('sellingPrice', e.target.value)} inputMode="decimal" /></div>
        </div>
        {margin !== null && <div style={{ marginTop: 6 }}><span className="margin-tag">Margin +{margin}% • profit {rs(Number(f.sellingPrice) - Number(f.purchasePrice))}/pc</span></div>}
        <div className="row2">
          <div><label>Loose price ₹ (per pc, khuchra)</label><input value={f.loosePrice ?? ''} onChange={(e) => set('loosePrice', e.target.value)} inputMode="decimal" placeholder={f.sellingPrice && f.packSize > 1 ? `auto ₹${(Number(f.sellingPrice) / Number(f.packSize)).toFixed(2)}` : 'same as sell'} /></div>
          <div><label>Stock *</label><input value={f.stock} onChange={(e) => set('stock', e.target.value)} inputMode="numeric" /></div>
        </div>
        <div className="row2">
          <div><label>Min stock (alert)</label><input value={f.minStock ?? ''} onChange={(e) => set('minStock', e.target.value)} inputMode="numeric" /></div>
          <div><label>Supplier</label><input value={f.supplier || ''} onChange={(e) => set('supplier', e.target.value)} /></div>
        </div>
        <div className="row2">
          <div><label>Category</label><input list="catlist" value={f.category || ''} onChange={(e) => set('category', e.target.value)} placeholder="Stationery…" /><datalist id="catlist">{cats.map((c) => <option key={c._id} value={c.name} />)}</datalist></div>
          <div><label>Unit</label><select value={f.unit || ''} onChange={(e) => set('unit', e.target.value)}><option value="">auto</option>{['piece', 'packet', 'box', 'bottle', 'can', 'pouch', 'kg', 'gram', 'liter', 'ml', 'dozen', 'pack', 'cigarette', 'other'].map((u) => <option key={u} value={u}>{u}</option>)}</select></div>
        </div>
        <div className="row2">
          <div><label>Pack size (pcs per {f.unit || 'pack'})</label><input value={f.packSize || 1} onChange={(e) => set('packSize', e.target.value)} inputMode="numeric" /></div>
          <div><label>Barcode / SKU</label><input value={f.barcode || f.sku || ''} onChange={(e) => set('barcode', e.target.value)} /></div>
        </div>
        <label>Supplier</label><input value={f.supplier || ''} onChange={(e) => set('supplier', e.target.value)} />
        <div className="section-t">🛒 Ke kinlo? Kar takay?</div>
        <label style={{ marginTop: 0 }}>Ke kinlo (buyer)</label>
        <div className="chips">{['', 'Ami', 'Ma', 'Baba'].map((w) => <button key={w} className={`chip${(f.purchasedBy || '') === w ? ' on' : ''}`} onClick={() => set('purchasedBy', w)}>{w === '' ? '—' : w}</button>)}</div>
        <label>Kar taka diye kena</label>
        <div className="chips">{['', 'Cash', 'Amar PhonePe', 'Mar PhonePe', 'Babar PhonePe', 'Bank'].map((a) => <button key={a} className={`chip${(f.fundedBy || '') === a ? ' on' : ''}`} onClick={() => set('fundedBy', a)}>{a === '' ? '—' : a}</button>)}</div>
        <button className="btn primary block" style={{ marginTop: 14 }} onClick={save}>✓ Save product</button>
      </div>
    </div>
  );
}
