// Test process only: exercise the real Next route with deterministic ASR.
// All Groq traffic is intercepted; database/storage credentials must be blank.
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = String(input instanceof Request ? input.url : input);
  if (url.startsWith('https://api.groq.com/')) {
    if (url.endsWith('/audio/transcriptions')) return Response.json({
      text: '250 lunch.', segments: [{avg_logprob:-0.3,no_speech_prob:0.01}],
    });
    throw new Error('Unexpected model call: exact expense should bypass extraction');
  }
  return realFetch(input, init);
};
