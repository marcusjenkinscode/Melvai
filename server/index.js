/**
 * Melvai API Server
 *
 * Responsibilities:
 *  - Proxy chat requests to Ollama (local LLM) or Kimi (cloud)
 *  - Expose a unified /api/models and /api/chat endpoint
 *  - Serve the built React frontend in production
 *
 * Environment variables:
 *   PORT             TCP port (default: 3000)
 *   OLLAMA_BASE_URL  Ollama base URL (default: http://localhost:11434)
 *   KIMI_API_KEY     Moonshot/Kimi API key (optional)
 *   CORS_ORIGIN      Allowed CORS origin — REQUIRED in production
 */

import express from 'express'
import cors from 'cors'
import rateLimit from 'express-rate-limit'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const PORT = process.env.PORT || 3000
const OLLAMA_BASE_URL = (process.env.OLLAMA_BASE_URL || 'http://localhost:11434').replace(/\/$/, '')
const KIMI_API_KEY = process.env.KIMI_API_KEY || ''

// In production CORS_ORIGIN must be explicitly set to the site domain.
// Refuse to start in production without it to prevent accidental misconfiguration.
if (process.env.NODE_ENV === 'production' && !process.env.CORS_ORIGIN) {
  console.error('ERROR: CORS_ORIGIN must be set in production (e.g. https://melvai.com)')
  process.exit(1)
}
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:5173'

const app = express()

app.use(cors({ origin: CORS_ORIGIN }))
app.use(express.json({ limit: '1mb' }))

// Rate limiter for API routes: 120 requests per minute per IP
const apiLimiter = rateLimit({
  windowMs: 60_000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
})

app.use('/api', apiLimiter)

// ─── Health check ─────────────────────────────────────────────────────────────

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', ollama: OLLAMA_BASE_URL, kimi: Boolean(KIMI_API_KEY) })
})

// ─── List available models ────────────────────────────────────────────────────

app.get('/api/models', async (_req, res) => {
  try {
    const ollamaRes = await fetch(`${OLLAMA_BASE_URL}/api/tags`, {
      signal: AbortSignal.timeout(10_000),
    })

    if (!ollamaRes.ok) {
      return res.status(502).json({ error: `Ollama returned ${ollamaRes.status}` })
    }

    const data = await ollamaRes.json()
    const ollamaModels = (data.models || []).map((m) => ({
      name: m.name,
      source: 'ollama',
      size: m.size,
      modified: m.modified_at,
    }))

    // Add Kimi cloud models when API key is configured
    const kimiModels = KIMI_API_KEY
      ? [
          { name: 'kimi-8k', displayName: 'Kimi (Moonshot 8k)', source: 'kimi' },
          { name: 'kimi-32k', displayName: 'Kimi (Moonshot 32k)', source: 'kimi' },
          { name: 'kimi-128k', displayName: 'Kimi (Moonshot 128k)', source: 'kimi' },
        ]
      : []

    res.json({ models: [...ollamaModels, ...kimiModels] })
  } catch (err) {
    res.status(503).json({ error: `Cannot reach Ollama: ${err.message}` })
  }
})

// ─── Streaming chat ───────────────────────────────────────────────────────────

app.post('/api/chat', async (req, res) => {
  const { model, messages } = req.body

  if (!model || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'model and messages[] are required' })
  }

  // Set up streaming headers (NDJSON)
  res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()

  try {
    if (model.startsWith('kimi-')) {
      await streamKimi(req, res, model, messages)
    } else {
      await streamOllama(req, res, model, messages)
    }
  } catch (err) {
    if (!res.writableEnded) {
      res.write(JSON.stringify({ error: err.message }) + '\n')
      res.end()
    }
  }
})

/**
 * Proxy streaming chat request to Ollama.
 * Passes the NDJSON stream through unchanged so the client can parse it
 * with the same logic regardless of model source.
 */
async function streamOllama(req, res, model, messages) {
  const upstream = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, stream: true }),
    signal: AbortSignal.timeout(300_000),
  })

  if (!upstream.ok) {
    res.write(JSON.stringify({ error: `Ollama error ${upstream.status}` }) + '\n')
    res.end()
    return
  }

  for await (const chunk of upstream.body) {
    if (req.socket.destroyed) break
    res.write(chunk)
  }
  res.end()
}

/**
 * Call the Kimi (Moonshot) OpenAI-compatible API and convert its
 * Server-Sent Events stream into the Ollama NDJSON format so the
 * browser client can handle all models uniformly.
 */
async function streamKimi(req, res, model, messages) {
  if (!KIMI_API_KEY) {
    res.write(JSON.stringify({ error: 'KIMI_API_KEY is not configured on the server' }) + '\n')
    res.end()
    return
  }

  const kimiModelMap = {
    'kimi-8k': 'moonshot-v1-8k',
    'kimi-32k': 'moonshot-v1-32k',
    'kimi-128k': 'moonshot-v1-128k',
  }
  const kimiModel = kimiModelMap[model] || 'moonshot-v1-8k'

  const upstream = await fetch('https://api.moonshot.cn/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${KIMI_API_KEY}`,
    },
    body: JSON.stringify({ model: kimiModel, messages, stream: true }),
    signal: AbortSignal.timeout(300_000),
  })

  if (!upstream.ok) {
    res.write(JSON.stringify({ error: `Kimi API error ${upstream.status}` }) + '\n')
    res.end()
    return
  }

  const reader = upstream.body.getReader()
  const decoder = new TextDecoder()

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    const text = decoder.decode(value, { stream: true })
    for (const line of text.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data: ')) continue
      const payload = trimmed.slice(6)
      if (payload === '[DONE]') continue

      try {
        const parsed = JSON.parse(payload)
        const content = parsed.choices?.[0]?.delta?.content
        if (content) {
          // Emit in Ollama-compatible NDJSON format
          res.write(JSON.stringify({ message: { role: 'assistant', content }, done: false }) + '\n')
        }
      } catch {
        // skip malformed SSE frames
      }
    }
  }

  res.write(JSON.stringify({ done: true }) + '\n')
  res.end()
}

// ─── Serve static frontend (production) ──────────────────────────────────────

// Separate, more generous limiter for page loads (static HTML/assets).
// This prevents the catch-all file-system handler from being abused while
// still allowing normal browsing traffic.
const staticLimiter = rateLimit({
  windowMs: 60_000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
})

const distPath = path.join(__dirname, '../web/dist')
app.use(express.static(distPath))
app.get('*', staticLimiter, (_req, res) => {
  res.sendFile(path.join(distPath, 'index.html'))
})

// ─── Start ────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`\nMelvai API server running on http://localhost:${PORT}`)
  console.log(`Ollama : ${OLLAMA_BASE_URL}`)
  console.log(`Kimi   : ${KIMI_API_KEY ? 'configured' : 'not configured (set KIMI_API_KEY to enable)'}`)
  console.log()
})
