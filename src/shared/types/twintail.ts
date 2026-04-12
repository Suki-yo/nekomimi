export interface TwintailImportStatus {
  twintailInstalled: boolean
  wuwaPrefixPath: string | null
  runnersPath: string | null
  xxmiPath: string | null
}

export interface TwintailImportOptions {
  importWuwaPrefix: boolean
  importRunners: boolean
  importXxmi: boolean
}

export interface TwintailImportResult {
  ok: boolean
  imported: string[]
  skipped: string[]
  error?: string
}
