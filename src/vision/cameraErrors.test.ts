import { classifyCameraError } from './cameraErrors'

const named = (name: string) => Object.assign(new Error(name), { name })

describe('classifyCameraError', () => {
  it.each([
    ['NotAllowedError', 'permission-denied'],
    ['PermissionDeniedError', 'permission-denied'],
    ['SecurityError', 'permission-denied'],
    ['NotFoundError', 'no-device'],
    ['DevicesNotFoundError', 'no-device'],
    ['NotReadableError', 'in-use'],
    ['TrackStartError', 'in-use'],
    ['OverconstrainedError', 'overconstrained'],
    ['AbortError', 'aborted'],
    ['CameraUnsupported', 'unsupported'],
    ['CameraInsecureContext', 'insecure-context'],
    ['SomethingElse', 'unknown'],
  ])('%s → %s', (name, kind) => expect(classifyCameraError(named(name)).kind).toBe(kind))

  it('handles non-Error values', () => {
    expect(classifyCameraError(null).kind).toBe('unknown')
    expect(classifyCameraError('boom').kind).toBe('unknown')
  })

  it('gives actionable, privacy-reassuring messages', () => {
    const denied = classifyCameraError(named('NotAllowedError'))
    expect(denied.message).toMatch(/address bar/i)
    expect(denied.message).toMatch(/nothing was recorded or sent/i)
    expect(denied.canRetry).toBe(true)
    expect(classifyCameraError(named('NotFoundError')).message).toMatch(/demonstration mode/i)
    expect(classifyCameraError(named('CameraInsecureContext')).canRetry).toBe(false)
  })
})
