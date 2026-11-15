import { useState } from 'react'

interface Spot { id: string; n: number; x: number; y: number; title: string; text: string }

const SPOTS: Spot[] = [
  { id: 'bulb', n: 1, x: 118, y: 150, title: 'The handle (bulb) rests in the palm', text: 'The rounded end of the baton sits against the pad of the palm, so the stick feels like a continuation of the hand. It is held, not gripped: the baton should be able to move a little.' },
  { id: 'pinch', n: 2, x: 168, y: 118, title: 'Thumb and first two fingers hold it', text: 'The thumb and the pads of the index (and usually middle) finger pinch the handle lightly, a little behind the bulb. Think of holding a small bird: firm enough not to drop it, gentle enough not to hurt it.' },
  { id: 'fingers', n: 3, x: 140, y: 190, title: 'The other fingers curl loosely', text: 'The remaining fingers curl in softly. A white-knuckled fist makes the whole arm tense and the tip stiff; a relaxed hand lets the tip rebound.' },
  { id: 'wrist', n: 4, x: 88, y: 128, title: 'The wrist stays flexible', text: 'Most of the small movements come from the wrist and fingers, and the forearm moves the bigger strokes. A locked wrist makes beats look like chopping.' },
  { id: 'line', n: 5, x: 252, y: 92, title: 'The baton continues the line of the forearm', text: 'Seen from the side, the baton points forward and slightly inward from the forearm — not down at the floor, not straight up. The tip is what the orchestra watches, so it should be clear against the space in front of you.' },
]

/** An illustrated grip with five numbered hotspots. Each one explains a single point; all are keyboard-reachable buttons. */
export function BatonGripDemo() {
  const [active, setActive] = useState<string>('pinch')
  const spot = SPOTS.find((s) => s.id === active)!
  return (
    <div className="grid gap-6 sm:grid-cols-[minmax(0,340px)_1fr]">
      <svg viewBox="0 0 340 240" className="w-full rounded-sm border hairline bg-ink-950" role="img" aria-label="Illustration of a hand holding a conducting baton: handle in the palm, thumb and two fingers pinching, other fingers loose, flexible wrist, baton continuing the line of the forearm">
        {/* forearm */}
        <path d="M0 150 L90 118 L100 158 L0 196 Z" fill="#2a2620" stroke="#c9c0ad" strokeOpacity=".5" />
        {/* hand */}
        <path d="M88 118 C110 98 150 96 178 112 C186 130 176 160 160 182 C146 204 112 206 98 182 Z" fill="#3a342b" stroke="#c9c0ad" strokeOpacity=".7" />
        {/* curled fingers */}
        <path d="M110 186 C124 204 150 206 164 190 M118 174 C130 190 152 192 164 178" fill="none" stroke="#c9c0ad" strokeOpacity=".5" />
        {/* thumb + index pinch */}
        <path d="M150 104 C168 92 186 100 190 116 C176 114 164 118 156 124 Z" fill="#4a4235" stroke="#c9c0ad" strokeOpacity=".7" />
        {/* baton */}
        <line x1="112" y1="150" x2="318" y2="64" stroke="#f3ecdc" strokeWidth="3.2" strokeLinecap="round" />
        <ellipse cx="116" cy="148" rx="11" ry="8" transform="rotate(-23 116 148)" fill="#c4a35a" />
        <circle cx="318" cy="64" r="2.6" fill="#c4a35a" />
        {SPOTS.map((s) => (
          <g key={s.id}>
            <circle cx={s.x} cy={s.y} r="11" fill={s.id === active ? '#c4a35a' : '#14110d'} stroke="#c4a35a" strokeWidth="1.5" />
            <text x={s.x} y={s.y + 4} fontSize="12" textAnchor="middle" fill={s.id === active ? '#14110d' : '#f3ecdc'}>{s.n}</text>
          </g>
        ))}
      </svg>
      <div>
        <div role="tablist" aria-label="Grip points" className="flex flex-wrap gap-2">
          {SPOTS.map((s) => (
            <button key={s.id} role="tab" aria-selected={s.id === active} className={`btn !px-3 !py-1.5 ${s.id === active ? 'btn-gold' : 'btn-ghost'}`} onClick={() => setActive(s.id)}>
              {s.n}
            </button>
          ))}
        </div>
        <div role="tabpanel" className="mt-4" aria-live="polite">
          <h4 className="font-serif text-2xl text-gold" data-testid="grip-title">{spot.n}. {spot.title}</h4>
          <p className="mt-2 text-sm leading-relaxed text-ivory-dim">{spot.text}</p>
        </div>
        <p className="mt-4 text-xs text-ivory-mute">Schools of conducting differ in the details of the grip; this is a common starting point. The drawing is schematic. Practise with a pencil or a chopstick if you do not own a baton — MAESTRO tracks your hand, not the baton.</p>
      </div>
    </div>
  )
}
