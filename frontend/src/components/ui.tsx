import { useEffect, useState } from 'react';

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
  return <div className="clock"><div style={{ fontSize: 22, fontWeight: 800 }}>{time} IST</div><div style={{ fontSize: 13 }}>{date} • {day}</div></div>;
}

export function Img({ src, alt }: { src?: string; alt: string }) {
  const [err, setErr] = useState(false);
  if (!src || err) return <div style={{ height: 110, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5ead0', fontSize: 34 }}>📚</div>;
  return <img src={src} alt={alt} loading="lazy" onError={() => setErr(true)} />;
}
