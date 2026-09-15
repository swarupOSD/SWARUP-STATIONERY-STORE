// Tiny delight engine: confetti + ka-ching + haptics. No assets, no deps.
// All effects respect user prefs (localStorage) + prefers-reduced-motion.

export const fxPrefs = {
  get sound() { try { return localStorage.getItem('fx-sound') !== 'off'; } catch { return true; } },
  get buzz() { try { return localStorage.getItem('fx-buzz') !== 'off'; } catch { return true; } },
  set sound(v: boolean) { try { localStorage.setItem('fx-sound', v ? 'on' : 'off'); } catch {} },
  set buzz(v: boolean) { try { localStorage.setItem('fx-buzz', v ? 'on' : 'off'); } catch {} },
};

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export function buzz(pattern: number | number[] = 15) {
  try {
    if (!fxPrefs.buzz || reducedMotion()) return;
    navigator.vibrate?.(pattern);
  } catch {}
}

let audioCtx: AudioContext | null = null;
function tone(freq: number, t0: number, dur: number, vol = 0.12) {
  const Ctor = window.AudioContext || (window as any).webkitAudioContext;
  if (!Ctor) return;
  audioCtx = audioCtx || new Ctor();
  if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o.type = 'sine'; o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, audioCtx.currentTime + t0);
  g.gain.exponentialRampToValueAtTime(vol, audioCtx.currentTime + t0 + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + t0 + dur);
  o.connect(g); g.connect(audioCtx.destination);
  o.start(audioCtx.currentTime + t0); o.stop(audioCtx.currentTime + t0 + dur + 0.05);
}

/** Cash-register ka-ching: cha-ching! */
export function ching() {
  try {
    if (!fxPrefs.sound) return;
    tone(880, 0, 0.18);
    tone(1318.5, 0.09, 0.35);
  } catch {}
}

/** Soft pop for add-to-cart. */
export function pop() {
  try {
    if (!fxPrefs.sound) return;
    tone(660, 0, 0.08, 0.06);
  } catch {}
}

const CONFETTI_COLORS = ['#b8860b', '#8b0000', '#ffd97a', '#1e7e34', '#fff3d9', '#c0392b'];

/** Lightweight canvas confetti burst (red/gold festive). Auto-cleans. */
export function confetti(n = 90) {
  try {
    if (reducedMotion()) return;
    const c = document.createElement('canvas');
    c.className = 'confetti-layer';
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = innerWidth * dpr; c.height = innerHeight * dpr;
    document.body.appendChild(c);
    const ctx = c.getContext('2d');
    if (!ctx) { c.remove(); return; }
    ctx.scale(dpr, dpr);
    const parts = Array.from({ length: n }, () => ({
      x: innerWidth / 2 + (Math.random() - 0.5) * 120,
      y: innerHeight * 0.32,
      vx: (Math.random() - 0.5) * 11,
      vy: -Math.random() * 10 - 3,
      s: Math.random() * 7 + 4,
      r: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.3,
      col: CONFETTI_COLORS[(Math.random() * CONFETTI_COLORS.length) | 0],
      shape: Math.random() > 0.4 ? 'r' : 'c',
    }));
    let frames = 0;
    const tick = () => {
      frames++;
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      for (const p of parts) {
        p.x += p.vx; p.y += p.vy; p.vy += 0.32; p.vx *= 0.99; p.r += p.vr;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r);
        ctx.fillStyle = p.col; ctx.globalAlpha = Math.max(0, 1 - frames / 110);
        if (p.shape === 'r') ctx.fillRect(-p.s / 2, -p.s / 3, p.s, p.s * 0.66);
        else { ctx.beginPath(); ctx.arc(0, 0, p.s / 2.4, 0, 7); ctx.fill(); }
        ctx.restore();
      }
      if (frames < 115) requestAnimationFrame(tick);
      else c.remove();
    };
    requestAnimationFrame(tick);
  } catch {}
}

/** Celebrate a completed sale: confetti + ching + happy buzz. */
export function celebrateSale() {
  confetti();
  ching();
  buzz([20, 40, 20]);
}

/* Shopkeeper tips, rotated daily (bn + en mix). */
export const TIPS = [
  { bn: '💡 ধারের খাতা রোজ মিলিয়ে নিন — ছোট বাকি বড় হয়!', en: 'Match Khata dues daily — small dues grow big!' },
  { bn: '💡 কম দামের পেন ক্যাশ কাউন্টারের পাশে রাখুন — impulse sale বাড়ে।', en: 'Keep low-price pens near the counter — impulse sales grow.' },
  { bn: '💡 Flipkart bill এলে সাথে সাথে স্ক্যান করুন — স্টক কখনো মিলবে না নইলে।', en: 'Scan Flipkart bills the same day — or stock will never tally.' },
  { bn: '💡 যারা বাকি নেয়, তাদের WhatsApp reminder পাঠান — টাকা তাড়াতাড়ি আসে।', en: 'Send WhatsApp reminders to due customers — money comes faster.' },
  { bn: '💡 Dead-stock মাল সামনে রাখুন বা অফার দিন — আটকে থাকা টাকা ছাড়ান।', en: 'Push dead stock to the front or offer a deal — free stuck cash.' },
  { bn: '💡 দিন শেষে ক্যাশ মিলিয়ে Day Close করুন — ২ মিনিটের কাজ, মাসে হিসাব পরিষ্কার।', en: 'Tally cash and close the day — 2 minutes keeps the month clean.' },
  { bn: '💡 নতুন মাল এলে দাম ঠিক করে তবেই বিক্রি করুন — SET PRICE alert দেখুন।', en: 'Set sell prices before selling new stock — check SET PRICE alerts.' },
];
export function tipOfDay(seedKey = '') {
  const d = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  let h = 0;
  for (const ch of d + seedKey) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return TIPS[h % TIPS.length];
}
