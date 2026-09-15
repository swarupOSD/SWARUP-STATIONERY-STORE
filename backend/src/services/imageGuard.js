const { request } = require('undici');
const dns = require('dns').promises;
const net = require('net');

const MAX_BYTES = 5 * 1024 * 1024;
const TIMEOUT_MS = 8000;
const ALLOWED_MIME = new Set(['image/jpeg','image/png','image/webp','image/gif','image/avif','image/svg+xml','image/bmp']);

function isPrivateIP(ip) {
  if (net.isIP(ip) === 4) {
    const [a, b] = ip.split('.').map(Number);
    if (a === 10) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 127) return true;
    if (a === 0) return true;
    return false;
  }
  if (net.isIP(ip) === 6) {
    const l = ip.toLowerCase();
    return l === '::1' || l.startsWith('fc') || l.startsWith('fd') || l.startsWith('fe80');
  }
  return true;
}

async function assertSafeUrl(raw) {
  let u;
  try { u = new URL(raw); } catch { const e = new Error('Invalid image URL.'); e.status = 400; e.publicMessage = 'That image URL is invalid. Try another URL, upload, or camera.'; throw e; }
  if (!['http:','https:'].includes(u.protocol)) { const e = new Error('bad protocol'); e.status = 400; e.publicMessage = 'Only http(s) image URLs are allowed.'; throw e; }
  if (!u.hostname || u.hostname === 'localhost') { const e = new Error('bad host'); e.status = 400; e.publicMessage = 'That image URL host is not allowed.'; throw e; }
  const addrs = await dns.lookup(u.hostname, { all: true }).catch(() => []);
  for (const a of addrs) {
    if (isPrivateIP(a.address)) { const e = new Error('private host'); e.status = 400; e.publicMessage = 'That image URL host is not allowed.'; throw e; }
  }
  return u;
}

// Resolve Google Images page URLs best-effort: if URL is not a direct image, try to detect og:image
async function previewImageUrl(raw) {
  const u = await assertSafeUrl(raw);
  const lower = u.pathname.toLowerCase();
  const looksImage = /\.(jpe?g|png|webp|gif|avif|bmp|svg)(\?|$)/.test(lower) || u.hostname.includes('images.unsplash') || u.hostname.includes('cloudinary');
  const res = await request(u.toString(), { method: 'HEAD', headersTimeout: TIMEOUT_MS, bodyTimeout: TIMEOUT_MS, maxRedirections: 3 }).catch(() => null);
  const ct = res?.headers?.['content-type']?.split(';')[0]?.trim() || '';
  const len = parseInt(res?.headers?.['content-length'] || '0', 10);
  if (ct.startsWith('image/')) {
    if (len && len > MAX_BYTES) { const e = new Error('too big'); e.status = 400; e.publicMessage = 'Image is too large (max 5MB).'; throw e; }
    return { ok: true, resolvedUrl: u.toString(), contentType: ct, contentLength: len || 0, direct: true };
  }
  if (looksImage) return { ok: true, resolvedUrl: u.toString(), contentType: ct || 'image/jpeg', contentLength: len || 0, direct: true };
  // Try GET page and parse og:image (bounded)
  try {
    const g = await request(u.toString(), { method: 'GET', headersTimeout: TIMEOUT_MS, bodyTimeout: TIMEOUT_MS, maxRedirections: 3 });
    const gct = g.headers?.['content-type'] || '';
    if (String(gct).includes('image/')) return { ok: true, resolvedUrl: u.toString(), contentType: String(gct).split(';')[0], contentLength: 0, direct: true };
    if (!String(gct).includes('text/html')) return { ok: false, reason: 'not-image', hint: 'That link is a Google search page, not a direct image. Open the image and copy the direct image address, or upload.' };
    let html = '';
    for await (const chunk of g.body) {
      html += chunk.toString('utf8');
      if (html.length > 200000) break;
    }
    const m = html.match(/<meta[^>]+property=["']og:image["'][^>]*content=["']([^"']+)["']/i) || html.match(/<img[^>]+src=["'](https?:[^"']+\.(?:jpe?g|png|webp|gif))["']/i);
    if (m && m[1]) {
      try { await assertSafeUrl(m[1]); return { ok: true, resolvedUrl: m[1], contentType: 'image/jpeg', contentLength: 0, direct: false }; } catch { /* fallthrough */ }
    }
    return { ok: false, reason: 'not-image', hint: 'Image could not be detected. Use a direct image URL, upload, or camera.' };
  } catch {
    return { ok: false, reason: 'fetch-failed', hint: 'Image could not be loaded. Try another URL, upload, or camera.' };
  }
}

module.exports = { previewImageUrl, MAX_BYTES };
