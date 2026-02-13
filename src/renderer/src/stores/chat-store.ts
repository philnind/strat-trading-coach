/**
 * Chat Store - Zustand state management for chat messages and conversations
 * Handles messages, streaming state, and conversation management
 */

import { create } from 'zustand'
import type { Message } from '@shared/models'

/**
 * Streaming message state
 * Represents a message currently being streamed from Claude
 */
export interface StreamingMessage {
  conversationId: string
  messageId: string
  role: 'assistant'
  content: string // Accumulated content so far
  isComplete: boolean
  tokens?: number
  cached?: boolean
}

/**
 * Chat store state
 */
interface ChatState {
  // Current conversation
  currentConversationId: string | null

  // Messages for current conversation
  messages: Message[]

  // Streaming state
  isStreaming: boolean
  streamingMessage: StreamingMessage | null

  // Loading states
  isLoadingMessages: boolean
  isSendingMessage: boolean

  // Error state
  error: string | null

  // Actions
  setCurrentConversation: (conversationId: string | null) => void
  setMessages: (messages: Message[]) => void
  addMessage: (message: Message) => void
  clearMessages: () => void

  // Streaming actions
  startStreaming: (conversationId: string, messageId: string) => void
  appendStreamingChunk: (chunk: string) => void
  completeStreaming: (fullContent: string, tokens: number, cached: boolean) => void
  errorStreaming: (error: string) => void

  // Loading actions
  setLoadingMessages: (loading: boolean) => void
  setSendingMessage: (sending: boolean) => void

  // Error actions
  setError: (error: string | null) => void
  clearError: () => void

  // Reset
  reset: () => void
}

/**
 * Initial state
 */
const initialState = {
  currentConversationId: null,
  messages: [],
  isStreaming: false,
  streamingMessage: null,
  isLoadingMessages: false,
  isSendingMessage: false,
  error: null,
}

/**
 * Chat store
 */
export const useChatStore = create<ChatState>((set, get) => ({
  ...initialState,

  // Conversation management
  setCurrentConversation: (conversationId) => {
    set({
      currentConversationId: conversationId,
      messages: [], // Clear messages when switching conversations
      error: null,
    })
  },

  setMessages: (messages) => {
    set({ messages })
  },

  addMessage: (message) => {
    set((state) => ({
      messages: [...state.messages, message],
    }))
  },

  clearMessages: () => {
    set({ messages: [] })
  },

  // Streaming management
  startStreaming: (conversationId, messageId) => {
    set({
      isStreaming: true,
      streamingMessage: {
        conversationId,
        messageId,
        role: 'assistant',
        content: '',
        isComplete: false,
      },
      error: null,
    })
  },

  appendStreamingChunk: (chunk) => {
    set((state) => {
      if (!state.streamingMessage) return state

      return {
        streamingMessage: {
          ...state.streamingMessage,
          content: state.streamingMessage.content + chunk,
        },
      }
    })
  },

  completeStreaming: (fullContent, tokens, cached) => {
    const state = get()
    if (!state.streamingMessage) return

    // Create final message
    const finalMessage: Message = {
      id: state.streamingMessage.messageId,
      conversationId: state.streamingMessage.conversationId,
      role: 'assistant',
      content: fullContent,
      tokens,
      cached,
      createdAt: Date.now(),
    }

    // Add to messages and clear streaming state
    set({
      messages: [...state.messages, finalMessage],
      isStreaming: false,
      streamingMessage: null,
      isSendingMessage: false,
    })
  },

  errorStreaming: (error) => {
    set({
      isStreaming: false,
      streamingMessage: null,
      isSendingMessage: false,
      error,
    })
  },

  // Loading states
  setLoadingMessages: (loading) => {
    set({ isLoadingMessages: loading })
  },

  setSendingMessage: (sending) => {
    set({ isSendingMessage: sending })
  },

  // Error handling
  setError: (error) => {
    set({ error })
  },

  clearError: () => {
    set({ error: null })
  },

  // Reset to initial state
  reset: () => {
    set(initialState)
  },
}))
