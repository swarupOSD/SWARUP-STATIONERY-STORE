import { useEffect, useState } from 'react';
import api, { errMsg } from '../api/client';
import { Empty, PageHead, Skel, rs, useToast } from '../components/ui';

type Line = { productId: string; name: string; qty: number; unitPrice: number; supplier: string; stock: number; unit: string; on: boolean };

export function BuyList() {
  const toast = useToast();
  const [lines, setLines] = useState<Line[]>([]);
  const [est, setEst] = useState(0);
  const [loading, setLoading] = useState(true);
  const [supplier, setSupplier] = useState('');
  const [busy, setBusy] = useState(false);
  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/api/reports/buy-list');
      setLines(data.items.map((x: any) => ({ productId: x.productId, name: x.name, qty: x.suggestQty, unitPrice: x.lastPrice, supplier: x.supplier, stock: x.stock, unit: x.unit, on: true })));
      setEst(data.estTotal);
    } catch (e: any) { toast(errMsg(e), 'err'); } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);
  const sel = lines.filter((l) => l.on && l.qty > 0);
  const selTotal = sel.reduce((s, l) => s + l.qty * l.unitPrice, 0);
  const set = (id: string, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.productId === id ? { ...l, ...patch } : l)));
  const waText = `🧾 *Order — Swarup Stationery Store*\n${sel.map((l) => `• ${l.name} x ${l.qty} (@₹${l.unitPrice})`).join('\n')}\nTotal ≈ ₹${Math.round(selTotal)}\nPlease confirm availability. Dhonnobad!`;
  const create = async () => {
    if (!sel.length) { toast('Kichu select koro', 'err'); return; }
    setBusy(true);
    try {
      const { data } = await api.post('/api/purchases', {
        supplier, source: 'Supplier', owner: 'Shop', addToStock: true,
        items: sel.map((l) => ({ productId: l.productId, name: l.name, qty: l.qty, baseQty: l.qty, unitPrice: l.unitPrice, lineTotal: l.qty * l.unitPrice })),
      });
      toast(`Purchase saved ✓ ${data.invoiceNumber}`, 'ok'); load();
    } catch (e: any) { toast(errMsg(e), 'err'); } finally { setBusy(false); }
  };
  return (
    <div className="page">
      <PageHead title="Kin-te hobe (buy list)" emoji="📋" />
      <p><small style={{ color: 'var(--muted)' }}>Low/out-of-stock mal — last kena dam onujayi. Tick, qty bodle direct purchase, ba supplier-ke WhatsApp-e order pathao.</small></p>
      {loading ? <Skel n={4} /> : lines.length === 0 ? <Empty emoji="✅" title="Sob stock thik ache" sub="Kichu kinte hobe na ekhon." /> : (
        <>
          <div className="card kpi accent"><small>🧾 Estimated order</small><br /><b>{rs(Math.round(est))}</b><div className="sub">{lines.length} items low</div></div>
          {lines.map((l) => (
            <div key={l.productId} className="lrow" style={!l.on ? { opacity: .55 } : {}}>
              <input type="checkbox" checked={l.on} onChange={(e) => set(l.productId, { on: e.target.checked })} style={{ width: 22 }} />
              <div className="grow"><b className="t">{l.name}</b><small>stock {l.stock} {l.unit} • last ₹{l.unitPrice}{l.supplier ? ` • ${l.supplier}` : ''}</small>
                <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                  <input type="number" value={l.qty} aria-label="qty" style={{ maxWidth: 90 }} onChange={(e) => set(l.productId, { qty: Math.max(0, Number(e.target.value)) })} />
                  <input type="number" value={l.unitPrice} aria-label="rate" style={{ maxWidth: 110 }} onChange={(e) => set(l.productId, { unitPrice: Math.max(0, Number(e.target.value)) })} />
                </div>
              </div>
              <b>{rs(l.qty * l.unitPrice)}</b>
            </div>
          ))}
          <div className="card" style={{ marginTop: 10 }}>
            <label>Supplier (purchase-e jabe)</label><input value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="e.g. Mahamaya Stores" />
            <div className="totals"><div className="tr grand"><span>Selected total</span><span>{rs(Math.round(selTotal))}</span></div></div>
            <div className="btnrow" style={{ marginTop: 8 }}>
              <a className="btn green" href={`https://wa.me/?text=${encodeURIComponent(waText)}`} target="_blank" rel="noreferrer">💬 WhatsApp order</a>
              <button className="btn primary" onClick={create} disabled={busy}>{busy ? 'Saving…' : `✓ Buy ${sel.length} items`}</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
