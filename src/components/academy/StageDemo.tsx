import { useMemo, useState } from 'react'
import { INSTRUMENTS, type InstrumentId } from '@/audio/instruments'
import { SECTIONS, type SectionId } from '@/orchestra/sections'

/** Schematic seating, as seen from above with the conductor at the bottom (x, y in a 0–100 box). Seating varies between orchestras. */
const SEATS: Partial<Record<InstrumentId, [number, number]>> = {
  violins: [14, 66], violins2: [26, 52], violas: [66, 52], cellos: [80, 66], basses: [90, 42],
  flutes: [36, 34], oboes: [46, 34], clarinets: [56, 34], bassoons: [66, 34],
  horns: [80, 22], trumpets: [44, 20], trombones: [58, 18], tuba: [70, 16],
  timpani: [26, 16], bassDrum: [16, 10], snareDrum: [34, 8], cymbals: [88, 10], triangle: [50, 8],
}

const HOW: Record<SectionId, { role: string; cue: string; hands: string }> = {
  strings: {
    role: 'The core of the orchestra, seated at the front. Their sound is shaped by the bow, so they follow the length and weight of your stroke.',
    cue: 'Cue by looking at the section a beat ahead and giving a preparation the size and character of the entrance: long and flowing for legato, short and crisp for staccato.',
    hands: 'The right hand shows the pulse and the character; the left hand shapes phrases and dynamics.',
  },
  woodwinds: {
    role: 'Seated in the middle. A wind player needs to breathe before the note, so they watch for the breath in your preparation.',
    cue: 'Cue entrances early and with eye contact; a small, clear preparation shows the breath. For sustained notes, a steady left hand helps them hold the line.',
    hands: 'A quiet, supportive left hand keeps long notes steady; avoid large, abrupt gestures that make them rush.',
  },
  brass: {
    role: 'Seated behind the woodwinds. Their sound arrives with a delay and can overpower the others, so balance is part of the conductor’s job.',
    cue: 'Give a big, unhurried preparation — the column of air takes longer to start — and cue early. Use a palm-down left hand to hold them back, and an open palm to invite more sound.',
    hands: 'Left hand palm down means softer; palm up and lifting means more.',
  },
  percussion: {
    role: 'Seated at the back; they hear the rest of the orchestra late. The timpani and drums live or die on the exact moment of the ictus.',
    cue: 'Make the ictus very clear and cue each important entrance with the eyes and a pointed gesture. Rests are long, so remind them a bar ahead.',
    hands: 'A small, precise right hand is best; show dynamics with the size of the stroke.',
  },
}

const sectionOf = (id: InstrumentId): SectionId => INSTRUMENTS.find((i) => i.id === id)!.section
const label = (id: InstrumentId) => INSTRUMENTS.find((i) => i.id === id)!.label
const shuffleSeed = (n: number) => ((n * 1103515245 + 12345) >>> 0) % 2147483648

/** Clickable stage plan with a short "cue the …" game. State is local; nothing is saved or measured. */
export function StageDemo() {
  const [selected, setSelected] = useState<SectionId>('strings')
  const [seed, setSeed] = useState(7)
  const [score, setScore] = useState({ right: 0, total: 0 })
  const [feedback, setFeedback] = useState<string | null>(null)
  const ids = useMemo(() => INSTRUMENTS.map((i) => i.id).filter((id) => SEATS[id]), [])
  const target = ids[seed % ids.length]
  const how = HOW[selected]

  const answer = (id: InstrumentId) => {
    const ok = id === target
    setScore((s) => ({ right: s.right + (ok ? 1 : 0), total: s.total + 1 }))
    setFeedback(ok ? `Correct — that is the ${label(target).toLowerCase()}.` : `That is the ${label(id).toLowerCase()}. The ${label(target).toLowerCase()} sit ${describe(target)}.`)
    setSeed((s) => shuffleSeed(s))
  }
  const describe = (id: InstrumentId) => {
    const [x, y] = SEATS[id]!
    return `${y > 50 ? 'at the front' : y > 28 ? 'in the middle' : 'at the back'}, ${x < 38 ? 'on your left' : x > 62 ? 'on your right' : 'near the centre'}`
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,420px)_1fr]">
      <div>
        <svg viewBox="0 0 100 100" className="w-full rounded-sm border hairline bg-ink-950" role="group" aria-label="Orchestra seating plan seen from above; the conductor stands at the bottom">
          <path d="M6 96 Q50 -6 94 96" fill="none" stroke="#c4a35a" strokeOpacity=".2" />
          <rect x="44" y="88" width="12" height="7" rx="1.5" fill="#c4a35a" fillOpacity=".5" />
          <text x="50" y="99" fontSize="4" textAnchor="middle" fill="#c9c0ad">conductor</text>
          {ids.map((id) => {
            const [x, y] = SEATS[id]!
            const on = sectionOf(id) === selected
            return (
              <g key={id}>
                <circle cx={x} cy={y} r="4.6" fill={on ? '#c4a35a' : '#2a2620'} stroke="#c4a35a" strokeOpacity={on ? 1 : 0.4} />
                <text x={x} y={y + 8.4} fontSize="3.3" textAnchor="middle" fill="#c9c0ad">{label(id).replace(' (section)', '')}</text>
              </g>
            )
          })}
        </svg>
        <p className="mt-2 text-xs text-ivory-mute">Schematic. Seating varies: many orchestras put the second violins opposite the firsts, or the cellos in the centre.</p>
      </div>
      <div className="space-y-5">
        <div role="tablist" aria-label="Orchestra families" className="flex flex-wrap gap-2">
          {SECTIONS.map((s) => (
            <button key={s.id} role="tab" aria-selected={selected === s.id} className={`btn !px-3 !py-1.5 ${selected === s.id ? 'btn-gold' : 'btn-ghost'}`} onClick={() => setSelected(s.id)}>{s.label}</button>
          ))}
        </div>
        <div role="tabpanel" aria-live="polite" className="space-y-2 text-sm leading-relaxed text-ivory-dim">
          <p>{how.role}</p>
          <p><span className="text-gold-soft">Cueing: </span>{how.cue}</p>
          <p><span className="text-gold-soft">Your hands: </span>{how.hands}</p>
        </div>
        <div className="border-t hairline pt-4">
          <p className="eyebrow">Cue practice</p>
          <p className="mt-2 text-lg text-ivory" data-testid="cue-target">Bring in the {label(target).toLowerCase()}.</p>
          <p className="mt-1 text-xs text-ivory-mute">Click their seat on the plan, or choose below.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {ids.map((id) => <button key={id} className="btn btn-ghost !px-2.5 !py-1 text-xs" onClick={() => answer(id)}>{label(id)}</button>)}
          </div>
          <p className="mt-3 text-sm text-ivory-dim" role="status" data-testid="cue-feedback">{feedback ?? 'No question answered yet.'}</p>
          <p className="text-xs text-ivory-mute">{score.total === 0 ? '' : `${score.right} of ${score.total} correct. This game is not saved.`}</p>
        </div>
      </div>
    </div>
  )
}
