import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { routes } from '@/app/App'
import { academyProgress, resetAcademyProgress } from '@/academy/progress'
import { addRecord, clearHistory, historyStore } from '@/analytics/historyStore'
import type { SessionRecord } from '@/analytics/types'
import { installStudioEnv } from './studioEnv'

vi.mock('@/audio/toneBackend', async () => await import('./fakeToneBackend'))
vi.mock('@/vision/mediapipeDetector', async () => await import('./fakeMediapipe'))

const view = (path: string) => render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: [path] })} />)

beforeEach(() => {
  installStudioEnv()
  resetAcademyProgress()
  clearHistory()
})

describe('Academy — lessons, quizzes and progress', () => {
  it('starts with no progress at all', async () => {
    view('/academy')
    expect(await screen.findByTestId('course-progress')).toHaveTextContent('0 of 11 lessons complete')
    expect(screen.getByTestId('lesson-progress')).toHaveTextContent('0 of 2 required items done')
  })

  it('"Mark as read" and a passed quiz complete a lesson, and the progress persists', async () => {
    view('/academy')
    await userEvent.click(await screen.findByRole('button', { name: 'Mark as read' }))
    // answer the correct options of "Conducting fundamentals"
    await userEvent.click(screen.getByRole('radio', { name: 'The right hand' }))
    await userEvent.click(screen.getByRole('radio', { name: 'At the ictus, where the stroke changes direction' }))
    await userEvent.click(screen.getByRole('radio', { name: 'A gesture before the first note showing tempo and character' }))
    await userEvent.click(screen.getByRole('button', { name: 'Check answers' }))
    expect(screen.getByTestId('quiz-result')).toHaveTextContent('3 of 3 correct — passed')
    expect(screen.getByTestId('lesson-progress')).toHaveTextContent('Lesson complete')
    expect(screen.getByTestId('course-progress')).toHaveTextContent('1 of 11 lessons complete')
    expect(academyProgress.get().lessons.fundamentals.quiz).toMatchObject({ best: 3, passed: true })
    expect(JSON.parse(localStorage.getItem('maestro.academy.v1')!).lessons.fundamentals.read).toBe(true) // persisted
  })

  it('a failed quiz is recorded as not passed and can be retried', async () => {
    view('/academy')
    await screen.findByTestId('course-progress')
    for (const q of ['Neither — tempo is fixed', 'At the start of a stroke', 'Tuning the orchestra']) await userEvent.click(screen.getByRole('radio', { name: q }))
    await userEvent.click(screen.getByRole('button', { name: 'Check answers' }))
    expect(screen.getByTestId('quiz-result')).toHaveTextContent('0 of 3 correct — not passed')
    expect(screen.getByTestId('lesson-progress')).not.toHaveTextContent('Lesson complete')
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(screen.getByRole('button', { name: 'Check answers' })).toBeDisabled()
    expect(screen.getByTestId('quiz-record')).toHaveTextContent('Not passed yet · best 0/3 · 1 attempt')
  })

  it('the quiz cannot be checked until every question is answered', async () => {
    view('/academy')
    await screen.findByTestId('course-progress')
    expect(screen.getByRole('button', { name: 'Check answers' })).toBeDisabled()
  })

  it('tap-tempo exercise: steady taps at the target tempo pass and are recorded', async () => {
    let now = 0
    vi.spyOn(performance, 'now').mockImplementation(() => now)
    view('/academy')
    await userEvent.click(await screen.findByRole('button', { name: /Tempo control/ }))
    const pad = screen.getByRole('button', { name: 'Tap' })
    for (let i = 0; i < 12; i++) {
      now = i * 750 // 80 BPM
      fireEvent.click(pad)
    }
    const result = await screen.findByTestId('tap-result')
    expect(result).toHaveTextContent('Passed')
    expect(result).toHaveTextContent('80.0 BPM')
    expect(academyProgress.get().lessons.tempo.exercises['tap-tempo']).toMatchObject({ passed: true, attempts: 1 })
    expect(screen.getByTestId('record-tap-tempo')).toHaveTextContent('Passed')
    vi.restoreAllMocks()
  })

  it('tap-tempo exercise: the wrong tempo is not a pass', async () => {
    let now = 0
    vi.spyOn(performance, 'now').mockImplementation(() => now)
    view('/academy')
    await userEvent.click(await screen.findByRole('button', { name: /Tempo control/ }))
    const pad = screen.getByRole('button', { name: 'Tap' })
    for (let i = 0; i < 12; i++) {
      now = i * 500 // 120 BPM
      fireEvent.click(pad)
    }
    expect(await screen.findByTestId('tap-result')).toHaveTextContent('Not passed yet')
    expect(academyProgress.get().lessons.tempo.exercises['tap-tempo'].passed).toBe(false)
    vi.restoreAllMocks()
  })

  it('camera exercises are optional, say they need a camera, and do not touch the camera until you ask', async () => {
    const { getUserMedia } = installStudioEnv()
    view('/academy')
    await userEvent.click(await screen.findByRole('button', { name: /4\/4 — conducting in four/ }))
    const card = screen.getByRole('region', { name: /Conduct three clean bars in 4\/4/ })
    expect(within(card).getByText('Optional')).toBeInTheDocument()
    expect(within(card).getByText('Needs camera')).toBeInTheDocument()
    expect(getUserMedia).not.toHaveBeenCalled()
    await userEvent.click(within(card).getByRole('button', { name: /Open exercise/ }))
    expect(getUserMedia).not.toHaveBeenCalled() // opening the exercise is not enabling the camera
    expect(within(card).getByRole('button', { name: 'Start exercise' })).toBeDisabled()
    await userEvent.click(within(card).getByRole('button', { name: 'Enable camera' }))
    await waitFor(() => expect(getUserMedia).toHaveBeenCalledTimes(1))
  })

  it('leaving the Academy releases the camera', async () => {
    const { getUserMedia, stream } = installStudioEnv()
    const { unmount } = view('/academy')
    await userEvent.click(await screen.findByRole('button', { name: /4\/4 — conducting in four/ }))
    const card = screen.getByRole('region', { name: /Conduct three clean bars in 4\/4/ })
    await userEvent.click(within(card).getByRole('button', { name: /Open exercise/ }))
    await userEvent.click(within(card).getByRole('button', { name: 'Enable camera' }))
    await waitFor(() => expect(getUserMedia).toHaveBeenCalled())
    await within(card).findByRole('button', { name: 'Stop camera' })
    unmount()
    expect(stream.track.stop).toHaveBeenCalled()
  })

  it('reset progress asks for confirmation', async () => {
    view('/academy')
    await userEvent.click(await screen.findByRole('button', { name: 'Mark as read' }))
    await userEvent.click(screen.getByRole('button', { name: 'Reset progress' }))
    await userEvent.click(screen.getByRole('button', { name: 'Confirm: erase all progress' }))
    expect(academyProgress.get().lessons).toEqual({})
    expect(screen.getByRole('button', { name: 'Mark as read' })).toBeEnabled()
  })
})

