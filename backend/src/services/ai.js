// Gemini via REST (no SDK needed) with strict JSON validation + heuristic fallback.
// Never trust AI IDs blindly; match against real DB products in routes.
const env = require('../config/env');

async function geminiJson(prompt, fallback) {
  if (!env.GEMINI_API_KEY) return { ok: false, reason: 'ai-not-configured', data: fallback ?? null };
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${env.GEMINI_API_KEY}`;
    const res = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt + '\n\nRespond with STRICT JSON only. No markdown.' }] }], generationConfig: { temperature: 0.1 } }),
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return { ok: false, reason: `ai-http-${res.status}`, data: fallback ?? null };
    const j = await res.json();
    const text = j?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
    const cleaned = text.replace(/```json|```/g, '').trim();
    const start = cleaned.indexOf('{') !== -1 && cleaned.indexOf('[') !== -1 ? Math.min(cleaned.indexOf('{'), cleaned.indexOf('[')) : Math.max(cleaned.indexOf('{'), cleaned.indexOf('['));
    const end = Math.max(cleaned.lastIndexOf('}'), cleaned.lastIndexOf(']'));
    if (start < 0 || end < 0) return { ok: false, reason: 'ai-bad-json', data: fallback ?? null };
    return { ok: true, data: JSON.parse(cleaned.slice(start, end + 1)) };
  } catch (e) {
    return { ok: false, reason: 'ai-error', data: fallback ?? null };
  }
}

// Heuristic Bengali+English voice parse fallback: "2 kopiko, 5 lozenge, 3 pen"
const BN_NUM = { 'এক': 1, 'দুই': 2, 'দুটো': 2, 'দুটি': 2, 'তিন': 3, 'তিনটে': 3, 'তিনটি': 3, 'চার': 4, 'চারটে': 4, 'পাঁচ': 5, 'পাঁচটা': 5, 'ছয়': 6, 'সাত': 7, 'আট': 8, 'নয়': 9, 'দশ': 10 };
function heuristicVoiceParse(text) {
  const items = [];
  const parts = String(text).split(/[,;।]| আর | and /i);
  for (const p of parts) {
    const m = p.match(/(\d+|[একদুইতিনচারপাঁচছয়সাতআটনয়দশ]+[টোটিাতেখানাগুলো]*)\s*([^\d.,]+)/);
    if (!m) continue;
    let qty = parseInt(m[1], 10);
    if (Number.isNaN(qty)) {
      const key = Object.keys(BN_NUM).find((k) => m[1].includes(k));
      qty = key ? BN_NUM[key] : 1;
      const d = m[1].match(/\d+/);
      if (d) qty = parseInt(d[0], 10);
    }
    const name = m[2].replace(/(টা|টে|টি|টা|খানা|পিস|গুলো)/g, '').trim();
    if (name) items.push({ name, qty: qty || 1 });
  }
  return items;
}

async function parseVoiceSale(text) {
  const prompt = `Parse this shopkeeper voice note (Bengali/English/mixed) into items: "${text}". Schema: {"items":[{"name":string,"qty":number}]}. Only product names and quantities. Never invent prices.`;
  const ai = await geminiJson(prompt, null);
  if (ai.ok && Array.isArray(ai.data?.items)) {
    const items = ai.data.items.filter((i) => i?.name && Number(i.qty) > 0).map((i) => ({ name: String(i.name), qty: Number(i.qty) }));
    if (items.length) return { ok: true, source: 'ai', items };
  }
  const items = heuristicVoiceParse(text);
  return { ok: items.length > 0, source: ai.ok ? 'ai' : 'heuristic', items, warning: items.length ? undefined : 'Could not understand. Please review manually.' };
}

async function extractInvoiceText(rawText) {
  const prompt = `Extract invoice fields from this bill text: """${String(rawText).slice(0, 12000)}""". Schema: {"supplier":string,"invoiceNumber":string,"orderNumber":string,"invoiceDate":string,"paymentStatus":string,"items":[{"name":string,"qty":number,"unitPrice":number,"lineTotal":number}],"subtotal":number,"discount":number,"tax":number,"shipping":number,"grandTotal":number,"paid":number,"due":number}. Missing => "" or 0. Never invent.`;
  const ai = await geminiJson(prompt, null);
  if (ai.ok && ai.data) return { ok: true, source: 'ai', data: ai.data };
  // regex fallback: lines like "Pen 10 x 8 = 80"
  const items = [];
  const lines = String(rawText).split('\n');
  for (const ln of lines) {
    const m = ln.match(/(.+?)\s+(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)\s*=\s*(\d+(?:\.\d+)?)/);
    if (m) items.push({ name: m[1].trim(), qty: Number(m[2]), unitPrice: Number(m[3]), lineTotal: Number(m[4]) });
  }
  return { ok: items.length > 0, source: 'heuristic', data: { supplier: '', invoiceNumber: '', orderNumber: '', invoiceDate: '', paymentStatus: '', items, subtotal: 0, discount: 0, tax: 0, shipping: 0, grandTotal: 0, paid: 0, due: 0 }, warning: 'AI unavailable — heuristic parse, please review carefully.' };
}

function validateInvoiceMath(inv) {
  const issues = [];
  for (const it of inv.items || []) {
    const expected = Number((Number(it.qty) * Number(it.unitPrice)).toFixed(2));
    if (Math.abs(expected - Number(it.lineTotal)) > 0.51) issues.push(`Line "${it.name}": ${it.qty}×${it.unitPrice}=${expected} but bill says ${it.lineTotal}`);
  }
  const sum = (inv.items || []).reduce((s, i) => s + Number(i.lineTotal || 0), 0);
  const expected = Number((sum + Number(inv.tax || 0) + Number(inv.shipping || 0) - Number(inv.discount || 0)).toFixed(2));
  if (inv.grandTotal && Math.abs(expected - Number(inv.grandTotal)) > 1) issues.push(`Bill total mismatch: lines ${sum} + tax ${inv.tax} + ship ${inv.shipping} − disc ${inv.discount} = ${expected}, bill says ${inv.grandTotal}`);
  return issues;
}

function suggestTemplate(name = '') {
  const n = name.toLowerCase();
  if (/cigarette.*(packet|pack)|packet.*cigar/.test(n)) return { category: 'Cigarettes', unit: 'packet', packSize: 10 };
  if (/cigar/.test(n)) return { category: 'Cigarettes', unit: 'cigarette', packSize: 1 };
  if (/gutka|gutkha|tobacco/.test(n)) return { category: 'Gutka', unit: 'pouch', packSize: 1 };
  if (/elachi|elaichi|cardamom|mouth|freshener|saunf/.test(n)) return { category: 'Mouth Freshener', unit: 'packet', packSize: 1 };
  if (/choco|kopiko|lozenge|candy|lolly|toff/.test(n)) return { category: 'Chocolate', unit: 'piece', packSize: 1 };
  if (/biscuit|cookie|parle|britannia/.test(n)) return { category: 'Biscuits', unit: 'packet', packSize: 1 };
  if (/cold|drink|coke|sprite|frooti|maaza|bottle|soda|juice/.test(n)) return { category: 'Cold Drinks', unit: 'bottle', packSize: 1 };
  if (/pen|pencil|copy|notebook|book|eraser|sharp|scale|paper|ink/.test(n)) return { category: 'Stationery', unit: 'piece', packSize: 1 };
  if (/soap|shampoo|oil|cream|paste|brush|detergent/.test(n)) return { category: 'Personal Care', unit: 'piece', packSize: 1 };
  if (/rice|dal|atta|sugar|salt|oil|grocery/.test(n)) return { category: 'Grocery', unit: 'packet', packSize: 1 };
  return { category: 'Other', unit: 'piece', packSize: 1 };
}

module.exports = { geminiJson, parseVoiceSale, extractInvoiceText, validateInvoiceMath, suggestTemplate };
