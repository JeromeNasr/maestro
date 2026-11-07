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
  /** Path under /public to the MIDI file (set when status is 'available'). */
  midiUrl?: string
  /** Licence record for the MIDI arrangement; required when status is 'available'. */
  midiLicense?: AssetLicense
  /** Why a planned piece is not yet selectable. */
  pendingReason?: string
  /** Deterministic artwork parameters (no external images → no licensing issues). */
  art: { hue: 'gold' | 'bronze' | 'ivory'; motif: 'staff' | 'waves' | 'rings' }
}
