import { act, fireEvent, render, screen } from '@testing-library/react'
import { createMemoryRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { MetronomeDemo } from '@/components/academy/MetronomeDemo'
import { Celebrate } from '@/components/fx/Celebrate'
import { FloatingNotes } from '@/components/fx/FloatingNotes'
import { Reveal } from '@/components/fx/Reveal'
import { SolfegeKeys } from '@/components/fx/SolfegeKeys'
import { Layout } from '@/app/Layout'
import { perfSetting } from '@/lib/perf'

class FakeCtx {
  static all: FakeCtx[] = []
  currentTime = 0
  closed = false
  destination = {}
  freqs: number[] = []
  constructor() { FakeCtx.all.push(this) }
  resume() { return Promise.resolve() }
  close() { this.closed = true; return Promise.resolve() }
  createGain() { return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect: (n: unknown) => n } }
  createOscillator() {
    const freqs = this.freqs
    return { type: '', frequency: { set value(v: number) { freqs.push(v) } }, connect: (n: unknown) => n, start() {}, stop() {} }
  }
}

beforeEach(() => {
  FakeCtx.all = []
  vi.stubGlobal('AudioContext', FakeCtx)
})
afterEach(() => vi.unstubAllGlobals())

describe('SolfegeKeys', () => {
  it('shows Do Re Mi Fa Sol La Si Do and plays the right pitch', () => {
    const { unmount } = render(<SolfegeKeys />)
    const keys = screen.getAllByRole('button')
    expect(keys.map((k) => k.getAttribute('aria-label'))).toEqual(['Do4', 'Re4', 'Mi4', 'Fa4', 'Sol4', 'La4', 'Si4', 'Do5'])
    fireEvent.click(keys[5])
    const ctx = FakeCtx.all[0]
    expect(ctx.freqs[0]).toBeCloseTo(440, 3)
    fireEvent.keyDown(window, { key: 'a' })
    expect(ctx.freqs.some((f) => Math.abs(f - 261.626) < 0.01)).toBe(true)
    unmount()
    expect(ctx.closed).toBe(true)
  })
  it('ignores letter keys typed into inputs', () => {
    render(<><input aria-label="x" /><SolfegeKeys /></>)
    fireEvent.keyDown(screen.getByLabelText('x'), { key: 'a' })
    expect(FakeCtx.all.length).toBe(0)
  })
})

describe('MetronomeDemo', () => {
  it('names the tempo, and closes its audio context on unmount', () => {
    vi.useFakeTimers()
    const { unmount } = render(<MetronomeDemo />)
    expect(screen.getByText('Adagio')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText(/metronome tempo/i), { target: { value: '140' } })
    expect(screen.getByText('Allegro')).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('Metronome click'))
    act(() => { vi.advanceTimersByTime(1000) })
    expect(FakeCtx.all.length).toBe(1)
    unmount()
    expect(FakeCtx.all[0].closed).toBe(true)
    vi.useRealTimers()
  })
})

describe('Celebrate', () => {
  it('renders only while shown, and reports when it is done', () => {
    vi.useFakeTimers()
    const done = vi.fn()
    const { rerender, container } = render(<Celebrate show={false} onDone={done} />)
    expect(container).toBeEmptyDOMElement()
    rerender(<Celebrate show label="Bravissimo!" onDone={done} />)
    expect(screen.getByText('Bravissimo!')).toBeInTheDocument()
    act(() => { vi.advanceTimersByTime(2500) })
    expect(done).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })
})

describe('Reveal', () => {
  it('is simply shown when IntersectionObserver is missing, and reveals when it intersects', () => {
    const { unmount } = render(<Reveal>hello</Reveal>)
    expect(screen.getByText('hello')).toHaveClass('in')
    unmount()
    let cb: IntersectionObserverCallback = () => {}
    const disconnect = vi.fn()
    vi.stubGlobal('IntersectionObserver', class { constructor(c: IntersectionObserverCallback) { cb = c } observe() {} disconnect = disconnect })
    render(<Reveal>later</Reveal>)
    expect(screen.getByText('later')).not.toHaveClass('in')
    act(() => cb([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver))
    expect(screen.getByText('later')).toHaveClass('in')
    expect(disconnect).toHaveBeenCalled()
  })
})

describe('FloatingNotes', () => {
  it('is decorative: hidden from assistive technology', () => {
    const { container } = render(<FloatingNotes count={3} />)
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true')
    expect(container.querySelectorAll('.float-note')).toHaveLength(3)
  })
})

describe('performance mode in the layout', () => {
  it('sets data-perf on the page and follows the selector', () => {
    perfSetting.set('lite')
    render(<RouterProvider router={createMemoryRouter([{ path: '/', element: <Layout />, children: [{ path: 'library', element: <p>page</p> }] }], { initialEntries: ['/library'] })} />)
    expect(document.documentElement.dataset.perf).toBe('lite')
    fireEvent.click(screen.getByRole('radio', { name: 'Full' }))
    expect(document.documentElement.dataset.perf).toBe('full')
    perfSetting.set('auto')
  })
})
