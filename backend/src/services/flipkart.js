// Flipkart GST-invoice PDF parsing + generic PDF text extraction.
// Pure functions (unit-tested) + one buffered pdf-parse wrapper.
const money = (s) => {
  if (s == null) return NaN;
  const cleaned = String(s).replace(/[^0-9,.\-]/g, '').replace(/,/g, '');
  const m = cleaned.match(/-?\d+(\.\d{1,2})?/);
  return m ? Number(m[0]) : NaN;
};

async function extractPdfText(buffer, maxPages = 6) {
  try {
    const mod = require('pdf-parse');
    if (typeof mod === 'function') {
      // pdf-parse v1
      const data = await mod(buffer, { max: maxPages });
      return (data.text || '').replace(/\r/g, '').slice(0, 60000);
    }
    if (mod.PDFParse) {
      // pdf-parse v2+
      const parser = new mod.PDFParse({ data: buffer });
      const data = await parser.getText();
      const text = data && typeof data === 'object' ? (data.text || data.total || '') : String(data || '');
      await parser.destroy().catch(() => {});
      return String(text).replace(/\r/g, '').slice(0, 60000);
    }
    return '';
  } catch {
    return '';
  }
}

function isFlipkart(text = '') {
  const t = text.toLowerCase();
  return t.includes('flipkart') && (/order\s*(id|no)/.test(t) || /invoice\s*(no|number|date)/.test(t));
}

function cleanName(s = '') {
  return String(s)
    .replace(/\[?HSN\s*:?\s*\d+\]?/gi, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\d.\-)\s]+/, '')
    .trim()
    .slice(0, 120);
}

function toISODate(s = '') {
  // accepts DD-MM-YYYY, DD/MM/YYYY, DD-MM-YY
  const m = String(s).match(/(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})/);
  if (!m) return '';
  let [, d, mo, y] = m;
  if (y.length === 2) y = '20' + y;
  return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