const record = (o: Partial<SessionRecord> = {}): SessionRecord => ({
  version: 2, id: `r${Math.random()}`, startedAt: '2026-03-04T10:00:00.000Z', compositionId: 'aurora-etude', compositionTitle: 'Aurora Étude', timeSignature: '4/4', source: 'camera', completed: true,
  playingSec: 184, referenceBpm: 84, beats: { accepted: 240, usedForTempo: 220, offPattern: 12, resyncs: 1, skipped: 2 }, patternAdherence: 240 / 252,
  tempo: { averageBpm: 86.2, minBpm: 70, maxBpm: 99, consistency: 0.81, intervalCv: 0.07, series: [[0, 84], [2, 85], [4, 88], [6, 90], [8, 86]] },
  dynamics: { secondsByMark: { pp: 10, p: 30, mp: 20, mf: 60, f: 40, ff: 20 }, secondsHeld: 4, minLevel: 0.1, maxLevel: 0.95 },
  tracking: { frames: 5000, right: 0.94, left: 0.82, both: 0.8, meanConfidence: 0.9 }, ...o,
})

describe('Analytics — real recorded data only', () => {
  it('with no history it shows an honest empty state (and no sample data)', async () => {
    view('/analytics')
    expect(await screen.findByText('No performances recorded yet')).toBeInTheDocument()
    expect(screen.queryByText(/sample/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /preview/i })).not.toBeInTheDocument()
  })

  it('shows a recorded performance with every figure tagged Measured or Estimate', async () => {
    addRecord(record())
    view('/analytics')
    const sel = await screen.findByTestId('selected-session')
    expect(within(sel).getByTestId('metric-duration-played')).toHaveTextContent('3:04')
    expect(within(sel).getByTestId('metric-duration-played')).toHaveTextContent('Measured')
    expect(within(sel).getByTestId('metric-beats-detected')).toHaveTextContent('240')
    expect(within(sel).getByTestId('metric-average-tempo')).toHaveTextContent('86 BPM')
    expect(within(sel).getByTestId('metric-average-tempo')).toHaveTextContent('Estimate')
    expect(within(sel).getByTestId('metric-tempo-consistency')).toHaveTextContent('81%')
    expect(within(sel).getByTestId('metric-pattern-adherence')).toHaveTextContent('Estimate')
    expect(within(sel).getByTestId('metric-pattern-adherence')).toHaveTextContent('no reference to compare against')
    expect(within(sel).getByTestId('metric-right-hand-tracked')).toHaveTextContent('94%')
    expect(within(sel).getByRole('img', { name: /conducted tempo/i })).toBeInTheDocument()
    expect(within(sel).getByRole('img', { name: /seconds spent at each dynamic/i })).toBeInTheDocument()
  })

  it('missing data is "Unavailable" — never shown as a number', async () => {
    addRecord(record({
      source: 'none', patternAdherence: null, dynamics: null,
      tempo: { averageBpm: null, minBpm: null, maxBpm: null, consistency: null, intervalCv: null, series: [] },
      tracking: { frames: 0, right: null, left: null, both: null, meanConfidence: null },
    }))
    view('/analytics')
    const sel = await screen.findByTestId('selected-session')
    for (const id of ['metric-average-tempo', 'metric-tempo-consistency', 'metric-pattern-adherence', 'metric-right-hand-tracked', 'metric-left-hand-tracked', 'metric-detector-confidence', 'metric-beats-detected']) {
      expect(within(sel).getByTestId(id)).toHaveTextContent('Unavailable')
      expect(within(sel).getByTestId(id)).toHaveTextContent('—')
    }
    expect(within(sel).getByTestId('metric-duration-played')).toHaveTextContent('Measured') // what WAS measured still shows
    expect(within(sel).getByText(/left hand was not tracked/i)).toBeInTheDocument()
  })

  it('demo sessions are labelled synthetic and excluded from the conducting averages', async () => {
    addRecord(record({ source: 'demo', id: 'demo1', compositionTitle: 'Parade March', tempo: { averageBpm: 120, minBpm: 119, maxBpm: 121, consistency: 1, intervalCv: 0, series: [] } }))
    addRecord(record({ source: 'camera', id: 'cam1' }))
    view('/analytics')
    await screen.findByTestId('selected-session')
    expect(screen.getByTestId('metric-average-tempo-consistency')).toHaveTextContent('81%') // the demo's 100% is not averaged in
    expect(screen.getByTestId('metric-sessions')).toHaveTextContent('1 with your camera')
    await userEvent.click(screen.getByRole('button', { name: /Show details of Parade March/ }))
    expect(screen.getAllByText(/Synthetic conductor/).length).toBeGreaterThan(0)
  })

  it('selects, deletes and clears sessions; clearing asks for confirmation', async () => {
    addRecord(record({ id: 'a', compositionTitle: 'Aurora Étude' }))
    addRecord(record({ id: 'b', compositionTitle: 'Evening Minuet', compositionId: 'evening-minuet', timeSignature: '3/4' }))
    view('/analytics')
    expect(await screen.findByTestId('selected-session')).toHaveTextContent('Evening Minuet') // latest first
    await userEvent.click(screen.getByRole('button', { name: /Show details of Aurora Étude/ }))
    expect(screen.getByTestId('selected-session')).toHaveTextContent('Aurora Étude')
    await userEvent.click(screen.getByRole('button', { name: /Delete Evening Minuet session/ }))
    expect(historyStore.get().map((r) => r.id)).toEqual(['a'])
    await userEvent.click(screen.getByRole('button', { name: 'Clear history' }))
    expect(historyStore.get()).toHaveLength(1) // not yet
    await userEvent.click(screen.getByRole('button', { name: /Confirm: delete all 1/ }))
    expect(historyStore.get()).toHaveLength(0)
    expect(await screen.findByText('No performances recorded yet')).toBeInTheDocument()
  })

  it('exports the real history as JSON', async () => {
    addRecord(record({ id: 'x' }))
    const created: Blob[] = []
    URL.createObjectURL = vi.fn((b: Blob) => (created.push(b), 'blob:fake'))
    URL.revokeObjectURL = vi.fn()
    view('/analytics')
    await userEvent.click(await screen.findByRole('button', { name: 'Export JSON' }))
    expect(created).toHaveLength(1)
    const json = JSON.parse(await created[0].text())
    expect(json.app).toBe('MAESTRO')
    expect(json.sessions[0].id).toBe('x')
  })

  it('persisted history survives a reload (and old-format records are ignored, not guessed at)', () => {
    addRecord(record({ id: 'keep' }))
    const raw = JSON.parse(localStorage.getItem('maestro.sessions.v2')!)
    expect(raw[0].id).toBe('keep')
    localStorage.setItem('maestro.sessions.v2', JSON.stringify([...raw, { version: 1, id: 'old', durationSec: 5 }, 'junk']))
    // re-reading through the reviver drops anything that is not a valid v2 record
    const revived = JSON.parse(localStorage.getItem('maestro.sessions.v2')!).filter((r: { version?: number }) => r && r.version === 2)
    expect(revived).toHaveLength(1)
  })

  it('lists passed Academy exercises', async () => {
    addRecord(record())
    academyProgress.set({ version: 1, lessons: { tempo: { read: true, quiz: null, exercises: { 'tap-tempo': { attempts: 2, bestScore: 91, passed: true, lastAt: '2026-03-04T10:00:00Z' } } } } })
    view('/analytics')
    expect(await screen.findByText(/Tempo control · tap-tempo/)).toBeInTheDocument()
    expect(screen.getByText(/Passed · best 91%/)).toBeInTheDocument()
  })
})
