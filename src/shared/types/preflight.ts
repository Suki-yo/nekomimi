export type PreflightSeverity = 'required' | 'recommended'

export interface PreflightCheck {
  name: string
  binary: string
  severity: PreflightSeverity
  purpose: string
  installHint: string
  ok: boolean
  foundAt?: string
  error?: string
}

export interface PreflightReport {
  ok: boolean
  checks: PreflightCheck[]
  checkedAt: string
}
