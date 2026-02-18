import { Routes, Route, NavLink } from 'react-router-dom'
import { Gamepad2, Settings } from 'lucide-react'
import Library from './pages/Library'
import SettingsPage from './pages/Settings'

function App() {
  return (
    <div className="min-h-screen flex">
      {/* Sidebar */}
      <nav className="w-16 bg-card border-r flex flex-col items-center py-4 gap-2">
        <NavLink
          to="/"
          className={({ isActive }) =>
            `w-10 h-10 flex items-center justify-center rounded-lg transition ${
              isActive
                ? 'bg-accent text-accent-foreground'
                : 'hover:bg-accent hover:text-accent-foreground'
            }`
          }
          title="Library"
        >
          <Gamepad2 className="h-5 w-5" />
        </NavLink>
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            `w-10 h-10 flex items-center justify-center rounded-lg transition ${
              isActive
                ? 'bg-accent text-accent-foreground'
                : 'hover:bg-accent hover:text-accent-foreground'
            }`
          }
          title="Settings"
        >
          <Settings className="h-5 w-5" />
        </NavLink>
      </nav>

      {/* Main content */}
      <main className="flex-1 overflow-auto bg-background">
        <Routes>
          <Route path="/" element={<Library />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </main>
    </div>
  )
}

export default App
