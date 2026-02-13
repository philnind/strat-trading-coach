/**
 * SettingsModal Component
 * Modal for app settings - API key, split ratio, preferences
 */

import type React from 'react'
import { useState } from 'react'
import { X, Eye, EyeOff, Check } from 'lucide-react'
import { useSettings } from '../hooks/use-settings'

interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
}

export function SettingsModal({ isOpen, onClose }: SettingsModalProps): React.ReactElement | null {
  const {
    hasApiKey,
    splitRatio,
    enablePromptCaching,
    enableSounds,
    setApiKey,
    setSplitRatio,
    setEnablePromptCaching,
    setEnableSounds,
  } = useSettings()

  const [apiKeyInput, setApiKeyInput] = useState('')
  const [showApiKey, setShowApiKey] = useState(false)
  const [isSavingApiKey, setIsSavingApiKey] = useState(false)
  const [apiKeyError, setApiKeyError] = useState<string | null>(null)
  const [apiKeySuccess, setApiKeySuccess] = useState(false)

  if (!isOpen) return null

  /**
   * Handle API key save
   */
  const handleSaveApiKey = async (): Promise<void> => {
    if (!apiKeyInput.trim()) {
      setApiKeyError('API key cannot be empty')
      return
    }

    setIsSavingApiKey(true)
    setApiKeyError(null)
    setApiKeySuccess(false)

    try {
      await setApiKey(apiKeyInput.trim())
      setApiKeySuccess(true)
      setApiKeyInput('')
      setTimeout(() => setApiKeySuccess(false), 3000)
    } catch (error) {
      setApiKeyError(error instanceof Error ? error.message : 'Failed to save API key')
    } finally {
      setIsSavingApiKey(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-lg border border-zinc-800 bg-zinc-900 p-6 shadow-xl">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Settings</h2>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-100 transition-colors"
            aria-label="Close settings"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Settings Content */}
        <div className="space-y-6">
          {/* API Key Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Claude API Key</label>
              {hasApiKey && (
                <span className="flex items-center gap-1 text-xs text-emerald-500">
                  <Check className="h-3 w-3" />
                  <span>Set</span>
                </span>
              )}
            </div>

            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type={showApiKey ? 'text' : 'password'}
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  placeholder="sk-ant-api03-..."
                  className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 pr-10 text-sm placeholder-zinc-500 focus:border-zinc-600 focus:outline-none"
                />
                <button
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 hover:bg-zinc-700"
                  aria-label={showApiKey ? 'Hide API key' : 'Show API key'}
                >
                  {showApiKey ? (
                    <EyeOff className="h-4 w-4 text-zinc-400" />
                  ) : (
                    <Eye className="h-4 w-4 text-zinc-400" />
                  )}
                </button>
              </div>
              <button
                onClick={handleSaveApiKey}
                disabled={isSavingApiKey || !apiKeyInput.trim()}
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isSavingApiKey ? 'Saving...' : 'Save'}
              </button>
            </div>

            {apiKeyError && (
              <p className="text-xs text-red-400">{apiKeyError}</p>
            )}
            {apiKeySuccess && (
              <p className="text-xs text-emerald-400">API key saved successfully!</p>
            )}

            <p className="text-xs text-zinc-500">
              Get your API key from{' '}
              <a
                href="https://console.anthropic.com/settings/keys"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 hover:underline"
              >
                console.anthropic.com
              </a>
            </p>
          </div>

          {/* Split Ratio Section */}
          <div className="space-y-3">
            <label className="text-sm font-medium">TradingView Panel Width</label>
            <div className="flex gap-2">
              {[
                { value: 0.5, label: '50%' },
                { value: 0.6, label: '60%' },
                { value: 0.7, label: '70%' },
              ].map((option) => (
                <label
                  key={option.value}
                  className="flex flex-1 items-center justify-center gap-2 rounded-md border border-zinc-700 bg-zinc-800 p-2 cursor-pointer hover:border-zinc-600 transition-colors"
                >
                  <input
                    type="radio"
                    name="splitRatio"
                    value={option.value}
                    checked={Math.abs(splitRatio - option.value) < 0.01}
                    onChange={() => setSplitRatio(option.value)}
                    className="h-4 w-4 border-zinc-700 bg-zinc-800 text-blue-600 focus:ring-blue-600"
                  />
                  <span className="text-sm">{option.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Preferences Section */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium">Preferences</h3>

            {/* Prompt Caching */}
            <label className="flex items-center justify-between">
              <div>
                <span className="text-sm">Enable Prompt Caching</span>
                <p className="text-xs text-zinc-500">Reduce API costs (recommended)</p>
              </div>
              <input
                type="checkbox"
                checked={enablePromptCaching}
                onChange={(e) => setEnablePromptCaching(e.target.checked)}
                className="h-4 w-4 rounded border-zinc-700 bg-zinc-800 text-blue-600 focus:ring-blue-600"
              />
            </label>

            {/* Sounds */}
            <label className="flex items-center justify-between">
              <div>
                <span className="text-sm">Enable Sounds</span>
                <p className="text-xs text-zinc-500">Play notification sounds</p>
              </div>
              <input
                type="checkbox"
                checked={enableSounds}
                onChange={(e) => setEnableSounds(e.target.checked)}
                className="h-4 w-4 rounded border-zinc-700 bg-zinc-800 text-blue-600 focus:ring-blue-600"
              />
            </label>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="rounded-md bg-zinc-800 px-4 py-2 text-sm font-medium hover:bg-zinc-700 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
