/**
 * Ollama / Melvai API client utilities.
 *
 * All API calls go to /api/* which is proxied by Vite (dev) or Express (prod)
 * to the Ollama instance or Kimi cloud API running on the VPS.
 */

/**
 * Fetch the list of available models from the API server.
 * @returns {Promise<Array<{name: string, source: string, displayName?: string}>>}
 */
export async function fetchModels() {
  const res = await fetch('/api/models')
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  if (data.error) throw new Error(data.error)
  return data.models || []
}

/**
 * Stream a chat response from the active model.
 *
 * Yields string tokens as they arrive from the NDJSON stream.
 * Throws if the request fails or the server returns an error object.
 *
 * @param {string} model  - Model name (e.g. "melvin", "llama3.2", "kimi-8k")
 * @param {Array<{role: string, content: string}>} messages - Conversation history
 * @param {AbortSignal} signal - AbortSignal to cancel mid-stream
 * @yields {string} token
 */
export async function* streamChat(model, messages, signal) {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages }),
    signal,
  })

  if (!res.ok) {
    let msg = `HTTP ${res.status}`
    try {
      const data = await res.json()
      if (data.error) msg = data.error
    } catch { /* ignore */ }
    throw new Error(msg)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? '' // keep the (possibly incomplete) last fragment

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue
      try {
        const data = JSON.parse(trimmed)
        if (data.error) throw new Error(data.error)
        if (data.message?.content) yield data.message.content
        if (data.done) return
      } catch (e) {
        // Only re-throw real errors, not JSON parse failures on partial frames
        if (e.message && !e.message.includes('JSON')) throw e
      }
    }
  }
}
