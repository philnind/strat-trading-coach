/**
 * MessageBubble Component
 * Renders individual messages with user/assistant styling
 * Includes markdown rendering for assistant messages
 */

import type React from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { User, Bot, Image as ImageIcon } from 'lucide-react'
import type { Message } from '@shared/models'

interface MessageBubbleProps {
  message: Message
  showTimestamp?: boolean
}

export function MessageBubble({ message, showTimestamp = false }: MessageBubbleProps): React.ReactElement {
  const isUser = message.role === 'user'

  return (
    <div className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}>
      {/* Avatar (left side for assistant) */}
      {!isUser && (
        <div className="flex-shrink-0">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-600">
            <Bot className="h-4 w-4 text-white" />
          </div>
        </div>
      )}

      {/* Message Content */}
      <div className={`flex max-w-[70%] flex-col gap-1 ${isUser ? 'items-end' : 'items-start'}`}>
        {/* Message Bubble */}
        <div
          className={`rounded-lg px-4 py-2 ${
            isUser
              ? 'bg-blue-600 text-white'
              : 'bg-zinc-800 text-zinc-100'
          }`}
        >
          {/* Screenshot indicator */}
          {message.screenshotPath && (
            <div className="mb-2 flex items-center gap-1.5 text-xs opacity-75">
              <ImageIcon className="h-3 w-3" />
              <span>Chart screenshot attached</span>
            </div>
          )}

          {/* Content */}
          {isUser ? (
            <p className="whitespace-pre-wrap text-sm">{message.content}</p>
          ) : (
            <div className="prose prose-invert prose-sm max-w-none">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {message.content}
              </ReactMarkdown>
            </div>
          )}
        </div>

        {/* Metadata */}
        <div className="flex items-center gap-2 px-1 text-xs text-zinc-500">
          {showTimestamp && (
            <span>
              {new Date(message.createdAt).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          )}
          {message.tokens && (
            <span className="flex items-center gap-1">
              <span>•</span>
              <span>{message.tokens} tokens</span>
              {message.cached && <span>(cached)</span>}
            </span>
          )}
        </div>
      </div>

      {/* Avatar (right side for user) */}
      {isUser && (
        <div className="flex-shrink-0">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-700">
            <User className="h-4 w-4 text-zinc-300" />
          </div>
        </div>
      )}
    </div>
  )
}
