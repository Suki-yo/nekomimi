#!/usr/bin/env node
const fs = require('fs')
const path = require('path')

const repoRoot = path.resolve(__dirname, '..')
const ipcTypesPath = path.join(repoRoot, 'src', 'shared', 'types', 'ipc.ts')
const handlersDir = path.join(repoRoot, 'src', 'main', 'ipc')

const ipcSrc = fs.readFileSync(ipcTypesPath, 'utf-8')
const ipcChannelsBlock = ipcSrc.split('export interface IPCEvents')[0] || ipcSrc

const declared = new Set()
const declarationRegex = /['"]([a-z][a-z0-9]*:[a-zA-Z0-9-]+)['"]\s*:/g
let match
while ((match = declarationRegex.exec(ipcChannelsBlock)) !== null) {
  declared.add(match[1])
}

const handled = new Set()

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walk(full)
      continue
    }

    if (!entry.name.endsWith('.ts')) {
      continue
    }

    const src = fs.readFileSync(full, 'utf-8')
    const handlerRegex = /(?:ipcMain\.handle|register[A-Za-z]+Handler)\(\s*['"]([a-z][a-z0-9]*:[a-zA-Z0-9-]+)['"]/g
    let handlerMatch
    while ((handlerMatch = handlerRegex.exec(src)) !== null) {
      handled.add(handlerMatch[1])
    }
  }
}

walk(handlersDir)

const declaredNotHandled = [...declared].filter((channel) => !handled.has(channel))
const handledNotDeclared = [...handled].filter((channel) => !declared.has(channel))

let failed = false

if (declaredNotHandled.length > 0) {
  console.error('FAIL: channels declared in ipc.ts but not handled:')
  for (const channel of declaredNotHandled) {
    console.error('  -', channel)
  }
  failed = true
}

if (handledNotDeclared.length > 0) {
  console.error('FAIL: channels handled but not declared in ipc.ts:')
  for (const channel of handledNotDeclared) {
    console.error('  -', channel)
  }
  failed = true
}

if (failed) {
  process.exit(1)
}

console.log(`OK: ${declared.size} channels declared, all handled`)
