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
  form.append('audio_file', new Blob([Buffer.from(audio, 'base64')], { type: mimeType }), 'recording');
  form.append('language_code', { english: 'en-IN', hindi: 'hi-IN', telugu: 'te-IN' }[language]);
  form.append('model', process.env.GNANI_STT_MODEL || 'prisma-v2.5');
  const response = await fetch(process.env.GNANI_STT_URL || 'https://api.vachana.ai/stt/v3', { method: 'POST', headers: { 'X-API-Key-ID': apiKey }, body: form });
  const responseText = await response.text();
  let data;
  try { data = JSON.parse(responseText); } catch (_) { data = {}; }
  if (!response.ok) {
    console.error('Gnani STT error:', response.status, responseText);
    throw Object.assign(new Error(data.message || data.detail?.message || `Gnani STT failed with ${response.status}: ${responseText}`), { status: 502 });
  }
  return data.text || data.transcript || data.data?.text || data.data?.transcript;
}

async function reply({ transcript, history, language, service }) {
  const key = requireConfig('GEMINI_API_KEY');
  const model = process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite';
  const contents = [...history.slice(-MAX_HISTORY).map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.text }] })), { role: 'user', parts: [{ text: transcript }] }];
  const prompt = `You are a careful farming assistant. Reply only in ${languageNames[language]}. Service: ${service}. Give practical, cautious guidance. Never make a definitive animal diagnosis or prescribe unsafe medicine dosages. For emergencies, tell the farmer to contact a veterinarian immediately. For government schemes, say they must verify details with official sources. If uncertain, say so.`;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;
  const data = await postJson(url, { systemInstruction: { parts: [{ text: prompt }] }, contents, generationConfig: { maxOutputTokens: 1200 } });
  return data.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('').trim();
}

async function speak({ text, language }) {
  const response = await fetch(process.env.GNANI_TTS_URL || 'https://api.vachana.ai/api/v1/tts/inference', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-API-Key-ID': requireConfig('GNANI_API_KEY') }, body: JSON.stringify({ text, model: process.env.GNANI_TTS_MODEL || 'timbre-v2.5', voice: process.env.GNANI_TTS_VOICE || 'Kaveri', language: { english: 'en-IN', hindi: 'hi-IN', telugu: 'te-IN' }[language], audio_config: { encoding: 'linear_pcm', container: 'wav', num_channels: 1, sample_rate: 48000, sample_width: 2 } }) });
  if (!response.ok) { let error; try { error = await response.json(); } catch (_) {} throw Object.assign(new Error(error?.message || error?.detail?.message || 'Gnani TTS request failed'), { status: 502 }); }
  return { audio: Buffer.from(await response.arrayBuffer()).toString('base64'), mimeType: response.headers.get('content-type') || 'audio/wav' };
}

async function summary({ messages, language }) {
  const key = requireConfig('GEMINI_API_KEY');
  const model = process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite';
  const transcript = messages.slice(-MAX_HISTORY).map(m => `Farmer: ${m.userTranscript}\nAssistant: ${m.assistantResponse}`).join('\n');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;
  const data = await postJson(url, { contents: [{ role: 'user', parts: [{ text: `Summarize this farming conversation in ${languageNames[language]} in 3 concise bullet points. Do not invent facts.\n${transcript}` }] }] });
  return data.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('').trim();
}

module.exports = { transcribe, reply, speak, summary };
