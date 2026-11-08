const crypto = require('crypto');
const MAX_HISTORY = 20;
const languageNames = { english: 'English', hindi: 'Hindi', telugu: 'Telugu' };

function requireConfig(name) {
  if (!process.env[name]) throw Object.assign(new Error(`${name} is not configured`), { status: 503 });
  return process.env[name];
}

async function postJson(url, body, headers = {}) {
  const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
  const text = await response.text();
  let data;
  try { data = JSON.parse(text); } catch (_) { data = { raw: text }; }
  if (!response.ok) throw Object.assign(new Error(data.message || data.error || `Provider request failed (${response.status})`), { status: 502, providerStatus: response.status });
  return data;
}

async function transcribe({ audio, mimeType, language }) {
  const apiKey = requireConfig('GNANI_API_KEY');
  const form = new FormData();
  const extension = ({ 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/m4a': 'm4a', 'audio/mp4': 'm4a', 'audio/mpeg': 'mp3', 'audio/ogg': 'ogg', 'audio/webm': 'ogg', 'audio/flac': 'flac', 'audio/aac': 'aac' }[mimeType] || 'wav');
  form.append('audio_file', new Blob([Buffer.from(audio, 'base64')], { type: mimeType }), `recording.${extension}`);
  form.append('language_code', { english: 'en-IN', hindi: 'hi-IN', telugu: 'te-IN', 'en-IN': 'en-IN', 'hi-IN': 'hi-IN', 'te-IN': 'te-IN' }[language] || language);
  form.append('model', process.env.GNANI_STT_MODEL || 'prisma-v2.5');
  const requestId = crypto.randomUUID();
  const response = await fetch(process.env.GNANI_STT_URL || 'https://api.vachana.ai/stt/v3', { method: 'POST', headers: { 'X-API-Key-ID': apiKey, 'X-API-Request-ID': requestId }, body: form });
  const responseText = await response.text();
  let data;
  try { data = JSON.parse(responseText); } catch (_) { data = {}; }
  if (!response.ok) {
    throw Object.assign(new Error(data.message || data.detail?.message || `Gnani STT failed with ${response.status}`), { status: 502, provider: 'Gnani STT', providerStatus: response.status, providerCode: data.error?.type || data.detail?.error_code || data.status_code || 'UNKNOWN', requestId: data.request_id || requestId });
  }
  return data.text || data.transcript || data.data?.text || data.data?.transcript;
}

async function reply({ transcript, history, language, service }) {
  const key = requireConfig('GEMINI_API_KEY');
  const model = process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite';
  const contents = [...history.slice(-MAX_HISTORY).map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.text }] })), { role: 'user', parts: [{ text: transcript }] }];
  const prompt = `You are a careful farming assistant. Reply only in ${languageNames[language]}. Service: ${service}. Give practical, cautious guidance. Never make a definitive animal diagnosis or prescribe unsafe medicine dosages. For emergencies, tell the farmer to contact a veterinarian immediately. For government schemes, say they must verify details with official sources. If uncertain, say so.`;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;
  let data;
  try { data = await postJson(url, { systemInstruction: { parts: [{ text: prompt }] }, contents, generationConfig: { maxOutputTokens: 1200 } }); }
  catch (error) { console.error('Gemini reply error:', error.message); throw error; }
  return data.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('').trim();
}

