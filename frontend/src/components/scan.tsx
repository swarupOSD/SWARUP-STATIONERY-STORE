import { useState } from 'react';
import api, { errMsg } from '../api/client';

export function Scanner({ onResult }: { onResult: (text: string) => void }) {
  const [open, setOpen] = useState(false);
  const [manual, setManual] = useState('');
  const [msg, setMsg] = useState('');

  const startCamera = async () => {
    setMsg('Starting camera…');
    try {
      // Prefer native BarcodeDetector
      const BD = (window as any).BarcodeDetector;
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      const video = document.createElement('video');
      video.srcObject = stream; await video.play();
      const wrap = document.getElementById('scan-video-wrap');
      wrap!.innerHTML = ''; wrap!.appendChild(video); video.style.width = '100%';
      if (BD) {
        const det = new BD({ formats: ['qr_code', 'ean_13', 'code_128', 'upc_a'] });
        const tick = async () => {
          try {
            const codes = await det.detect(video);
            if (codes?.[0]?.rawValue) {
              stream.getTracks().forEach((t) => t.stop());
              onResult(codes[0].rawValue); setOpen(false); return;
            }
          } catch {}
          if (document.getElementById('scan-video-wrap')?.contains(video)) requestAnimationFrame(tick);
          else stream.getTracks().forEach((t) => t.stop());
        };
        tick();
      } else {
        // dynamic zxing fallback
        try {
          const { BrowserMultiFormatReader } = await import('@zxing/browser').catch(() => ({ BrowserMultiFormatReader: null }) as any);
          if (!BrowserMultiFormatReader) { setMsg('Scanner not supported here — type barcode manually.'); stream.getTracks().forEach((t) => t.stop()); return; }
          const reader = new BrowserMultiFormatReader();
          await reader.decodeFromVideoDevice(undefined, video, (res: any) => {
            if (res?.getText?.()) { onResult(res.getText()); setOpen(false); try { reader.reset(); } catch {} stream.getTracks().forEach((t) => t.stop()); }
          });
        } catch { setMsg('Camera scan failed — type manually.'); }
      }
    } catch { setMsg('Camera blocked — type barcode manually.'); }
  };

  if (!open) return <button className="btn" onClick={() => setOpen(true)}>📷 Scan</button>;
  return (
    <div className="modal"><div className="sheet">
      <h3>Scan barcode / QR</h3>
      <div id="scan-video-wrap" />
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button className="btn gold" onClick={startCamera}>Start camera</button>
        <button className="btn" onClick={() => setOpen(false)}>Close</button>
      </div>
      {msg && <p>{msg}</p>}
      <label>Or type barcode / SKU</label>
      <div style={{ display: 'flex', gap: 8 }}>
        <input value={manual} onChange={(e) => setManual(e.target.value)} placeholder="SKU / barcode" />
        <button className="btn primary" onClick={() => { onResult(manual); setOpen(false); }}>Go</button>
      </div>
    </div></div>
  );
}

export function VoiceSale({ onParsed }: { onParsed: (items: any[]) => void }) {
  const [listening, setListening] = useState(false);
  const [err, setErr] = useState('');
  const start = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { setErr('Voice not supported on this browser.'); return; }
    const r = new SR();
    r.lang = 'bn-IN'; r.interimResults = false;
    setListening(true);
    r.onresult = async (e: any) => {
      const text = e.results[0][0].transcript;
      setListening(false);
      try {
        const { data } = await api.post('/api/ai/voice-parse', { text });
        onParsed(data.matched?.length ? data.matched : data.items);
      } catch (e2: any) { setErr(errMsg(e2)); }
    };
    r.onerror = () => { setListening(false); setErr('Could not hear. Try again.'); };
    r.start();
  };
  return <span><button className="btn" onClick={start}>{listening ? '🎤 Listening…' : '🎤 Voice Sale'}</button>{err && <small> {err}</small>}</span>;
}
