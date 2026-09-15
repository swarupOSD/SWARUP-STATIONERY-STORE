const jwt = require('jsonwebtoken');
const env = require('../config/env');
const User = require('../models/User');

function signToken(user) {
  return jwt.sign({ id: user._id.toString(), role: user.role, username: user.username }, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN });
}

async function auth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Login required.' });
    const decoded = jwt.verify(token, env.JWT_SECRET);
    const user = await User.findById(decoded.id);
    if (!user || !user.active) return res.status(401).json({ error: 'Session expired. Please login again.' });
    req.user = user;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Session expired. Please login again.' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Login required.' });
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'Not permitted.' });
    next();
  };
}

function requirePerm(perm) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Login required.' });
    if (req.user.role === 'ADMIN') return next();
    const perms = req.user.permissions || [];
    if (perms.includes(perm) || perms.includes('*')) return next();
    return res.status(403).json({ error: 'Not permitted for staff role.' });
  };
}

module.exports = { signToken, auth, requireRole, requirePerm };
