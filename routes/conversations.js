const express = require('express');
const Conversation = require('../models/Conversation');
const { authenticateToken } = require('../middleware/auth');
const router = express.Router();
const languages = ['english', 'hindi', 'telugu'];
const services = ['crop_advice', 'animal_health', 'weather', 'government_schemes', 'market_prices', 'general'];

router.use(authenticateToken);
router.post('/', async (req, res, next) => {
  try {
    const { service, language, messages = [], summary, duration, audioMetadata, saved = false, bookmarked = false } = req.body;
    if (!services.includes(service) || !languages.includes(language) || !Array.isArray(messages) || messages.length > 20) return res.status(400).json({ success: false, message: 'Invalid conversation data' });
    const cleanMessages = messages.map(m => ({ userTranscript: String(m.userTranscript || '').slice(0, 4000), assistantResponse: String(m.assistantResponse || '').slice(0, 8000), audioMetadata: m.audioMetadata }));
    const conversation = await Conversation.create({ userId: req.userId, service, language, messages: cleanMessages, summary: summary ? String(summary).slice(0, 4000) : undefined, duration, audioMetadata, saved: Boolean(saved), bookmarked: Boolean(bookmarked) });
    res.status(201).json({ success: true, data: { conversation } });
  } catch (e) { next(e); }
});
router.get('/', async (req, res, next) => { try { const conversations = await Conversation.find({ userId: req.userId }).sort({ createdAt: -1 }).limit(100).lean(); res.json({ success: true, data: { conversations } }); } catch (e) { next(e); } });
router.get('/:id', async (req, res, next) => { try { const conversation = await Conversation.findOne({ _id: req.params.id, userId: req.userId }).lean(); if (!conversation) return res.status(404).json({ success: false, message: 'Conversation not found' }); res.json({ success: true, data: { conversation } }); } catch (e) { next(e); } });
router.patch('/:id', async (req, res, next) => { try { const allowed = {}; for (const key of ['summary', 'duration', 'saved', 'bookmarked', 'audioMetadata']) if (req.body[key] !== undefined) allowed[key] = req.body[key]; const conversation = await Conversation.findOneAndUpdate({ _id: req.params.id, userId: req.userId }, { $set: allowed }, { new: true, runValidators: true }).lean(); if (!conversation) return res.status(404).json({ success: false, message: 'Conversation not found' }); res.json({ success: true, data: { conversation } }); } catch (e) { next(e); } });
module.exports = router;
