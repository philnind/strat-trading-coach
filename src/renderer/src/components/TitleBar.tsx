/**
 * TitleBar Component
 * Top app bar with title, connection status, and settings button
 */

import type React from 'react'
import { Settings } from 'lucide-react'
import { useSettingsStore } from '../stores/settings-store'

interface TitleBarProps {
  onSettingsClick: () => void
}

export function TitleBar({ onSettingsClick }: TitleBarProps): React.ReactElement {
  const isConnected = useSettingsStore((state) => state.isConnected)

  return (
    <header className="flex h-12 items-center justify-between border-b border-zinc-800 bg-zinc-900 px-4">
      {/* Left side - App title */}
      <div className="flex items-center gap-2">
        <h1 className="text-xs font-semibold">STRAT Monitor</h1>
        <span className="text-xs text-zinc-500">AI Trading Coach</span>
      </div>

      {/* Right side - Status and settings */}
      <div className="flex items-center gap-3">
        {/* Connection Status */}
        <div className="flex items-center gap-1.5">
          <div
            className={`h-2 w-2 rounded-full ${
              isConnected ? 'bg-emerald-500' : 'bg-red-500'
            }`}
          />
          <span className="text-xs text-zinc-400">
            {isConnected ? 'Connected' : 'Disconnected'}
          </span>
        </div>

        {/* Settings Button */}
        <button
          onClick={onSettingsClick}
          className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 transition-colors"
          aria-label="Settings"
        >
          <Settings className="h-4 w-4" />
        </button>
      </div>
    </header>
  )
}
