// Shared: apply a purchase's stock increase exactly once per line with ledger entries.
// Used by invoice-commit. (Manual purchase route keeps its own equivalent logic.)
const Product = require('../models/Product');
const StockMovement = require('../models/StockMovement');

async function applyPurchaseStock({ items = [], ref = '', purchaseId = '', date, time, username = '' }) {
  let lines = 0, units = 0;
  for (const it of items) {
    if (!it.productId) continue;
    const p = await Product.findById(it.productId);
    if (!p) continue;
    const addBase = Math.max(0, Math.round(Number(it.baseQty || it.qty || 0)));
    if (!addBase) continue;
    const before = p.stock, after = before + addBase;
    p.stock = after;
    if (Number(it.sellingPrice) > 0 && p.needsPricing) {
      // keep shopkeeper-confirmed price; auto price only fills gaps elsewhere
    }
    await p.save();
    await StockMovement.create({
      productId: p._id, productName: p.name, type: 'PURCHASE',
      quantityDelta: addBase, before, after,
      reference: ref, referenceId: String(purchaseId || ''),
      reason: `Purchase ${ref}`, date, time, user: username,
    });
    lines += 1; units += addBase;
  }
  return { lines, units };
}

module.exports = { applyPurchaseStock };
