/**
 * TitleBar Component Tests
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TitleBar } from '../TitleBar'

describe('TitleBar', () => {
  it('renders app title', () => {
    render(<TitleBar onSettingsClick={() => {}} />)

    expect(screen.getByText('STRAT Monitor')).toBeInTheDocument()
    expect(screen.getByText('AI Trading Coach')).toBeInTheDocument()
  })

  it('shows connected status by default', () => {
    render(<TitleBar onSettingsClick={() => {}} />)

    expect(screen.getByText('Connected')).toBeInTheDocument()
  })

  it('calls onSettingsClick when settings button is clicked', async () => {
    const onSettingsClick = vi.fn()
    const user = userEvent.setup()

    render(<TitleBar onSettingsClick={onSettingsClick} />)

    const settingsButton = screen.getByRole('button', { name: /settings/i })
    await user.click(settingsButton)

    expect(onSettingsClick).toHaveBeenCalledTimes(1)
  })
})
