const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

function fontPaths() {
  const candidates = [
    path.join(__dirname, '..', '..', 'assets', 'fonts', 'NotoSansBengali-Full.ttf'),
    path.join(__dirname, '..', '..', 'assets', 'fonts', 'NotoSansBengali-Regular.ttf'),
    path.join(__dirname, '..', '..', 'assets', 'fonts', 'NotoSans-Regular.ttf'),
    '/usr/share/fonts/truetype/noto/NotoSansBengali-Regular.ttf',
    'C:\\Windows\\Fonts\\Nirmala.ttf',
  ];
  return candidates.filter((p) => { try { return fs.existsSync(p); } catch { return false; } });
}

function baseDoc(title) {
  const doc = new PDFDocument({ size: 'A4', margin: 40 });
  const fonts = fontPaths();
  if (fonts[0]) { try { doc.registerFont('body', fonts[0]); doc.font('body'); } catch {} }
  return doc;
}

function header(doc, settings, subtitle) {
  doc.fontSize(16).fillColor('#8B0000').text('🪔 Swarup Stationery Store', { align: 'center' });
  if (settings?.address) doc.fontSize(9).fillColor('#333').text(settings.address, { align: 'center' });
  if (settings?.phone) doc.fontSize(9).text('Phone: ' + settings.phone, { align: 'center' });
  doc.moveDown(0.3);
  doc.fillColor('#B8860B').text('─'.repeat(60), { align: 'center' });
  doc.moveDown(0.3);
  if (subtitle) doc.fontSize(12).fillColor('#222').text(subtitle, { align: 'center' });
  doc.moveDown(0.5);
  doc.fillColor('#000');
}

function table(doc, rows, cols) {
  // rows: array of arrays; cols: widths
  const startX = doc.x;
  rows.forEach((r, i) => {
    let x = startX;
    r.forEach((cell, j) => {
      doc.fontSize(9).text(String(cell), x, doc.y, { width: cols[j], continued: false });
      x += cols[j];
    });
    doc.moveDown(0.4);
    if (i === 0) { doc.moveTo(startX, doc.y).lineTo(555, doc.y).strokeColor('#B8860B').stroke(); }
  });
}

function footer(doc, settings) {
  doc.moveDown(1);
  doc.fillColor('#B8860B').text('─'.repeat(60), { align: 'center' });
  doc.fontSize(9).fillColor('#333').text(settings?.receiptFooter || 'Thank you! Visit again. ধন্যবাদ!', { align: 'center' });
}

function sendPdf(res, filename, build) {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  const doc = baseDoc(filename);
  doc.pipe(res);
  build(doc);
  doc.end();
}

module.exports = { baseDoc, header, table, footer, sendPdf, fontPaths };
