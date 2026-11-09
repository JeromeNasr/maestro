import { Link } from 'react-router'
import { COMPOSITIONS } from '@/library/compositions'
import { CompositionCard } from '@/components/ui/CompositionCard'
import { FAMILIES } from '@/orchestra/lore'

/** The four-beat pattern, traced by a baton tip. Static for people who prefer reduced motion. */
function Pattern() {
  const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  const d = 'M50 82 Q26 80 20 56 Q50 66 80 56 Q76 30 50 20 Q44 52 50 82 Z'
  const beats: [number, number][] = [[50, 82], [20, 56], [80, 56], [50, 20]]
  return (
    <svg aria-hidden="true" viewBox="0 0 100 100" className="h-full w-full">
      <path d={d} fill="none" stroke="#c4a35a" strokeOpacity=".35" strokeWidth=".5" />
      {beats.map(([x, y], i) => (
        <g key={i}>
          <circle cx={x} cy={y} r="1.6" fill="#0b0a09" stroke="#c4a35a" strokeWidth=".4" />
          <text x={x + (i === 1 ? -6 : 4)} y={y + (i === 3 ? -3 : 5)} fontSize="4.4" fill="#8f8878" style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontStyle: 'italic' }}>{i + 1}</text>
        </g>
      ))}
      <circle r="2.2" fill="#d9bf82" cx={reduced ? 50 : undefined} cy={reduced ? 82 : undefined}>
        {!reduced && <animateMotion dur="3.2s" repeatCount="indefinite" path={d} keyPoints="0;1" keyTimes="0;1" calcMode="spline" keySplines=".45 0 .55 1" />}
      </circle>
    </svg>
  )
}

export function Landing() {
  return (
    <>
      <section className="border-b hairline">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 pb-24 pt-20 sm:px-6 sm:pt-28 lg:grid-cols-[1.35fr_1fr] lg:items-center">
          <div>
            <p className="smallcaps text-base text-gold">A virtual orchestra for your two hands</p>
            <h1 className="mt-6 text-6xl leading-[0.92] sm:text-8xl">
              Pick up <br className="hidden sm:block" />the <em className="text-gold">baton</em>.
            </h1>
            <p className="mt-8 max-w-lg text-lg leading-relaxed text-ivory-dim">
              Raise your right hand and beat the time; the orchestra follows your tempo. Lift or lower your left to ask for more or less sound. Everything happens in your browser, with your webcam.
            </p>
            <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-3">
              <Link to="/studio" className="btn btn-gold !px-7 !py-3">Step onto the podium</Link>
              <Link to="/academy" className="text-sm text-ivory-dim underline decoration-gold/50 underline-offset-4 hover:text-ivory">Never conducted? Start with the Academy</Link>
            </div>
            <p className="mt-10 max-w-md text-xs leading-relaxed text-ivory-mute">
              Your camera video never leaves your computer — it is analysed right in the page, and nothing is uploaded or stored. Best in recent Chrome or Edge.
            </p>
          </div>
          <div className="mx-auto aspect-square w-full max-w-[26rem]">
            <Pattern />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-24 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h2 className="text-5xl">Tonight’s programme</h2>
          <Link to="/library" className="text-sm text-ivory-dim underline decoration-gold/50 underline-offset-4 hover:text-ivory">See the whole library</Link>
        </div>
        <p className="mt-4 max-w-xl text-ivory-dim">
          Three short pieces of our own — one in four, one in three, one in two. The famous ones will join them as soon as we have arrangements whose licences we can check.
        </p>
        <div className="mt-10 border-b hairline">
          {COMPOSITIONS.filter((c) => c.status === 'available').map((c, i) => <CompositionCard key={c.id} composition={c} number={i + 1} />)}
        </div>
      </section>

      <section className="border-y hairline bg-ink-900/60">
        <div className="mx-auto grid max-w-5xl gap-x-16 gap-y-8 px-4 py-24 sm:px-6 md:grid-cols-[1fr_1.2fr]">
          <h2 className="text-5xl">How a performance goes</h2>
          <div className="space-y-5 leading-relaxed text-ivory-dim">
            <p className="first-letter:float-left first-letter:mr-2 first-letter:font-serif first-letter:text-6xl first-letter:leading-[0.8] first-letter:text-gold">
              You choose a piece and switch on the camera. MAESTRO asks you to show each hand once, so it knows which is which and how far you like to reach. Then you raise both hands, hold still for a moment, and the music begins.
            </p>
            <p>
              From there it is the ordinary craft of conducting: strokes down, left, right and up for four; the orchestra plays on the bounce at the bottom of each stroke. Keep a steady pulse and the tempo settles on it. Slow down, and it slows with you — never with a jolt.
            </p>
            <p>When you finish, the Analytics page shows how steady you were, and how often the camera could see you.</p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-24 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h2 className="text-5xl">Meet the orchestra</h2>
          <Link to="/orchestra" className="text-sm text-ivory-dim underline decoration-gold/50 underline-offset-4 hover:text-ivory">Instruments, seating and what the maestro wears</Link>
        </div>
        <ul className="mt-12 grid gap-x-10 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
          {FAMILIES.map((f) => (
            <li key={f.id} className="border-t border-gold/30 pt-5">
              <Link to={`/orchestra#${f.id}`} className="group block">
                <span className="font-serif text-5xl italic text-gold-deep">{f.numeral}</span>
                <h3 className="mt-2 text-3xl group-hover:text-gold">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ivory-mute">{f.instruments.map((i) => i.name.toLowerCase()).join(', ')}</p>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="border-t hairline px-4 py-28 text-center sm:px-6">
        <p className="font-serif text-4xl italic text-ivory-dim">The orchestra is waiting for the first beat.</p>
        <Link to="/studio" className="btn btn-gold mt-8 !px-7 !py-3">Raise your hands</Link>
      </section>
    </>
  )
}
