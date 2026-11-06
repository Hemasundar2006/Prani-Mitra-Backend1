const WebSocket = require('ws');

const models = { 'gemini-3.1-flash-live-preview': true, 'gemini-2.5-flash-native-audio-preview-12-2025': true };

function languageName(language) { return { english: 'English', hindi: 'Hindi', telugu: 'Telugu' }[language] || language; }

function connect({ language, service, onTranscript, onAssistantText, onAudio, onTurnComplete, onInterrupted, onError, onOpen }) {
  if (!process.env.GEMINI_API_KEY) throw new Error('Gemini Live is not configured');
  const model = process.env.GEMINI_LIVE_MODEL || 'gemini-3.1-flash-live-preview';
  if (!models[model]) throw new Error('Configured Gemini Live model is not supported');
  const url = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${encodeURIComponent(process.env.GEMINI_API_KEY)}`;
  const socket = new WebSocket(url);
  let setupComplete = false;
  const pendingAudio = [];
  socket.on('open', () => {
    socket.send(JSON.stringify({ setup: { model: `models/${model}`, generationConfig: { responseModalities: ['AUDIO'] }, systemInstruction: { parts: [{ text: `You are Prani Mitra, a safe farming assistant. The selected language is ${languageName(language)}. The selected service is ${service}. Respond only in ${languageName(language)}. Use short sentences suitable for speech. Do not give definitive animal diagnoses or unsafe medicine dosages. Refer urgent animal cases to a veterinarian. Tell users to verify government scheme information with official sources. Ask a follow-up question when the farmer's question is incomplete.` }] }, inputAudioTranscription: {}, outputAudioTranscription: {}, realtimeInputConfig: { automaticActivityDetection: {} } } }));
    onOpen?.();
  });
  socket.on('message', raw => {
    try {
      const message = JSON.parse(raw.toString());
      if (message.setupComplete) { setupComplete = true; while (pendingAudio.length && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ realtimeInput: { audio: { data: pendingAudio.shift().toString('base64'), mimeType: 'audio/pcm;rate=16000' } } })); return; }
      const content = message.serverContent;
      if (!content) return;
      if (content.interrupted) onInterrupted?.();
      if (content.inputTranscription?.text) onTranscript(content.inputTranscription.text, Boolean(content.inputTranscription.finished));
      if (content.interimInputTranscription?.text) onTranscript(content.interimInputTranscription.text, false);
      for (const part of content.modelTurn?.parts || []) {
        if (part.text) onAssistantText(part.text, false);
        if (part.inlineData?.data) onAudio(part.inlineData.data, part.inlineData.mimeType || 'audio/pcm;rate=24000');
      }
      if (content.turnComplete) { onAssistantText('', true); onTurnComplete?.(); }
    } catch (error) { onError?.(error); }
  });
  socket.on('error', error => onError?.(error));
  socket.on('close', (code, reason) => { if (code !== 1000) onError?.(new Error(`Gemini Live closed (${code})`)); });
  return {
    sendAudio(buffer) { if (!setupComplete) { pendingAudio.push(buffer); return; } if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ realtimeInput: { audio: { data: buffer.toString('base64'), mimeType: 'audio/pcm;rate=16000' } } })); },
    stop() { if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ realtimeInput: { audioStreamEnd: true } })); },
    interrupt() { if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ realtimeInput: { activityStart: {} } })); },
    close() { if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) socket.close(1000, 'client stopped'); }
  };
}

module.exports = { connect };
