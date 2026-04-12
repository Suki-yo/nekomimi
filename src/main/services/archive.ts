import { execFile } from 'child_process'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { promisify } from 'util'

const execFileP = promisify(execFile)

export interface ExtractOptions {
  src: string
  dest: string
  strip?: number
}

function isNestedTarArchive(filePath: string): boolean {
  const lower = filePath.toLowerCase()
  return lower.endsWith('.tar')
}

async function extractWith7z(src: string, dest: string): Promise<void> {
  await execFileP('7z', ['x', src, `-o${dest}`, '-y'], {
    maxBuffer: 1024 * 1024 * 64,
  })
}

function mergeIntoDest(srcPath: string, destPath: string): void {
  fs.cpSync(srcPath, destPath, {
    force: true,
    recursive: true,
  })
  fs.rmSync(srcPath, { recursive: true, force: true })
}

function flattenSingleRoot(dest: string, strip: number): void {
  for (let level = 0; level < strip; level += 1) {
    const entries = fs.readdirSync(dest)
    if (entries.length !== 1) {
      return
    }

    const innerPath = path.join(dest, entries[0])
    if (!fs.statSync(innerPath).isDirectory()) {
      return
    }

    for (const entry of fs.readdirSync(innerPath)) {
      fs.renameSync(path.join(innerPath, entry), path.join(dest, entry))
    }

    fs.rmdirSync(innerPath)
  }
}

export async function extractArchive(options: ExtractOptions): Promise<void> {
  const { src, dest, strip = 0 } = options

  if (!fs.existsSync(src)) {
    throw new Error(`archive not found: ${src}`)
  }

  fs.mkdirSync(dest, { recursive: true })

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nekomimi-archive-'))
  try {
    await extractWith7z(src, tempDir)

    const nestedEntries = fs.readdirSync(tempDir)
    const nestedTarPath =
      nestedEntries.length === 1
        ? path.join(tempDir, nestedEntries[0])
        : null

    if (nestedTarPath && fs.existsSync(nestedTarPath) && isNestedTarArchive(nestedTarPath)) {
      await extractWith7z(nestedTarPath, dest)
    } else {
      for (const entry of nestedEntries) {
        mergeIntoDest(path.join(tempDir, entry), path.join(dest, entry))
      }
    }

    if (strip > 0) {
      flattenSingleRoot(dest, strip)
    }
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
}
