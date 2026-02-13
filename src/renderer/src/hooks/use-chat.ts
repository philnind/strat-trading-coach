/**
 * useChat Hook - Manages chat message sending and receiving via IPC
 * Handles streaming responses, conversation management, and error handling
 */

import { useEffect, useCallback } from 'react'
import { useChatStore } from '../stores/chat-store'
import type { ChatSendMessageRequest } from '@shared/ipc-types'

import type { Message } from '@shared/models'
import type { StreamingMessage } from '../stores/chat-store'

/**
 * Return type for useChat hook
 */
export interface UseChatReturn {
  // State
  messages: Message[]
  isStreaming: boolean
  streamingMessage: StreamingMessage | null
  isSendingMessage: boolean
  isLoadingMessages: boolean
  error: string | null
  currentConversationId: string | null

  // Actions
  sendMessage: (message: string, includeScreenshot?: boolean, screenshotPath?: string) => Promise<void>
  loadMessages: (conversationId: string) => Promise<void>
  clearMessages: () => void
  clearError: () => void
}

/**
 * useChat Hook
 * Manages chat interactions with Claude API via IPC
 */
export function useChat(): UseChatReturn {
  const {
    messages,
    isStreaming,
    streamingMessage,
    isSendingMessage,
    isLoadingMessages,
    error,
    currentConversationId,
    setMessages,
    addMessage,
    clearMessages,
    startStreaming,
    appendStreamingChunk,
    completeStreaming,
    errorStreaming,
    setSendingMessage,
    setLoadingMessages,
    clearError,
  } = useChatStore()

  /**
   * Set up IPC listeners for streaming responses
   */
  useEffect(() => {
    // Message chunk listener
    const removeChunkListener = window.electronAPI.onMessageChunk((chunk) => {
      appendStreamingChunk(chunk.chunk)
    })

    // Message complete listener
    const removeCompleteListener = window.electronAPI.onMessageComplete((complete) => {
      completeStreaming(complete.fullContent, complete.tokens, complete.cached)
    })

    // Message error listener
    const removeErrorListener = window.electronAPI.onMessageError((error) => {
      errorStreaming(error.error)
    })

    // Cleanup listeners on unmount
    return () => {
      removeChunkListener()
      removeCompleteListener()
      removeErrorListener()
    }
  }, [appendStreamingChunk, completeStreaming, errorStreaming])

  /**
   * Send a message to Claude API
   */
  const sendMessage = useCallback(
    async (message: string, includeScreenshot?: boolean, screenshotPath?: string): Promise<void> => {
      if (!message.trim()) {
        return
      }

      setSendingMessage(true)
      clearError()

      try {
        // Add user message to store immediately
        const userMessage = {
          id: `user-${Date.now()}`,
          conversationId: currentConversationId || 'temp',
          role: 'user' as const,
          content: message,
          screenshotPath,
          createdAt: Date.now(),
        }
        addMessage(userMessage)

        // Prepare request
        const request: ChatSendMessageRequest = {
          message,
          conversationId: currentConversationId || undefined,
          includeScreenshot,
          screenshotPath,
        }

        // Start streaming (will be populated by IPC listeners)
        startStreaming(currentConversationId || 'temp', `assistant-${Date.now()}`)

        // Send to main process
        await window.electronAPI.sendMessage(request)
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to send message'
        errorStreaming(errorMessage)
      }
    },
    [
      currentConversationId,
      addMessage,
      startStreaming,
      setSendingMessage,
      clearError,
      errorStreaming,
    ]
  )

  /**
   * Load messages for a conversation from database
   */
  const loadMessages = useCallback(
    async (conversationId: string): Promise<void> => {
      setLoadingMessages(true)
      clearError()

      try {
        const response = await window.electronAPI.getMessages({ conversationId })
        setMessages(response.messages)
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to load messages'
        errorStreaming(errorMessage)
      } finally {
        setLoadingMessages(false)
      }
    },
    [setMessages, setLoadingMessages, clearError, errorStreaming]
  )

  return {
    // State
    messages,
    isStreaming,
    streamingMessage,
    isSendingMessage,
    isLoadingMessages,
    error,
    currentConversationId,

    // Actions
    sendMessage,
    loadMessages,
    clearMessages,
    clearError,
  }
}
