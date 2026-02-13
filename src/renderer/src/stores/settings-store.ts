/**
 * Settings Store - Zustand state management for app settings
 * Handles API key status, split ratio, theme, and preferences
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * Settings store state
 */
interface SettingsState {
  // API key
  hasApiKey: boolean
  apiKeyLastChecked: number | null

  // Split ratio (percentage of window for TradingView)
  splitRatio: number // 0-1 (default: 0.6 = 60% for TradingView)

  // Theme
  theme: 'light' | 'dark' | 'system'

  // Preferences
  autoSaveConversations: boolean
  defaultTimeframe: string
  enablePromptCaching: boolean
  enableSounds: boolean

  // Connection status
  isConnected: boolean

  // Actions
  setHasApiKey: (hasKey: boolean) => void
  checkApiKeyStatus: () => Promise<void>

  setSplitRatio: (ratio: number) => void

  setTheme: (theme: 'light' | 'dark' | 'system') => void

  setAutoSaveConversations: (enabled: boolean) => void
  setDefaultTimeframe: (timeframe: string) => void
  setEnablePromptCaching: (enabled: boolean) => void
  setEnableSounds: (enabled: boolean) => void

  setIsConnected: (connected: boolean) => void

  // Reset
  reset: () => void
}

/**
 * Default settings
 */
const defaultSettings = {
  hasApiKey: false,
  apiKeyLastChecked: null,
  splitRatio: 0.6,
  theme: 'dark' as const,
  autoSaveConversations: true,
  defaultTimeframe: '1D',
  enablePromptCaching: true,
  enableSounds: false,
  isConnected: true,
}

/**
 * Settings store with persistence
 * Persists to localStorage to maintain settings across sessions
 */
export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      ...defaultSettings,

      // API key management
      setHasApiKey: (hasKey) => {
        set({
          hasApiKey: hasKey,
          apiKeyLastChecked: Date.now(),
        })
      },

      checkApiKeyStatus: async () => {
        try {
          const status = await window.electronAPI.getApiKeyStatus()
          set({
            hasApiKey: status.hasKey,
            apiKeyLastChecked: Date.now(),
          })
        } catch (error) {
          console.error('Failed to check API key status:', error)
          set({
            hasApiKey: false,
            apiKeyLastChecked: Date.now(),
          })
        }
      },

      // Split ratio
      setSplitRatio: (ratio) => {
        // Clamp between 0.3 and 0.8 (30% - 80%)
        const clampedRatio = Math.max(0.3, Math.min(0.8, ratio))
        set({ splitRatio: clampedRatio })

        // Persist to main process
        window.electronAPI.setSplitRatio({ ratio: clampedRatio }).catch((error) => {
          console.error('Failed to set split ratio:', error)
        })
      },

      // Theme
      setTheme: (theme) => {
        set({ theme })
      },

      // Preferences
      setAutoSaveConversations: (enabled) => {
        set({ autoSaveConversations: enabled })
      },

      setDefaultTimeframe: (timeframe) => {
        set({ defaultTimeframe: timeframe })
      },

      setEnablePromptCaching: (enabled) => {
        set({ enablePromptCaching: enabled })
      },

      setEnableSounds: (enabled) => {
        set({ enableSounds: enabled })
      },

      // Connection status
      setIsConnected: (connected) => {
        set({ isConnected: connected })
      },

      // Reset to defaults
      reset: () => {
        set(defaultSettings)
      },
    }),
    {
      name: 'strat-monitor-settings', // localStorage key
      partialize: (state) => ({
        // Only persist these fields
        splitRatio: state.splitRatio,
        theme: state.theme,
        autoSaveConversations: state.autoSaveConversations,
        defaultTimeframe: state.defaultTimeframe,
        enablePromptCaching: state.enablePromptCaching,
        enableSounds: state.enableSounds,
      }),
    }
  )
)
