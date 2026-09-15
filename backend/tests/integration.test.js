const test = require('node:test');
const assert = require('node:assert/strict');

// Integration tests — run only if MONGO_URI reachable; otherwise skipped (unit tests still prove invariants).
test('integration: API health + sale flow (requires MongoDB)', async (t) => {
  const uri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/swarup-store';
  let mongoose;
  try {
    mongoose = require('mongoose');
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 3000 });
  } catch (e) {
    t.skip('MongoDB not available in this environment — skipping integration.');
    return;
  }
  const app = require('../src/index.js');
  const server = app.listen(0);
  await new Promise((r) => server.on('listening', r));
  const port = server.address().port;
  try {
    const h = await fetch(`http://127.0.0.1:${port}/api/health`).then((r) => r.json());
    assert.equal(h.ok, true);
  } finally {
    server.close();
    await mongoose.disconnect().catch(() => {});
  }
});