async function speak({ text, language }) {
  const response = await fetch(process.env.GNANI_TTS_URL || 'https://api.vachana.ai/api/v1/tts/inference', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-API-Key-ID': requireConfig('GNANI_API_KEY') }, body: JSON.stringify({ text, model: process.env.GNANI_TTS_MODEL || 'timbre-v2.5', voice: process.env.GNANI_TTS_VOICE || 'Kaveri', language: { english: 'en-IN', hindi: 'hi-IN', telugu: 'te-IN' }[language], audio_config: { encoding: 'linear_pcm', container: 'raw', num_channels: 1, sample_rate: 16000, sample_width: 2 } }) });
  if (!response.ok) { let error; try { error = await response.json(); } catch (_) {} throw Object.assign(new Error(error?.message || error?.detail?.message || 'Gnani TTS request failed'), { status: 502 }); }
  const audio = Buffer.from(await response.arrayBuffer()).toString('base64');
  console.info('Gnani TTS succeeded:', { bytes: Buffer.byteLength(audio, 'base64'), language });
  return { audio, mimeType: response.headers.get('content-type') || 'audio/wav' };
}

async function summary({ messages, language }) {
  const key = requireConfig('GEMINI_API_KEY');
  const model = process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite';
  const transcript = messages.slice(-MAX_HISTORY).map(m => `Farmer: ${m.userTranscript}\nAssistant: ${m.assistantResponse}`).join('\n');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;
  const data = await postJson(url, { contents: [{ role: 'user', parts: [{ text: `Summarize this farming conversation in ${languageNames[language]} in 3 concise bullet points. Do not invent facts.\n${transcript}` }] }] });
  return data.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('').trim();
}

async function analyzeRecording({ transcript, language, service }) {
  const key = requireConfig('GEMINI_API_KEY');
  const model = process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite';
  const languageName = { english: 'English', hindi: 'Hindi', telugu: 'Telugu' }[language] || language;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;
  const instruction = `Analyze this farmer recording in ${languageName}. Service: ${service}. Return ONLY valid JSON with exactly these fields: summary (string), immediateAction (string), urgency (string), requiresContact (boolean), contactReason (string), response (string). urgency must be exactly normal, warning, or urgent. Set requiresContact true only when the farmer should contact a veterinarian, animal hospital, agriculture officer, or support service. Set it false for normal questions handled by general guidance. For serious animal symptoms set urgency urgent and requiresContact true. Never diagnose animals definitively or prescribe unsafe medicine dosages. For government schemes, tell the farmer to verify information with official sources. If incomplete, ask a follow-up question in response. Keep sentences short.`;
  let data;
  try { data = await postJson(url, { systemInstruction: { parts: [{ text: instruction }] }, contents: [{ role: 'user', parts: [{ text: transcript }] }], generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 1200 } }); } catch (error) { throw Object.assign(error, { status: 502, provider: 'Gemini', providerStatus: error.providerStatus || 'UNKNOWN', providerCode: error.providerCode || 'UNKNOWN', requestId: error.requestId || 'UNKNOWN' }); }
  const raw = data.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('').trim();
  if (!raw) throw Object.assign(new Error('Gemini returned no recording analysis'), { status: 502 });
  let result;
  try { result = JSON.parse(raw); } catch (_) { throw Object.assign(new Error('Gemini returned invalid analysis JSON'), { status: 502 }); }
  if (!['normal', 'warning', 'urgent'].includes(result.urgency) || typeof result.summary !== 'string' || typeof result.immediateAction !== 'string' || typeof result.requiresContact !== 'boolean' || typeof result.contactReason !== 'string' || typeof result.response !== 'string') throw Object.assign(new Error('Gemini returned incomplete analysis JSON'), { status: 502 });
  return result;
}

async function speakRecording({ text, language }) {
  const requestId = crypto.randomUUID();
  const response = await fetch(process.env.GNANI_TTS_URL || 'https://api.vachana.ai/api/v1/tts/inference', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-API-Key-ID': requireConfig('GNANI_API_KEY') }, body: JSON.stringify({ text, model: process.env.GNANI_TTS_MODEL || 'timbre-v2.5', voice: process.env.GNANI_TTS_VOICE || 'Kaveri', language: { english: 'en-IN', hindi: 'hi-IN', telugu: 'te-IN' }[language], audio_config: { encoding: 'linear_pcm', container: 'wav', num_channels: 1, sample_rate: 24000, sample_width: 2 } }) });
  if (!response.ok) { let data = {}; const responseText = await response.text(); try { data = JSON.parse(responseText); } catch (_) {} throw Object.assign(new Error(data.message || data.detail?.message || `Gnani TTS failed with ${response.status}`), { status: 502, provider: 'Gnani TTS', providerStatus: response.status, providerCode: data.error?.type || data.detail?.error_code || data.status_code || 'UNKNOWN', requestId: data.request_id || requestId }); }
  return { audioBase64: Buffer.from(await response.arrayBuffer()).toString('base64'), audioFormat: 'wav', audioSampleRate: 24000 };
}

module.exports = { transcribe, reply, speak, summary, analyzeRecording, speakRecording };
