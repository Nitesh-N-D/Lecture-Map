import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import Seo from '../components/ui/Seo'

const robots = () => document.head.querySelector('meta[name="robots"]')?.content
const canonical = () => document.head.querySelector('link[rel="canonical"]')?.href

describe('Seo', () => {
  it('sets title, description and canonical for public pages', () => {
    render(<Seo title="Privacy | LectureMap" description="About privacy" path="/privacy" />)
    expect(document.title).toBe('Privacy | LectureMap')
    expect(document.head.querySelector('meta[name="description"]').content).toBe('About privacy')
    expect(robots()).toBe('index, follow')
    expect(canonical()).toBe(`${window.location.origin}/privacy`)
  })

  it('marks private pages noindex and removes the canonical link', () => {
    render(<Seo title="Dashboard | LectureMap" path="/dashboard" />)
    render(<Seo title="Dashboard | LectureMap" noindex />)
    expect(robots()).toBe('noindex, nofollow')
    expect(canonical()).toBeUndefined()
  })
})
