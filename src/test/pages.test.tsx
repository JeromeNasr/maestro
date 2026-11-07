import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { routes } from '@/app/App'
import { selectedCompositionId } from '@/library/selection'

function renderAt(path: string) {
  return render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: [path] })} />)
}

describe('routing & navigation', () => {
  it.each([
    ['/', /conduct your/i],
    ['/library', /choose your repertoire/i],
    ['/studio', /aurora/i],
    ['/academy', /learn the language/i],
    ['/analytics', /your performances/i],
    ['/missing', /out of tempo/i],
  ])('renders %s', (path, heading) => {
    renderAt(path)
    expect(screen.getByRole('heading', { level: 1, name: heading })).toBeInTheDocument()
  })

  it('exposes the primary navigation', () => {
    renderAt('/')
    const nav = screen.getByRole('navigation', { name: 'Primary' })
    for (const l of ['Library', 'Studio', 'Academy', 'Analytics']) expect(within(nav).getByRole('link', { name: l })).toBeInTheDocument()
  })
})

describe('Library', () => {
  it('filters by search and reports the count', async () => {
    renderAt('/library')
    await userEvent.type(screen.getByRole('searchbox'), 'handel')
    expect(screen.getByRole('article', { name: /water music/i })).toBeInTheDocument()
    expect(screen.queryByRole('article', { name: /brandenburg/i })).not.toBeInTheDocument()
    expect(screen.getByText(/1 of 4 compositions/)).toBeInTheDocument()
  })

  it('shows an empty state when nothing matches', async () => {
    renderAt('/library')
    await userEvent.type(screen.getByRole('searchbox'), 'qqqq')
    expect(screen.getByText(/no compositions match/i)).toBeInTheDocument()
  })

  it('disables planned compositions and lets an available one be selected', async () => {
    renderAt('/library')
    const planned = screen.getByRole('article', { name: /four seasons/i })
    expect(within(planned).getByRole('button')).toBeDisabled()
    const demo = screen.getByRole('article', { name: /aurora/i })
    expect(within(demo).getByRole('button')).toHaveAttribute('aria-pressed', 'true')
    expect(selectedCompositionId.get()).toBe('maestro-demo-001')
  })
})

describe('Studio (Phase 1)', () => {
  it('does not request the camera and disables every unimplemented control', () => {
    const getUserMedia = vi.fn()
    Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia }, configurable: true })
    renderAt('/studio')
    expect(getUserMedia).not.toHaveBeenCalled()
    const buttons = screen.getAllByRole('button').filter((b) => !/menu|close/i.test(b.textContent ?? ''))
    expect(buttons.length).toBeGreaterThan(10)
    for (const b of buttons) expect(b).toBeDisabled()
    for (const s of screen.getAllByRole('slider')) expect(s).toBeDisabled()
  })

  it('shows no fabricated live values', () => {
    renderAt('/studio')
    const readout = screen.getByRole('region', { name: /performance/i })
    expect(within(readout).getByText('BPM').nextSibling).toHaveTextContent('—')
  })
})

describe('Analytics', () => {
  it('starts empty with no invented data', () => {
    renderAt('/analytics')
    expect(screen.getByText(/no performances recorded yet/i)).toBeInTheDocument()
  })

  it('labels sample data as demo and tags measured vs estimate', async () => {
    renderAt('/analytics')
    await userEvent.click(screen.getByRole('button', { name: /preview layout/i }))
    expect(screen.getByText(/invented sample values/i)).toBeInTheDocument()
    expect(screen.getAllByText('Measured').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Estimate').length).toBeGreaterThan(0)
  })
})

describe('Academy', () => {
  it('switches lessons and shows a pattern demo', async () => {
    renderAt('/academy')
    await userEvent.click(screen.getByRole('button', { name: /4\/4 — conducting in four/i }))
    expect(screen.getByRole('heading', { level: 2, name: /4\/4/ })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /4\/4 conducting pattern: Down, Left, Right, Up/ })).toBeInTheDocument()
  })

  it('dynamics demo maps the slider to a marking', async () => {
    renderAt('/academy')
    await userEvent.click(screen.getByRole('button', { name: /^05?\s?\d*\s?Dynamics$|Dynamics$/ }))
    expect(screen.getByTestId('dynamic-mark')).toHaveTextContent('mf')
  })
})

describe('navigation behaviour', () => {
  it('updates the document title per route', async () => {
    renderAt('/library')
    expect(document.title).toBe('Library — MAESTRO')
    await userEvent.click(screen.getByRole('navigation', { name: 'Primary' }).querySelector('a[href="/academy"]')!)
    expect(document.title).toBe('Conducting Academy — MAESTRO')
  })

  it('has no live region wrapping the animated lesson content', () => {
    const { container } = renderAt('/academy')
    expect(container.querySelector('article[aria-live]')).toBeNull()
  })
})
