import { useEffect, useState } from 'react'
import { GestureInput } from '@/conducting/gestureInput'
import { createMediaPipeDetector } from '@/vision/mediapipeDetector'
import { VisionSession } from '@/vision/visionSession'

/** A camera + gesture-recognition pipeline for exercises. Releases the camera and model on unmount. No audio. */
export function useGestureInput(): GestureInput {
  const [input] = useState(() => new GestureInput(new VisionSession({ createDetector: createMediaPipeDetector })))
  useEffect(() => {
    input.activate()
    return () => {
      input.deactivate()
      input.vision.release()
    }
  }, [input])
  return input
}
