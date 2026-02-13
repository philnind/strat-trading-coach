/**
 * useSettings Hook - Wrapper around settings store with IPC integration
 * Provides convenient access to settings state and actions
 */

import { useEffect, useCallback } from 'react'
import { useSettingsStore } from '../stores/settings-store'

/**
 * Return type for useSettings hook
 */
export interface UseSettingsReturn {
  // State
  hasApiKey: boolean
  splitRatio: number
  theme: 'light' | 'dark' | 'system'
  autoSaveConversations: boolean
  defaultTimeframe: string
  enablePromptCaching: boolean
  enableSounds: boolean
  isConnected: boolean

  // Actions
  setApiKey: (apiKey: string) => Promise<void>
  checkApiKeyStatus: () => Promise<void>
  setSplitRatio: (ratio: number) => void
  setTheme: (theme: 'light' | 'dark' | 'system') => void
  setAutoSaveConversations: (enabled: boolean) => void
  setDefaultTimeframe: (timeframe: string) => void
  setEnablePromptCaching: (enabled: boolean) => void
  setEnableSounds: (enabled: boolean) => void
}

/**
 * useSettings Hook
 * Provides access to app settings with automatic persistence
 */
export function useSettings(): UseSettingsReturn {
  const {
    hasApiKey,
    splitRatio,
    theme,
    autoSaveConversations,
    defaultTimeframe,
    enablePromptCaching,
    enableSounds,
    isConnected,
    setHasApiKey,
    checkApiKeyStatus,
    setSplitRatio,
    setTheme,
    setAutoSaveConversations,
    setDefaultTimeframe,
    setEnablePromptCaching,
    setEnableSounds,
  } = useSettingsStore()

  /**
   * Check API key status on mount
   */
  useEffect(() => {
    checkApiKeyStatus()
  }, [checkApiKeyStatus])

  /**
   * Set API key via IPC
   */
  const setApiKey = useCallback(
    async (apiKey: string): Promise<void> => {
      try {
        await window.electronAPI.setApiKey(apiKey)
        setHasApiKey(true)
      } catch (error) {
        console.error('Failed to set API key:', error)
        throw error
      }
    },
    [setHasApiKey]
  )

  return {
    // State
    hasApiKey,
    splitRatio,
    theme,
    autoSaveConversations,
    defaultTimeframe,
    enablePromptCaching,
    enableSounds,
    isConnected,

    // Actions
    setApiKey,
    checkApiKeyStatus,
    setSplitRatio,
    setTheme,
    setAutoSaveConversations,
    setDefaultTimeframe,
    setEnablePromptCaching,
    setEnableSounds,
  }
}
