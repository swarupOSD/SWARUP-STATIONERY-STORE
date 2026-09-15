import { Component, createContext, useCallback, useContext, useEffect, useRef, useState, ReactNode } from 'react';

/* ---------- error boundary: never a silent white screen ---------- */
export class ErrorBoundary extends Component<{ children: ReactNode }, { msg: string; stack: string }> {
  state = { msg: '', stack: '' };
  static getDerivedStateFromError(e: any) { return { msg: String(e?.message || e), stack: String(e?.stack || '') }; }
  componentDidCatch() { /* visible fallback below is the UX */ }
  render() {
    if (!this.state.msg) return this.props.children;
    return (
      <div style={{ maxWidth: 440, margin: '40px auto', padding: 16 }}>
        <div className="card" style={{ borderLeft: '4px solid var(--rose-tx)' }}>
          <h3>😕 Something didn't load</h3>
          <p style={{ fontSize: 13, wordBreak: 'break-word' }}>{this.state.msg}</p>
          {this.state.stack && <details><summary style={{ fontSize: 12, cursor: 'pointer' }}>Technical detail</summary><pre style={{ fontSize: 11, whiteSpace: 'pre-wrap' }}>{this.state.stack.slice(0, 800)}</pre></details>}
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button className="btn primary" style={{ flex: 1 }} onClick={() => location.reload()}>↻ Reload</button>
            <button className="btn" style={{ flex: 1 }} onClick={() => { try { navigator.clipboard.writeText(this.state.msg + '\n' + this.state.stack); alert('Copied — send it to support'); } catch { alert(this.state.msg); } }}>📋 Copy error</button>
          </div>
          <button className="btn ghost sm block" style={{ marginTop: 8 }} onClick={() => { localStorage.clear(); location.href = '/login'; }}>Logout & retry</button>
        </div>
      </div>
    );
  }
}

/* ---------- formatting ---------- */
export const rs = (n: any) => `₹${Number(n ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
export const num = (n: any) => Number(n ?? 0).toLocaleString('en-IN');
export const initials = (s: any = '') => String(s ?? '').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';
export const waLink = (phone: string, text: string) => {
  const p = (phone || '').replace(/\D/g, '');
  return `https://wa.me/${p ? '91' + p.slice(-10) : ''}?text=${encodeURIComponent(text)}`;
};
export function useDebounce<T>(v: T, ms = 300) {
  const [d, setD] = useState(v);
  useEffect(() => { const t = setTimeout(() => setD(v), ms); return () => clearTimeout(t); }, [v, ms]);
  return d;
}

/* ---------- safe local storage (a poisoned value must never white-screen) ---------- */
export function getJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null || raw === undefined) return fallback;
    const v = JSON.parse(raw);
    return v === undefined ? fallback : (v as T);
  } catch {
    try { localStorage.removeItem(key); } catch {}
    return fallback;
  }
}

/* ---------- clock ---------- */
export function useISTClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  const time = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(now);
  const date = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'long', year: 'numeric' }).format(now);
  const day = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'long' }).format(now);
  return { time, date, day };
}
export function Clock() {
  const { time, date, day } = useISTClock();
  return <div className="clock"><div style={{ fontSize: 24, fontWeight: 800, letterSpacing: 1 }}>{time} <small style={{ fontSize: 12 }}>IST</small></div><div style={{ fontSize: 13 }}>{date} • {day}</div></div>;
}
export function greeting(): string {
  const h = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: 'numeric', hour12: false }).format(new Date()));
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

/* ---------- images ---------- */
export function Img({ src, alt, h = 110 }: { src?: string; alt: string; h?: number }) {
  const [err, setErr] = useState(false);
  if (!src || err) return <div style={{ height: h, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg,#f7ecd2,#efdcb4)', fontSize: 34 }}>📚</div>;
  return <img src={src} alt={alt} loading="lazy" onError={() => setErr(true)} style={{ height: h }} />;
}

/* ---------- toast ---------- */
type Toast = { id: number; msg: string; kind: 'ok' | 'err' | 'info' };
const ToastCtx = createContext<(msg: string, kind?: Toast['kind']) => void>(() => {});
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }: { children: ReactNode }) {
  const [list, setList] = useState<Toast[]>([]);
  const id = useRef(1);
  const push = useCallback((msg: string, kind: Toast['kind'] = 'info') => {
    const t = { id: id.current++, msg, kind };
    setList((l) => [...l.slice(-2), t]);
    setTimeout(() => setList((l) => l.filter((x) => x.id !== t.id)), 3200);
  }, []);
  const icon = (k: Toast['kind']) => (k === 'ok' ? '✅' : k === 'err' ? '⚠️' : '🔔');
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts">{list.map((t) => <div key={t.id} className={`toast ${t.kind}`}><span>{icon(t.kind)}</span><span>{t.msg}</span></div>)}</div>
    </ToastCtx.Provider>
  );
}

