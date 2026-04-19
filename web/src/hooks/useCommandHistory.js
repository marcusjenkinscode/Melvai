import { useRef, useCallback } from 'react'

const MAX_HISTORY = 100

/**
 * Manages a command history stack.
 * Arrow-up/down navigates through past commands.
 */
export default function useCommandHistory() {
  const history = useRef([])
  const index = useRef(-1)

  const pushHistory = useCallback((cmd) => {
    // Don't duplicate the most-recent entry
    if (cmd && history.current[0] !== cmd) {
      history.current = [cmd, ...history.current].slice(0, MAX_HISTORY)
    }
    index.current = -1
  }, [])

  const navigateHistory = useCallback((direction) => {
    const len = history.current.length
    if (len === 0) return null

    if (direction === 'up') {
      index.current = Math.min(index.current + 1, len - 1)
    } else {
      index.current = Math.max(index.current - 1, -1)
    }

    return index.current === -1 ? '' : history.current[index.current]
  }, [])

  const resetHistoryIndex = useCallback(() => {
    index.current = -1
  }, [])

  return { pushHistory, navigateHistory, resetHistoryIndex }
}
