import { courseProgress, lessonItems, lessonStatus } from './completion'
import { LESSONS, QUIZ_PASS_MARK } from './lessons'
import { academyProgress, allExercises, markRead, recordExercise, recordQuiz, resetAcademyProgress } from './progress'

beforeEach(() => resetAcademyProgress())
const get = () => academyProgress.get()
const lesson = (id: string) => LESSONS.find((l) => l.id === id)!

describe('lesson content', () => {
  it('covers every required topic', () => {
    const ids = LESSONS.map((l) => l.id)
    for (const topic of ['fundamentals', 'positioning', 'patterns', 'two-four', 'three-four', 'four-four', 'tempo', 'dynamics', 'coordination', 'mistakes']) expect(ids).toContain(topic)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('every lesson has meaningful text and a well-formed quiz', () => {
    for (const l of LESSONS) {
      expect(l.body.join(' ').length, l.id).toBeGreaterThan(250)
      expect(l.quiz.length, l.id).toBeGreaterThanOrEqual(3)
      for (const q of l.quiz) {
        expect(q.options.length).toBeGreaterThanOrEqual(3)
        expect(q.answer).toBeGreaterThanOrEqual(0)
        expect(q.answer).toBeLessThan(q.options.length)
        expect(new Set(q.options).size).toBe(q.options.length)
        expect(q.explanation.length).toBeGreaterThan(5)
      }
      expect(new Set(l.quiz.map((q) => q.id)).size).toBe(l.quiz.length)
    }
  })

  it('every camera exercise is optional; at least one required exercise works without a camera', () => {
    const all = LESSONS.flatMap((l) => l.exercises)
    expect(all.filter((e) => e.requiresCamera).every((e) => !e.required)).toBe(true)
    expect(all.some((e) => e.required && !e.requiresCamera)).toBe(true)
    expect(new Set(all.map((e) => e.id)).size).toBe(all.length)
  })

  it('pattern lessons carry a matching pattern exercise and demo', () => {
    expect(lesson('two-four').exercises[0]).toMatchObject({ kind: 'pattern', timeSignature: '2/4' })
    expect(lesson('three-four').demo).toBe('pattern-3/4')
    expect(lesson('four-four').exercises[0].timeSignature).toBe('4/4')
  })

  it('the pass mark is 2 of 3', () => {
    expect(2 / 3).toBeGreaterThanOrEqual(QUIZ_PASS_MARK)
    expect(1 / 3).toBeLessThan(QUIZ_PASS_MARK)
  })
})

describe('progress is only what was actually done', () => {
  it('starts completely empty — no fake progress', () => {
    const c = courseProgress(get())
    expect(c.lessonsComplete).toBe(0)
    for (const s of c.statuses) expect(s.requiredDone).toBe(0)
    expect(allExercises(get())).toEqual([])
  })

  it('reading and passing the quiz complete a lesson that has no required exercise', () => {
    const l = lesson('fundamentals')
    markRead(l.id)
    expect(lessonStatus(l, get())).toMatchObject({ requiredDone: 1, requiredTotal: 2, complete: false })
    recordQuiz(l.id, 2, 3, QUIZ_PASS_MARK)
    expect(lessonStatus(l, get())).toMatchObject({ requiredDone: 2, complete: true })
    expect(courseProgress(get()).lessonsComplete).toBe(1)
  })

  it('a failed quiz does not count; a later pass does, and a pass is never lost', () => {
    const l = lesson('patterns')
    markRead(l.id)
    recordQuiz(l.id, 1, 3, QUIZ_PASS_MARK)
    expect(lessonStatus(l, get()).complete).toBe(false)
    expect(get().lessons[l.id].quiz).toMatchObject({ attempts: 1, best: 1, passed: false })
    recordQuiz(l.id, 3, 3, QUIZ_PASS_MARK)
    recordQuiz(l.id, 0, 3, QUIZ_PASS_MARK) // a worse retry
    expect(get().lessons[l.id].quiz).toMatchObject({ attempts: 3, best: 3, passed: true })
    expect(lessonStatus(l, get()).complete).toBe(true)
  })

  it('a lesson with a required exercise is not complete until it is passed', () => {
    const l = lesson('tempo')
    markRead(l.id)
    recordQuiz(l.id, 3, 3, QUIZ_PASS_MARK)
    expect(lessonStatus(l, get())).toMatchObject({ requiredDone: 2, requiredTotal: 3, complete: false })
    recordExercise(l.id, 'tap-tempo', 40, false)
    expect(lessonStatus(l, get()).complete).toBe(false)
    recordExercise(l.id, 'tap-tempo', 92, true)
    expect(lessonStatus(l, get()).complete).toBe(true)
    expect(get().lessons[l.id].exercises['tap-tempo']).toMatchObject({ attempts: 2, bestScore: 92, passed: true })
  })

  it('optional (camera) exercises are tracked separately and never block completion', () => {
    const l = lesson('four-four')
    markRead(l.id)
    recordQuiz(l.id, 2, 3, QUIZ_PASS_MARK)
    let s = lessonStatus(l, get())
    expect(s).toMatchObject({ complete: true, optionalDone: 0, optionalTotal: 1 })
    recordExercise(l.id, 'pattern-4-4', 100, true)
    s = lessonStatus(l, get())
    expect(s.optionalDone).toBe(1)
    expect(lessonItems(l, get()).find((i) => i.key === 'ex:pattern-4-4')).toMatchObject({ done: true, required: false, requiresCamera: true })
  })

  it('exercise history is available for analytics', () => {
    recordExercise('tempo', 'tap-tempo', 80, true, new Date('2026-01-02T00:00:00Z'))
    expect(allExercises(get())).toEqual([{ lessonId: 'tempo', exerciseId: 'tap-tempo', result: { attempts: 1, bestScore: 80, passed: true, lastAt: '2026-01-02T00:00:00.000Z' } }])
  })

  it('reset clears everything', () => {
    markRead('fundamentals')
    resetAcademyProgress()
    expect(get().lessons).toEqual({})
  })
})
