import { useEffect, useState } from 'react'
import type { PreflightReport } from '@shared/types/preflight'

interface UsePreflightResult {
  report: PreflightReport | null
  loading: boolean
  refresh: () => Promise<void>
}

export function usePreflight(): UsePreflightResult {
  const [report, setReport] = useState<PreflightReport | null>(null)
  const [loading, setLoading] = useState(false)

  async function load(refresh = false): Promise<void> {
    setLoading(true)
    try {
      const channel = refresh ? 'preflight:refresh' : 'preflight:check'
      const nextReport = await window.api.invoke(channel)
      setReport(nextReport)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load(false)

    const handleFocus = () => {
      void load(true)
    }

    window.addEventListener('focus', handleFocus)
    return () => {
      window.removeEventListener('focus', handleFocus)
    }
  }, [])

  return {
    report,
    loading,
    refresh: async () => load(true),
  }
}
