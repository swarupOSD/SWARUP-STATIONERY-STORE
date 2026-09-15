const express = require('express');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const env = require('../config/env');
const User = require('../models/User');
const { signToken, auth } = require('../middleware/auth');
const { audit } = require('../middleware/common');

const router = express.Router();

router.post('/login', body('username').notEmpty(), body('password').notEmpty(), async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: 'Enter username and password.' });
    const { username, password } = req.body;
    const user = await User.findOne({ username: String(username).toLowerCase().trim() });
    if (!user || !user.active) return res.status(401).json({ error: 'Invalid username or password. Check spelling and extra spaces.' });
    const ok = await bcrypt.compare(String(password).trim(), user.passwordHash);
    if (!ok) return res.status(401).json({ error: 'Invalid username or password. Check spelling and extra spaces.' });
    await audit(user, 'LOGIN', 'user', user._id, {});
    res.json({ token: signToken(user), user: { id: user._id, username: user.username, name: user.name, role: user.role, permissions: user.permissions } });
  } catch (e) { next(e); }
});

router.get('/me', auth, (req, res) => {
  const u = req.user;
  res.json({ id: u._id, username: u.username, name: u.name, role: u.role, permissions: u.permissions });
});

router.post('/logout', auth, async (req, res) => {
  await audit(req.user, 'LOGOUT', 'user', req.user._id, {});
  res.json({ ok: true });
});

module.exports = router;
