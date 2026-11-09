import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { routes } from '@/app/App'
import { calibrationStore } from '@/vision/calibration'
import { DEFAULT_GESTURE_CONFIG } from '@/config/gestureConfig'
import { gestureSettings } from '@/config/settings'
import { selectedCompositionId } from '@/library/selection'
import { SECTIONS } from '@/orchestra/sections'
import { namedError } from './fakeMedia'
import { instances } from './fakeToneBackend'
import { detectors } from './fakeMediapipe'
import { installStudioEnv } from './studioEnv'

vi.mock('@/audio/toneBackend', async () => await import('./fakeToneBackend'))
vi.mock('@/vision/mediapipeDetector', async () => await import('./fakeMediapipe'))

let env: ReturnType<typeof installStudioEnv>
beforeEach(() => {
  env = installStudioEnv()
  instances.length = 0
  detectors.length = 0
})

async function renderStudio() {
  const view = render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: ['/studio'] })} />)
  await screen.findByRole('heading', { level: 1 })
  await waitFor(() => expect(screen.getByRole('button', { name: 'Start' })).toBeEnabled()) // score loaded
  return view
}
const cameraPanel = () => screen.getByRole('region', { name: /camera & hand tracking/i })
const enableCamera = () => userEvent.click(screen.getByRole('button', { name: 'Enable camera' }))
const backend = () => instances.at(-1)!

describe('Studio — camera panel', () => {
  it('starts with the camera off, explains privacy, and requests nothing', async () => {
    await renderStudio()
    expect(screen.getByText('Camera is off')).toBeInTheDocument()
    expect(screen.getByText(/never uploaded/i)).toBeInTheDocument()
    expect(env.getUserMedia).not.toHaveBeenCalled()
    expect(detectors).toHaveLength(0)
    expect(screen.getByRole('button', { name: 'Calibrate' })).toBeDisabled()
    expect(screen.getByTestId('handedness-status')).toHaveTextContent(/not verified/i)
  })

  it('requests the camera only when Enable camera is pressed (video only), then shows live state', async () => {
    await renderStudio()
    await enableCamera()
    expect(env.getUserMedia).toHaveBeenCalledTimes(1)
    expect((env.getUserMedia.mock.calls[0] as unknown[])[0]).toMatchObject({ audio: false })
    expect(await within(cameraPanel()).findByText('Live camera')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Stop camera' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Calibrate' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Virtual conductor' })).toBeDisabled()
  })

  it('Stop camera releases the hardware and the model', async () => {
    await renderStudio()
    await enableCamera()
    await userEvent.click(await screen.findByRole('button', { name: 'Stop camera' }))
    expect(env.stream.track.stop).toHaveBeenCalled()
    expect(detectors[0].closed).toBe(true)
    expect(screen.getByText('Camera is off')).toBeInTheDocument()
  })

  it('leaving the Studio releases camera, model AND audio', async () => {
    const { unmount } = await renderStudio()
    await enableCamera()
    await screen.findByRole('button', { name: 'Stop camera' })
    await userEvent.click(screen.getByRole('button', { name: 'Start' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Pause' })).toBeEnabled())
    unmount()
    expect(env.stream.track.stop).toHaveBeenCalled()
    expect(detectors[0].closed).toBe(true)
    expect(backend().disposed).toBe(true)
  })

  it('permission denied → clear message; retry or the virtual conductor', async () => {
    env.getUserMedia.mockRejectedValueOnce(namedError('NotAllowedError'))
    await renderStudio()
    await enableCamera()
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/camera access was blocked/i)
    expect(screen.getByRole('button', { name: 'Virtual conductor' })).toBeEnabled()
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('button', { name: 'Stop camera' })).toBeInTheDocument()
  })

  it('no camera at all → explains and points to the virtual conductor', async () => {
    env.getUserMedia.mockRejectedValueOnce(namedError('NotFoundError'))
    await renderStudio()
    await enableCamera()
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/no camera was detected/i)
    expect(alert).toHaveTextContent(/virtual conductor/i)
  })

  it('the virtual conductor works without a camera, is clearly synthetic, and offers its own controls', async () => {
    await renderStudio()
    await userEvent.click(screen.getByRole('button', { name: 'Virtual conductor' }))
    expect(env.getUserMedia).not.toHaveBeenCalled()
    expect(within(cameraPanel()).getAllByText(/synthetic hands/i).length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: 'Calibrate' })).toBeDisabled()
    const panel = screen.getByRole('region', { name: /virtual conductor/i })
    expect(within(panel).getByRole('slider', { name: /tempo in beats per minute/i })).toBeEnabled()
    await userEvent.click(screen.getByRole('button', { name: 'Stop demo' }))
    expect(screen.queryByRole('region', { name: /virtual conductor/i })).not.toBeInTheDocument()
  })

  it('opens the calibration flow from the live camera and can cancel it', async () => {
    await renderStudio()
    await enableCamera()
    await userEvent.click(await screen.findByRole('button', { name: 'Calibrate' }))
    const cal = screen.getByRole('group', { name: 'Calibration' })
    expect(cal).toHaveTextContent(/step 1 of 3/i)
    await userEvent.click(within(cal).getByRole('button', { name: /cancel calibration/i }))
    expect(screen.queryByRole('group', { name: 'Calibration' })).not.toBeInTheDocument()
  })

  it('sensitivity and the left/right override are real settings', async () => {
    await renderStudio()
    expect(screen.getByRole('slider', { name: /tracking sensitivity/i })).toBeEnabled()
    await userEvent.selectOptions(screen.getByLabelText(/left\/right labels/i), 'swapped')
    await waitFor(() => expect(screen.getByTestId('handedness-status')).toHaveTextContent(/manual: labels swapped/i))
  })

  it('shows a saved calibration and lets the user clear it', async () => {
    calibrationStore.set({ version: 1, createdAt: 1, handedness: { swap: true, observed: { right: 'Left', left: 'Right' }, agreement: { right: 1, left: 1 } }, ranges: { left: null, right: null }, warnings: [] })
    await renderStudio()
    expect(await screen.findByText(/verified by calibration — labels swapped/i)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Clear calibration' }))
    expect(calibrationStore.get()).toBeNull()
    expect(screen.getByTestId('handedness-status')).toHaveTextContent(/not verified/i)
  })
})

