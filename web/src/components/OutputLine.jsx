import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import CodeBlock from './CodeBlock'

/** Custom renderers passed to ReactMarkdown */
const markdownComponents = {
  // Unwrap the outer <pre> — CodeBlock renders its own
  pre({ children }) {
    return <>{children}</>
  },
  code({ inline, className, children }) {
    const match = /language-(\w+)/.exec(className || '')
    const lang = match ? match[1] : ''
    const code = String(children).replace(/\n$/, '')

    if (inline) {
      return <code className="inline-code">{children}</code>
    }
    return <CodeBlock code={code} language={lang} />
  },
}

/**
 * Renders a single terminal output line.
 *
 * Line types:
 *   input      – echoed user command (with prompt)
 *   system     – dim status / info message
 *   error      – red error message
 *   help       – preformatted help text (box drawing)
 *   assistant  – Melvin's response (Markdown with copyable code blocks)
 */
export default function OutputLine({ line, streaming = false }) {
  const { type, content } = line

  switch (type) {
    case 'input':
      return (
        <div className="output-line line-input">
          <span className="echo-prompt">melvin@melvai:~$&nbsp;</span>
          <span className="echo-cmd">{content}</span>
        </div>
      )

    case 'system':
      return (
        <div className="output-line line-system">
          <span className="sys-prefix">╌╌&nbsp;</span>
          <span>{content}</span>
        </div>
      )

    case 'error':
      return (
        <div className="output-line line-error">
          <span className="err-prefix">✗&nbsp;</span>
          <span>{content}</span>
        </div>
      )

    case 'help':
      return (
        <div className="output-line line-help">
          <pre className="help-pre">{content}</pre>
        </div>
      )

    case 'assistant':
      return (
        <div className={`output-line line-assistant${streaming ? ' streaming' : ''}`}>
          <div className="melvin-header">
            <span className="melvin-label">Melvin</span>
            <span className="melvin-arrow">&nbsp;›&nbsp;</span>
          </div>
          <div className="melvin-body">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
              {content}
            </ReactMarkdown>
            {streaming && <span className="cursor-blink" aria-hidden="true">▋</span>}
          </div>
        </div>
      )

    default:
      return (
        <div className="output-line line-generic">
          <span>{content}</span>
        </div>
      )
  }
}
