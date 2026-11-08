const express = require('express');
const multer = require('multer');
const { authenticateToken } = require('../middleware/auth');
const assistant = require('../services/assistantService');
const RecordingAnalysis = require('../models/RecordingAnalysis');
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
const recordingLanguages = { English: 'english', Hindi: 'hindi', Telugu: 'telugu' };
const recordingServices = new Set(['animal-health', 'farming', 'nutrition', 'schemes', 'general']);
function pcmToWav(pcm, sampleRate = 16000, channels = 1) { const header = Buffer.alloc(44); header.write('RIFF', 0); header.writeUInt32LE(36 + pcm.length, 4); header.write('WAVE', 8); header.write('fmt ', 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(channels, 22); header.writeUInt32LE(sampleRate, 24); header.writeUInt32LE(sampleRate * channels * 2, 28); header.writeUInt16LE(channels * 2, 32); header.writeUInt16LE(16, 34); header.write('data', 36); header.writeUInt32LE(pcm.length, 40); return Buffer.concat([header, pcm]); }

router.post('/analyze-recording', authenticateToken, async (req, res) => {
  try {
    const { audioBase64, language, service, duration } = req.body || {};
    if (!recordingLanguages[language] || !recordingServices.has(service) || typeof audioBase64 !== 'string' || !audioBase64 || audioBase64.length > 16 * 1024 * 1024 || !Number.isFinite(Number(duration)) || Number(duration) < 0 || Number(duration) > 3600) return res.status(400).json({ success: false, message: 'Invalid audio, language, service, or duration' });
    const encodedAudio = audioBase64.replace(/^data:.*?;base64,/, '').replace(/\s/g, '');
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(encodedAudio) || encodedAudio.length % 4 === 1) return res.status(400).json({ success: false, message: 'Invalid base64 audio' });
    let pcm;
    try { pcm = Buffer.from(encodedAudio, 'base64'); } catch (_) { return res.status(400).json({ success: false, message: 'Invalid base64 audio' }); }
    if (!pcm.length || pcm.length % 2 !== 0) return res.status(400).json({ success: false, message: 'Audio must be non-empty PCM16 audio' });
    if (!process.env.GNANI_API_KEY || !process.env.GEMINI_API_KEY) return res.status(503).json({ success: false, message: 'Required AI providers are not configured' });
    const internalLanguage = recordingLanguages[language];
    const wav = pcmToWav(pcm);
    const transcript = await assistant.transcribe({ audio: wav.toString('base64'), mimeType: 'audio/wav', language: internalLanguage });
    if (!transcript) throw Object.assign(new Error('Gnani returned no transcript'), { status: 502 });
    const analysis = await assistant.analyzeRecording({ transcript, language: internalLanguage, service });
    const spoken = analysis.immediateAction || analysis.response;
    const speech = await assistant.speakRecording({ text: spoken, language: internalLanguage });
    const record = await RecordingAnalysis.create({ userId: req.userId, language, service, transcript, summary: analysis.summary, immediateAction: analysis.immediateAction, urgency: analysis.urgency, response: analysis.response, audioFormat: speech.audioFormat, audioSampleRate: speech.audioSampleRate, duration: Number(duration) });
    res.status(200).json({ success: true, data: { id: record._id.toString(), language: record.language, service: record.service, transcript: record.transcript, summary: record.summary, immediateAction: record.immediateAction, urgency: record.urgency, response: record.response, audioBase64: speech.audioBase64, audioFormat: record.audioFormat, audioSampleRate: record.audioSampleRate, duration: record.duration, createdAt: record.createdAt.toISOString() } });
  } catch (error) {
    const status = error.status === 502 ? 502 : error.name === 'ValidationError' ? 400 : 502;
    console.error('Recording analysis failed:', { status, code: error.code || error.name || 'PROVIDER_FAILURE', message: safeProviderMessage(error.message) });
    res.status(status).json({ success: false, message: status === 502 ? 'Recording analysis provider failed' : 'Invalid recording analysis request' });
  }
});

router.get('/recordings', authenticateToken, async (req, res, next) => {
  try { const items = await RecordingAnalysis.find({ userId: req.userId }).sort({ createdAt: -1 }).limit(100).lean(); res.json({ success: true, data: { items: items.map(item => ({ id: item._id.toString(), language: item.language, service: item.service, transcript: item.transcript, summary: item.summary, immediateAction: item.immediateAction, urgency: item.urgency, response: item.response, duration: item.duration, createdAt: item.createdAt.toISOString() })) } }); } catch (error) { next(error); }
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
