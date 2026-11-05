const express = require('express');
const multer = require('multer');
const { authenticateToken } = require('../middleware/auth');
const assistant = require('../services/assistantService');
const router = express.Router();
const upload = multer({ limits: { fileSize: 8 * 1024 * 1024 }, fileFilter: (req, file, cb) => cb(null, ['audio/m4a', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/webm', 'audio/ogg'].includes(file.mimetype)) });
const languages = ['english', 'hindi', 'telugu'];
const services = ['crop_advice', 'animal_health', 'weather', 'government_schemes', 'market_prices', 'general'];
const normalizeLanguage = value => ({ English: 'english', Hindi: 'hindi', Telugu: 'telugu', english: 'english', hindi: 'hindi', telugu: 'telugu' }[value] || value);
const bad = (res, message) => res.status(400).json({ success: false, message });
const validate = (body, requireTranscript = false) => {
  if (!languages.includes(body.language) || !services.includes(body.service)) return 'Unsupported language or service';
  if (requireTranscript && (!body.transcript || typeof body.transcript !== 'string' || body.transcript.length > 4000)) return 'Transcript is required and must be at most 4000 characters';
};

router.post('/transcribe', authenticateToken, upload.single('audio'), async (req, res, next) => {
  try {
    if (!req.file) return bad(res, 'Audio is required and must be a supported format');
    const error = validate(req.body); if (error) return bad(res, error);
    const text = await assistant.transcribe({ audio: req.file.buffer.toString('base64'), mimeType: req.file.mimetype, language: req.body.language });
    if (!text) throw Object.assign(new Error('Speech provider returned no transcript'), { status: 502 });
    res.json({ success: true, data: { transcript: text } });
  } catch (e) { next(e); }
});

router.post('/reply', authenticateToken, async (req, res, next) => { try { const error = validate(req.body, true); if (error) return bad(res, error); const history = Array.isArray(req.body.history) ? req.body.history.slice(-20).filter(x => x && ['user', 'assistant'].includes(x.role) && typeof x.text === 'string' && x.text.length <= 4000) : []; const text = await assistant.reply({ ...req.body, history }); if (!text) throw Object.assign(new Error('AI returned no response'), { status: 502 }); res.json({ success: true, data: { response: text } }); } catch (e) { next(e); } });
router.post('/speak', authenticateToken, async (req, res, next) => { try { const error = validate(req.body, true); if (error) return bad(res, error); const result = await assistant.speak({ text: req.body.transcript, language: req.body.language }); if (!result.audio) throw Object.assign(new Error('Speech provider returned no audio'), { status: 502 }); res.json({ success: true, data: result }); } catch (e) { next(e); } });
router.post('/summary', authenticateToken, async (req, res, next) => { try { const error = validate(req.body); if (error || !Array.isArray(req.body.messages) || req.body.messages.length > 20) return bad(res, error || 'Invalid messages'); const text = await assistant.summary({ messages: req.body.messages, language: req.body.language }); res.json({ success: true, data: { summary: text } }); } catch (e) { next(e); } });

// Compatibility endpoint for clients that send { action, language, audio, ... } to /api/assistant.
// New clients should prefer the explicit /transcribe, /reply, /speak and /summary endpoints.
router.post('/', authenticateToken, async (req, res, next) => {
  try {
    const body = { ...req.body, language: normalizeLanguage(req.body.language), service: req.body.service || 'general' };
    const error = validate(body);
    if (error) return bad(res, error);

    if (body.action === 'transcribe') {
      if (!body.audio || typeof body.audio !== 'string' || body.audio.length > 12 * 1024 * 1024) return bad(res, 'Audio is required and must be at most 8 MB');
      const transcript = await assistant.transcribe({ audio: body.audio.replace(/^data:audio\/[^;]+;base64,/, ''), mimeType: body.mimeType || 'audio/wav', language: body.language });
      return res.json({ success: true, action: 'transcribe', transcript, data: { transcript } });
    }

    if (body.action === 'reply') {
      if (!body.transcript || body.transcript.length > 4000) return bad(res, 'Transcript is required and must be at most 4000 characters');
      const response = await assistant.reply({ transcript: body.transcript, history: Array.isArray(body.history) ? body.history : [], language: body.language, service: body.service });
      return res.json({ success: true, action: 'reply', response, data: { response } });
    }

    if (body.action === 'speak') {
      if (!body.text && !body.transcript) return bad(res, 'Text is required');
      const speech = await assistant.speak({ text: body.text || body.transcript, language: body.language });
      return res.json({ success: true, action: 'speak', ...speech, data: speech });
    }

    return bad(res, 'Unsupported assistant action');
  } catch (e) { next(e); }
});
module.exports = router;
