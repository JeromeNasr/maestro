import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { FAMILIES, FUN_FACTS, WARDROBE } from '@/orchestra/lore'
import { SECTIONS } from '@/orchestra/sections'
import { Orchestra } from '@/pages/Orchestra'

describe('Orchestra page', () => {
  it('has a section for each of the four families with every instrument named', () => {
    render(<MemoryRouter><Orchestra /></MemoryRouter>)
    for (const f of FAMILIES) {
      const sec = screen.getByRole('region', { name: f.title })
      for (const i of f.instruments) expect(within(sec).getByRole('heading', { name: i.name })).toBeInTheDocument()
    }
    expect(screen.getByRole('heading', { name: /what the maestro wears/i })).toBeInTheDocument()
    expect(screen.getAllByRole('listitem').length).toBeGreaterThan(WARDROBE.length + FUN_FACTS.length)
  })
  it('covers the same families as the mixer, and the instruments the app plays', () => {
    expect(FAMILIES.map((f) => f.id).sort()).toEqual(SECTIONS.map((s) => s.id).sort())
    const names = FAMILIES.flatMap((f) => f.instruments.map((i) => i.name.toLowerCase()))
    for (const n of ['violin', 'viola', 'cello', 'double bass', 'flute', 'oboe', 'clarinet', 'bassoon', 'french horn', 'trumpet', 'trombone', 'tuba', 'timpani', 'snare drum', 'bass drum', 'cymbals']) expect(names).toContain(n)
  })
  it('every pitched instrument has a sensible range; unpitched ones have none', () => {
    for (const i of FAMILIES.flatMap((f) => f.instruments)) {
      if (!i.range) continue
      expect(i.range[0]).toBeGreaterThanOrEqual(24)
      expect(i.range[1]).toBeLessThanOrEqual(108)
      expect(i.range[1] - i.range[0]).toBeGreaterThan(12)
    }
  })
})
