import { createPersistentStore } from '@/lib/store'

/** What the learner has actually done. Nothing here is ever pre-filled; progress is derived only from recorded results. */
export interface QuizResult { attempts: number; best: number; total: number; passed: boolean }
export interface ExerciseResult { attempts: number; bestScore: number; passed: boolean; lastAt: string }
export interface LessonProgress {
  read: boolean
  quiz: QuizResult | null
  exercises: Record<string, ExerciseResult>
}
export interface AcademyProgress {
  version: 1
  lessons: Record<string, LessonProgress>
}

export const EMPTY_LESSON: LessonProgress = { read: false, quiz: null, exercises: {} }

export const academyProgress = createPersistentStore<AcademyProgress>('maestro.academy.v1', { version: 1, lessons: {} }, (raw) => {
  const p = raw as Partial<AcademyProgress> | null
  return p && p.version === 1 && typeof p.lessons === 'object' && p.lessons ? (p as AcademyProgress) : { version: 1, lessons: {} }
})

const lesson = (p: AcademyProgress, id: string): LessonProgress => p.lessons[id] ?? EMPTY_LESSON
const update = (id: string, f: (l: LessonProgress) => LessonProgress) =>
  academyProgress.set((p) => ({ ...p, lessons: { ...p.lessons, [id]: f(lesson(p, id)) } }))

export function markRead(lessonId: string) {
  update(lessonId, (l) => (l.read ? l : { ...l, read: true }))
}

/** Records a quiz attempt. The best score is kept; `passed` is sticky once earned. */
export function recordQuiz(lessonId: string, correct: number, total: number, passMark: number) {
  update(lessonId, (l) => {
    const prev = l.quiz
    const passedNow = total > 0 && correct / total >= passMark
    return { ...l, quiz: { attempts: (prev?.attempts ?? 0) + 1, best: Math.max(prev?.best ?? 0, correct), total, passed: (prev?.passed ?? false) || passedNow } }
  })
}

export function recordExercise(lessonId: string, exerciseId: string, score: number, passed: boolean, now: Date = new Date()) {
  update(lessonId, (l) => {
    const prev = l.exercises[exerciseId]
    return {
      ...l,
      exercises: {
        ...l.exercises,
        [exerciseId]: { attempts: (prev?.attempts ?? 0) + 1, bestScore: Math.max(prev?.bestScore ?? 0, score), passed: (prev?.passed ?? false) || passed, lastAt: now.toISOString() },
      },
    }
  })
}

export const resetAcademyProgress = () => academyProgress.set({ version: 1, lessons: {} })
export const getLessonProgress = (p: AcademyProgress, id: string) => lesson(p, id)

/** Every exercise (across lessons) with its result, for analytics. */
export function allExercises(p: AcademyProgress): { lessonId: string; exerciseId: string; result: ExerciseResult }[] {
  return Object.entries(p.lessons).flatMap(([lessonId, l]) => Object.entries(l.exercises).map(([exerciseId, result]) => ({ lessonId, exerciseId, result })))
}
