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
    .replace(/\[?HSN\s*:?\s*\d+\]?/gi, ' ')
    .replace(/\b\d{6,10}\b/g, ' ') // bare HSN-style codes
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
  const dbg = { chars: text.length, lines: lines.length, headerFound: false, rowsSeen: 0, rowsMatched: 0 };
  const MONEYS = '((?:[\\d,]+\\.\\d{2}\\s*){1,5})';
  const wideRow = new RegExp(`^(.+?)\\s{2,}(\\d{1,5}(?:\\.\\d+)?)\\s+${MONEYS}$`);
  const looseLine = /^(.+?)\s+(\d{1,5}(?:\.\d+)?)\s*[x×]\s*([\d,]+\.\d{2})(?:\s*=\s*([\d,]+\.\d{2}))?\s*$/i;
  const tableRow = new RegExp(`^(.{6,}?)\\s+(\\d{1,5}(?:\\.\\d+)?)\\s+${MONEYS}$`); // single-space, in-table only
  const SKIP = /^(total|grand|subtotal|taxable|tax|gst|sgst|cgst|igst|shipping|delivery|discount|round|net|invoice|order|amount|balance|payable|qty|quantity|sl|serial|description|product|item|particulars|hsn|rate)\b/i;

  // join wrapped product names: text-only line followed by a qty+amounts row
  const rowAhead = (s) => /\d{1,5}(?:\.\d+)?\s+[^]*?[\d,]+\.\d{2}[^]*?[\d,]+\.\d{2}/.test(s.replace(/₹|Rs\.?/gi, ''));
  const flow = [];
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i], nx = lines[i + 1] || '';
    const texty = /[A-Za-z\u0980-\u09FF]{4,}/.test(ln) && !/[\d,]+\.\d{2}/.test(ln) && ln.length < 140 && !SKIP.test(ln);
    if (texty && rowAhead(nx)) { flow.push(ln + '  ' + nx); i++; }
    else flow.push(ln);
  }

  let inTable = false;
  for (const raw of flow) {
    const ln = raw.replace(/₹|Rs\.?/gi, '').replace(/ {3,}/g, '  ');
    if (/description|particulars|product details|item details|sl\.?\s*no.*qty|serial.*qty|hsn.*qty/i.test(ln)) { inTable = true; dbg.headerFound = true; continue; }
    if (/^(total|grand total|subtotal|taxable|amount payable|net amount|round off)/i.test(ln)) { inTable = false; continue; }
    let m = ln.match(wideRow);
    let explicitRate = false;
    if (!m) { m = ln.match(looseLine); explicitRate = !!m; }
    if (!m && inTable) m = ln.match(tableRow);
    if (!m) continue;
    const name = cleanName(m[1]);
    if (name.length < 3 || SKIP.test(name)) continue;
    const qtyRaw = Number(m[2]);
    const qty = Math.round(qtyRaw);
    const amounts = (explicitRate ? [m[3], m[4]] : (m[3] || '').match(/[\d,]+\.\d{2}/g) || []).map(money).filter(Number.isFinite);
    dbg.rowsSeen += 1;
    if (!amounts.length) continue;
    // last money on the row is the line total (rows may include discount/tax columns)
    const total = explicitRate && amounts.length === 1 ? Math.round(qty * amounts[0] * 100) / 100 : amounts[amounts.length - 1];
    // Flipkart tables show gross/taxable amounts, not unit rate → derive rate from total
    const rate = explicitRate
      ? (m[4] !== undefined ? money(m[3]) : amounts[0])
      : (Number.isFinite(total) && qty > 0 ? Math.round((total / qty) * 100) / 100 : NaN);
    if (!(qty > 0) || !Number.isFinite(rate) || !Number.isFinite(total)) { notes.push(`Skipped unclear row: "${raw.slice(0, 80)}"`); continue; }
    dbg.rowsMatched += 1;
    items.push({ name, qty, unitPrice: Math.round(rate * 100) / 100, lineTotal: Math.round(total * 100) / 100 });
  }
  if (!items.length) {
    notes.push(dbg.rowsSeen
      ? `${dbg.rowsSeen} number-rows seen but none looked like products — the layout may be unusual.`
      : 'No item rows recognised. If this is a photo/scanned bill (no selectable text), paste the bill text and upload again.');
  }

  // --- totals ---
  const grab = (re) => {
    const m = joined.match(re);
    return m ? money(m[m.length - 1]) : NaN;
  };
  let grandTotal = grab(/(?:Grand\s*Total|Net\s*Amount|Invoice\s*(?:Value|Total|Amount)|Amount\s*Payable|Payable\s*Amount|Total\s*(?:Amount|Value|Rs\.?))\s*[:\-]?\s*[₹Rs.\s]*([\d,]+\.\d{2})/i);
  const itemsSum = Math.round(items.reduce((s, i) => s + i.lineTotal, 0) * 100) / 100;
  if (!Number.isFinite(grandTotal)) { grandTotal = itemsSum; notes.push('Grand total not found — using sum of items.'); }
  const tqM = joined.match(/Total\s*Qty\s*[:\-]?\s*(\d+)/i);
  if (tqM) {
    const tq = Number(tqM[1]), iq = items.reduce((s, i) => s + i.qty, 0);
    if (tq !== iq) notes.push(`Bill says total qty ${tq} but ${iq} recognised — some rows may be missed. Review below.`);
  }
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
    paymentStatus: 'Paid', notes, debug: dbg,
  };
}

module.exports = { extractPdfText, isFlipkart, parseFlipkart, cleanName, money, toISODate };
