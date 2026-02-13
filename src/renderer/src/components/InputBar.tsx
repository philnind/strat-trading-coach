/**
 * InputBar Component
 * Message input with send button, screenshot toggle, and keyboard shortcuts
 */

import type React from 'react'
import { useState, useRef, useEffect, type KeyboardEvent } from 'react'
import { Send, Camera, X } from 'lucide-react'
import { useScreenshot } from '../hooks/use-screenshot'

interface InputBarProps {
  onSendMessage: (message: string, screenshotPath?: string) => void
  disabled?: boolean
  placeholder?: string
}

export function InputBar({
  onSendMessage,
  disabled = false,
  placeholder = 'Ask about chart patterns, The Strat setups...',
}: InputBarProps): React.ReactElement {
  const [message, setMessage] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const { screenshot, isCapturing, captureScreenshot, clearScreenshot } = useScreenshot()

  /**
   * Auto-resize textarea as user types
   */
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`
    }
  }, [message])

  /**
   * Handle send action
   */
  const handleSend = (): void => {
    if (!message.trim() || disabled) return

    onSendMessage(message, screenshot?.filePath || undefined)
    setMessage('')
    clearScreenshot()

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }

  /**
   * Handle keyboard shortcuts
   * - Enter: Send message
   * - Shift+Enter: New line
   */
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  /**
   * Handle screenshot capture
   */
  const handleScreenshotClick = async (): Promise<void> => {
    if (screenshot) {
      clearScreenshot()
    } else {
      await captureScreenshot()
    }
  }

  return (
    <div className="border-t border-zinc-800 bg-zinc-900 p-4">
      <div className="mx-auto w-full">
        {/* Screenshot Preview */}
        {screenshot && (
          <div className="mb-3 flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800 p-2">
            <div className="flex-1 flex items-center gap-2">
              <Camera className="h-4 w-4 text-blue-500" />
              <span className="text-xs text-zinc-400">
                Chart screenshot ({screenshot.metadata?.width}x{screenshot.metadata?.height})
              </span>
            </div>
            <button
              onClick={clearScreenshot}
              className="rounded-md p-1 hover:bg-zinc-700 transition-colors"
              aria-label="Remove screenshot"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Input Row */}
        <div className="flex gap-2">
          {/* Screenshot Button */}
          <button
            onClick={handleScreenshotClick}
            disabled={disabled || isCapturing}
            className={`flex-shrink-0 rounded-md p-2 transition-colors ${
              screenshot
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-300'
            } disabled:opacity-50 disabled:cursor-not-allowed`}
            aria-label={screenshot ? 'Remove screenshot' : 'Capture screenshot'}
          >
            <Camera className="h-5 w-5" />
          </button>

          {/* Text Input */}
          <textarea
            ref={textareaRef}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled}
            rows={1}
            className="flex-1 resize-none rounded-md border border-zinc-700 bg-zinc-800 px-4 py-2 text-sm placeholder-zinc-500 focus:border-zinc-600 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ minHeight: '42px', maxHeight: '150px' }}
          />

          {/* Send Button */}
          <button
            onClick={handleSend}
            disabled={disabled || !message.trim()}
            className="flex-shrink-0 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            aria-label="Send message"
          >
            <Send className="h-5 w-5 text-white" />
          </button>
        </div>

        {/* Keyboard Hint */}
        <p className="mt-2 text-xs text-zinc-500">
          <kbd className="rounded bg-zinc-800 px-1.5 py-0.5">Enter</kbd> to send,{' '}
          <kbd className="rounded bg-zinc-800 px-1.5 py-0.5">Shift+Enter</kbd> for new line
        </p>
      </div>
    </div>
  )
}
