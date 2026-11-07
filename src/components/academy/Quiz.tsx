import { useState } from 'react'
import { QUIZ_PASS_MARK, type Lesson } from '@/academy/lessons'
import { getLessonProgress, recordQuiz, academyProgress } from '@/academy/progress'
import { useStore } from '@/lib/store'

/** Multiple-choice quiz. The result is recorded (and persisted) only when the learner submits; passing needs 2 of 3. */
export function Quiz({ lesson }: { lesson: Lesson }) {
  const [answers, setAnswers] = useState<(number | null)[]>(() => lesson.quiz.map(() => null))
  const [submitted, setSubmitted] = useState(false)
  const progress = useStore(academyProgress)
  const prev = getLessonProgress(progress, lesson.id).quiz
  const correct = lesson.quiz.filter((q, i) => answers[i] === q.answer).length
  const total = lesson.quiz.length
  const passed = correct / total >= QUIZ_PASS_MARK
  const complete = answers.every((a) => a !== null)

  return (
    <section aria-labelledby={`quiz-${lesson.id}`} className="panel p-5">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h3 id={`quiz-${lesson.id}`} className="text-xl">Quiz</h3>
        {prev && <span className="text-xs text-ivory-mute" data-testid="quiz-record">{prev.passed ? 'Passed' : 'Not passed yet'} · best {prev.best}/{prev.total} · {prev.attempts} attempt{prev.attempts === 1 ? '' : 's'}</span>}
      </header>
      <ol className="mt-4 space-y-5">
        {lesson.quiz.map((q, qi) => (
          <li key={q.id}>
            <fieldset disabled={submitted}>
              <legend className="text-sm text-ivory">{qi + 1}. {q.prompt}</legend>
              <div className="mt-2 space-y-1.5">
                {q.options.map((o, oi) => {
                  const mark = submitted ? (oi === q.answer ? 'text-gold' : answers[qi] === oi ? 'text-ivory-mute line-through' : 'text-ivory-dim') : 'text-ivory-dim'
                  return (
                    <label key={oi} className={`flex cursor-pointer items-center gap-2 text-sm ${mark}`}>
                      <input type="radio" name={`${lesson.id}-${q.id}`} checked={answers[qi] === oi} onChange={() => setAnswers((a) => a.map((x, i) => (i === qi ? oi : x)))} className="accent-gold" />
                      {o}
                    </label>
                  )
                })}
              </div>
              {submitted && <p className="mt-2 text-xs text-ivory-mute">{answers[qi] === q.answer ? 'Correct. ' : 'Not quite. '}{q.explanation}</p>}
            </fieldset>
          </li>
        ))}
      </ol>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        {!submitted ? (
          <button className="btn btn-gold" disabled={!complete} onClick={() => { setSubmitted(true); recordQuiz(lesson.id, correct, total, QUIZ_PASS_MARK) }}>Check answers</button>
        ) : (
          <>
            <p role="status" className="text-sm text-ivory" data-testid="quiz-result">{correct} of {total} correct — {passed ? 'passed' : 'not passed (2 of 3 needed)'}</p>
            <button className="btn btn-ghost" onClick={() => { setSubmitted(false); setAnswers(lesson.quiz.map(() => null)) }}>Try again</button>
          </>
        )}
        {!submitted && !complete && <span className="text-xs text-ivory-mute">Answer every question to check.</span>}
      </div>
    </section>
  )
}
