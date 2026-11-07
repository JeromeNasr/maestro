import type { Lesson } from './lessons'
import { LESSONS } from './lessons'
import { getLessonProgress, type AcademyProgress } from './progress'

export interface LessonItem {
  key: string
  label: string
  done: boolean
  /** Counts towards completing the lesson (optional items are bonus practice). */
  required: boolean
  requiresCamera?: boolean
}

/** The things to do in a lesson, each marked done ONLY if a result for it has been recorded. */
export function lessonItems(lesson: Lesson, progress: AcademyProgress): LessonItem[] {
  const p = getLessonProgress(progress, lesson.id)
  const items: LessonItem[] = [
    { key: 'read', label: 'Read the lesson', done: p.read, required: true },
    { key: 'quiz', label: 'Pass the quiz', done: !!p.quiz?.passed, required: true },
  ]
  for (const e of lesson.exercises) items.push({ key: `ex:${e.id}`, label: e.title, done: !!p.exercises[e.id]?.passed, required: e.required, requiresCamera: e.requiresCamera })
  return items
}

export interface LessonStatus {
  items: LessonItem[]
  requiredDone: number
  requiredTotal: number
  optionalDone: number
  optionalTotal: number
  complete: boolean
}

export function lessonStatus(lesson: Lesson, progress: AcademyProgress): LessonStatus {
  const items = lessonItems(lesson, progress)
  const req = items.filter((i) => i.required)
  const opt = items.filter((i) => !i.required)
  return {
    items,
    requiredDone: req.filter((i) => i.done).length,
    requiredTotal: req.length,
    optionalDone: opt.filter((i) => i.done).length,
    optionalTotal: opt.length,
    complete: req.every((i) => i.done),
  }
}

export function courseProgress(progress: AcademyProgress) {
  const statuses = LESSONS.map((l) => lessonStatus(l, progress))
  return { lessonsComplete: statuses.filter((s) => s.complete).length, lessonsTotal: LESSONS.length, statuses }
}
