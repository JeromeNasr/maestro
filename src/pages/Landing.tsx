import { Link } from 'react-router-dom'
import { COMPOSITIONS } from '@/library/compositions'
import { CompositionCard } from '@/components/ui/CompositionCard'
import { SectionHeading } from '@/components/ui/SectionHeading'
import { StatusTag } from '@/components/ui/StatusTag'

const STEPS = [
  ['Choose', 'Pick a piece from the library and see its meter and difficulty.'],
  ['Calibrate', 'Enable your webcam and show both hands so MAESTRO can learn your range.'],
  ['Conduct', 'Your right hand beats time; your left hand shapes the dynamics.'],
  ['Review', 'See your tempo consistency and tracking reliability afterwards.'],
]

const FEATURES = [
  ['Two hands, two roles', 'Right hand: beat, tempo and start/stop. Left hand: loudness, from pianissimo to fortissimo.'],
  ['Real conducting patterns', 'Educational 2/4, 3/4 and 4/4 patterns — directional strokes, not just “hand moved”.'],
  ['Genuine MIDI playback', 'Notes are scheduled in musical time, so tempo changes never alter pitch.'],
  ['Four orchestra sections', 'Strings, woodwinds, brass and percussion, each with volume and mute.'],
  ['Private by design', 'Video is processed in your browser by MediaPipe. Nothing is uploaded.'],
  ['Tunable', 'Thresholds, hold times and sensitivity are configurable.'],
]

const TECH = [
  ['MediaPipe Hand Landmarker', '21 landmarks per hand, in real time, on-device.'],
  ['Gesture engine', 'Stroke detection, direction matching, debouncing and tempo estimation, kept separate from the UI.'],
  ['Tone.js + Web Audio', 'A MIDI sequencer driving synthesised orchestral sections.'],
]

export function Landing() {
  return (
    <>
      <section className="relative overflow-hidden border-b hairline">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-[0.07]">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="absolute left-0 right-0 border-t border-gold" style={{ top: `${28 + i * 5}%` }} />
          ))}
        </div>
        <svg aria-hidden="true" viewBox="0 0 100 100" className="pointer-events-none absolute right-[6%] top-1/2 hidden h-[420px] -translate-y-1/2 opacity-25 lg:block">
          <path d="M50 80 L22 55 L78 55 L50 20 Z" fill="none" stroke="#c4a35a" strokeWidth=".4" strokeDasharray="1.5 2" />
          {[[50, 80], [22, 55], [78, 55], [50, 20]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r="2.4" fill="none" stroke="#c4a35a" strokeWidth=".5" />)}
        </svg>
        <div className="relative mx-auto max-w-7xl px-4 pb-28 pt-24 sm:px-6 sm:pt-32">
          <p className="eyebrow animate-fadeUp">Virtual orchestra · Hand-tracked</p>
          <h1 className="mt-6 max-w-4xl animate-fadeUp text-6xl leading-[0.95] sm:text-8xl" style={{ animationDelay: '.1s' }}>
            Conduct Your <em className="text-gold">Own</em> Orchestra.
          </h1>
          <p className="mt-8 max-w-xl animate-fadeUp text-lg leading-relaxed text-ivory-dim" style={{ animationDelay: '.2s' }}>
            MAESTRO turns the movement of your hands into musical instruction. Beat the time, shape the dynamics, and hear an orchestra follow — entirely in your browser.
          </p>
          <div className="mt-10 flex animate-fadeUp flex-wrap gap-4" style={{ animationDelay: '.3s' }}>
            <Link to="/studio" className="btn btn-gold !px-7 !py-3">Start Conducting</Link>
            <Link to="/library" className="btn btn-ghost !px-7 !py-3">Browse the library</Link>
          </div>
          <p className="mt-10 flex max-w-xl flex-wrap items-center gap-2 text-xs text-ivory-mute">
            <StatusTag kind="phase">Build status</StatusTag>
            Interface preview (Phase 1 of 7). Hand tracking and audio playback are under construction and are labelled as such wherever they appear.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-24 sm:px-6">
        <SectionHeading eyebrow="Featured compositions" title="A programme for the podium">
          Original demonstration music comes first; the classical favourites follow once licensed arrangements are verified.
        </SectionHeading>
        <div className="mt-12 grid gap-6 md:grid-cols-2">
          {COMPOSITIONS.map((c) => <CompositionCard key={c.id} composition={c} />)}
        </div>
      </section>

      <section className="border-y hairline bg-ink-900/50">
        <div className="mx-auto max-w-7xl px-4 py-24 sm:px-6">
          <SectionHeading eyebrow="How it works" title="From gesture to music" />
          <ol className="mt-12 grid gap-8 md:grid-cols-4">
            {STEPS.map(([t, d], i) => (
              <li key={t} className="border-t border-gold/40 pt-5">
                <span className="font-serif text-4xl text-gold">{i + 1}</span>
                <h3 className="mt-2 text-2xl">{t}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ivory-dim">{d}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-24 sm:px-6">
        <SectionHeading eyebrow="Key features" title="Built like an instrument" />
        <dl className="mt-12 grid gap-x-12 gap-y-10 md:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(([t, d]) => (
            <div key={t}>
              <dt className="font-serif text-2xl text-ivory">{t}</dt>
              <dd className="mt-2 text-sm leading-relaxed text-ivory-dim">{d}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="border-t hairline bg-ink-900/50">
        <div className="mx-auto grid max-w-7xl gap-12 px-4 py-24 sm:px-6 lg:grid-cols-[1fr_1.4fr]">
          <SectionHeading eyebrow="The technology" title="Engineering under the baton">
            Webcam acquisition, hand detection, gesture recognition, tempo estimation and audio playback are independent modules connected by typed events.
          </SectionHeading>
          <ul className="divide-y divide-ivory/10 border-y hairline">
            {TECH.map(([t, d]) => (
              <li key={t} className="py-5">
                <p className="font-serif text-xl text-gold-soft">{t}</p>
                <p className="mt-1 text-sm text-ivory-dim">{d}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-4 py-28 text-center sm:px-6">
        <h2 className="text-5xl">Raise your hands.</h2>
        <p className="mt-4 text-ivory-dim">The orchestra is waiting for the downbeat.</p>
        <Link to="/studio" className="btn btn-gold mt-8 !px-7 !py-3">Enter the studio</Link>
      </section>
    </>
  )
}