function parseFlipkart(text = '') {
  const notes = [];
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const joined = lines.join('\n');

  const invM = joined.match(/Invoice\s+(No\.?|Number|#)\s*[:\-]?\s*([A-Z0-9][A-Z0-9\-/]{3,})/i)
    || joined.match(/\bInvoice\s*[:\-]\s*([A-Z0-9][A-Z0-9\-/]{3,})/i);
  const invNum = invM ? (invM[2] || invM[1]).trim() : '';
  const ordM = joined.match(/Order\s*(ID|No|Number)?\s*[:\-]?\s*(OD\d{8,})/i);
  const dateM = joined.match(/Invoice\s*Date\s*[:\-]?\s*(\d{1,2}[-/]\d{1,2}[-/]\d{2,4})/i)
    || joined.match(/Date\s*of\s*Invoice\s*[:\-]?\s*(\d{1,2}[-/]\d{1,2}[-/]\d{2,4})/i);

  const invoiceNumber = invNum;
  const orderNumber = ordM ? ordM[2].trim() : '';
  const invoiceDate = dateM ? toISODate(dateM[1]) : '';
  if (!invoiceNumber) notes.push('Invoice number not found — check the PDF.');
  if (!orderNumber) notes.push('Order ID not found — duplicate check will use invoice number only.');

  // --- line items: rows containing name + qty + amounts ---
  const items = [];
  const itemLine = /^(.+?)\s{2,}(\d{1,4})\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})(?:\s+([\d,]+\.\d{2}))?\s*$/;
  const looseLine = /^(.+?)\s+(\d{1,4})\s*[x×]\s*([\d,]+\.\d{2})(?:\s*=\s*([\d,]+\.\d{2}))?\s*$/i;
  // single-space rows only trusted inside the detected item table (PDF extractors vary)
  const tableLine = /^(.{6,}?)\s+(\d{1,4})\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})(?:\s+([\d,]+\.\d{2}))?\s*$/;
  let inTable = false;
  for (const ln of lines) {
    if (/description of goods|product.*qty|sl\.?\s*no/i.test(ln)) { inTable = true; continue; }
    if (/^(total|grand total|subtotal|taxable|amount payable|round off)/i.test(ln)) { inTable = false; continue; }
    let m = ln.match(itemLine);
    let explicitRate = false;
    if (!m) { m = ln.match(looseLine); explicitRate = !!m; }
    if (!m && inTable) m = ln.match(tableLine);
    if (!m) continue;
    const name = cleanName(m[1]);
    if (name.length < 3 || /^(total|gst|sgst|cgst|igst|shipping|discount|round)/i.test(name)) continue;
    const qty = Number(m[2]);
    // last money group on the row is the line total (rows may include a discount column)
    let total = NaN;
    for (let g = 5; g >= 4; g--) { if (m[g] !== undefined) { total = money(m[g]); break; } }
    if (!Number.isFinite(total)) total = explicitRate && Number.isFinite(money(m[3])) ? Math.round(qty * money(m[3]) * 100) / 100 : NaN;
    // Flipkart tables show gross/taxable amounts, not unit rate → derive rate from total
    const rate = explicitRate ? money(m[3]) : (Number.isFinite(total) && qty > 0 ? Math.round((total / qty) * 100) / 100 : NaN);
    if (!Number.isFinite(total)) total = Math.round(qty * rate * 100) / 100;
    if (!(qty > 0) || !Number.isFinite(rate)) { notes.push(`Skipped unclear row: "${ln.slice(0, 80)}"`); continue; }
    items.push({ name, qty, unitPrice: Math.round(rate * 100) / 100, lineTotal: Math.round(total * 100) / 100 });
  }
  if (!items.length) notes.push('No item rows recognised — Jumlah? Check that this is a text (not scanned-image) PDF.');

  // --- totals ---
  const grab = (re) => {
    const m = joined.match(re);
    return m ? money(m[m.length - 1]) : NaN;
  };
  let grandTotal = grab(/(?:Grand\s*Total|Invoice\s*(?:Value|Total)|Amount\s*Payable|Total\s*Amount)\s*[:\-]?\s*[₹Rs.\s]*([\d,]+\.\d{2})/i);
  const itemsSum = Math.round(items.reduce((s, i) => s + i.lineTotal, 0) * 100) / 100;
  if (!Number.isFinite(grandTotal)) { grandTotal = itemsSum; notes.push('Grand total not found — using sum of items.'); }
  let tax = grab(/Total\s*Tax\s*[:\-]?\s*[₹Rs.\s]*([\d,]+\.\d{2})/i);
  if (!Number.isFinite(tax)) {
    const gst = [...joined.matchAll(/(?:IGST|CGST|SGST)[^\d]*([\d,]+\.\d{2})/gi)].map((x) => money(x[1])).filter(Number.isFinite);
    tax = gst.length ? Math.round(gst.reduce((a, b) => a + b, 0) * 100) / 100 : 0;
  }
  let shipping = grab(/Shipping\s*(?:Charges?|Fee)?\s*[:\-]?\s*[₹Rs.\s]*([\d,]+\.\d{2})/i);
  if (!Number.isFinite(shipping)) shipping = 0;
  let discount = grab(/(?:Total\s*)?Discount\s*[:\-]?\s*[₹Rs.\s]*([\d,]+\.\d{2})/i);
  if (!Number.isFinite(discount)) discount = 0;

  return {
    supplier: 'Flipkart', invoiceNumber, orderNumber, invoiceDate,
    items, subtotal: itemsSum, tax, shipping, discount,
    grandTotal: Math.round(grandTotal * 100) / 100,
    paid: Math.round(grandTotal * 100) / 100, due: 0,
    paymentStatus: 'Paid', notes,
  };
}

module.exports = { extractPdfText, isFlipkart, parseFlipkart, cleanName, money, toISODate };
