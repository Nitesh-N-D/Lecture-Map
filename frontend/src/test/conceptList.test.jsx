import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ConceptList, { conceptStatus } from '../components/graph/ConceptList'

const nodes = [
  { concept_id: 'a', name: 'Atoms', difficulty: 'beginner', timestamp_seconds: 0 },
  { concept_id: 'b', name: 'Bonds', difficulty: 'intermediate', timestamp_seconds: 10, status: 'blocked' },
  { concept_id: 'c', name: 'Crystals', difficulty: 'advanced', timestamp_seconds: 20, status: 'mastered' },
]
const edges = [{ from: 'a', to: 'b' }]

describe('ConceptList', () => {
  it('shows status as words, never colour alone', () => {
    render(<ConceptList nodes={nodes} edges={edges} visitedIds={new Set(['a'])} />)
    expect(screen.getByText(/Studied/)).toBeInTheDocument()
    expect(screen.getByText(/Blocked by prerequisite/)).toBeInTheDocument()
    expect(screen.getByText(/Mastered/)).toBeInTheDocument()
    expect(screen.getByText('Builds on: Atoms')).toBeInTheDocument()
  })

  it('selects a concept with the keyboard', async () => {
    const onSelect = vi.fn()
    render(<ConceptList nodes={nodes} edges={edges} visitedIds={new Set()} onSelect={onSelect} />)
    await userEvent.tab()
    await userEvent.keyboard('{Enter}')
    expect(onSelect).toHaveBeenCalledWith(nodes[0])
  })

  it('explicit study beats blocked, mastery beats study', () => {
    expect(conceptStatus({ concept_id: 'b', status: 'blocked' }, new Set(['b']))).toBe('studied')
    expect(conceptStatus({ concept_id: 'b', status: 'mastered' }, new Set(['b']))).toBe('mastered')
    expect(conceptStatus({ concept_id: 'z' }, new Set())).toBe('unexplored')
  })
})
