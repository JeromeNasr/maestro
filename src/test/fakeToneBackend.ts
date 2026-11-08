import { FakeBackend } from './fakeAudio'

/** Drop-in replacement for ToneBackend in UI tests (vi.mock('@/audio/toneBackend')). Instances are recorded. */
export const instances: FakeBackend[] = []
export class ToneBackend extends FakeBackend {
  constructor() {
    super()
    instances.push(this)
  }
}

/** The Studio builds an OrchestraBackend; in UI tests it is the same recording fake. */
export { ToneBackend as OrchestraBackend }
