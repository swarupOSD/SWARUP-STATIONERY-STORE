const express = require('express');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const { auth, requireRole } = require('../middleware/auth');
const { audit } = require('../middleware/common');

const router = express.Router();
router.use(auth);

router.get('/', requireRole('ADMIN'), async (req, res, next) => {
  try { res.json(await User.find().select('-passwordHash').sort({ createdAt: -1 })); } catch (e) { next(e); }
});

router.post('/', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const { username, password, name = '', role = 'STAFF', permissions = [] } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password are required.' });
    const exists = await User.findOne({ username: String(username).toLowerCase().trim() });
    if (exists) return res.status(400).json({ error: 'Username already exists.' });
    const u = await User.create({ username: String(username).toLowerCase().trim(), passwordHash: await bcrypt.hash(String(password), 10), name, role, permissions });
    await audit(req.user, 'USER_CREATED', 'user', u._id, { username: u.username, role: u.role });
    res.status(201).json({ id: u._id, username: u.username, name: u.name, role: u.role, permissions: u.permissions });
  } catch (e) { next(e); }
});

router.patch('/:id', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const u = await User.findById(req.params.id);
    if (!u) return res.status(404).json({ error: 'User not found.' });
    const { name, role, permissions, active, password } = req.body;
    if (name !== undefined) u.name = name;
    if (role !== undefined) u.role = role;
    if (permissions !== undefined) u.permissions = permissions;
    if (active !== undefined) u.active = active;
    if (password) u.passwordHash = await bcrypt.hash(String(password), 10);
    await u.save();
    await audit(req.user, 'USER_UPDATED', 'user', u._id, { username: u.username });
    res.json({ id: u._id, username: u.username, name: u.name, role: u.role, permissions: u.permissions, active: u.active });
  } catch (e) { next(e); }
});

module.exports = router;
