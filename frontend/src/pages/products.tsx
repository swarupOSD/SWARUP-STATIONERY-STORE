import { useEffect, useState } from 'react';
import api, { errMsg } from '../api/client';

export function Products() {
  const [q, setQ] = useState('');
  const [items, setItems] = useState<any[]>([]);
  const load = async (term = '') => {
    const { data } = await api.get('/api/products', { params: { q: term, limit: 100 } });
    setItems(data.items);
  };
  useEffect(() => { load(); }, []);
  return (
    <div>
      <h2>Products</h2>
      <div style={{ display: 'flex', gap: 8 }}>
        <input placeholder="Search name / বাংলা / SKU / barcode / brand" value={q} onChange={(e) => { setQ(e.target.value); load(e.target.value); }} />
        <a className="btn primary" href="/products/new">+ Add</a>
      </div>
      <table style={{ marginTop: 10 }}><thead><tr><th>Name</th><th>Price</th><th>Stock</th><th>Cat</th></tr></thead>
        <tbody>{items.map((p) => <tr key={p._id}><td><a href={`/products/${p._id}`}>{p.name}</a></td><td>₹{p.sellingPrice}</td><td>{p.stock}</td><td>{p.category}</td></tr>)}</tbody>
      </table>
    </div>
  );
}

export function ProductForm({ editId }: { editId?: string }) {
  const [f, setF] = useState<any>({ name: '', purchasePrice: '', sellingPrice: '', stock: '', category: '', unit: '', packSize: 1, imageUrl: '' });
  const [preview, setPreview] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const set = (k: string, v: any) => setF((s: any) => ({ ...s, [k]: v }));

  useEffect(() => {
    if (editId) api.get(`/api/products/${editId}`).then((r) => { setF(r.data); setPreview(r.data.imageUrl || ''); });
  }, [editId]);

  const suggest = async () => {
    if (!f.name) return;
    const { data } = await api.post('/api/products/suggest', { name: f.name });
    setF((s: any) => ({ ...s, category: s.category || data.category, unit: s.unit || data.unit, packSize: s.packSize || data.packSize }));
  };
  const checkImage = async () => {
    setMsg('Loading image…'); setErr('');
    try {
      const { data } = await api.post('/api/products/preview-image', { url: f.imageUrl });
      setPreview(data.resolvedUrl); setMsg('✓ Image loaded');
    } catch (e: any) { setPreview(''); setErr(e?.response?.data?.hint || errMsg(e)); setMsg(''); }
  };
  const uploadFile = async (file: File) => {
    const fd = new FormData(); fd.append('file', file); fd.append('folder', 'products');
    const { data } = await api.post('/api/uploads', fd);
    set('imageUrl', data.url); setPreview(data.url); setMsg('✓ Image loaded');
  };
  const save = async () => {
    setErr(''); setMsg('');
    try {
      if (editId) await api.patch(`/api/products/${editId}`, f);
      else await api.post('/api/products', { ...f, purchasePrice: Number(f.purchasePrice), sellingPrice: Number(f.sellingPrice), stock: Number(f.stock || 0) });
      setMsg('Saved ✓'); location.href = '/products';
    } catch (e: any) { setErr(errMsg(e)); }
  };
  return (
    <div style={{ maxWidth: 560 }}>
      <h2>{editId ? 'Edit' : 'Add'} Product</h2>
      <label>Name</label><input value={f.name} onChange={(e) => set(e.target.name, e.target.value)} onBlur={suggest} />
      <label>Bengali name</label><input value={f.nameBn || ''} onChange={(e) => set('nameBn', e.target.value)} />
      <label>Image URL (direct / Google image URL)</label>
      <div style={{ display: 'flex', gap: 8 }}><input value={f.imageUrl || ''} onChange={(e) => set('imageUrl', e.target.value)} /><button className="btn" onClick={checkImage}>Preview</button></div>
      {msg && <p>{msg}</p>}{err && <p style={{ color: '#a00' }}>{err}. Try another URL, upload, or camera.</p>}
      {preview && <img src={preview} alt="preview" style={{ width: '100%', maxHeight: 220, objectFit: 'contain', background: '#fff', border: '1px solid #eadfc8', borderRadius: 12 }} />}
      <label>Upload / camera</label><input type="file" accept="image/*" capture="environment" onChange={(e) => e.target.files?.[0] && uploadFile(e.target.files[0])} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <div><label>Buy price ₹</label><input value={f.purchasePrice} onChange={(e) => set('purchasePrice', e.target.value)} inputMode="decimal" /></div>
        <div><label>Sell price ₹</label><input value={f.sellingPrice} onChange={(e) => set('sellingPrice', e.target.value)} inputMode="decimal" /></div>
        <div><label>Stock</label><input value={f.stock} onChange={(e) => set('stock', e.target.value)} inputMode="numeric" /></div>
        <div><label>Min stock</label><input value={f.minStock || ''} onChange={(e) => set('minStock', e.target.value)} inputMode="numeric" /></div>
        <div><label>Category</label><input value={f.category || ''} onChange={(e) => set('category', e.target.value)} /></div>
        <div><label>Unit</label><select value={f.unit || ''} onChange={(e) => set('unit', e.target.value)}><option value="">auto</option>{['piece','packet','box','bottle','can','pouch','kg','gram','liter','ml','dozen','pack','cigarette','other'].map((u) => <option key={u} value={u}>{u}</option>)}</select></div>
        <div><label>Pack size</label><input value={f.packSize || 1} onChange={(e) => set('packSize', e.target.value)} inputMode="numeric" /></div>
        <div><label>Barcode / SKU</label><input value={f.barcode || f.sku || ''} onChange={(e) => set('barcode', e.target.value)} /></div>
      </div>
      <label>Brand</label><input value={f.brand || ''} onChange={(e) => set('brand', e.target.value)} />
      <button className="btn primary" style={{ width: '100%', marginTop: 12 }} onClick={save}>Save Product</button>
    </div>
  );
}
