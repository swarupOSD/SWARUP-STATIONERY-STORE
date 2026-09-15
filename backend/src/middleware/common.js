const { AuditLog } = require('../models/Misc');

async function audit(user, action, entity = '', entityId = '', metadata = {}) {
  try {
    // never store passwords/secrets
    const safe = JSON.parse(JSON.stringify(metadata, (k, v) => {
      if (/password|secret|token|key/i.test(k)) return '[redacted]';
      return v;
    }));
    await AuditLog.create({ user: user?.username || user || 'system', userId: user?._id || null, action, entity, entityId: String(entityId || ''), metadata: safe });
  } catch (e) { /* audit must never break main flow */ }
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  console.error('[error]', err.message);
  const status = err.status || 500;
  res.status(status).json({ error: err.publicMessage || 'Something went wrong. Please try again.' });
}

module.exports = { audit, errorHandler };
