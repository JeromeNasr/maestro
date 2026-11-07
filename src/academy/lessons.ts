export interface Lesson {
  id: string
  title: string
  summary: string
  body: string[]
  /** Which interactive demonstration (if any) accompanies this lesson. */
  demo?: 'pattern-2/4' | 'pattern-3/4' | 'pattern-4/4' | 'dynamics' | 'tempo'
}

export const LESSONS: Lesson[] = [
  {
    id: 'principles',
    title: 'Basic principles',
    summary: 'What a conductor actually communicates.',
    body: [
      'A conductor does three jobs with the hands: keeping time, shaping loudness, and giving cues. The baton hand (your right) keeps time; the other hand (your left) shapes expression.',
      'The beat is felt at the ictus — the point where the stroke changes direction, like the bounce of a ball. The orchestra plays on the ictus, so make it clear and consistent.',
      'MAESTRO uses simplified, educational patterns. Professional conductors vary these considerably.',
    ],
  },
  {
    id: 'two-four',
    title: '2/4 — conducting in two',
    summary: 'Down, up.',
    demo: 'pattern-2/4',
    body: ['Two beats per bar. Beat 1 is a strong downward stroke; beat 2 is the upward rebound. Keep the two strokes the same length for an even pulse.'],
  },
  {
    id: 'three-four',
    title: '3/4 — conducting in three',
    summary: 'Down, right, up.',
    demo: 'pattern-3/4',
    body: ['Three beats per bar, common in dances like the minuet and waltz. Beat 1 down, beat 2 outward to the right, beat 3 back up to the starting point.'],
  },
  {
    id: 'four-four',
    title: '4/4 — conducting in four',
    summary: 'Down, left, right, up.',
    demo: 'pattern-4/4',
    body: [
      'Four beats per bar. Beat 1 down, beat 2 across to the left, beat 3 across to the right, beat 4 up.',
      'This is the simplified teaching version used by MAESTRO; the traditional pattern crosses the body on beat 2.',
    ],
  },
  {
    id: 'tempo',
    title: 'Tempo control',
    summary: 'Faster hands, faster music.',
    demo: 'tempo',
    body: [
      'Tempo is measured in beats per minute (BPM). MAESTRO estimates it from the time between your detected beats, filters out outliers, and moves the music’s tempo smoothly towards it.',
      'Changing tempo changes when notes are played, never their pitch.',
    ],
  },
  {
    id: 'dynamics',
    title: 'Dynamics',
    summary: 'Raise the left hand to get louder.',
    demo: 'dynamics',
    body: ['Dynamics run from pianissimo (pp) to fortissimo (ff). In MAESTRO, the height of your left hand sets the level; changes are interpolated so the sound swells rather than jumps.'],
  },
  {
    id: 'cresc',
    title: 'Crescendo and diminuendo',
    summary: 'Gradually louder, gradually softer.',
    body: ['A crescendo is a gradual increase in volume; a diminuendo is a gradual decrease. Slowly raise or lower the left hand and the orchestra follows. A sustained slope in hand height is what MAESTRO will recognise as a crescendo or diminuendo.'],
  },
  {
    id: 'cues',
    title: 'Starting and stopping',
    summary: 'The preparatory gesture and the cut-off.',
    body: [
      'Before a piece begins, a conductor raises both hands to signal readiness — the preparatory gesture. To end, both hands come down and hold, signalling a cut-off.',
      'MAESTRO’s cues require a deliberate hold so that ordinary conducting does not trigger them. Hold times are configurable.',
    ],
  },
]
