import * as fs from 'fs'
import * as path from 'path'
import { getPaths } from './paths'

export interface DetectedGameInfo {
  name: string
  executable: string
  directory: string
  prefix: string | null
}

export interface DetectedRunner {
  name: string
  type: 'wine' | 'proton'
  path: string
}

function detectPrefix(exePath: string): string | null {
  let current = path.dirname(exePath)
  const root = path.parse(current).root

  while (current !== root) {
    const driveC = path.join(current, 'drive_c')
    const dosdevices = path.join(current, 'dosdevices')
    const pfx = path.join(current, 'pfx')

    const hasDriveC = fs.existsSync(driveC)
    const hasDosdevices = fs.existsSync(dosdevices)
    const hasPfx = fs.existsSync(pfx)
    const insideDriveC = current.includes('/drive_c/')

    if (!insideDriveC && hasDriveC && hasDosdevices) {
      return current
    }

    if (!insideDriveC && hasPfx && fs.existsSync(path.join(pfx, 'drive_c'))) {
      return pfx
    }

    current = path.dirname(current)
  }

  return null
}

export function detectGame(exePath: string): DetectedGameInfo {
  const name = path.basename(exePath, '.exe')
  const prefix = detectPrefix(exePath)
  const directory = path.dirname(exePath)

  return {
    name,
    executable: exePath,
    directory,
    prefix,
  }
}

const PROTON_DIRS = [
  '~/.steam/steam/compatibilitytools.d',
  '~/.local/share/Steam/compatibilitytools.d',
]

export function detectRunners(): DetectedRunner[] {
  const runners: DetectedRunner[] = []
  const home = process.env.HOME || ''
  const paths = getPaths()

  for (const dir of PROTON_DIRS) {
    const protonDir = dir.replace('~', home)
    if (!fs.existsSync(protonDir)) {
      continue
    }

    for (const name of fs.readdirSync(protonDir)) {
      const protonPath = path.join(protonDir, name)
      const wineBin = path.join(protonPath, 'files/bin/wine')
      if (fs.existsSync(wineBin)) {
        runners.push({ name, type: 'proton', path: protonPath })
      }
    }
  }

  const ourRunnersDir = path.join(paths.base, 'runners')
  if (fs.existsSync(ourRunnersDir)) {
    for (const name of fs.readdirSync(ourRunnersDir)) {
      const runnerPath = path.join(ourRunnersDir, name)
      const wineBin = path.join(runnerPath, 'files/bin/wine')
      if (fs.existsSync(wineBin)) {
        runners.push({ name, type: 'proton', path: runnerPath })
      }
    }
  }

  const systemWine = '/usr/bin/wine'
  if (fs.existsSync(systemWine)) {
    runners.push({ name: 'System Wine', type: 'wine', path: systemWine })
  }

  return runners
}
