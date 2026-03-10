import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatPlaytimeHours(hours: number): string {
  if (!Number.isFinite(hours) || hours <= 0) {
    return '0h'
  }

  if (hours >= 10) {
    return `${Math.round(hours)}h`
  }

  const roundedHours = Math.round(hours * 10) / 10
  return `${roundedHours.toFixed(1).replace(/\.0$/, '')}h`
}
