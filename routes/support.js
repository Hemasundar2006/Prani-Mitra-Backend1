const express = require('express');
const SupportContact = require('../models/SupportContact');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();
const categories = new Set(['veterinarian', 'animal-hospital', 'agriculture-officer', 'support']);

router.get('/nearby', authenticateToken, async (req, res) => {
  const latitude = Number(req.query.latitude);
  const longitude = Number(req.query.longitude);
  const category = String(req.query.category || '');
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180 || !categories.has(category)) return res.status(400).json({ success: false, message: 'Invalid coordinates or category' });
  try {
    const contacts = await SupportContact.aggregate([
      { $geoNear: { near: { type: 'Point', coordinates: [longitude, latitude] }, key: 'location', distanceField: 'distanceMeters', spherical: true, query: { verified: true, category }, maxDistance: 250000 } },
      { $limit: 5 },
      { $project: { _id: 1, name: 1, phone: 1, category: 1, address: 1, available: 1, distanceMeters: 1 } }
    ]);
    if (!contacts.length) return res.status(404).json({ success: false, message: 'No nearby verified contacts available' });
    res.json({ success: true, data: contacts.map(contact => ({ id: contact._id.toString(), name: contact.name, phone: contact.phone, category: contact.category, address: contact.address, distanceKm: Math.round((contact.distanceMeters / 1000) * 10) / 10, available: contact.available })) });
  } catch (error) {
    console.error('Nearby support lookup failed:', { code: error.code || error.name });
    res.status(500).json({ success: false, message: 'Failed to load nearby support contacts' });
  }
});

module.exports = router;
