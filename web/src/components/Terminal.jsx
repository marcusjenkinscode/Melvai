import { useState, useEffect, useRef, useCallback } from 'react'
import AsciiArt from './AsciiArt'
import OutputLine from './OutputLine'
import useCommandHistory from '../hooks/useCommandHistory'
import { fetchModels, streamChat } from '../utils/ollamaClient'
import { getHelpText } from '../utils/commands'

const SYSTEM_PROMPT =
  'You are Melvin, a knowledgeable AI assistant for Melvai.com. ' +
  'You are accessed through a terminal web interface. ' +
  'When providing code always use markdown fenced code blocks with the language name (e.g. ```python). ' +
  'Be helpful, clear, and concise.'

let lineIdCounter = 0
const nextId = () => ++lineIdCounter

export default function Terminal() {
  const [lines, setLines] = useState([])
  const [input, setInput] = useState('')
  const [model, setModel] = useState(null)
  const [models, setModels] = useState([])
  const [messages, setMessages] = useState([]) // conversation history sent to API
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamContent, setStreamContent] = useState('')
  const [connected, setConnected] = useState(null) // null=unknown true=ok false=error
  const [awaitingModelSelect, setAwaitingModelSelect] = useState(false)

  const inputRef = useRef(null)
  const outputRef = useRef(null)
  const abortCtrl = useRef(null)

  const { pushHistory, navigateHistory, resetHistoryIndex } = useCommandHistory()

  // ─── helpers ────────────────────────────────────────────────────────────────

  const addLine = useCallback((type, content) => {
    setLines((prev) => [...prev, { id: nextId(), type, content }])
  }, [])

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      if (outputRef.current) {
        outputRef.current.scrollTop = outputRef.current.scrollHeight
      }
    })
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [lines, streamContent, scrollToBottom])

  // ─── boot sequence ───────────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false
    const boot = async () => {
      addLine('system', 'Initializing Melvin AI…')
      try {
        const data = await fetchModels()
        if (cancelled) return
        setModels(data)
        setConnected(true)

        const preferred = data.find((m) => m.name.startsWith('melvin'))
        const active = preferred?.name ?? data[0]?.name ?? 'llama3.2'
        setModel(active)

        addLine('system', `Connected · ${data.length} model(s) available`)
        addLine('system', `Active model: ${active}`)
        addLine('system', "Type /help for commands or start chatting with Melvin.")
      } catch (err) {
        if (cancelled) return
        setConnected(false)
        addLine('error', 'Could not connect to Ollama. Is the API server running?')
        addLine('error', err.message)
        addLine('system', 'Try: cd server && npm start')
        addLine('system', "Type /help for commands. Connection retried on each request.")
      }
    }
    boot()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ─── focus management ────────────────────────────────────────────────────────

  const focusInput = useCallback(() => {
    inputRef.current?.focus()
  }, [])

  // ─── keyboard shortcuts ──────────────────────────────────────────────────────

  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        const cmd = navigateHistory('up')
        if (cmd !== null) setInput(cmd)
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        const cmd = navigateHistory('down')
        setInput(cmd ?? '')
      } else if (e.ctrlKey && e.key === 'c') {
        e.preventDefault()
        abortCtrl.current?.abort()
        if (isStreaming) {
          setIsStreaming(false)
          setStreamContent('')
          addLine('system', '^C')
        }
        setInput('')
        resetHistoryIndex()
      } else if (e.ctrlKey && e.key === 'l') {
        e.preventDefault()
        setLines([])
      }
    },
    [navigateHistory, resetHistoryIndex, isStreaming, addLine]
  )

  // ─── slash commands ──────────────────────────────────────────────────────────

  const handleSlashCommand = useCallback(
    async (raw) => {
      const parts = raw.slice(1).split(' ')
      const cmd = parts[0].toLowerCase()
      const args = parts.slice(1).join(' ').trim()

      switch (cmd) {
        case 'help':
          addLine('help', getHelpText())
          break

        case 'clear':
          setLines([])
          break

        case 'reset':
          setMessages([])
          addLine('system', 'Conversation history cleared.')
          break

        case 'models': {
          addLine('system', 'Fetching available models…')
          try {
            const data = await fetchModels()
            setModels(data)
            setConnected(true)
            if (data.length === 0) {
              addLine('error', 'No models found. Pull one with: ollama pull llama3.2')
              break
            }
            const list = data
              .map((m, i) => {
                const tag = m.source === 'kimi' ? ' [cloud]' : ''
                const active = m.name === model ? ' ←' : ''
                return `  ${i + 1}. ${m.name}${tag}${active}`
              })
              .join('\n')
            addLine('system', `Available models:\n${list}\n\nEnter number or name to switch:`)
            setAwaitingModelSelect(true)
          } catch (err) {
            setConnected(false)
            addLine('error', `Failed to fetch models: ${err.message}`)
          }
          break
        }

        case 'model': {
          if (!args) {
            addLine('system', `Current model: ${model ?? 'none'}`)
          } else {
            const found =
              models.find((m) => m.name === args) ||
              models.find((m) => m.name.startsWith(args))
            if (found) {
              setModel(found.name)
              addLine('system', `Model switched to: ${found.name}`)
            } else {
              addLine('error', `Model not found: "${args}". Use /models to see available models.`)
            }
          }
          break
        }

        case 'system': {
          if (!args) {
            const sysMsg = messages.find((m) => m.role === 'system')
            addLine(
              'system',
              sysMsg ? `System prompt: ${sysMsg.content}` : 'Using default Melvin system prompt.'
            )
          } else {
            setMessages((prev) => [
              { role: 'system', content: args },
              ...prev.filter((m) => m.role !== 'system'),
            ])
            addLine('system', 'System prompt updated.')
          }
          break
        }

        default:
          addLine('error', `Unknown command: /${cmd}  — type /help for commands.`)
      }
    },
    [model, models, messages, addLine]
  )

  // ─── chat with AI ────────────────────────────────────────────────────────────

  const handleChat = useCallback(
    async (userMessage) => {
      if (isStreaming) {
        addLine('error', 'Melvin is responding. Press Ctrl+C to cancel.')
        return
      }
      if (!model) {
        addLine('error', 'No model selected. Type /models to choose one.')
        return
      }

      const history = messages.filter((m) => m.role !== 'system')
      const chatMessages = [
        { role: 'system', content: SYSTEM_PROMPT },
        ...history,
        { role: 'user', content: userMessage },
      ]

      setIsStreaming(true)
      setStreamContent('')

      const ctrl = new AbortController()
      abortCtrl.current = ctrl
      let fullContent = ''

      try {
        for await (const token of streamChat(model, chatMessages, ctrl.signal)) {
          fullContent += token
          setStreamContent(fullContent)
        }
        setMessages((prev) => [
          ...prev.filter((m) => m.role !== 'system'),
          { role: 'user', content: userMessage },
          { role: 'assistant', content: fullContent },
        ])
        addLine('assistant', fullContent)
      } catch (err) {
        if (err.name !== 'AbortError') {
          addLine('error', `Error: ${err.message}`)
        }
      } finally {
        setIsStreaming(false)
        setStreamContent('')
        abortCtrl.current = null
      }
    },
    [isStreaming, model, messages, addLine]
  )

  // ─── model selection prompt ──────────────────────────────────────────────────

  const resolveModelSelect = useCallback(
    (input) => {
      setAwaitingModelSelect(false)
      const num = parseInt(input, 10)
      let found = null

      if (!isNaN(num) && num >= 1 && num <= models.length) {
        found = models[num - 1]
      } else {
        found =
          models.find((m) => m.name === input) ||
          models.find((m) => m.name.startsWith(input))
      }

      if (found) {
        setModel(found.name)
        addLine('system', `Model switched to: ${found.name}`)
      } else {
        addLine('error', `Unknown selection: "${input}". Type /models to try again.`)
      }
    },
    [models, addLine]
  )

  // ─── form submit ─────────────────────────────────────────────────────────────

  const handleSubmit = useCallback(
    async (e) => {
      e.preventDefault()
      const cmd = input.trim()
      if (!cmd) return

      setInput('')
      pushHistory(cmd)
      resetHistoryIndex()

      if (awaitingModelSelect) {
        addLine('input', cmd)
        resolveModelSelect(cmd)
        return
      }

      addLine('input', cmd)

      if (cmd.startsWith('/')) {
        await handleSlashCommand(cmd)
      } else {
        await handleChat(cmd)
      }
    },
    [
      input,
      awaitingModelSelect,
      pushHistory,
      resetHistoryIndex,
      resolveModelSelect,
      addLine,
      handleSlashCommand,
      handleChat,
    ]
  )

  // ─── render ──────────────────────────────────────────────────────────────────

  const statusClass =
    connected === true ? 'status-online' : connected === false ? 'status-offline' : 'status-connecting'
  const statusLabel =
    connected === true ? '● connected' : connected === false ? '● offline' : '● connecting…'

  return (
    <div className="terminal-wrapper" onClick={focusInput}>
      {/* macOS-style title bar */}
      <div className="term-titlebar">
        <span className="dot dot-red" />
        <span className="dot dot-yellow" />
        <span className="dot dot-green" />
        <span className="term-title">melvin@melvai.com — terminal</span>
        <span className={`term-status ${statusClass}`}>{statusLabel}</span>
      </div>

      {/* Scrollable output area */}
      <div className="term-output" ref={outputRef}>
        <AsciiArt />

        {lines.map((line) => (
          <OutputLine key={line.id} line={line} />
        ))}

        {/* Live streaming response */}
        {isStreaming && (
          <OutputLine
            line={{ id: 'stream', type: 'assistant', content: streamContent }}
            streaming
          />
        )}
      </div>

      {/* Input area */}
      <div className="term-input-bar">
        <span className="input-prompt">
          <span className="prompt-model">[{model ?? '…'}]</span>
          <span className="prompt-host"> melvin@melvai</span>
          <span className="prompt-sep">:~$&nbsp;</span>
        </span>
        <form onSubmit={handleSubmit} style={{ display: 'contents' }}>
          <input
            ref={inputRef}
            className="term-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            autoFocus
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck="false"
            disabled={isStreaming}
            placeholder={
              isStreaming
                ? 'Melvin is responding… (Ctrl+C to cancel)'
                : awaitingModelSelect
                ? 'Enter model number or name…'
                : ''
            }
          />
        </form>
      </div>
    </div>
  )
}
