const { checkPreflight } = require('../dist/main/services/preflight')

;(async () => {
  const report = await checkPreflight()
  if (!report || !Array.isArray(report.checks)) {
    console.error('FAIL: checkPreflight did not return a report with .checks')
    process.exit(1)
  }

  const names = report.checks.map((check) => check.name).sort()
  const expected = ['7z', 'chmod', 'pkill', 'tar', 'umu-run', 'unzip', 'wine', 'xz', 'zenity', 'zstd'].sort()

  for (const name of expected) {
    if (!names.includes(name)) {
      console.error(`FAIL: preflight missing check for ${name}`)
      process.exit(1)
    }
  }

  console.log('OK: preflight returned', report.checks.length, 'checks')
})().catch((error) => {
  console.error('FAIL:', error instanceof Error ? error.message : String(error))
  process.exit(1)
})
