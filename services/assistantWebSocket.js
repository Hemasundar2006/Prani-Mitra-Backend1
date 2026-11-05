const { WebSocketServer } = require('ws');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Conversation = require('../models/Conversation');
const assistant = require('./assistantService');

const languageMap = { English: 'english', Hindi: 'hindi', Telugu: 'telugu', english: 'english', hindi: 'hindi', telugu: 'telugu' };
const serviceMap = { Farming: 'farming', 'Animal Health': 'animal_health', Nutrition: 'general', Schemes: 'government_schemes', General: 'general' };

function send(ws, payload) { if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(payload)); }
function tokenFrom(request) { const match = request.headers.authorization?.match(/^Bearer\s+(.+)$/i); return match?.[1]; }
function pcm16ToWav(pcm, sampleRate, channels) {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0); header.writeUInt32LE(36 + pcm.length, 4); header.write('WAVE', 8);
  header.write('fmt ', 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24); header.writeUInt32LE(sampleRate * channels * 2, 28); header.writeUInt16LE(channels * 2, 32); header.writeUInt16LE(16, 34);
  header.write('data', 36); header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

function attachAssistantWebSocket(server) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 1024 * 1024 });
  server.on('upgrade', async (request, socket, head) => {
    if (request.url !== '/ws/assistant') return;
    try {
      const token = tokenFrom(request);
      if (!token) throw new Error('Authorization Bearer token required');
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.userId);
      if (!user || !user.isActive) throw new Error('Invalid user token');
      wss.handleUpgrade(request, socket, head, ws => { ws.user = user; wss.emit('connection', ws, request); });
    } catch (error) { socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n'); socket.destroy(); }
  });

  wss.on('connection', ws => {
    const session = { chunks: [], messages: [], startedAt: Date.now(), language: 'english', service: 'general', mimeType: 'audio/wav' };
    let saved = false;
    const persistConversation = async () => {
      if (saved || !session.messages.length) return null;
      const summary = await assistant.summary({ messages: session.messages.map(m => ({ userTranscript: m.role === 'user' ? m.text : '', assistantResponse: m.role === 'assistant' ? m.text : '' })), language: session.language });
      if (!summary) throw new Error('Conversation summary was empty; conversation was not saved');
      const conversation = await Conversation.create({ userId: ws.user._id, service: session.service, language: session.language, messages: session.messages, summary, duration: Math.round((Date.now() - session.startedAt) / 1000), saved: false });
      saved = true;
      return conversation;
    };
    ws.on('message', async (raw, isBinary) => {
      try {
        if (isBinary || Buffer.isBuffer(raw)) { session.chunks.push(Buffer.from(raw).toString('base64')); console.info('Assistant WebSocket audio binary chunk received:', raw.length); return; }
        const event = JSON.parse(raw.toString());
        if (event.type === 'start') { session.language = languageMap[event.language] || event.language; session.service = serviceMap[event.service] || event.service || 'general'; session.audio = event.audio || session.audio; session.mimeType = event.mimeType || 'audio/wav'; session.startedAt = Date.now(); console.info('Assistant WebSocket started:', { language: session.language, service: session.service, audio: session.audio }); return; }
        if (event.type === 'audio' || event.type === 'audio_chunk') { if (typeof event.audio !== 'string' || event.audio.length > 1024 * 1024) return send(ws, { type: 'error', message: 'Invalid audio chunk' }); session.chunks.push(event.audio.replace(/^data:.*?;base64,/, '')); console.info('Assistant WebSocket audio chunk received:', { chunks: session.chunks.length, bytes: Buffer.byteLength(event.audio, 'base64') }); return; }
        if (event.type !== 'stop') return send(ws, { type: 'error', message: 'Unsupported event type' });
        if (!session.chunks.length) { console.warn('Assistant WebSocket stop received with no audio chunks'); return send(ws, { type: 'error', message: 'No audio received' }); }
        let pcm = Buffer.concat(session.chunks.map(chunk => Buffer.from(chunk, 'base64')));
        if (session.audio?.encoding === 'int16') pcm = pcm16ToWav(pcm, session.audio.sampleRate || 16000, session.audio.channels || 1);
        const transcript = await assistant.transcribe({ audio: pcm.toString('base64'), mimeType: session.audio?.encoding === 'int16' ? 'audio/wav' : session.mimeType, language: session.language });
        send(ws, { type: 'transcript.final', text: transcript });
        const answer = await assistant.reply({ transcript, history: session.messages, language: session.language, service: session.service });
        send(ws, { type: 'assistant.partial', text: answer });
        send(ws, { type: 'assistant.final', text: answer });
        const speech = await assistant.speak({ text: answer, language: session.language });
        send(ws, { type: 'audio', audio: speech.audio, mimeType: speech.mimeType });
        session.messages.push({ role: 'user', text: transcript }, { role: 'assistant', text: answer });
        send(ws, { type: 'turn.complete' });
        const conversation = await persistConversation();
        if (conversation) send(ws, { type: 'conversation.saved', conversationId: conversation._id.toString() });
      } catch (error) { console.error('Assistant WebSocket error:', error); send(ws, { type: 'error', message: error.message || 'Voice conversation failed' }); }
    });
    ws.on('close', () => { if (!saved && session.messages.length) console.warn('Assistant WebSocket closed before conversation.saved confirmation'); });
  });
  return wss;
}

module.exports = { attachAssistantWebSocket };
