import { useCallback, useEffect, useRef, useState } from 'react'
import type { ActivityEvent, Selection } from '@/types/app-shell'

const DEFAULT_STATUS_LINE = '> awaiting input...'
const DEFAULT_AUTO_CLEAR_MS = 4000

function normalizeStatusLine(message: string): string {
  return message.startsWith('>') ? message : `> ${message}`
}

export function useStatusBar(autoClearMs = DEFAULT_AUTO_CLEAR_MS) {
  const [statusLine, setStatusLineState] = useState(DEFAULT_STATUS_LINE)
  const [activityLog, setActivityLog] = useState<ActivityEvent[]>([])
  const clearTimerRef = useRef<number | null>(null)

  const cancelPendingClear = useCallback(() => {
    if (clearTimerRef.current !== null) {
      window.clearTimeout(clearTimerRef.current)
      clearTimerRef.current = null
    }
  }, [])

  const setStatusLine = useCallback((message: string) => {
    cancelPendingClear()
    setStatusLineState(normalizeStatusLine(message))
  }, [cancelPendingClear])

  const pushActivity = useCallback((message: string, selection?: Selection) => {
    setActivityLog((current) => [
      {
        id: Date.now() + current.length,
        message,
        timestamp: new Date().toISOString(),
        selection,
      },
      ...current,
    ].slice(0, 12))
  }, [])

  const reportStatus = useCallback((message: string, selection?: Selection) => {
    const normalized = normalizeStatusLine(message)
    cancelPendingClear()
    setStatusLineState(normalized)
    pushActivity(normalized.replace(/^>\s*/, ''), selection)

    if (autoClearMs > 0) {
      clearTimerRef.current = window.setTimeout(() => {
        setStatusLineState(DEFAULT_STATUS_LINE)
        clearTimerRef.current = null
      }, autoClearMs)
    }
  }, [autoClearMs, cancelPendingClear, pushActivity])

  useEffect(() => {
    return () => {
      cancelPendingClear()
    }
  }, [cancelPendingClear])

  return {
    statusLine,
    activityLog,
    reportStatus,
    setStatusLine,
  }
}
