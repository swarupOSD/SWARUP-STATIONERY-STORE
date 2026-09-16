import { useEffect, useRef, useState } from 'react';
import api, { errMsg } from '../api/client';

export function Scanner({ onResult }: { onResult: (text: string) => void }) {
  const [open, setOpen] = useState(false);
  const [manual, setManual] = useState('');
  const [msg, setMsg] = useState('');
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [devId, setDevId] = useState('');
  const live = useRef<{ stream?: MediaStream; stop?: () => void }>({});
  const stopAll = () => {
    try { live.current.stop?.(); } catch {}
    try { live.current.stream?.getTracks().forEach((t) => t.stop()); } catch {}
    live.current = {};
  };
  useEffect(() => () => stopAll(), [open]);

  const openSheet = async () => {
    setMsg(''); setOpen(true);
    try {
      const devs = await navigator.mediaDevices?.enumerateDevices?.();
      const cams = (devs || []).filter((d) => d.kind === 'videoinput');
      setDevices(cams);
      const rear = cams.find((c) => /back|rear|environment/i.test(c.label));
      setDevId(rear?.deviceId || cams[0]?.deviceId || '');
    } catch {}
  };

  const startCamera = async () => {
    setMsg('Starting camera… (allow permission ↑)');
    stopAll();
    try {
      if (!navigator.mediaDevices?.getUserMedia) { setMsg('Ei browser-e camera support nei — niche type koro.'); return; }
      const stream = await navigator.mediaDevices.getUserMedia(devId ? { video: { deviceId: { exact: devId } } } : { video: { facingMode: 'environment' } });
      live.current.stream = stream;
      const video = document.createElement('video');
      video.muted = true; (video as any).playsInline = true;
      video.srcObject = stream; await video.play();
      const wrap = document.getElementById('scan-video-wrap');
      if (!wrap) { stopAll(); return; }
      wrap.innerHTML = ''; wrap.appendChild(video); video.style.width = '100%';
      setMsg('Barcode QR-er samne dharo…');
      const BD = (window as any).BarcodeDetector;
      if (BD) {
        let alive = true;
        live.current.stop = () => { alive = false; };
        let det: any = null;
        try { det = new BD({ formats: ['qr_code', 'ean_13', 'ean_8', 'code_128', 'code_39', 'upc_a', 'upc_e'] }); }
        catch { det = new BD(); }
        const tick = async () => {
          if (!alive) return;
          try {
            const codes = await det.detect(video);
            if (codes?.[0]?.rawValue) {
              const v = codes[0].rawValue; stopAll();
              onResult(v); setOpen(false); return;
            }
          } catch {}
          if (document.getElementById('scan-video-wrap')?.contains(video)) requestAnimationFrame(tick);
          else stopAll();
        };
        tick();
      } else {
        try {
          const { BrowserMultiFormatReader } = await import('@zxing/browser').catch(() => ({ BrowserMultiFormatReader: null }) as any);
          if (!BrowserMultiFormatReader) { setMsg('Scanner not supported here — type barcode manually.'); stopAll(); return; }
          const reader = new BrowserMultiFormatReader();
          live.current.stop = () => { try { reader.reset(); } catch {} };
          const track = stream.getVideoTracks()[0];
          const useId = devId || track?.getSettings?.()?.deviceId;
          await reader.decodeFromVideoDevice(useId || undefined, video, (res: any, err: any) => {
            if (err && err?.name !== 'NotFoundException') setMsg('Dekhte pachchhi na — alo/barcode thik koro…');
            if (res?.getText?.()) { const v = res.getText(); stopAll(); onResult(v); setOpen(false); }
          });
        } catch { setMsg('Camera scan failed — type manually.'); }
      }
    } catch (e: any) {
      const n = e?.name || '';
      if (n === 'NotAllowedError') setMsg('⛔ Camera permission dao (browser address-bar-er camera icon), tarpor abar try koro.');
      else if (n === 'NotFoundError' || n === 'OverconstrainedError') setMsg('📷 Camera pelam na — onno camera select koro ba type koro.');
      else if (n === 'NotReadableError') setMsg('📷 Camera onno app-e busy — bondho kore abar try koro.');
      else if (!window.isSecureContext) setMsg('🔒 Camera sudhu HTTPS/localhost-e chole.');
      else setMsg('Camera blocked — type barcode manually.');
    }
  };

  if (!open) return <button className="btn" onClick={openSheet}>📷 Scan</button>;
  return (
    <div className="modal"><div className="sheet">
      <h3>Scan barcode / QR</h3>
      <div id="scan-video-wrap" />
      {devices.length > 1 && (
        <><label>Camera</label>
        <select value={devId} onChange={(e) => setDevId(e.target.value)}>{devices.map((d, i) => <option key={d.deviceId || i} value={d.deviceId}>📷 {d.label || `Camera ${i + 1}`}</option>)}</select></>
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button className="btn gold" onClick={startCamera}>Start camera</button>
        <button className="btn" onClick={() => { stopAll(); setOpen(false); }}>Close</button>
      </div>
      {msg && <p>{msg}</p>}
      <label>Or type barcode / SKU</label>
      <div style={{ display: 'flex', gap: 8 }}>
        <input value={manual} onChange={(e) => setManual(e.target.value)} placeholder="SKU / barcode" />
        <button className="btn primary" onClick={() => { if (manual.trim()) { onResult(manual.trim()); setOpen(false); } }}>Go</button>
      </div>
    </div></div>
  );
}
export function VoiceSale({ onParsed }: { onParsed: (items: any[]) => void }) {
  const [listening, setListening] = useState(false);
  const [err, setErr] = useState('');
  const [heard, setHeard] = useState('');
  const [working, setWorking] = useState(false);
  const [lang, setLang] = useState('bn-IN');
  const rec = useRef<any>(null);
  const settled = useRef(false);
  useEffect(() => () => { try { rec.current?.abort(); } catch {} }, []);
  const start = () => {
    if (listening || working) return;
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { setErr('Ei browser-e voice nei — Chrome use koro.'); return; }
    setErr(''); setHeard('');
    const r = new SR();
    rec.current = r;
    settled.current = false;
    r.lang = lang; r.interimResults = true; r.maxAlternatives = 1;
    setListening(true);
    let finalText = '';
    r.onresult = (e: any) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText += t + ' ';
        else interim += t;
      }
      setHeard((finalText + interim).trim());
    };
    const finish = async (text: string) => {
      if (settled.current) return;
      settled.current = true;
      setListening(false);
      if (!text.trim()) { setErr('Kichu sunte pelam na — abar bolo.'); return; }
      setWorking(true);
      try {
        const { data } = await api.post('/api/ai/voice-parse', { text });
        const found = data.matched?.length ? data.matched : data.items;
        if (!found?.length) setErr(`Bujhlam: "${text}" — kintu product millo na. Nam bodle bolo.`);
        else onParsed(found);
      } catch (e2: any) { setErr(errMsg(e2)); } finally { setWorking(false); }
    };
    r.onend = () => { finish(finalText); };
    r.onerror = (e: any) => {
      if (settled.current) return;
      settled.current = true;
      setListening(false);
      const t = e?.error || '';
      if (t === 'not-allowed') setErr('⛔ Mic permission dao (address-bar icon), tarpor try koro.');
      else if (t === 'no-speech') setErr('Kichu sunte pelam na — jore bolo.');
      else if (t === 'network') setErr('📡 Net lagbe voice-er jonno.');
      else if (t !== 'aborted') setErr('Voice holo na — abar try koro.');
    };
    try { r.start(); } catch { setListening(false); }
  };
  const stop = () => { try { rec.current?.stop(); } catch {} };
  return (
    <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
      <button className="btn sm ghost" title="Voice language" onClick={() => setLang(lang === 'bn-IN' ? 'en-IN' : 'bn-IN')}>{lang === 'bn-IN' ? 'বাং' : 'EN'}</button>
      {!listening
        ? <button className="btn" onClick={start}>{working ? '⏳ Bhujchi…' : '🎤 Voice Sale'}</button>
        : <button className="btn primary" onClick={stop}>⏹ Stop — done bolo</button>}
      {err && <small style={{ color: 'var(--rose-tx)' }}> {err}</small>}
      {(listening || heard) && !err && <small style={{ color: 'var(--muted)' }}>🎧 "{heard || 'sun chi…'}"</small>}
    </span>
  );
}
