const express = require('express');
const multer = require('multer');
const { authenticateToken } = require('../middleware/auth');
const assistant = require('../services/assistantService');
const RecordingAnalysis = require('../models/RecordingAnalysis');
const SupportContact = require('../models/SupportContact');
const router = express.Router();
const upload = multer({ limits: { fileSize: 8 * 1024 * 1024 }, fileFilter: (req, file, cb) => cb(null, ['audio/m4a', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/webm', 'audio/ogg'].includes(file.mimetype)) });
const liveTokenRateLimit = require('express-rate-limit')({
  windowMs: 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: req => String(req.userId || req.ip),
  handler: (req, res) => res.status(429).json({ success: false, message: 'Too many Gemini Live token requests. Please try again shortly.' })
});
const languages = ['english', 'hindi', 'telugu'];
const services = ['farming', 'crop_advice', 'animal_health', 'nutrition', 'weather', 'government_schemes', 'market_prices', 'general'];
const normalizeLanguage = value => ({ English: 'english', Hindi: 'hindi', Telugu: 'telugu', english: 'english', hindi: 'hindi', telugu: 'telugu' }[value] || value);
const normalizeService = value => ({
  Farming: 'farming',
  'Crop Advice': 'crop_advice',
  'Animal Health': 'animal_health',
  Weather: 'weather',
  'Government Schemes': 'government_schemes',
  'Market Prices': 'market_prices',
  farming: 'farming',
  'crop-advice': 'crop_advice',
  'animal-health': 'animal_health',
  'government-schemes': 'government_schemes',
  'market-prices': 'market_prices'
}[value] || value);
const normalizeMessages = messages => (Array.isArray(messages) ? messages : []).slice(-20).filter(m => m && ['user', 'assistant'].includes(m.role)).map(m => ({ role: m.role, text: String(m.content ?? m.text ?? '').slice(0, 8000) })).filter(m => m.text);
const safeProviderMessage = value => String(value || 'Unknown provider error').replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 240);
const recordingLanguages = { English: { label: 'English', code: 'en-IN', key: 'english' }, Hindi: { label: 'Hindi', code: 'hi-IN', key: 'hindi' }, 'हिन्दी': { label: 'Hindi', code: 'hi-IN', key: 'hindi' }, Telugu: { label: 'Telugu', code: 'te-IN', key: 'telugu' }, 'తెలుగు': { label: 'Telugu', code: 'te-IN', key: 'telugu' } };
const recordingServices = new Set(['animal-health', 'farming', 'nutrition', 'schemes', 'general']);
function pcmToWav(pcm, sampleRate = 16000, channels = 1) { const header = Buffer.alloc(44); header.write('RIFF', 0); header.writeUInt32LE(36 + pcm.length, 4); header.write('WAVE', 8); header.write('fmt ', 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(channels, 22); header.writeUInt32LE(sampleRate, 24); header.writeUInt32LE(sampleRate * channels * 2, 28); header.writeUInt16LE(channels * 2, 32); header.writeUInt16LE(16, 34); header.write('data', 36); header.writeUInt32LE(pcm.length, 40); return Buffer.concat([header, pcm]); }
function publicPhone(value) { const raw = String(value || '').replace(/[\s()-]/g, ''); if (/^\+\d{10,15}$/.test(raw)) return raw; if (/^[6-9]\d{9}$/.test(raw)) return `+91${raw}`; if (/^91[6-9]\d{9}$/.test(raw)) return `+${raw}`; return null; }
async function emergencyContacts(service, latitude, longitude) { const categories = service === 'animal-health' ? ['veterinarian', 'animal-hospital'] : service === 'general' ? ['support', 'veterinarian', 'animal-hospital'] : ['agriculture-officer', 'support']; const query = { verified: true, category: { $in: categories } }; const hasLocation = Number.isFinite(latitude) && Number.isFinite(longitude); const contacts = hasLocation ? await SupportContact.aggregate([{ $geoNear: { near: { type: 'Point', coordinates: [longitude, latitude] }, key: 'location', distanceField: 'distanceMeters', spherical: true, query, maxDistance: 250000 } }, { $limit: 5 }, { $project: { name: 1, phone: 1, category: 1, distanceMeters: 1 } }]) : await SupportContact.find(query).select('name phone category').limit(5).lean(); return contacts.map(contact => { const phone = publicPhone(contact.phone); if (!phone) return null; return { name: contact.name, phone, distanceKm: Number.isFinite(contact.distanceMeters) ? Math.round((contact.distanceMeters / 1000) * 10) / 10 : null, category: contact.category }; }).filter(Boolean); }

router.post('/analyze-recording', authenticateToken, async (req, res) => {
  try {
    const { audioBase64, language, service, duration, latitude, longitude } = req.body || {};
    const errors = {};
    if (typeof audioBase64 !== 'string' || !audioBase64.trim()) errors.audioBase64 = 'Expected non-empty base64 PCM16 audio';
    if (typeof language !== 'string' || !recordingLanguages[language]) errors.language = 'Expected English, Hindi, Telugu, हिन्दी, or తెలుగు';
    if (typeof service !== 'string' || !recordingServices.has(service)) errors.service = 'Expected animal-health, farming, nutrition, schemes, or general';
    if (!Number.isInteger(duration) || duration < 0) errors.duration = 'Expected an integer greater than or equal to zero';
    if (typeof audioBase64 === 'string' && audioBase64.length > 16 * 1024 * 1024) errors.audioBase64 = 'Audio is too large';
    if (Object.keys(errors).length) return res.status(400).json({ success: false, message: errors.audioBase64 || 'Invalid recording request', errors });
    const encodedAudio = audioBase64.replace(/^data:.*?;base64,/, '').replace(/\s/g, '');
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(encodedAudio) || encodedAudio.length % 4 === 1) return res.status(400).json({ success: false, message: 'Invalid audioBase64', errors: { audioBase64: 'Expected non-empty base64 PCM16 audio' } });
    let pcm;
    try { pcm = Buffer.from(encodedAudio, 'base64'); } catch (_) { return res.status(400).json({ success: false, message: 'Invalid audioBase64', errors: { audioBase64: 'Expected non-empty base64 PCM16 audio' } }); }
    if (!pcm.length || pcm.length % 2 !== 0) return res.status(400).json({ success: false, message: 'Invalid audioBase64', errors: { audioBase64: 'Expected non-empty base64 PCM16 audio' } });
    if (!process.env.GNANI_API_KEY || !process.env.GEMINI_API_KEY) return res.status(503).json({ success: false, message: 'Required AI providers are not configured' });
    const normalizedLanguage = recordingLanguages[language];
    const wav = pcmToWav(pcm);
    const transcript = await assistant.transcribe({ audio: wav.toString('base64'), mimeType: 'audio/wav', language: normalizedLanguage.code });
    if (!transcript) throw Object.assign(new Error('Gnani returned no transcript'), { status: 502 });
    const analysis = await assistant.analyzeRecording({ transcript, language: normalizedLanguage.key, service });
    const spoken = analysis.immediateAction || analysis.response;
    let speech = { audioBase64: null, audioFormat: 'wav', audioSampleRate: 24000, audioError: null };
    try { speech = { ...(await assistant.speakRecording({ text: spoken, language: normalizedLanguage.key })), audioError: null }; }
    catch (ttsError) { console.error('Recording provider failure:', { provider: ttsError.provider || 'Gnani TTS', status: ttsError.providerStatus || 'UNKNOWN', code: ttsError.providerCode || 'UNKNOWN', requestId: ttsError.requestId || 'UNKNOWN' }); speech.audioError = 'Gnani TTS failed'; }
    let contacts = [];
    if (analysis.requiresContact) { try { contacts = await emergencyContacts(service, Number(latitude), Number(longitude)); } catch (contactError) { console.error('Emergency contact lookup failed:', { code: contactError.code || contactError.name || 'LOOKUP_FAILED' }); } }
    const record = await RecordingAnalysis.create({ userId: req.userId, language: normalizedLanguage.label, service, transcript, summary: analysis.summary, immediateAction: analysis.immediateAction, urgency: analysis.urgency, requiresContact: analysis.requiresContact, contactReason: analysis.contactReason, response: analysis.response, contacts, audioFormat: speech.audioFormat, audioSampleRate: speech.audioSampleRate, duration });
    res.status(200).json({ success: true, data: { id: record._id.toString(), language: record.language, service: record.service, transcript: record.transcript, summary: record.summary, immediateAction: record.immediateAction, urgency: record.urgency, requiresContact: record.requiresContact, contactReason: record.contactReason, response: record.response, contacts, audioBase64: speech.audioBase64, audioFormat: record.audioFormat, audioSampleRate: record.audioSampleRate, ...(speech.audioError ? { audioError: speech.audioError } : {}), duration: record.duration, createdAt: record.createdAt.toISOString() } });
  } catch (error) {
    const status = error.status === 502 ? 502 : error.name === 'ValidationError' ? 400 : 502;
    console.error('Recording analysis failed:', { provider: error.provider || 'analysis', status: error.providerStatus || status, code: error.providerCode || error.code || error.name || 'PROVIDER_FAILURE', requestId: error.requestId || 'UNKNOWN', message: safeProviderMessage(error.message) });
    res.status(status).json({ success: false, message: status === 502 ? 'Recording analysis provider failed' : 'Invalid recording analysis request' });
  }
});

router.get('/recordings', authenticateToken, async (req, res, next) => {
  try { const items = await RecordingAnalysis.find({ userId: req.userId }).sort({ createdAt: -1 }).limit(100).lean(); res.json({ success: true, data: { items: items.map(item => ({ id: item._id.toString(), language: item.language, service: item.service, transcript: item.transcript, summary: item.summary, immediateAction: item.immediateAction, urgency: item.urgency, requiresContact: item.requiresContact, contactReason: item.contactReason, contacts: Array.isArray(item.contacts) ? item.contacts : [], duration: item.duration, createdAt: item.createdAt.toISOString() })) } }); } catch (error) { next(error); }
});

router.post('/live-token', authenticateToken, liveTokenRateLimit, async (req, res) => {
  const { purpose, model } = req.body || {};
  if (purpose !== 'gemini-live' || model !== 'gemini-3.8-live') return res.status(400).json({ success: false, message: 'purpose must be gemini-live and model must be gemini-3.8-live' });
  if (!process.env.GEMINI_API_KEY) return res.status(503).json({ success: false, message: 'Gemini Live is not configured' });
  const now = Date.now();
  const expiresAt = new Date(now + 30 * 60 * 1000);
  const newSessionExpireTime = new Date(now + 60 * 1000);
  try {
    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/auth_tokens', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
      body: JSON.stringify({ uses: 1, expireTime: expiresAt.toISOString(), newSessionExpireTime: newSessionExpireTime.toISOString(), fieldMask: 'model,generationConfig.responseModalities', bidiGenerateContentSetup: { model: 'models/gemini-3.8-live', generationConfig: { responseModalities: ['AUDIO'] } } })
    });
    const responseText = await response.text();
    let data = {};
    try { data = JSON.parse(responseText); } catch (_) {}
    if (!response.ok || !data.name) {
      const providerMessage = safeProviderMessage(data.error?.message || data.message || responseText);
      console.error('Gemini Live token provisioning failed:', { status: response.status, code: data.error?.status || data.status || 'UNKNOWN', message: providerMessage });
      return res.status(502).json({ error: `Gemini token provisioning failed (${response.status}): ${providerMessage}` });
    }
    res.status(200).json({ token: data.name, expiresAt: expiresAt.toISOString() });
  } catch (error) {
    console.error('Gemini Live token request failed:', { message: error.message });
    res.status(502).json({ success: false, message: 'Gemini Live token service unavailable' });
  }
});
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

router.post('/reply', authenticateToken, async (req, res, next) => { try { const body = { ...req.body, language: normalizeLanguage(req.body.language), service: req.body.service || 'general' }; const messages = normalizeMessages(req.body.messages); const userMessages = messages.filter(m => m.role === 'user'); const transcript = req.body.transcript || userMessages[userMessages.length - 1]?.text; if (!transcript) return bad(res, 'Transcript or user message is required'); const text = await assistant.reply({ transcript, history: messages.slice(0, -1), language: body.language, service: body.service }); if (!text) throw Object.assign(new Error('AI returned no response'), { status: 502 }); res.json({ success: true, text }); } catch (e) { next(e); } });
router.post('/speak', authenticateToken, async (req, res, next) => { try { const error = validate(req.body, true); if (error) return bad(res, error); const result = await assistant.speak({ text: req.body.transcript, language: req.body.language }); if (!result.audio) throw Object.assign(new Error('Speech provider returned no audio'), { status: 502 }); res.json({ success: true, data: result }); } catch (e) { next(e); } });
router.post('/summary', authenticateToken, async (req, res, next) => { try { const language = normalizeLanguage(req.body.language); const messages = normalizeMessages(req.body.messages); const error = validate({ ...req.body, language }); if (error || !messages.length) return bad(res, error || 'Invalid messages'); const text = await assistant.summary({ messages: messages.map(m => ({ userTranscript: m.role === 'user' ? m.text : '', assistantResponse: m.role === 'assistant' ? m.text : '' })), language }); if (!text) throw Object.assign(new Error('Gemini returned an empty summary'), { status: 502 }); res.json({ success: true, text }); } catch (e) { next(e); } });

// Compatibility endpoint for clients that send { action, language, audio, ... } to /api/assistant.
// New clients should prefer the explicit /transcribe, /reply, /speak and /summary endpoints.
router.post('/', authenticateToken, async (req, res, next) => {
  try {
    const body = { ...req.body, language: normalizeLanguage(req.body.language), service: normalizeService(req.body.service || 'general'), messages: normalizeMessages(req.body.messages) };
    const error = validate(body);
    if (error) return bad(res, error);

    if (body.action === 'transcribe') {
      if (!body.audio || typeof body.audio !== 'string' || body.audio.length > 12 * 1024 * 1024) return bad(res, 'Audio is required and must be at most 8 MB');
      const transcript = await assistant.transcribe({ audio: body.audio.replace(/^data:audio\/[^;]+;base64,/, ''), mimeType: body.mimeType || 'audio/wav', language: body.language });
      return res.json({ success: true, action: 'transcribe', transcript, data: { transcript } });
    }

    if (body.action === 'reply') {
      const latestUser = [...body.messages].reverse().find(m => m.role === 'user');
      if (!latestUser) return bad(res, 'At least one user message is required');
      const response = await assistant.reply({ transcript: latestUser.text, history: body.messages.slice(0, -1), language: body.language, service: body.service });
      return res.json({ success: true, text: response });
    }

    if (body.action === 'speak') {
      if (!body.text && !body.transcript) return bad(res, 'Text is required');
      const speech = await assistant.speak({ text: body.text || body.transcript, language: body.language });
      return res.json({ success: true, text: body.text || body.transcript, ...speech });
    }

    if (body.action === 'summary') {
      if (!body.messages.length) return bad(res, 'At least one message is required');
      const summary = await assistant.summary({ messages: body.messages.map(m => ({ userTranscript: m.role === 'user' ? m.text : '', assistantResponse: m.role === 'assistant' ? m.text : '' })), language: body.language });
      if (!summary) throw Object.assign(new Error('Gemini returned an empty summary'), { status: 502 });
      return res.json({ success: true, text: summary });
    }

    return bad(res, 'Unsupported assistant action');
  } catch (e) { next(e); }
});
module.exports = router;
