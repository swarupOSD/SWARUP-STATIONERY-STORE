const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

const env = require('./config/env');
const { connectDB } = require('./config/db');
const User = require('./models/User');
const { Settings } = require('./models/Misc');
const Category = require('./models/Category');
const { errorHandler } = require('./middleware/common');

const app = express();
app.set('trust proxy', 1);
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: env.CLIENT_ORIGIN.split(',').map((s) => s.trim()).filter(Boolean) || '*', credentials: true }));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(mongoSanitize());
app.use(morgan('tiny'));
app.use(rateLimit({ windowMs: 60 * 1000, max: 300, standardHeaders: true }));

// local uploads static (dev fallback)
const upDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(upDir)) fs.mkdirSync(upDir, { recursive: true });
app.use('/uploads', express.static(upDir));

app.use('/api', require('./routes/public'));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api', require('./routes/catalog'));
app.use('/api/products', require('./routes/products'));
app.use('/api/sales', require('./routes/sales'));
app.use('/api/purchases', require('./routes/purchases'));
app.use('/api/customers', require('./routes/customers'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/invoices', require('./routes/invoices'));
app.use('/api/expenses', require('./routes/expenses'));
app.use('/api', require('./routes/misc'));

app.get('/', (req, res) => res.json({ name: 'Swarup Stationery Store API', ok: true }));

app.use((req, res) => res.status(404).json({ error: 'Not found.' }));
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[api-error]', err.message);
  const isUploadErr = err.message?.includes('Only PDF') || err.message?.includes('File too large') || err.code === 'LIMIT_FILE_SIZE';
  const status = err.status || (isUploadErr ? 400 : 500);
  res.status(status).json({ error: err.publicMessage || (isUploadErr || err.status ? err.message : 'Something went wrong. Please try again.') });
});

async function ensureSeed() {
  let s = await Settings.findOne({ key: 'shop' });
  if (!s) await Settings.create({ key: 'shop' });
  const count = await Category.countDocuments();
  if (!count) {
    await Category.insertMany(['Stationery','Grocery','Chocolate','Biscuits','Candy','Cold Drinks','Snacks','Cigarettes','Gutka','Tobacco','Mouth Freshener','Elachi','Personal Care','Household','Other'].map((n) => ({ name: n })));
  }
  const adminCount = await User.countDocuments({ role: 'ADMIN' });
  if (!adminCount) {
    if (!env.ADMIN_PASSWORD) {
      console.warn('[seed] No ADMIN_PASSWORD set — first admin NOT created. Set ADMIN_USERNAME/ADMIN_PASSWORD env.');
    } else {
      try {
        await User.create({ username: env.ADMIN_USERNAME.toLowerCase().trim(), name: env.ADMIN_NAME, passwordHash: await bcrypt.hash(env.ADMIN_PASSWORD, 10), role: 'ADMIN', permissions: ['*'] });
        console.log(`[seed] Admin "${env.ADMIN_USERNAME}" created.`);
      } catch (e) {
        if (e.code === 11000) console.log('[seed] Admin already exists (concurrent boot) — continuing.');
        else throw e;
      }
    }
  }
}

const PORT = env.PORT;
if (require.main === module) {
  connectDB().then(ensureSeed).then(() => {
    app.listen(PORT, '0.0.0.0', () => console.log(`[api] listening on 0.0.0.0:${PORT}`));
  }).catch((e) => { console.error('[db] failed', e.message); process.exit(1); });
}

module.exports = app;
