import type { ReactNode } from 'react'

type Kind = 'demo' | 'neutral' | 'measured' | 'estimate' | 'unavailable'

const STYLES: Record<Kind, string> = {
  demo: 'border-bronze text-bronze-soft',
  neutral: 'border-ivory/25 text-ivory-mute',
  measured: 'border-gold/60 text-gold',
  estimate: 'border-ivory/30 text-ivory-dim',
  unavailable: 'border-ivory/15 text-ivory-mute',
}

/** Small label: marks demo/synthetic data, measured vs estimated vs unavailable values, and neutral status. */
export function StatusTag({ kind, children }: { kind: Kind; children?: ReactNode }) {
  const label =
    children ?? { demo: 'Demo data', neutral: '', measured: 'Measured', estimate: 'Estimate', unavailable: 'Unavailable' }[kind]
  return (
    <span className={`inline-block whitespace-nowrap rounded-sm border px-1.5 py-px text-[10px] uppercase tracking-widest ${STYLES[kind]}`}>
      {label}
    </span>
  )
}

