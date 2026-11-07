import { useEffect, useState } from 'react'
import { createStore } from '@/lib/store'
import { useStore } from '@/lib/store'
import { createMediaPipeDetector } from '@/vision/mediapipeDetector'
import { IDLE_SNAPSHOT, VisionSession, type VisionSnapshot } from '@/vision/visionSession'

const idleStore = createStore<VisionSnapshot>(IDLE_SNAPSHOT)

/**
 * Creates the VisionSession when the Studio mounts and disposes it (camera tracks, detector, loop, listeners)
 * when it unmounts. Creating the session does NOT touch the camera.
 */
export function useVisionSession(): VisionSession | null {
  const [session, setSession] = useState<VisionSession | null>(null)
  useEffect(() => {
    const s = new VisionSession({ createDetector: createMediaPipeDetector })
    setSession(s)
    return () => s.dispose()
  }, [])
  return session
}

export function useVisionSnapshot(session: VisionSession | null): VisionSnapshot {
  return useStore(session ? session.store : idleStore)
}
