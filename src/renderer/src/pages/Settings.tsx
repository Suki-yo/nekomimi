import { useEffect, useState } from 'react'
import type { AppConfig } from '../../../shared/types/config'

function Settings() {
  const [config, setConfig] = useState<AppConfig | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadConfig()
  }, [])

  const loadConfig = async () => {
    try {
      setLoading(true)
      const appConfig = await window.api.invoke('config:get')
      setConfig(appConfig)
    } finally {
      setLoading(false)
    }
  }

  const updateConfig = async (updates: Partial<AppConfig>) => {
    const updated = await window.api.invoke('config:update', updates)
    setConfig(updated)
  }

  if (loading || !config) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-zinc-400">Loading settings...</div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-2xl">
      <h1 className="text-2xl font-bold mb-6">Settings</h1>

      {/* Appearance */}
      <section className="mb-8">
        <h2 className="text-lg font-medium mb-4 text-zinc-300">Appearance</h2>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span>Theme</span>
            <select
              value={config.ui.theme}
              onChange={(e) =>
                updateConfig({
                  ui: { ...config.ui, theme: e.target.value as 'light' | 'dark' | 'auto' },
                })
              }
              className="bg-zinc-700 rounded px-3 py-1.5"
            >
              <option value="auto">Auto</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </div>

          <div className="flex items-center justify-between">
            <span>View Mode</span>
            <select
              value={config.ui.viewMode}
              onChange={(e) =>
                updateConfig({
                  ui: { ...config.ui, viewMode: e.target.value as 'grid' | 'list' },
                })
              }
              className="bg-zinc-700 rounded px-3 py-1.5"
            >
              <option value="grid">Grid</option>
              <option value="list">List</option>
            </select>
          </div>
        </div>
      </section>

      {/* Runner */}
      <section className="mb-8">
        <h2 className="text-lg font-medium mb-4 text-zinc-300">Runner</h2>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span>Default Runner Type</span>
            <select
              value={config.runner.defaultType}
              onChange={(e) =>
                updateConfig({
                  runner: {
                    ...config.runner,
                    defaultType: e.target.value as 'wine' | 'proton' | 'native',
                  },
                })
              }
              className="bg-zinc-700 rounded px-3 py-1.5"
            >
              <option value="proton">Proton</option>
              <option value="wine">Wine</option>
              <option value="native">Native</option>
            </select>
          </div>
        </div>
      </section>

      {/* Info */}
      <section>
        <h2 className="text-lg font-medium mb-4 text-zinc-300">About</h2>
        <div className="text-zinc-400 text-sm space-y-1">
          <p>Nekomimi v{window.api.version}</p>
          <p>The anime game launcher for people who simp too hard.</p>
        </div>
      </section>
    </div>
  )
}

export default Settings
