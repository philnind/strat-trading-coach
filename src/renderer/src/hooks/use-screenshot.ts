/**
 * useScreenshot Hook - Manages screenshot capture and preview
 * Handles screenshot capture, data URL retrieval, and state management
 */

import { useState, useCallback } from 'react'
import type { CaptureScreenshotRequest, CaptureScreenshotResponse } from '@shared/ipc-types'

/**
 * Screenshot state
 */
export interface ScreenshotState {
  id: string | null
  filePath: string | null
  dataUrl: string | null
  metadata: {
    width: number
    height: number
    size: number
  } | null
}

/**
 * Return type for useScreenshot hook
 */
export interface UseScreenshotReturn {
  // State
  screenshot: ScreenshotState | null
  isCapturing: boolean
  error: string | null

  // Actions
  captureScreenshot: (options?: CaptureScreenshotRequest) => Promise<ScreenshotState | null>
  clearScreenshot: () => void
  clearError: () => void
}

/**
 * useScreenshot Hook
 * Manages screenshot capture flow with preview support
 */
export function useScreenshot(): UseScreenshotReturn {
  const [screenshot, setScreenshot] = useState<ScreenshotState | null>(null)
  const [isCapturing, setIsCapturing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /**
   * Capture a screenshot of the TradingView pane
   */
  const captureScreenshot = useCallback(
    async (options: CaptureScreenshotRequest = {}): Promise<ScreenshotState | null> => {
      setIsCapturing(true)
      setError(null)

      try {
        // Capture screenshot via IPC
        const result: CaptureScreenshotResponse = await window.electronAPI.captureScreenshot(options)

        if (!result.success || !result.id || !result.filePath || !result.metadata) {
          throw new Error(result.error || 'Screenshot capture failed')
        }

        // Fetch data URL for preview
        const dataUrl = await window.electronAPI.getScreenshotDataUrl(result.id)

        const screenshotState: ScreenshotState = {
          id: result.id,
          filePath: result.filePath,
          dataUrl,
          metadata: result.metadata,
        }

        setScreenshot(screenshotState)
        return screenshotState
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to capture screenshot'
        setError(errorMessage)
        return null
      } finally {
        setIsCapturing(false)
      }
    },
    []
  )

  /**
   * Clear the current screenshot
   */
  const clearScreenshot = useCallback(() => {
    setScreenshot(null)
    setError(null)
  }, [])

  /**
   * Clear error state
   */
  const clearError = useCallback(() => {
    setError(null)
  }, [])

  return {
    // State
    screenshot,
    isCapturing,
    error,

    // Actions
    captureScreenshot,
    clearScreenshot,
    clearError,
  }
}
