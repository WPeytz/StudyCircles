/**
 * Minimal client for your AI endpoint.
 * You can implement a serverless function that proxies to your LLM provider
 * and call it here — keeping API keys on the server.
 */
export async function askAI({ prompt, course }) {
  // By default, return a mocked answer for local dev
  if (!import.meta.env.VITE_AI_ENDPOINT) {
    return {
      answer: `This is a mock draft answer.\n\nYou asked: "${prompt}"${course ? ` (Course: ${course})` : ''}.\n\nWire up VITE_AI_ENDPOINT to get real answers.`
    }
  }
  const res = await fetch(import.meta.env.VITE_AI_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, course })
  })
  if (!res.ok) throw new Error('AI endpoint failed')
  return await res.json()
}