/* ---------- confirm dialog ---------- */
type ConfirmOpts = { title: string; body?: string; okText?: string };
const ConfirmCtx = createContext<(o: ConfirmOpts) => Promise<boolean>>(() => Promise.resolve(false));
export const useConfirm = () => useContext(ConfirmCtx);
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [req, setReq] = useState<{ o: ConfirmOpts; resolve: (v: boolean) => void } | null>(null);
  const ask = useCallback((o: ConfirmOpts) => new Promise<boolean>((resolve) => setReq({ o, resolve })), []);
  const done = (v: boolean) => { req?.resolve(v); setReq(null); };
  return (
    <ConfirmCtx.Provider value={ask}>
      {children}
      {req && (
        <div className="modal" onClick={() => done(false)}>
          <div className="sheet" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
            <h3>{req.o.title}</h3>
            {req.o.body && <p style={{ color: 'var(--muted)' }}>{req.o.body}</p>}
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button className="btn" style={{ flex: 1 }} onClick={() => done(false)}>Cancel</button>
              <button className="btn primary" style={{ flex: 1 }} onClick={() => done(true)}>{req.o.okText || 'Confirm'}</button>
            </div>
          </div>
        </div>
      )}
    </ConfirmCtx.Provider>
  );
}

/* ---------- building blocks ---------- */
export function Sheet({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  return (
    <div className="modal" onClick={onClose}>
      <div className="sheet" style={wide ? { maxWidth: 720 } : {}} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 6 }}>
          <h3 style={{ flex: 1, margin: 0 }}>{title}</h3>
          <button className="btn sm ghost" onClick={onClose}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}
export function PageHead({ title, emoji, children }: { title: string; emoji?: string; children?: ReactNode }) {
  return <div className="pagehead"><h2>{emoji ? `${emoji} ` : ''}{title}</h2>{children}</div>;
}
export function Stat({ icon, label, value, sub, tone }: { icon: string; label: string; value: string; sub?: string; tone?: 'accent' | 'red' | 'green' }) {
  return <div className={`card kpi ${tone || ''}`}><span className="ic">{icon}</span><br /><small>{label}</small><br /><b>{value}</b>{sub && <div className="sub">{sub}</div>}</div>;
}
export function Empty({ emoji, title, sub, action }: { emoji: string; title: string; sub?: string; action?: ReactNode }) {
  return <div className="empty"><span className="e">{emoji}</span><b>{title}</b>{sub && <div style={{ marginTop: 4 }}>{sub}</div>}<div style={{ marginTop: 12 }}>{action}</div></div>;
}
export function Skel({ n = 3 }: { n?: number }) {
  return <div>{Array.from({ length: n }).map((_, i) => <div key={i} className="skel" />)}</div>;
}
export function Avatar({ name, gold }: { name: string; gold?: boolean }) {
  return <div className={`avatar${gold ? ' gold' : ''}`}>{initials(name)}</div>;
}
export function QtyStepper({ qty, onChange, small }: { qty: number; onChange: (q: number) => void; small?: boolean }) {
  return (
    <div className="stepper">
      <button onClick={() => onChange(Math.max(0, qty - 1))} aria-label="decrease">−</button>
      <span>{qty}</span>
      <button onClick={() => onChange(qty + 1)} aria-label="increase">+</button>
    </div>
  );
}
export function Seg<T extends string>({ options, value, onChange }: { options: { v: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return <div className="seg">{options.map((o) => <button key={o.v} className={value === o.v ? 'on' : ''} onClick={() => onChange(o.v)}>{o.label}</button>)}</div>;
}
export function HBarChart({ data }: { data: { label: string; value: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const top = data.reduce((a, b, i) => (b.value > (data[a]?.value ?? -1) ? i : a), 0);
  return (
    <div>
      <div className="hbars">{data.map((d, i) => <div key={i} className={`hb${i === top ? ' top' : ''}`} style={{ height: `${Math.max(4, (d.value / max) * 100)}%` }} title={`${d.label}: ₹${d.value}`} />)}</div>
      <div className="hbar-x">{data.map((d, i) => <span key={i}>{d.label}</span>)}</div>
    </div>
  );
}
export function SplitBar({ parts }: { parts: { label: string; value: number; color: string }[] }) {
  const total = parts.reduce((s, p) => s + p.value, 0) || 1;
  return (
    <div>
      <div className="splitbar">{parts.filter((p) => p.value > 0).map((p, i) => <i key={i} style={{ width: `${(p.value / total) * 100}%`, background: p.color }} />)}</div>
      <div className="legend">{parts.map((p, i) => <span key={i}><span className="dot" style={{ background: p.color }} />{p.label} {rs(p.value)}</span>)}</div>
    </div>
  );
}
