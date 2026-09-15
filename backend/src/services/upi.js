// UPI intent + QR helpers. No auto-confirmation: payment confirmation is manual unless gateway webhook exists.
const QRCode = require('qrcode');

function upiIntent({ upiId, name, amount, note = 'Swarup Stationery' }) {
  const am = Number(amount).toFixed(2);
  const params = new URLSearchParams({ pa: upiId, pn: name || 'Swarup Stationery Store', am, cu: 'INR', tn: String(note).slice(0, 80) });
  return `upi://pay?${params.toString()}`;
}

async function upiQrDataUrl(intent) {
  return QRCode.toDataURL(intent, { width: 280, margin: 1 });
}

module.exports = { upiIntent, upiQrDataUrl };
