import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'
import { resetGestureSettings } from '@/config/settings'
import { calibrationStore } from '@/vision/calibration'

afterEach(() => {
  cleanup()
  localStorage.clear()
  resetGestureSettings()
  calibrationStore.set(null)
})
