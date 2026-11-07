import type { ReactNode } from 'react'

type Kind = 'demo' | 'phase' | 'measured' | 'estimate' | 'unavailable'

const STYLES: Record<Kind, string> = {
  demo: 'border-bronze text-bronze',
  phase: 'border-ivory/25 text-ivory-mute',
  measured: 'border-gold/60 text-gold',
  estimate: 'border-ivory/30 text-ivory-dim',
  unavailable: 'border-ivory/15 text-ivory-mute',
}

/** Small honesty label: marks demo data, unimplemented features, and measured-vs-estimated values. */
export function StatusTag({ kind, children }: { kind: Kind; children?: ReactNode }) {
  const label =
    children ?? { demo: 'Demo data', phase: 'Not yet implemented', measured: 'Measured', estimate: 'Estimate', unavailable: 'Unavailable' }[kind]
  return (
    <span className={`inline-block whitespace-nowrap rounded-sm border px-1.5 py-px text-[10px] uppercase tracking-widest ${STYLES[kind]}`}>
      {label}
    </span>
  )
}

export const PhaseTag = ({ phase }: { phase: number }) => <StatusTag kind="phase">Planned · Phase {phase}</StatusTag>
