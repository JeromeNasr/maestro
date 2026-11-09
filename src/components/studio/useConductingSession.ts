import { useEffect, useState } from 'react'
import { ToneBackend } from '@/audio/toneBackend'
import type { AudioSnapshot } from '@/audio/engine'
import type { MixerState } from '@/audio/mixer'
import { ConductingSession, type StudioSnapshot } from '@/conducting/conductingSession'
import type { GestureSnapshot } from '@/gesture/types'
import { useStore } from '@/lib/store'
import { createMediaPipeDetector } from '@/vision/mediapipeDetector'
import type { VisionSnapshot } from '@/vision/visionSession'

/**
 * Creates the ConductingSession once per Studio mount and activates it; on unmount `deactivate()` releases the
 * camera, detector, audio graph, timers and listeners. Creating the session touches neither camera nor audio.
 */
export function useConductingSession(): ConductingSession {
  const [session] = useState(() => new ConductingSession({ createDetector: createMediaPipeDetector, createBackend: () => new ToneBackend() }))
  useEffect(() => {
    session.activate()
    return () => session.deactivate()
  }, [session])
  return session
}

export const useStudio = (s: ConductingSession): StudioSnapshot => useStore(s.store)
export const useAudio = (s: ConductingSession): AudioSnapshot => useStore(s.audioStore)
export const useGesture = (s: ConductingSession): GestureSnapshot => useStore(s.gesture.store)
export const useVision = (s: ConductingSession): VisionSnapshot => useStore(s.vision.store)
export const useMix = (s: ConductingSession): MixerState => useStore(s.mixer.store)
