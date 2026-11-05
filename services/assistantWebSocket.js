const { WebSocketServer } = require('ws');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Conversation = require('../models/Conversation');
const assistant = require('./assistantService');

const languageMap = { English: 'english', Hindi: 'hindi', Telugu: 'telugu', english: 'english', hindi: 'hindi', telugu: 'telugu' };
const serviceMap = { Farming: 'farming', 'Animal Health': 'animal_health', Nutrition: 'general', Schemes: 'government_schemes', General: 'general' };

function send(ws, payload) { if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(payload)); }
function tokenFrom(request) { const match = request.headers.authorization?.match(/^Bearer\s+(.+)$/i); return match?.[1]; }

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
    ws.on('message', async raw => {
      try {
        const event = JSON.parse(raw.toString());
        if (event.type === 'start') { session.language = languageMap[event.language] || event.language; session.service = serviceMap[event.service] || event.service || 'general'; session.mimeType = event.mimeType || 'audio/wav'; session.startedAt = Date.now(); return; }
        if (event.type === 'audio') { if (typeof event.audio !== 'string' || event.audio.length > 1024 * 1024) return send(ws, { type: 'error', message: 'Invalid audio chunk' }); session.chunks.push(event.audio); return; }
        if (event.type !== 'stop') return send(ws, { type: 'error', message: 'Unsupported event type' });
        if (!session.chunks.length) return send(ws, { type: 'error', message: 'No audio received' });
        const transcript = await assistant.transcribe({ audio: Buffer.concat(session.chunks.map(chunk => Buffer.from(chunk.replace(/^data:.*?;base64,/, ''), 'base64'))).toString('base64'), mimeType: session.mimeType, language: session.language });
        send(ws, { type: 'transcript.final', text: transcript });
        const answer = await assistant.reply({ transcript, history: session.messages, language: session.language, service: session.service });
        send(ws, { type: 'assistant.partial', text: answer });
        send(ws, { type: 'assistant.final', text: answer });
        const speech = await assistant.speak({ text: answer, language: session.language });
        send(ws, { type: 'audio', audio: speech.audio, mimeType: speech.mimeType });
        session.messages.push({ role: 'user', text: transcript }, { role: 'assistant', text: answer });
        send(ws, { type: 'turn.complete' });
      } catch (error) { console.error('Assistant WebSocket error:', error); send(ws, { type: 'error', message: error.message || 'Voice conversation failed' }); }
    });
    ws.on('close', async () => {
      if (!session.messages.length) return;
      try {
        const summary = await assistant.summary({ messages: session.messages.map(m => ({ userTranscript: m.role === 'user' ? m.text : '', assistantResponse: m.role === 'assistant' ? m.text : '' })), language: session.language });
        const conversation = await Conversation.create({ userId: ws.user._id, service: session.service, language: session.language, messages: session.messages, summary, duration: Math.round((Date.now() - session.startedAt) / 1000), saved: false });
        console.info('Conversation saved:', conversation._id.toString());
      } catch (error) { console.error('Conversation save failed:', error); }
    });
  });
  return wss;
}

module.exports = { attachAssistantWebSocket };
