const { WebSocketServer } = require('ws');
const WebSocket = require('ws');
const geminiLive = require('./geminiLiveService');
const jwt = require('jsonwebtoken');
const assistant = require('./assistantService');

const languageMap = { English: 'english', Hindi: 'hindi', Telugu: 'telugu', english: 'english', hindi: 'hindi', telugu: 'telugu' };
const serviceMap = { Farming: 'farming', farming: 'farming', 'Animal Health': 'animal_health', 'animal health': 'animal_health', 'Animal Health': 'animal_health', Nutrition: 'nutrition', nutrition: 'nutrition', Schemes: 'government_schemes', schemes: 'government_schemes', 'Government Schemes': 'government_schemes', General: 'general', general: 'general' };

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
      let user = null;
      if (token) { const decoded = jwt.verify(token, process.env.JWT_SECRET); user = { _id: decoded.userId, isActive: true }; }
      wss.handleUpgrade(request, socket, head, ws => { ws.user = user; wss.emit('connection', ws, request); });
    } catch (error) { socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n'); socket.destroy(); }
  });

  wss.on('connection', ws => {
    const session = { chunks: [], messages: [], startedAt: Date.now(), language: 'english', service: 'general', mimeType: 'audio/wav', speaking: false, speechActive: false, provider: null, stopped: false };
    let processingTranscript = false;
    const handleTranscript = async transcript => {
      if (!transcript || processingTranscript) return;
      processingTranscript = true;
      send(ws, { type: 'transcript.partial', text: transcript });
      send(ws, { type: 'transcript.final', text: transcript });
      const answer = await assistant.reply({ transcript, history: session.messages, language: session.language, service: session.service });
      send(ws, { type: 'assistant.partial', text: answer });
      send(ws, { type: 'assistant.final', text: answer });
      session.speaking = true;
      const speech = await assistant.speak({ text: answer, language: session.language });
      if (session.speaking) send(ws, { type: 'audio', audio: speech.audio, mimeType: speech.mimeType });
      session.messages.push({ role: 'user', text: transcript }, { role: 'assistant', text: answer });
      session.speaking = false;
      processingTranscript = false;
      send(ws, { type: 'turn.complete' });
    };
    ws.on('message', async (raw, isBinary) => {
      try {
        if (isBinary || Buffer.isBuffer(raw)) { session.chunks.push(Buffer.from(raw).toString('base64')); console.info('Assistant WebSocket audio binary chunk received:', raw.length); return; }
        const event = JSON.parse(raw.toString());
        if (event.type === 'start') {
          const startToken = event.token || event.authorization;
          if (!ws.user && startToken) { const decoded = jwt.verify(String(startToken).replace(/^Bearer\s+/i, ''), process.env.JWT_SECRET); ws.user = { _id: decoded.userId, isActive: true }; }
          if (!ws.user || !ws.user.isActive) return send(ws, { type: 'error', code: 'INVALID_TOKEN', message: 'Valid Bearer login token required' });
          session.language = languageMap[event.language] || event.language; session.service = serviceMap[event.service] || event.service || 'general'; session.audio = event.audio || session.audio; session.mimeType = event.mimeType || 'audio/wav'; session.startedAt = Date.now();
          if (!['english', 'hindi', 'telugu'].includes(session.language)) return send(ws, { type: 'error', code: 'UNSUPPORTED_LANGUAGE', message: 'Unsupported language' });
          if (!['farming', 'animal_health', 'nutrition', 'government_schemes', 'general'].includes(session.service)) return send(ws, { type: 'error', code: 'UNSUPPORTED_SERVICE', message: 'Unsupported service' });
          if (event.provider === 'gemini-live') {
            session.provider = geminiLive.connect({ language: session.language, service: session.service, onOpen: () => console.info('Gemini Live connected'), onTranscript: (text, final) => { if (final) { session.speechActive = false; send(ws, { type: 'speech.ended', waitMs: 3000 }); send(ws, { type: 'assistant.thinking' }); } send(ws, { type: final ? 'transcript.final' : 'transcript.partial', text }); }, onAssistantText: (text, final) => { if (text) { send(ws, { type: final ? 'assistant.final' : 'assistant.partial', text }); if (text.includes('?')) send(ws, { type: 'assistant.question', text }); } }, onAudio: (audio, mimeType) => { const rate = Number((mimeType.match(/rate=(\d+)/) || [])[1] || 24000); if (!session.speaking) { session.speaking = true; send(ws, { type: 'audio.started' }); } send(ws, { type: 'audio', audio, format: 'pcm16', sampleRate: rate, channels: 1 }); }, onInterrupted: () => { session.speaking = false; send(ws, { type: 'interruption' }); }, onTurnComplete: () => { if (session.speaking) { session.speaking = false; send(ws, { type: 'audio.completed' }); } send(ws, { type: 'turn.complete' }); if (session.stopped) { session.provider.close(); ws.close(1000, 'Conversation stopped'); } }, onError: error => { console.error('Gemini Live error:', error.message); send(ws, { type: 'error', message: 'Gemini Live provider failed' }); } });
            console.info('Gemini Live session requested'); return;
          }
          const languageCode = { english: 'en-IN', hindi: 'hi-IN', telugu: 'te-IN' }[session.language];
          session.gnani = new WebSocket(process.env.GNANI_STT_WS_URL || 'wss://api.vachana.ai/stt/v3/stream', { headers: { 'x-api-key-id': process.env.GNANI_API_KEY, language_code: languageCode, model: 'prisma-v2.5', 'x-sample-rate': String(session.audio?.sampleRate || 16000), 'x-vad-threshold': '0.5', 'x-min-silence-ms': '700' } });
          session.gnani.on('open', () => console.info('Gnani realtime STT connected'));
          session.gnani.on('message', message => { try { const providerEvent = JSON.parse(message.toString()); if (providerEvent.type === 'transcript' && providerEvent.text) handleTranscript(providerEvent.text).catch(error => { console.error('Realtime assistant error:', error.message); send(ws, { type: 'error', code: 'PROVIDER_FAILURE', message: 'Assistant provider failed' }); }); if (providerEvent.type === 'error') { console.error('Gnani realtime STT error:', providerEvent.message); send(ws, { type: 'error', code: 'GNANI_STT_FAILURE', message: 'Speech recognition failed' }); } } catch (_) {} });
          session.gnani.on('error', error => { console.error('Gnani realtime STT connection error:', error.message); send(ws, { type: 'error', code: 'GNANI_STT_FAILURE', message: 'Speech recognition connection failed' }); });
          console.info('Assistant WebSocket started:', { language: session.language, service: session.service, audio: Boolean(session.audio) }); return;
        }
        if (event.type === 'audio' || event.type === 'audio_chunk') { if (typeof event.audio !== 'string' || event.audio.length > 1024 * 1024) return send(ws, { type: 'error', code: 'INVALID_AUDIO', message: 'Invalid audio chunk' }); if (!session.speechActive) { session.speechActive = true; send(ws, { type: 'speech.started' }); } session.speaking = false; const pcm = Buffer.from(event.audio.replace(/^data:.*?;base64,/, ''), 'base64'); if (session.provider) session.provider.sendAudio(pcm); else if (session.gnani?.readyState === WebSocket.OPEN) session.gnani.send(pcm); else session.chunks.push(pcm.toString('base64')); return; }
        if (event.type === 'stop') { session.stopped = true; if (session.provider) return session.provider.stop(); if (session.gnani && session.gnani.readyState === WebSocket.OPEN) session.gnani.close(); session.chunks = []; session.messages = []; return ws.close(1000, 'Conversation stopped'); }
        if (event.type !== 'stop') return send(ws, { type: 'error', message: 'Unsupported event type' });
        if (!session.chunks.length) { console.warn('Assistant WebSocket stop received with no audio chunks'); return send(ws, { type: 'error', message: 'No audio received' }); }
        let pcm = Buffer.concat(session.chunks.map(chunk => Buffer.from(chunk, 'base64')));
        if (session.audio?.encoding === 'int16') pcm = pcm16ToWav(pcm, session.audio.sampleRate || 16000, session.audio.channels || 1);
        const transcript = await assistant.transcribe({ audio: pcm.toString('base64'), mimeType: session.audio?.encoding === 'int16' ? 'audio/wav' : session.mimeType, language: session.language });
        send(ws, { type: 'transcript.final', text: transcript });
        const answer = await assistant.reply({ transcript, history: session.messages, language: session.language, service: session.service });
        send(ws, { type: 'assistant.partial', text: answer });
        send(ws, { type: 'assistant.final', text: answer });
        session.speaking = true;
        const speech = await assistant.speak({ text: answer, language: session.language });
        if (!session.speaking) return;
        send(ws, { type: 'audio', audio: speech.audio, format: 'pcm', sampleRate: 16000, channels: 1, encoding: 'int16' });
        session.messages.push({ role: 'user', text: transcript }, { role: 'assistant', text: answer });
        send(ws, { type: 'turn.complete' });
      } catch (error) { console.error('Assistant WebSocket error:', error); send(ws, { type: 'error', message: error.message || 'Voice conversation failed' }); }
    });
    ws.on('close', () => { if (session.gnani && session.gnani.readyState === WebSocket.OPEN) session.gnani.close(); session.chunks = []; session.messages = []; });
  });
  return wss;
}

module.exports = { attachAssistantWebSocket };
