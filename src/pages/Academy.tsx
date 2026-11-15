import { useState } from 'react'
import { courseProgress, lessonStatus } from '@/academy/completion'
import { LESSONS, type DemoKind, type ExerciseDef } from '@/academy/lessons'
import { academyProgress, getLessonProgress, markRead, resetAcademyProgress } from '@/academy/progress'
import { CameraExercise } from '@/components/academy/CameraExercise'
import { ArticulationDemo } from '@/components/academy/ArticulationDemo'
import { BatonGripDemo } from '@/components/academy/BatonGripDemo'
import { DynamicsDemo } from '@/components/academy/DynamicsDemo'
import { FrameGuide } from '@/components/academy/FrameGuide'
import { PatternDemo } from '@/components/academy/PatternDemo'
import { Quiz } from '@/components/academy/Quiz'
import { StageDemo } from '@/components/academy/StageDemo'
import { TapTempoExercise } from '@/components/academy/TapTempoExercise'
import { StatusTag } from '@/components/ui/StatusTag'
import type { TimeSignature } from '@/config/gestureConfig'
import { useStore } from '@/lib/store'

function Demo({ kind }: { kind: DemoKind }) {
  if (kind.startsWith('pattern-')) return <PatternDemo key={kind} timeSignature={kind.slice(8) as TimeSignature} />
  if (kind === 'tempo') return <PatternDemo key="tempo" timeSignature="4/4" />
  if (kind === 'frame') return <FrameGuide />
  if (kind === 'baton-grip') return <BatonGripDemo />
  if (kind === 'baton-articulation') return <ArticulationDemo />
  if (kind === 'stage') return <StageDemo />
  return <DynamicsDemo />
}

function Exercise({ lessonId, def }: { lessonId: string; def: ExerciseDef }) {
  const [open, setOpen] = useState(def.kind === 'tap-tempo') // camera exercises stay closed until asked (they use the camera)
  const progress = useStore(academyProgress)
  const r = getLessonProgress(progress, lessonId).exercises[def.id]
  return (
    <section className="panel p-5" aria-labelledby={`ex-${def.id}`}>
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 id={`ex-${def.id}`} className="text-xl">{def.title}</h3>
          <p className="mt-1 text-sm text-ivory-dim">{def.description}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <StatusTag kind="neutral">{def.required ? 'Required' : 'Optional'}</StatusTag>
          {def.requiresCamera && <StatusTag kind="neutral">Needs camera</StatusTag>}
        </div>
      </header>
      {r && <p className="mt-2 text-xs text-ivory-mute" data-testid={`record-${def.id}`}>{r.passed ? 'Passed' : 'Not passed yet'} · best {Math.round(r.bestScore)} · {r.attempts} attempt{r.attempts === 1 ? '' : 's'}</p>}
      <div className="mt-4">
        {def.kind === 'tap-tempo' ? (
          <TapTempoExercise lessonId={lessonId} def={def} />
        ) : open ? (
          <CameraExercise lessonId={lessonId} def={def} />
        ) : (
          <button className="btn btn-ghost" onClick={() => setOpen(true)}>Open exercise (uses your camera when you enable it)</button>
        )}
      </div>
    </section>
  )
}

export function Academy() {
  const [id, setId] = useState(LESSONS[0].id)
  const [confirmReset, setConfirmReset] = useState(false)
  const progress = useStore(academyProgress)
  const lesson = LESSONS.find((l) => l.id === id)!
  const status = lessonStatus(lesson, progress)
  const course = courseProgress(progress)
  const read = getLessonProgress(progress, lesson.id).read

  return (
    <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
      <p className="eyebrow">Conducting Academy</p>
      <h1 className="mt-3 text-5xl">Learn the language of the baton</h1>
      <p className="mt-4 max-w-2xl text-ivory-dim">Read, watch the patterns, test yourself, then practise. Progress is saved in this browser and counts only what you have actually done.</p>
      <p className="mt-3 text-sm text-ivory-dim" data-testid="course-progress">
        {course.lessonsComplete} of {course.lessonsTotal} lessons complete
        {' · '}
        {confirmReset ? (
          <>
            <button className="text-gold-soft hover:text-gold" onClick={() => { resetAcademyProgress(); setConfirmReset(false) }}>Confirm: erase all progress</button>{' '}
            <button className="text-ivory-mute hover:text-ivory" onClick={() => setConfirmReset(false)}>Cancel</button>
          </>
        ) : (
          <button className="text-ivory-mute hover:text-gold-soft" onClick={() => setConfirmReset(true)}>Reset progress</button>
        )}
      </p>

      <div className="mt-10 grid gap-10 lg:grid-cols-[280px_1fr]">
        <nav aria-label="Lessons">
          <ul className="space-y-1 border-l hairline">
            {LESSONS.map((l, i) => {
              const s = course.statuses[i]
              return (
                <li key={l.id}>
                  <button
                    onClick={() => setId(l.id)} aria-current={l.id === id ? 'true' : undefined}
                    className={`-ml-px flex w-full items-center justify-between gap-2 border-l-2 px-4 py-2 text-left text-sm transition-colors ${l.id === id ? 'border-gold text-gold' : 'border-transparent text-ivory-dim hover:text-ivory'}`}
                  >
                    <span><span className="mr-2 text-ivory-mute">{String(i + 1).padStart(2, '0')}</span>{l.title}</span>
                    <span className="shrink-0 text-xs text-ivory-mute" aria-label={s.complete ? 'complete' : `${s.requiredDone} of ${s.requiredTotal} done`}>{s.complete ? '✓' : `${s.requiredDone}/${s.requiredTotal}`}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </nav>

        <article className="min-w-0 space-y-8">
          <p className="sr-only" role="status">Showing lesson: {lesson.title}</p>
          <header>
            <h2 className="text-4xl">{lesson.title}</h2>
            <p className="mt-1 text-gold-soft">{lesson.summary}</p>
          </header>
          <div className="max-w-2xl space-y-4 leading-relaxed text-ivory-dim">
            {lesson.body.map((p, i) => <p key={i}>{p}</p>)}
            {lesson.points && <ul className="list-disc space-y-1 pl-5 text-sm marker:text-gold">{lesson.points.map((p) => <li key={p}>{p}</li>)}</ul>}
          </div>
          {lesson.demo && (
            <div className="panel p-5">
              <p className="eyebrow mb-4">Interactive demonstration</p>
              <Demo kind={lesson.demo} />
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <button className={`btn ${read ? 'btn-ghost' : 'btn-gold'}`} disabled={read} onClick={() => markRead(lesson.id)}>{read ? 'Marked as read ✓' : 'Mark as read'}</button>
          </div>

          <Quiz key={lesson.id} lesson={lesson} />
          {lesson.exercises.map((e) => <Exercise key={`${lesson.id}/${e.id}`} lessonId={lesson.id} def={e} />)}

          <aside aria-label="Lesson progress" className="border-t hairline pt-5" data-testid="lesson-progress">
            <p className="eyebrow mb-3">This lesson</p>
            <ul className="space-y-1 text-sm">
              {status.items.map((it) => (
                <li key={it.key} className={it.done ? 'text-gold' : 'text-ivory-dim'}>
                  {it.done ? '✓' : '○'} {it.label}{!it.required ? ' (optional)' : ''}{it.requiresCamera ? ' · camera' : ''}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-sm text-ivory-mute">{status.complete ? 'Lesson complete.' : `${status.requiredDone} of ${status.requiredTotal} required items done.`}</p>
          </aside>
        </article>
      </div>
    </section>
  )
}
