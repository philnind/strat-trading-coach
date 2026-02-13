/**
 * Main Application Component
 * STRAT Monitor - AI Trading Coach
 */

import { useState } from 'react'
import type React from 'react'
import { TitleBar } from './components/TitleBar'
import { ChatPanel } from './components/ChatPanel'
import { SettingsModal } from './components/SettingsModal'
import './App.css'

function App(): React.ReactElement {
  const [settingsOpen, setSettingsOpen] = useState(false)

  return (
    <div className="flex h-screen flex-col bg-zinc-950 text-zinc-100">
      {/* Title Bar */}
      <TitleBar onSettingsClick={() => setSettingsOpen(true)} />

      {/* Main Content - Chat Panel */}
      <ChatPanel />

      {/* Settings Modal */}
      <SettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
    </div>
  )
}

export default App
