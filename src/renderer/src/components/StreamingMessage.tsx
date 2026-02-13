/**
 * StreamingMessage Component
 * Renders a message currently being streamed from Claude
 * Shows accumulated content with a blinking cursor
 */

import type React from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Bot } from 'lucide-react'
import type { StreamingMessage as StreamingMessageType } from '../stores/chat-store'

interface StreamingMessageProps {
  message: StreamingMessageType
}

export function StreamingMessage({ message }: StreamingMessageProps): React.ReactElement {
  return (
    <div className="flex gap-3 justify-start">
      {/* Avatar */}
      <div className="flex-shrink-0">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-600">
          <Bot className="h-4 w-4 text-white" />
        </div>
      </div>

      {/* Message Content */}
      <div className="flex max-w-[70%] flex-col gap-1 items-start">
        {/* Message Bubble */}
        <div className="rounded-lg px-4 py-2 bg-zinc-800 text-zinc-100">
          <div className="prose prose-invert prose-sm max-w-none">
            {message.content ? (
              <div className="flex items-start">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {message.content}
                </ReactMarkdown>
                <span className="ml-1 inline-block h-4 w-1.5 bg-blue-500 cursor-blink" />
              </div>
            ) : (
              <div className="flex items-center gap-2 text-sm text-zinc-400">
                <span>Thinking</span>
                <span className="inline-block h-4 w-1.5 bg-blue-500 cursor-blink" />
              </div>
            )}
          </div>
        </div>

        {/* Streaming indicator */}
        <div className="flex items-center gap-1.5 px-1 text-xs text-zinc-500">
          <div className="flex gap-1">
            <span className="h-1 w-1 rounded-full bg-blue-500 animate-pulse" style={{ animationDelay: '0ms' }} />
            <span className="h-1 w-1 rounded-full bg-blue-500 animate-pulse" style={{ animationDelay: '150ms' }} />
            <span className="h-1 w-1 rounded-full bg-blue-500 animate-pulse" style={{ animationDelay: '300ms' }} />
          </div>
          <span>Streaming...</span>
        </div>
      </div>
    </div>
  )
}
