import { useState } from 'react'
import { LESSONS, type Lesson } from '@/academy/lessons'
import { PatternDemo } from '@/components/academy/PatternDemo'
import { DynamicsDemo } from '@/components/academy/DynamicsDemo'
import { StatusTag } from '@/components/ui/StatusTag'
import type { TimeSignature } from '@/config/gestureConfig'

function Demo({ kind }: { kind: NonNullable<Lesson['demo']> }) {
  if (kind.startsWith('pattern-')) return <PatternDemo key={kind} timeSignature={kind.slice(8) as TimeSignature} />
  if (kind === 'tempo') return <PatternDemo key="tempo" timeSignature="4/4" />
  return <DynamicsDemo />
}

export function Academy() {
  const [id, setId] = useState(LESSONS[0].id)
  const lesson = LESSONS.find((l) => l.id === id)!
  return (
    <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
      <p className="eyebrow">Conducting Academy</p>
      <h1 className="mt-3 text-5xl">Learn the language of the baton</h1>
      <p className="mt-4 max-w-2xl text-ivory-dim">
        Read the principles, watch the patterns, then practise in the studio.
      </p>
      <p className="mt-3 flex items-center gap-2 text-xs text-ivory-mute">
        <StatusTag kind="phase">Planned · Phase 6</StatusTag> Camera-based exercises with live feedback are not available yet; the demonstrations below are animations.
      </p>

      <div className="mt-10 grid gap-10 lg:grid-cols-[260px_1fr]">
        <nav aria-label="Lessons">
          <ul className="space-y-1 border-l hairline">
            {LESSONS.map((l, i) => (
              <li key={l.id}>
                <button
                  onClick={() => setId(l.id)}
                  aria-current={l.id === id ? 'true' : undefined}
                  className={`-ml-px block w-full border-l-2 px-4 py-2 text-left text-sm transition-colors ${l.id === id ? 'border-gold text-gold' : 'border-transparent text-ivory-dim hover:text-ivory'}`}
                >
                  <span className="mr-2 text-ivory-mute">{String(i + 1).padStart(2, '0')}</span>{l.title}
                </button>
              </li>
            ))}
          </ul>
        </nav>
        <article aria-live="polite">
          <h2 className="text-4xl">{lesson.title}</h2>
          <p className="mt-1 text-gold-soft">{lesson.summary}</p>
          <div className="mt-6 max-w-2xl space-y-4 leading-relaxed text-ivory-dim">
            {lesson.body.map((p, i) => <p key={i}>{p}</p>)}
          </div>
          {lesson.demo && (
            <div className="panel mt-8 p-5">
              <p className="eyebrow mb-4">Interactive demonstration</p>
              <Demo kind={lesson.demo} />
            </div>
          )}
        </article>
      </div>
    </section>
  )
}
