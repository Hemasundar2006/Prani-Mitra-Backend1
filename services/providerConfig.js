function getProviderConfig() {
  const gnaniKey = process.env.GNANI_API_KEY_ID || process.env.GNANI_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;
  return { gnaniKey, geminiKey };
}

function logProviderConfig() {
  const { gnaniKey, geminiKey } = getProviderConfig();
  console.info('Provider configuration:', { gnaniConfigured: Boolean(gnaniKey), geminiConfigured: Boolean(geminiKey), nodeEnv: process.env.NODE_ENV });
  return { gnaniKey, geminiKey };
}

module.exports = { getProviderConfig, logProviderConfig };
