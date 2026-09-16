// Bing-backed photo suggestions for a product. Human picks (guaranteed match).
// Pure parser (unit-tested) + fetch wrapper with timeouts. Best-effort: [] on any failure.
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

function parseBingHtml(raw) {
  const html = String(raw || '').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
  const out = [];
  const re = /\{"sid"[^}]*?"purl":"(.*?)".*?"murl":"(.*?)".*?"t":"(.*?)","mid"/g;
  let m;
  while ((m = re.exec(html)) && out.length < 10) {
    try {
      const purl = JSON.parse('"' + m[1] + '"');
      const murl = JSON.parse('"' + m[2] + '"');
      const title = JSON.parse('"' + m[3] + '"').slice(0, 90);
      if (/^https?:\/\//.test(murl)) out.push({ purl, murl, title });
    } catch {}
  }
  return out;
}

async function suggestImages(query, limit = 8) {
  try {
    const q = encodeURIComponent(String(query || '').slice(0, 80) + ' buy online');
    const res = await fetch('https://www.bing.com/images/search?q=' + q + '&form=HDRSC2', {
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return [];
    const html = await res.text();
    return parseBingHtml(html).slice(0, limit);
  } catch {
    return [];
  }
}

module.exports = { parseBingHtml, suggestImages };
