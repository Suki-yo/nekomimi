import { useEffect, useState } from 'react'

export function useClock(intervalMs = 1000): Date {
  const [clock, setClock] = useState(() => new Date())

  useEffect(() => {
    const interval = window.setInterval(() => {
      setClock(new Date())
    }, intervalMs)

    return () => window.clearInterval(interval)
  }, [intervalMs])

  return clock
}