describe('Studio — playback controls', () => {
  it('Enable audio initialises audio on a click; Start plays; the transport buttons follow the state', async () => {
    await renderStudio()
    expect(backend()?.initCalls ?? 0).toBe(0)
    await userEvent.click(screen.getByRole('button', { name: 'Start' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Pause' })).toBeEnabled())
    expect(backend().initCalls).toBe(1)
    expect(screen.getByTestId('audio-status')).toHaveTextContent(/audio running/i)
    expect(screen.getByRole('button', { name: 'Start' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Stop' })).toBeEnabled()
    await userEvent.click(screen.getByRole('button', { name: 'Pause' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Resume' })).toBeEnabled())
    expect(backend().silenced).toBe(true)
    await userEvent.click(screen.getByRole('button', { name: 'Resume' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Pause' })).toBeEnabled())
    await userEvent.click(screen.getByRole('button', { name: 'Stop' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Start' })).toBeEnabled())
    expect(screen.getByTestId('readout-position')).toHaveTextContent('—')
  })

  it('emergency pause / stop are always on screen while playing, and work from the keyboard', async () => {
    await renderStudio()
    expect(screen.queryByRole('region', { name: /emergency controls/i })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Start' }))
    const bar = await screen.findByRole('region', { name: /emergency controls/i })
    expect(within(bar).getByRole('button', { name: /pause/i })).toBeVisible()
    expect(within(bar).getByRole('button', { name: /stop/i })).toBeVisible()
    await act(async () => {
      document.body.focus()
      window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true }))
    })
    expect(await within(await screen.findByRole('region', { name: /emergency controls/i })).findByRole('button', { name: /resume/i })).toBeVisible()
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    await waitFor(() => expect(screen.queryByRole('region', { name: /emergency controls/i })).not.toBeInTheDocument())
    expect(backend().silenced).toBe(true)
  })

  it('Space on a focused button keeps its normal meaning (does not pause)', async () => {
    await renderStudio()
    await userEvent.click(screen.getByRole('button', { name: 'Start' }))
    await screen.findByRole('region', { name: /emergency controls/i })
    const stopBtn = screen.getByRole('button', { name: 'Stop', hidden: false })
    stopBtn.focus()
    const ev = new KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true, cancelable: true })
    stopBtn.dispatchEvent(ev)
    expect(ev.defaultPrevented).toBe(false)
  })
})

describe('Studio — orchestra section controls', () => {
  it.each(SECTIONS.map((s) => [s.id, s.label] as const))('%s: mute, solo and volume change the audio graph', async (id, label) => {
    await renderStudio()
    await userEvent.click(screen.getByRole('button', { name: 'Enable audio' }))
    await waitFor(() => expect(screen.getByTestId('audio-status')).toHaveTextContent(/audio running/i))
    const b = backend()
    const row = screen.getByTestId(`section-${id}`)
    const before = b.gains[id]
    expect(before).toBeGreaterThan(0)
    await userEvent.click(within(row).getByRole('button', { name: `Mute ${label}` }))
    expect(within(row).getByRole('button', { name: `Mute ${label}` })).toHaveAttribute('aria-pressed', 'true')
    expect(b.gains[id]).toBe(0)
    await userEvent.click(within(row).getByRole('button', { name: `Mute ${label}` }))
    expect(b.gains[id]).toBeCloseTo(before)
    await userEvent.click(within(row).getByRole('button', { name: `Solo ${label}` }))
    for (const other of SECTIONS.filter((s) => s.id !== id)) expect(b.gains[other.id]).toBe(0)
    expect(b.gains[id]).toBeGreaterThan(0)
    await userEvent.click(within(row).getByRole('button', { name: `Solo ${label}` }))
    const slider = within(row).getByRole('slider', { name: `${label} volume` })
    fireEvent.change(slider, { target: { value: '0' } })
    expect(b.gains[id]).toBe(0)
    fireEvent.change(slider, { target: { value: '0.5' } })
    expect(b.gains[id]).toBeGreaterThan(0)
    expect(b.gains[id]).toBeLessThan(before)
  })

  it('master volume reaches the output', async () => {
    await renderStudio()
    await userEvent.click(screen.getByRole('button', { name: 'Enable audio' }))
    await waitFor(() => expect(screen.getByTestId('audio-status')).toHaveTextContent(/audio running/i))
    const master = screen.getByRole('slider', { name: 'Master volume' })
    fireEvent.change(master, { target: { value: '0' } })
    expect(backend().master).toBe(0)
    fireEvent.change(master, { target: { value: '1' } })
    expect(backend().master).toBe(1)
  })
})

describe('Studio — composition and conducting pattern', () => {
  it('conducting pattern: Aurora offers 4/4 and 2/4 (in two), locked while playing; the Minuet only 3/4', async () => {
    await renderStudio()
    const sel = screen.getByLabelText('Conduct in') as HTMLSelectElement
    expect([...sel.options].map((o) => o.textContent)).toEqual(['4/4', '2/4 (in two)'])
    await userEvent.selectOptions(sel, '2/4')
    expect(sel.value).toBe('2/4')
    await userEvent.click(screen.getByRole('button', { name: 'Start' }))
    await waitFor(() => expect(sel).toBeDisabled())
    await userEvent.click(screen.getByRole('button', { name: 'Stop' }))
    await waitFor(() => expect(sel).toBeEnabled())
    await userEvent.selectOptions(screen.getByLabelText('Composition'), 'evening-minuet')
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Evening Minuet'))
    await waitFor(() => expect(screen.getByLabelText('Conduct in')).toBeDisabled())
    expect(selectedCompositionId.get()).toBe('evening-minuet')
    expect((screen.getByLabelText('Conduct in') as HTMLSelectElement).value).toBe('3/4')
  })

  it('lists the instruments of the piece and the section each belongs to', async () => {
    await renderStudio()
    await userEvent.click(screen.getByText('Instruments in this piece'))
    const table = screen.getByRole('table', { name: /orchestra section/i })
    expect(within(table).getByText('Timpani').closest('tr')).toHaveTextContent('Percussion')
    expect(within(table).getByText('Flute').closest('tr')).toHaveTextContent('Woodwinds')
    expect(within(table).getByText('Horns').closest('tr')).toHaveTextContent('Brass')
  })

  it('tempo mode: fixed tempo reveals a speed control', async () => {
    await renderStudio()
    expect(screen.queryByRole('slider', { name: /fixed tempo/i })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('radio', { name: 'Fixed tempo' }))
    expect(screen.getByRole('slider', { name: /fixed tempo/i })).toBeEnabled()
  })
})

describe('Studio — tuning panel', () => {
  it('changes real recogniser thresholds live, persists them, and resets to defaults', async () => {
    await renderStudio()
    await userEvent.click(screen.getByText(/^Tuning/))
    const slider = screen.getByRole('slider', { name: 'Minimum stroke size' })
    fireEvent.change(slider, { target: { value: '1.2' } })
    expect(gestureSettings.get().beat.minAmplitude).toBeCloseTo(1.2)
    expect(JSON.parse(localStorage.getItem('maestro.gestureConfig.v1')!).beat.minAmplitude).toBeCloseTo(1.2) // persisted
    expect(screen.getByText(/1 changed/)).toBeInTheDocument()
    fireEvent.change(screen.getByRole('slider', { name: 'Stop hold time' }), { target: { value: '2000' } })
    expect(gestureSettings.get().cues.stopHoldMs).toBe(2000)
    await userEvent.click(screen.getByRole('checkbox', { name: /open right palm/i }))
    expect(gestureSettings.get().cues.openPalmPauseEnabled).toBe(true)
    await userEvent.click(screen.getByRole('button', { name: 'Reset all to defaults' }))
    expect(gestureSettings.get()).toEqual(DEFAULT_GESTURE_CONFIG)
  })

  it('values outside a parameter range are clamped', async () => {
    await renderStudio()
    await userEvent.click(screen.getByText(/^Tuning/))
    fireEvent.change(screen.getByRole('slider', { name: 'Direction strictness' }), { target: { value: '5' } })
    expect(gestureSettings.get().beat.directionTolerance).toBeLessThanOrEqual(0.9)
  })
})
