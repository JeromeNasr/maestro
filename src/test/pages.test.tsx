import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { routes } from '@/app/App'
import { selectedCompositionId } from '@/library/selection'
import { installStudioEnv } from './studioEnv'

vi.mock('@/audio/toneBackend', async () => await import('./fakeToneBackend'))
vi.mock('@/vision/mediapipeDetector', async () => await import('./fakeMediapipe'))

beforeEach(() => {
  installStudioEnv()
})

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
  ])('renders %s', async (path, heading) => {
    renderAt(path)
    expect(await screen.findByRole('heading', { level: 1, name: heading })).toBeInTheDocument()
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
    expect(screen.getByText(/1 of 6 compositions/)).toBeInTheDocument()
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
    expect(selectedCompositionId.get()).toBe('aurora-etude')
  })
})

describe('Studio', () => {
  it('does not request the camera or start audio on load', async () => {
    const { getUserMedia } = installStudioEnv()
    renderAt('/studio')
    await screen.findByRole('heading', { level: 1, name: /aurora/i })
    expect(getUserMedia).not.toHaveBeenCalled()
    const { instances } = await import('./fakeToneBackend')
    expect(instances.every((b) => b.initCalls === 0)).toBe(true)
  })

  it('every visible control is enabled or has a stated reason for being disabled', async () => {
    renderAt('/studio')
    await screen.findByRole('heading', { level: 1, name: /aurora/i })
    await waitFor(() => expect(screen.getByRole('button', { name: 'Start' })).toBeEnabled())
    expect(screen.getByRole('button', { name: 'Enable camera' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Pause' })).toBeDisabled() // nothing playing yet
    expect(screen.getByRole('button', { name: 'Resume' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Stop' })).toBeDisabled()
    const mixer = screen.getByRole('region', { name: /orchestra/i })
    for (const b of within(mixer).getAllByRole('button')) expect(b).toBeEnabled()
    for (const sl of within(mixer).getAllByRole('slider')) expect(sl).toBeEnabled()
  })

  it('shows no fabricated live values before anything is conducted', async () => {
    renderAt('/studio')
    await screen.findByRole('heading', { level: 1, name: /aurora/i })
    for (const id of ['readout-your-tempo', 'readout-music-tempo', 'readout-position', 'readout-tracking']) expect(screen.getByTestId(id)).toHaveTextContent('—')
  })
})



describe('Academy', () => {
  it('switches lessons and shows a pattern demo', async () => {
    renderAt('/academy')
    await userEvent.click(await screen.findByRole('button', { name: /4\/4 — conducting in four/i }))
    expect(screen.getByRole('heading', { level: 2, name: /4\/4/ })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /4\/4 conducting pattern: Down, Left, Right, Up/ })).toBeInTheDocument()
  })

  it('dynamics demo maps the slider to a marking', async () => {
    renderAt('/academy')
    await userEvent.click(await screen.findByRole('button', { name: /Dynamics, crescendo and diminuendo/ }))
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
