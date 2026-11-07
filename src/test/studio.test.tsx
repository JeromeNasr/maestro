import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { routes } from '@/app/App'
import { calibrationStore } from '@/vision/calibration'
import { FakeStream, namedError } from './fakeMedia'

const h = vi.hoisted(() => ({ create: vi.fn() }))
vi.mock('@/vision/mediapipeDetector', () => ({ createMediaPipeDetector: h.create }))

class UiDetector {
  delegate = 'CPU' as const
  assetOrigin = 'test' as const
  closed = false
  detect = () => ({ hands: [] })
  setMinConfidence = vi.fn()
  close() {
    this.closed = true
  }
}

let stream: FakeStream
let getUserMedia: ReturnType<typeof vi.fn>
let detector: UiDetector

beforeEach(() => {
  stream = new FakeStream()
  detector = new UiDetector()
  h.create.mockImplementation(() => Promise.resolve(detector))
  getUserMedia = vi.fn(() => Promise.resolve(stream))
  Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia }, configurable: true })
  HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined)
  HTMLMediaElement.prototype.pause = vi.fn()
  Object.defineProperty(HTMLVideoElement.prototype, 'videoWidth', { get: () => 640, configurable: true })
  Object.defineProperty(HTMLVideoElement.prototype, 'videoHeight', { get: () => 480, configurable: true })
  HTMLCanvasElement.prototype.getContext = vi.fn(() => null) as never
})

const renderStudio = () => render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: ['/studio'] })} />)
const panel = () => screen.getByRole('region', { name: /camera & hand tracking/i })
const enable = () => userEvent.click(screen.getByRole('button', { name: 'Enable camera' }))

describe('Studio camera panel', () => {
  it('starts with the camera off, explains privacy, and requests nothing', () => {
    renderStudio()
    expect(screen.getByText('Camera is off')).toBeInTheDocument()
    expect(screen.getByText(/never uploaded/i)).toBeInTheDocument()
    expect(getUserMedia).not.toHaveBeenCalled()
    expect(h.create).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Calibrate' })).toBeDisabled()
    expect(screen.getByTestId('handedness-status')).toHaveTextContent(/not verified/i)
  })

  it('requests the camera only when Enable camera is pressed, then shows live tracking state', async () => {
    renderStudio()
    await enable()
    expect(getUserMedia).toHaveBeenCalledTimes(1)
    expect(getUserMedia.mock.calls[0][0]).toMatchObject({ audio: false })
    expect(await within(panel()).findByText('Live camera')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Stop camera' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Calibrate' })).toBeEnabled()
    expect(screen.getByText(/No hands detected/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Demo mode' })).toBeDisabled() // cannot mix sources
  })

  it('Stop camera releases the hardware and the model', async () => {
    renderStudio()
    await enable()
    await screen.findByRole('button', { name: 'Stop camera' })
    await userEvent.click(screen.getByRole('button', { name: 'Stop camera' }))
    expect(stream.track.stop).toHaveBeenCalled()
    expect(detector.closed).toBe(true)
    expect(screen.getByText('Camera is off')).toBeInTheDocument()
  })

  it('leaving the Studio (unmount) releases the camera', async () => {
    const { unmount } = renderStudio()
    await enable()
    await screen.findByRole('button', { name: 'Stop camera' })
    unmount()
    expect(stream.track.stop).toHaveBeenCalled()
    expect(detector.closed).toBe(true)
  })

  it('shows a clear message when permission is denied, and allows retry or demo mode', async () => {
    getUserMedia.mockRejectedValueOnce(namedError('NotAllowedError'))
    renderStudio()
    await enable()
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/camera access was blocked/i)
    expect(alert).toHaveTextContent(/address bar/i)
    expect(screen.getByRole('button', { name: 'Demo mode' })).toBeEnabled()
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('button', { name: 'Stop camera' })).toBeInTheDocument()
    expect(getUserMedia).toHaveBeenCalledTimes(2)
  })

  it('explains when no camera exists', async () => {
    getUserMedia.mockRejectedValueOnce(namedError('NotFoundError'))
    renderStudio()
    await enable()
    expect(await screen.findByRole('alert')).toHaveTextContent(/no camera was detected/i)
  })

  it('demonstration mode works without any camera and is clearly labelled synthetic', async () => {
    renderStudio()
    await userEvent.click(screen.getByRole('button', { name: 'Demo mode' }))
    expect(getUserMedia).not.toHaveBeenCalled()
    expect(h.create).not.toHaveBeenCalled()
    expect(within(panel()).getAllByText(/synthetic hands/i).length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: 'Calibrate' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Stop demo' }))
    expect(screen.getByText('Camera is off')).toBeInTheDocument()
  })

  it('demonstration mode reports both demo hands as tracked', async () => {
    renderStudio()
    await userEvent.click(screen.getByRole('button', { name: 'Demo mode' }))
    await waitFor(() => expect(screen.getByTestId('left-status')).toHaveTextContent(/tracking/i), { timeout: 2000 })
    await waitFor(() => expect(screen.getByTestId('right-status')).toHaveTextContent(/tracking/i), { timeout: 2000 })
  })

  it('opens the calibration flow from the live camera and can cancel it', async () => {
    renderStudio()
    await enable()
    await userEvent.click(await screen.findByRole('button', { name: 'Calibrate' }))
    const cal = screen.getByRole('group', { name: 'Calibration' })
    expect(cal).toHaveTextContent(/step 1 of 3/i)
    expect(cal).toHaveTextContent(/right side of the preview/i)
    await userEvent.click(within(cal).getByRole('button', { name: /cancel calibration/i }))
    expect(screen.queryByRole('group', { name: 'Calibration' })).not.toBeInTheDocument()
  })

  it('the sensitivity slider and handedness override are real settings', async () => {
    renderStudio()
    const slider = screen.getByRole('slider', { name: /tracking sensitivity/i })
    expect(slider).toBeEnabled()
    await userEvent.selectOptions(screen.getByLabelText(/left\/right labels/i), 'swapped')
    await waitFor(() => expect(screen.getByTestId('handedness-status')).toHaveTextContent(/manual: labels swapped/i))
  })

  it('shows a saved calibration and lets the user clear it', async () => {
    calibrationStore.set({ version: 1, createdAt: 1, handedness: { swap: true, observed: { right: 'Left', left: 'Right' }, agreement: { right: 1, left: 1 } }, ranges: { left: null, right: null }, warnings: [] })
    renderStudio()
    expect(await screen.findByText(/verified by calibration — labels swapped/i)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Clear calibration' }))
    expect(calibrationStore.get()).toBeNull()
    expect(screen.getByTestId('handedness-status')).toHaveTextContent(/not verified/i)
    expect(screen.queryByRole('button', { name: 'Clear calibration' })).not.toBeInTheDocument()
  })
})
