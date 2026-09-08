import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { EmptyState, ErrorState, SkeletonText } from './States'

describe('EmptyState', () => {
  it('renders the title and body', () => {
    render(<EmptyState title="No dishes yet" body="Create your first recipe." />)
    expect(screen.getByText('No dishes yet')).toBeInTheDocument()
    expect(screen.getByText('Create your first recipe.')).toBeInTheDocument()
  })

  it('fires the action handler on click', async () => {
    const onClick = vi.fn()
    render(<EmptyState title="Empty" action={{ label: 'Add dish', onClick }} />)
    await userEvent.click(screen.getByRole('button', { name: 'Add dish' }))
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('omits the action button when no action is given', () => {
    render(<EmptyState title="Empty" />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})

describe('ErrorState', () => {
  it('shows a default title and a retry button that calls back', async () => {
    const onRetry = vi.fn()
    render(<ErrorState body="500 from the server" onRetry={onRetry} />)
    expect(screen.getByText('Could not load this')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /retry/i }))
    expect(onRetry).toHaveBeenCalledOnce()
  })
})

describe('SkeletonText', () => {
  it('renders the requested number of shimmer lines', () => {
    const { container } = render(<SkeletonText lines={4} />)
    expect(container.querySelectorAll('[aria-hidden="true"]')).toHaveLength(4)
  })
})
