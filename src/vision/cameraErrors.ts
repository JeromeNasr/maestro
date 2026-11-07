export type CameraErrorKind =
  | 'insecure-context'
  | 'unsupported'
  | 'permission-denied'
  | 'no-device'
  | 'in-use'
  | 'overconstrained'
  | 'aborted'
  | 'unknown'

export interface CameraErrorInfo {
  kind: CameraErrorKind
  title: string
  message: string
  /** Whether pressing "Enable camera" again can plausibly succeed. */
  canRetry: boolean
}

const PRIVACY = 'Nothing was recorded or sent anywhere.'

const INFO: Record<CameraErrorKind, Omit<CameraErrorInfo, 'kind'>> = {
  'permission-denied': {
    title: 'Camera access was blocked',
    message: `Your browser did not allow MAESTRO to use the camera. Allow camera access for this site (click the camera or lock icon in the address bar, set Camera to “Allow”), then press Enable camera again. ${PRIVACY}`,
    canRetry: true,
  },
  'no-device': {
    title: 'No camera found',
    message: `No camera was detected on this device. Connect a webcam and try again, or use demonstration mode. ${PRIVACY}`,
    canRetry: true,
  },
  'in-use': {
    title: 'Camera is unavailable',
    message: 'The camera could not be started, most likely because another application or browser tab is using it. Close other apps that use the camera (video calls, other tabs) and try again.',
    canRetry: true,
  },
  overconstrained: {
    title: 'Camera settings not supported',
    message: 'The camera does not support the requested video settings.',
    canRetry: true,
  },
  'insecure-context': {
    title: 'Camera needs a secure connection',
    message: 'Browsers only allow camera access on HTTPS pages or on localhost. Open MAESTRO from https:// or http://localhost.',
    canRetry: false,
  },
  unsupported: {
    title: 'Camera not supported',
    message: 'This browser does not support camera access (getUserMedia). Try a current version of Chrome, Edge, Firefox or Safari, or use demonstration mode.',
    canRetry: false,
  },
  aborted: { title: 'Camera start was interrupted', message: 'The camera request was cancelled before it finished.', canRetry: true },
  unknown: {
    title: 'The camera could not be started',
    message: 'An unexpected error occurred while starting the camera. Try again, or use demonstration mode.',
    canRetry: true,
  },
}

export const cameraErrorInfo = (kind: CameraErrorKind): CameraErrorInfo => ({ kind, ...INFO[kind] })

/** Maps a getUserMedia failure (DOMException or otherwise) to a user-facing explanation. */
export function classifyCameraError(err: unknown): CameraErrorInfo {
  const name = (err as { name?: string } | null)?.name ?? ''
  switch (name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
    case 'SecurityError':
      return cameraErrorInfo('permission-denied')
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return cameraErrorInfo('no-device')
    case 'NotReadableError':
    case 'TrackStartError':
      return cameraErrorInfo('in-use')
    case 'OverconstrainedError':
    case 'ConstraintNotSatisfiedError':
      return cameraErrorInfo('overconstrained')
    case 'AbortError':
      return cameraErrorInfo('aborted')
    case 'CameraUnsupported':
      return cameraErrorInfo('unsupported')
    case 'CameraInsecureContext':
      return cameraErrorInfo('insecure-context')
    default:
      return cameraErrorInfo('unknown')
  }
}

/** Error thrown by CameraController so callers can classify it uniformly. */
export class CameraStartError extends Error {
  constructor(name: string, message = name) {
    super(message)
    this.name = name
  }
}
