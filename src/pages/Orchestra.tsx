import { FAMILIES, FUN_FACTS, WARDROBE, type InstrumentLore } from '@/orchestra/lore'

const LO = 24 // C1
const HI = 108 // C8
const OCTAVES = [24, 36, 48, 60, 72, 84, 96, 108]
const NOTE = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B']
const noteName = (m: number) => `${NOTE[m % 12]}${Math.floor(m / 12) - 1}`

/** The usual sounding range of an instrument drawn along a seven-octave line (C1–C8). */
function RangeStrip({ range, label }: { range: [number, number]; label: string }) {
  const x = (m: number) => ((m - LO) / (HI - LO)) * 100
  return (
    <svg viewBox="0 0 100 9" preserveAspectRatio="none" className="mt-3 h-[22px] w-full" role="img" aria-label={`${label}: about ${noteName(range[0])} to ${noteName(range[1])}`}>
      <line x1="0" x2="100" y1="4.5" y2="4.5" stroke="#f3ecdc" strokeOpacity=".15" strokeWidth=".5" vectorEffect="non-scaling-stroke" />
      {OCTAVES.map((m) => (
        <line key={m} x1={x(m)} x2={x(m)} y1={m === 60 ? 0.5 : 2.5} y2={m === 60 ? 8.5 : 6.5} stroke="#f3ecdc" strokeOpacity={m === 60 ? 0.5 : 0.22} strokeWidth=".5" vectorEffect="non-scaling-stroke" />
      ))}
      <rect x={x(range[0])} y="2.6" width={x(range[1]) - x(range[0])} height="3.8" fill="#c4a35a" fillOpacity=".85" />
    </svg>
  )
}

function Instrument({ i }: { i: InstrumentLore }) {
  return (
    <li className="grid gap-x-10 gap-y-2 border-t hairline py-7 md:grid-cols-[minmax(0,11rem)_1fr]">
      <div>
        <h4 className="font-serif text-2xl">{i.name}</h4>
        {i.range ? (
          <p className="mt-1 text-xs tabular-nums text-ivory-mute">
            {noteName(i.range[0])} – {noteName(i.range[1])}
          </p>
        ) : (
          <p className="mt-1 text-xs text-ivory-mute">unpitched</p>
        )}
      </div>
      <div>
        <p className="text-ivory">{i.voice}</p>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-ivory-dim">{i.detail}</p>
        {i.range && <RangeStrip range={i.range} label={i.name} />}
      </div>
    </li>
  )
}

/** A plan of the stage from above, drawn as arcs around the podium. Schematic: seating varies from orchestra to orchestra. */
const CX = 50
const CY = 64
const pt = (r: number, deg: number): [number, number] => [CX + r * Math.cos((deg * Math.PI) / 180), CY + r * Math.sin((deg * Math.PI) / 180)]
function wedge(r0: number, r1: number, a0: number, a1: number): string {
  const [x0, y0] = pt(r1, a0)
  const [x1, y1] = pt(r1, a1)
  const [x2, y2] = pt(r0, a1)
  const [x3, y3] = pt(r0, a0)
  return `M${x0} ${y0} A${r1} ${r1} 0 0 1 ${x1} ${y1} L${x2} ${y2} A${r0} ${r0} 0 0 0 ${x3} ${y3} Z`
}
const SEATS: { label: string; r0: number; r1: number; a0: number; a1: number; size?: number }[] = [
  { label: 'Violins I', r0: 12, r1: 27, a0: -170, a1: -128 },
  { label: 'Violins II', r0: 12, r1: 27, a0: -126, a1: -90 },
  { label: 'Violas', r0: 12, r1: 27, a0: -88, a1: -58 },
  { label: 'Cellos', r0: 12, r1: 27, a0: -56, a1: -10 },
  { label: 'Woodwinds', r0: 29, r1: 38, a0: -140, a1: -40 },
  { label: 'Brass', r0: 40, r1: 48, a0: -134, a1: -46 },
  { label: 'Percussion', r0: 50, r1: 58, a0: -124, a1: -56 },
]
function StagePlan() {
  return (
    <svg viewBox="0 0 100 70" className="w-full" role="img" aria-label="Seating plan: strings in a fan at the front, woodwinds behind them, then brass, with percussion at the very back; the conductor stands at the front centre">
      {SEATS.map((s) => {
        const mid = (s.a0 + s.a1) / 2
        const [lx, ly] = pt((s.r0 + s.r1) / 2, mid)
        return (
          <g key={s.label}>
            <path d={wedge(s.r0, s.r1, s.a0, s.a1)} fill="#c4a35a" fillOpacity=".07" stroke="#c4a35a" strokeOpacity=".45" strokeWidth=".3" />
            <text x={lx} y={ly + 0.9} textAnchor="middle" fontSize={s.r1 === 27 ? 2.1 : 2.7} fill="#d9bf82" style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', letterSpacing: '.04em' }}>{s.label.toUpperCase()}</text>
          </g>
        )
      })}
      <rect x="45.5" y="59" width="9" height="5.5" rx=".8" fill="#c4a35a" fillOpacity=".6" />
      <text x="50" y="68.6" textAnchor="middle" fontSize="2.8" fill="#c9c0ad" style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontStyle: 'italic' }}>the podium</text>
    </svg>
  )
}

