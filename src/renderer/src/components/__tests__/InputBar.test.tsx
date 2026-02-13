/**
 * InputBar Component Tests
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { InputBar } from '../InputBar'

// Mock the useScreenshot hook
vi.mock('../../hooks/use-screenshot', () => ({
  useScreenshot: () => ({
    screenshot: null,
    isCapturing: false,
    captureScreenshot: vi.fn(),
    clearScreenshot: vi.fn(),
  }),
}))

describe('InputBar', () => {
  it('renders input and send button', () => {
    render(<InputBar onSendMessage={() => {}} />)

    expect(screen.getByPlaceholderText(/ask about chart patterns/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /send message/i })).toBeInTheDocument()
  })

  it('calls onSendMessage when send button is clicked', async () => {
    const onSendMessage = vi.fn()
    const user = userEvent.setup()

    render(<InputBar onSendMessage={onSendMessage} />)

    const input = screen.getByPlaceholderText(/ask about chart patterns/i)
    await user.type(input, 'Test message')

    const sendButton = screen.getByRole('button', { name: /send message/i })
    await user.click(sendButton)

    expect(onSendMessage).toHaveBeenCalledWith('Test message', undefined)
  })

  it('calls onSendMessage when Enter is pressed', async () => {
    const onSendMessage = vi.fn()
    const user = userEvent.setup()

    render(<InputBar onSendMessage={onSendMessage} />)

    const input = screen.getByPlaceholderText(/ask about chart patterns/i)
    await user.type(input, 'Test message{Enter}')

    expect(onSendMessage).toHaveBeenCalledWith('Test message', undefined)
  })

  it('clears input after sending message', async () => {
    const onSendMessage = vi.fn()
    const user = userEvent.setup()

    render(<InputBar onSendMessage={onSendMessage} />)

    const input = screen.getByPlaceholderText(/ask about chart patterns/i) as HTMLTextAreaElement
    await user.type(input, 'Test message')

    const sendButton = screen.getByRole('button', { name: /send message/i })
    await user.click(sendButton)

    expect(input.value).toBe('')
  })

  it('disables input when disabled prop is true', () => {
    render(<InputBar onSendMessage={() => {}} disabled />)

    const input = screen.getByRole('textbox')
    expect(input).toBeDisabled()
  })

  it('shows screenshot button', () => {
    render(<InputBar onSendMessage={() => {}} />)

    expect(screen.getByRole('button', { name: /capture screenshot/i })).toBeInTheDocument()
  })
})
