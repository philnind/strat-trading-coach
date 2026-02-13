/**
 * MessageBubble Component Tests
 */

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MessageBubble } from '../MessageBubble'
import type { Message } from '@shared/models'

describe('MessageBubble', () => {
  const userMessage: Message = {
    id: '1',
    conversationId: 'conv1',
    role: 'user',
    content: 'Hello, this is a test message',
    createdAt: Date.now(),
  }

  const assistantMessage: Message = {
    id: '2',
    conversationId: 'conv1',
    role: 'assistant',
    content: 'This is a **markdown** response',
    createdAt: Date.now(),
  }

  it('renders user message with correct styling', () => {
    render(<MessageBubble message={userMessage} />)

    expect(screen.getByText('Hello, this is a test message')).toBeInTheDocument()
  })

  it('renders assistant message with markdown', () => {
    render(<MessageBubble message={assistantMessage} />)

    expect(screen.getByText('markdown')).toBeInTheDocument()
  })

  it('shows screenshot indicator when message has screenshot', () => {
    const messageWithScreenshot: Message = {
      ...userMessage,
      screenshotPath: '/path/to/screenshot.png',
    }

    render(<MessageBubble message={messageWithScreenshot} />)

    expect(screen.getByText('Chart screenshot attached')).toBeInTheDocument()
  })

  it('displays token count when provided', () => {
    const messageWithTokens: Message = {
      ...assistantMessage,
      tokens: 150,
    }

    render(<MessageBubble message={messageWithTokens} showTimestamp />)

    expect(screen.getByText(/150 tokens/i)).toBeInTheDocument()
  })

  it('shows cached indicator when message is cached', () => {
    const cachedMessage: Message = {
      ...assistantMessage,
      tokens: 150,
      cached: true,
    }

    render(<MessageBubble message={cachedMessage} showTimestamp />)

    expect(screen.getByText(/cached/i)).toBeInTheDocument()
  })
})