export function Orchestra() {
  return (
    <>
      <section className="border-b hairline">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 pb-20 pt-20 sm:px-6 lg:grid-cols-[1.25fr_1fr] lg:items-end">
          <div>
            <p className="eyebrow">Know who you are conducting</p>
            <h1 className="mt-5 text-6xl leading-[0.95] sm:text-7xl">Who is <em className="text-gold">in</em> the orchestra, and what they do.</h1>
            <p className="mt-7 max-w-xl text-lg leading-relaxed text-ivory-dim">
              Four families, about twenty kinds of instrument, and one person in front who makes no sound at all. Here is who sits where, what each player gives you, and — because people always ask — what the conductor wears.
            </p>
          </div>
          <div className="lg:pb-2">
            <StagePlan />
            <p className="mt-2 text-xs italic text-ivory-mute">A typical stage seen from above. Seating varies between orchestras.</p>
          </div>
        </div>
      </section>

      <div className="mx-auto grid max-w-7xl gap-x-16 px-4 py-20 sm:px-6 lg:grid-cols-[11rem_1fr]">
        <nav aria-label="On this page" className="mb-10 hidden lg:block">
          <ul className="sticky top-28 space-y-3 font-serif text-xl text-ivory-mute">
            {FAMILIES.map((f) => (
              <li key={f.id}><a className="hover:text-gold" href={`#${f.id}`}><span className="mr-3 text-gold-deep">{f.numeral}</span>{f.title}</a></li>
            ))}
            <li><a className="hover:text-gold" href="#wardrobe"><span className="mr-3 text-gold-deep">V</span>The wardrobe</a></li>
            <li><a className="hover:text-gold" href="#details"><span className="mr-3 text-gold-deep">VI</span>Small details</a></li>
          </ul>
        </nav>

        <div className="min-w-0 space-y-24">
          {FAMILIES.map((f) => (
            <section key={f.id} id={f.id} aria-labelledby={`h-${f.id}`} className="scroll-mt-28">
              <header className="max-w-2xl">
                <p className="font-serif text-6xl leading-none text-gold-deep">{f.numeral}</p>
                <h2 id={`h-${f.id}`} className="mt-2 text-5xl">{f.title}</h2>
                <p className="mt-5 leading-relaxed text-ivory-dim first-letter:float-left first-letter:mr-2 first-letter:font-serif first-letter:text-6xl first-letter:leading-[0.8] first-letter:text-gold">{f.intro}</p>
              </header>
              <ul className="mt-10 border-b hairline">
                {f.instruments.map((i) => <Instrument key={i.name} i={i} />)}
              </ul>
              {f.id === 'strings' && <p className="mt-3 text-xs text-ivory-mute">The gold bar on each line is the usual sounding range, drawn along seven octaves from C1 to C8; the tall tick marks middle C. Ranges are approximate.</p>}
            </section>
          ))}

          <section id="wardrobe" aria-labelledby="h-wardrobe" className="scroll-mt-28">
            <p className="font-serif text-6xl leading-none text-gold-deep">V</p>
            <h2 id="h-wardrobe" className="mt-2 text-5xl">What the maestro wears</h2>
            <p className="mt-5 max-w-2xl leading-relaxed text-ivory-dim">There is no rule book, only habit. The habit is to look serious, to move freely, and to let the audience watch your hands rather than your clothes.</p>
            <dl className="mt-10 divide-y divide-ivory/10 border-y hairline">
              {WARDROBE.map((w) => (
                <div key={w.item} className="grid gap-x-10 gap-y-1 py-5 md:grid-cols-[11rem_1fr]">
                  <dt className="font-serif text-xl text-gold-soft">{w.item}</dt>
                  <dd className="max-w-xl text-sm leading-relaxed text-ivory-dim">{w.note}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section id="details" aria-labelledby="h-details" className="scroll-mt-28">
            <p className="font-serif text-6xl leading-none text-gold-deep">VI</p>
            <h2 id="h-details" className="mt-2 text-5xl">Small details worth knowing</h2>
            <ol className="mt-10 grid gap-x-14 gap-y-9 md:grid-cols-2">
              {FUN_FACTS.map((f, n) => (
                <li key={f.title} className="relative pl-12">
                  <span className="absolute left-0 top-0 font-serif text-3xl italic text-gold-deep">{n + 1}</span>
                  <h3 className="font-serif text-2xl leading-snug">{f.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-ivory-dim">{f.text}</p>
                </li>
              ))}
            </ol>
          </section>
        </div>
      </div>
    </>
  )
}
