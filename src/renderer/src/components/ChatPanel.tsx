/**
 * ChatPanel Component
 * Main chat interface - assembles MessageList and InputBar
 */

import type React from 'react'
import { MessageList } from './MessageList'
import { InputBar } from './InputBar'
import { useChat } from '../hooks/use-chat'
import { useSettings } from '../hooks/use-settings'

export function ChatPanel(): React.ReactElement {
  const {
    messages,
    isStreaming,
    streamingMessage,
    isSendingMessage,
    isLoadingMessages,
    error,
    sendMessage,
    clearError,
  } = useChat()

  const { hasApiKey } = useSettings()

  /**
   * Handle message send
   */
  const handleSendMessage = (message: string, screenshotPath?: string): void => {
    sendMessage(message, !!screenshotPath, screenshotPath)
  }

  return (
    <div className="flex flex-1 flex-col">
      {/* Error Banner */}
      {error && (
        <div className="border-b border-red-900 bg-red-950/50 p-3">
          <div className="mx-auto flex w-full items-center justify-between px-4">
            <div className="flex items-center gap-2">
              <span className="text-sm text-red-400">{error}</span>
            </div>
            <button
              onClick={clearError}
              className="text-xs text-red-400 hover:text-red-300"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* API Key Warning */}
      {!hasApiKey && (
        <div className="border-b border-yellow-900 bg-yellow-950/50 p-3">
          <div className="mx-auto w-full text-center px-4">
            <p className="text-sm text-yellow-400">
              Please set your Claude API key in settings to start chatting
            </p>
          </div>
        </div>
      )}

      {/* Messages */}
      <MessageList
        messages={messages}
        streamingMessage={streamingMessage}
        isLoadingMessages={isLoadingMessages}
      />

      {/* Input Bar */}
      <InputBar
        onSendMessage={handleSendMessage}
        disabled={!hasApiKey || isSendingMessage || isStreaming}
        placeholder={
          !hasApiKey
            ? 'Set API key in settings to start chatting...'
            : 'Ask about chart patterns, The Strat setups...'
        }
      />
    </div>
  )
}
