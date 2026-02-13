/**
 * MessageList Component
 * Scrollable message list with auto-scroll to bottom on new messages
 */

import type React from 'react'
import { useEffect, useRef } from 'react'
import { MessageBubble } from './MessageBubble'
import { StreamingMessage } from './StreamingMessage'
import type { Message } from '@shared/models'
import type { StreamingMessage as StreamingMessageType } from '../stores/chat-store'

interface MessageListProps {
  messages: Message[]
  streamingMessage: StreamingMessageType | null
  isLoadingMessages?: boolean
}

export function MessageList({
  messages,
  streamingMessage,
  isLoadingMessages = false,
}: MessageListProps): React.ReactElement {
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  /**
   * Auto-scroll to bottom when new messages arrive or streaming updates
   */
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, streamingMessage?.content])

  /**
   * Empty state
   */
  if (!isLoadingMessages && messages.length === 0 && !streamingMessage) {
    return (
      <div className="flex h-full items-center justify-center p-4">
        <div className="mx-auto max-w-md text-center">
          <div className="mb-4 rounded-lg border border-zinc-800 bg-zinc-900 p-6">
            <h2 className="mb-2 text-lg font-semibold">Welcome to STRAT Monitor</h2>
            <p className="text-sm text-zinc-400">
              Your AI-powered trading coach for The Strat methodology
            </p>
            <p className="mt-4 text-xs text-zinc-500">
              Start by asking questions about chart patterns, capturing a screenshot, or
              journaling your trades
            </p>
          </div>
        </div>
      </div>
    )
  }

  /**
   * Loading state
   */
  if (isLoadingMessages) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex items-center gap-2 text-sm text-zinc-400">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-600 border-t-blue-500" />
          <span>Loading messages...</span>
        </div>
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-y-auto p-4 messages-container"
    >
      <div className="mx-auto w-full space-y-4">
        {/* Existing Messages */}
        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} showTimestamp />
        ))}

        {/* Streaming Message */}
        {streamingMessage && (
          <StreamingMessage message={streamingMessage} />
        )}

        {/* Scroll anchor */}
        <div ref={messagesEndRef} />
      </div>
    </div>
  )
}
