const { Counter } = require('../models/Misc');

async function nextReceiptNumber(session = null) {
  const year = new Intl.DateTimeFormat('en', { timeZone: 'Asia/Kolkata', year: 'numeric' }).format(new Date());
  const key = `receipt-${year}`;
  const opts = { new: true, upsert: true };
  if (session) opts.session = session;
  const doc = await Counter.findOneAndUpdate({ name: key }, { $inc: { seq: 1 } }, opts);
  const seq = String(doc.seq).padStart(6, '0');
  return `SS-${year}-${seq}`;
}

async function nextPurchaseRef(session = null) {
  const year = new Intl.DateTimeFormat('en', { timeZone: 'Asia/Kolkata', year: 'numeric' }).format(new Date());
  const key = `purchase-${year}`;
  const opts = { new: true, upsert: true };
  if (session) opts.session = session;
  const doc = await Counter.findOneAndUpdate({ name: key }, { $inc: { seq: 1 } }, opts);
  return `PUR-${year}-${String(doc.seq).padStart(6, '0')}`;
}

module.exports = { nextReceiptNumber, nextPurchaseRef };
