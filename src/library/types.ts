import type { TimeSignature } from '@/config/gestureConfig'

export type Difficulty = 'Beginner' | 'Intermediate' | 'Advanced'
export type Period = 'Baroque' | 'Classical' | 'Romantic' | 'Contemporary'

/**
 * 'available'  – a MIDI asset with verified licence exists in the repo.
 * 'planned'    – intended for the library; no verified-licence arrangement included yet.
 */
export type CompositionStatus = 'available' | 'planned'

export interface AssetLicense {
  /** SPDX-style identifier or plain description, e.g. "CC0-1.0", "Original work, CC0". */
  license: string
  source: string
  notes?: string
  /** Licences such as CC BY / CC BY-SA require crediting the typesetter: shown in the Library and the Studio. */
  attribution?: string
  /** Link to the licence text. */
  licenseUrl?: string
}

export interface Composition {
  id: string
  title: string
  composer: string
  period: Period
  /** Approximate duration in seconds of the arrangement in this library. */
  durationSec: number
  timeSignature: TimeSignature
  difficulty: Difficulty
  description: string
  status: CompositionStatus
  /**
   * Time signatures the piece can be conducted in. The first is the written meter. A 4/4 piece can also be conducted
   * "in two" (2/4): each conducted beat then spans two quarter notes.
   */
  conductingOptions: TimeSignature[]
  /** Optional section overrides by MIDI track name (for arrangements whose instrument programs are wrong). */
  sectionOverrides?: Record<string, import('@/orchestra/sections').SectionId>
  /** Path under /public to the MIDI file (set when status is 'available'). */
  midiUrl?: string
  /** Licence record for the MIDI arrangement; required when status is 'available'. */
  midiLicense?: AssetLicense
  /** Why a planned piece is not yet selectable. */
  pendingReason?: string
  /** Deterministic artwork parameters (no external images → no licensing issues). */
  art: { hue: 'gold' | 'bronze' | 'ivory'; motif: 'staff' | 'waves' | 'rings' }
}
