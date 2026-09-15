const express = require('express');
const Category = require('../models/Category');
const Supplier = require('../models/Supplier');
const { auth } = require('../middleware/auth');
const { audit } = require('../middleware/common');

const router = express.Router();
router.use(auth);

const DEFAULTS = ['Stationery','Grocery','Chocolate','Biscuits','Candy','Cold Drinks','Snacks','Cigarettes','Gutka','Tobacco','Mouth Freshener','Elachi','Personal Care','Household','Other'];

router.get('/categories', async (req, res, next) => {
  try {
    let cats = await Category.find({ active: true }).sort({ name: 1 });
    if (!cats.length) {
      await Category.insertMany(DEFAULTS.map((n) => ({ name: n })));
      cats = await Category.find({ active: true }).sort({ name: 1 });
    }
    res.json(cats);
  } catch (e) { next(e); }
});

router.post('/categories', async (req, res, next) => {
  try {
    const { name, nameBn = '', icon = '' } = req.body;
    if (!name) return res.status(400).json({ error: 'Category name is required.' });
    const c = await Category.create({ name: String(name).trim(), nameBn, icon });
    await audit(req.user, 'CATEGORY_CREATED', 'category', c._id, { name: c.name });
    res.status(201).json(c);
  } catch (e) {
    if (e.code === 11000) return res.status(400).json({ error: 'Category already exists.' });
    next(e);
  }
});

router.get('/suppliers', async (req, res, next) => {
  try { res.json(await Supplier.find().sort({ name: 1 }).limit(200)); } catch (e) { next(e); }
});

router.post('/suppliers', async (req, res, next) => {
  try {
    const { name, phone = '', address = '', notes = '' } = req.body;
    if (!name) return res.status(400).json({ error: 'Supplier name is required.' });
    res.status(201).json(await Supplier.create({ name, phone, address, notes }));
  } catch (e) { next(e); }
});

module.exports = router;
