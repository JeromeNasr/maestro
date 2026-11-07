import type { Composition } from '@/library/types'

const COLOR = { gold: '#c4a35a', bronze: '#8c6a43', ivory: '#c9c0ad' } as const

/** Deterministic SVG artwork (no external images, so no image licensing concerns). */
export function CompositionArt({ art, className = '' }: { art: Composition['art']; className?: string }) {
  const c = COLOR[art.hue]
  return (
    <svg viewBox="0 0 320 180" className={`h-full w-full ${className}`} role="img" aria-label={`${art.motif} artwork`} preserveAspectRatio="xMidYMid slice">
      <rect width="320" height="180" fill="#12100e" />
      {art.motif === 'staff' &&
        [0, 1, 2, 3, 4].map((i) => <line key={i} x1="0" x2="320" y1={62 + i * 12} y2={62 + i * 12} stroke={c} strokeOpacity=".45" />)}
      {art.motif === 'staff' &&
        [40, 90, 140, 190, 240, 280].map((x, i) => (
          <ellipse key={x} cx={x} cy={110 - ((i * 7) % 38)} rx="7" ry="5" fill={c} transform={`rotate(-20 ${x} ${110 - ((i * 7) % 38)})`} />
        ))}
      {art.motif === 'rings' &&
        [18, 38, 60, 84, 110].map((r) => <circle key={r} cx="160" cy="90" r={r} fill="none" stroke={c} strokeOpacity={0.15 + r / 260} />)}
      {art.motif === 'waves' &&
        [0, 1, 2, 3, 4, 5].map((i) => (
          <path key={i} d={`M0 ${50 + i * 18} Q 40 ${30 + i * 18} 80 ${50 + i * 18} T 160 ${50 + i * 18} T 240 ${50 + i * 18} T 320 ${50 + i * 18}`} fill="none" stroke={c} strokeOpacity={0.25 + i * 0.1} />
        ))}
      <rect width="320" height="180" fill="url(#fade)" />
      <defs>
        <linearGradient id="fade" x1="0" x2="0" y1="0" y2="1">
          <stop offset="55%" stopColor="#12100e" stopOpacity="0" />
          <stop offset="100%" stopColor="#12100e" stopOpacity=".9" />
        </linearGradient>
      </defs>
    </svg>
  )
}
