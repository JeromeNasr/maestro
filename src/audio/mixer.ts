import { createStore, type Store } from '@/lib/store'
import { SECTIONS, type SectionId } from '@/orchestra/sections'

export interface SectionMix { volume: number; muted: boolean; solo: boolean }
export interface MixerState { sections: Record<SectionId, SectionMix>; master: number }

export const DEFAULT_VOLUME = 0.8

const initial = (): MixerState => ({
  sections: Object.fromEntries(SECTIONS.map((s) => [s.id, { volume: DEFAULT_VOLUME, muted: false, solo: false }])) as Record<SectionId, SectionMix>,
  master: DEFAULT_VOLUME,
})

const clamp01 = (v: number) => Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0))
/** Slider position → linear gain. Squared: roughly perceptual, and slider 0 is true silence. */
export const volumeToGain = (v: number) => clamp01(v) ** 2

/**
 * Orchestra section controls: volume, mute, solo, master. Pure state + gain rules:
 *  - muted sections are silent;
 *  - if ANY section is soloed, only soloed sections are heard (a soloed section that is also muted stays silent).
 */
export class Mixer {
  readonly store: Store<MixerState> = createStore(initial())

  get state(): MixerState {
    return this.store.get()
  }

  setVolume(section: SectionId, v: number) {
    this.patch(section, { volume: clamp01(v) })
  }
  setMuted(section: SectionId, muted: boolean) {
    this.patch(section, { muted })
  }
  setSolo(section: SectionId, solo: boolean) {
    this.patch(section, { solo })
  }
  setMaster(v: number) {
    this.store.set((s) => ({ ...s, master: clamp01(v) }))
  }
  reset() {
    this.store.set(initial())
  }

  /** Whether this section is audible given mute/solo state (ignoring volume). */
  audible(section: SectionId): boolean {
    const s = this.state.sections
    const anySolo = SECTIONS.some((x) => s[x.id].solo)
    return !s[section].muted && (!anySolo || s[section].solo)
  }

  /** Linear gain for the section from the mixer alone (volume × mute/solo); master is applied separately. */
  sectionGain(section: SectionId): number {
    return this.audible(section) ? volumeToGain(this.state.sections[section].volume) : 0
  }
  get masterGain(): number {
    return volumeToGain(this.state.master)
  }

  private patch(section: SectionId, p: Partial<SectionMix>) {
    this.store.set((s) => ({ ...s, sections: { ...s.sections, [section]: { ...s.sections[section], ...p } } }))
  }
}
