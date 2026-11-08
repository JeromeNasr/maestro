import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LESSONS } from '@/academy/lessons'
import { ArticulationDemo, tipHeight } from '@/components/academy/ArticulationDemo'
import { BatonGripDemo } from '@/components/academy/BatonGripDemo'
import { StageDemo } from '@/components/academy/StageDemo'

describe('baton lessons are part of the course', () => {
  it('has the baton, technique and sections lessons with a demo and a quiz each', () => {
    for (const [id, demo] of [['baton', 'baton-grip'], ['baton-technique', 'baton-articulation'], ['sections', 'stage']] as const) {
      const l = LESSONS.find((x) => x.id === id)!
      expect(l, id).toBeDefined()
      expect(l.demo).toBe(demo)
      expect(l.quiz.length).toBeGreaterThanOrEqual(3)
    }
  })
  it('the course says plainly that MAESTRO does not track the baton tip', () => {
    const text = LESSONS.find((l) => l.id === 'baton')!.body.join(' ')
    expect(text).toMatch(/does not detect the baton itself/)
  })
  it('covers what the brief asks for: what and why, how to hold it, patterns, tempo, dynamics, start/stop, sections', () => {
    const all = LESSONS.map((l) => `${l.id} ${l.title} ${l.body.join(' ')}`.toLowerCase()).join(' ')
    for (const kw of ['baton', 'hold', 'grip', '2/4', '3/4', '4/4', 'tempo', 'dynamics', 'cut-off', 'preparation', 'brass', 'woodwinds', 'percussion', 'strings']) expect(all, kw).toContain(kw)
  })
})

describe('articulation geometry', () => {
  const sample = (k: 'legato' | 'staccato' | 'marcato') => Array.from({ length: 200 }, (_, i) => tipHeight(k, i / 200))
  it('every articulation starts a beat at the top, reaches the ictus (0) and stays within 0–1', () => {
    for (const k of ['legato', 'staccato', 'marcato'] as const) {
      const s = sample(k)
      expect(Math.max(...s), k).toBeLessThanOrEqual(1)
      expect(Math.min(...s), k).toBeGreaterThanOrEqual(0)
      expect(Math.min(...s), k).toBeLessThan(0.01)
      expect(tipHeight(k, 0), k).toBeGreaterThan(0.95)
    }
  })
  it('legato never stops; staccato rests at the top; marcato pauses at the ictus', () => {
    const still = (s: number[], at: (v: number) => boolean) => s.filter((v, i) => i > 0 && Math.abs(v - s[i - 1]) < 1e-9 && at(v)).length
    expect(still(sample('legato'), () => true)).toBe(0)
    expect(still(sample('staccato'), (v) => v === 1)).toBeGreaterThan(80)
    expect(still(sample('marcato'), (v) => v === 0)).toBeGreaterThan(15)
  })
})

describe('interactive demos', () => {
  it('grip: each of the five points can be selected and explained', async () => {
    render(<BatonGripDemo />)
    const tabs = screen.getAllByRole('tab')
    expect(tabs).toHaveLength(5)
    await userEvent.click(tabs[3])
    expect(screen.getByTestId('grip-title')).toHaveTextContent(/wrist/i)
    await userEvent.click(tabs[0])
    expect(screen.getByTestId('grip-title')).toHaveTextContent(/palm/i)
  })
  it('articulation: switching style updates the explanation; sliders are labelled', async () => {
    render(<ArticulationDemo />)
    await userEvent.click(screen.getByRole('radio', { name: 'Staccato' }))
    expect(screen.getByText(/Short, separated notes/)).toBeInTheDocument()
    expect(screen.getByRole('slider', { name: 'Gesture size' })).toBeInTheDocument()
  })
  it('stage: family tabs change the advice, and the cue game scores right and wrong answers honestly', async () => {
    render(<StageDemo />)
    await userEvent.click(screen.getByRole('tab', { name: 'Brass' }))
    expect(screen.getByText(/palm-down/i)).toBeInTheDocument()
    const target = screen.getByTestId('cue-target').textContent!.replace(/^Bring in the /, '').replace(/\.$/, '')
    const buttons = screen.getAllByRole('button').filter((b) => b.className.includes('text-xs'))
    const right = buttons.find((b) => b.textContent!.toLowerCase() === target)!
    await userEvent.click(right)
    expect(screen.getByTestId('cue-feedback')).toHaveTextContent(/Correct/)
    const next = screen.getByTestId('cue-target').textContent!.replace(/^Bring in the /, '').replace(/\.$/, '')
    const wrong = buttons.find((b) => b.textContent!.toLowerCase() !== next)!
    await userEvent.click(wrong)
    expect(screen.getByTestId('cue-feedback')).toHaveTextContent(/That is the/)
    expect(within(document.body).getByText(/1 of 2 correct/)).toBeInTheDocument()
  })
})
