import type { TimeSignature } from '@/config/gestureConfig'

export type DemoKind = 'pattern-2/4' | 'pattern-3/4' | 'pattern-4/4' | 'dynamics' | 'tempo' | 'frame'

export interface QuizQuestion {
  id: string
  prompt: string
  options: string[]
  /** Index into `options`. */
  answer: number
  explanation: string
}

export type ExerciseKind = 'tap-tempo' | 'pattern' | 'dynamics' | 'both-hands'

export interface ExerciseDef {
  id: string
  kind: ExerciseKind
  title: string
  description: string
  /** Camera exercises use the real gesture recogniser and need a webcam. */
  requiresCamera: boolean
  /** Required exercises count towards completing the lesson; optional ones are bonus practice. */
  required: boolean
  timeSignature?: TimeSignature
  targetBpm?: number
}

export interface Lesson {
  id: string
  title: string
  summary: string
  body: string[]
  /** Short, scannable tips shown under the text. */
  points?: string[]
  demo?: DemoKind
  quiz: QuizQuestion[]
  exercises: ExerciseDef[]
}

/** A quiz is passed with at least this fraction of the questions right (2 of 3). */
export const QUIZ_PASS_MARK = 0.66

export const LESSONS: Lesson[] = [
  {
    id: 'fundamentals',
    title: 'Conducting fundamentals',
    summary: 'What the hands are actually for.',
    body: [
      'A conductor does three jobs with the hands: keep time, shape loudness and character, and give cues. In MAESTRO the right hand keeps time and the left hand shapes dynamics; both hands together give the start and stop cues.',
      'The beat is felt at the ictus — the point where a stroke changes direction, like the bounce of a ball. The orchestra plays on the ictus, so a clear, consistent ictus matters more than a pretty pattern.',
      'Before every piece the conductor gives a preparation: a breath and a gesture that shows tempo, loudness and character before a single note is played. The first beat after the preparation is the downbeat.',
    ],
    points: ['Right hand: time (the beat and its tempo).', 'Left hand: expression (dynamics, character).', 'The ictus is the beat — not the middle of the stroke.', 'Always prepare: show the tempo before the first note.'],
    quiz: [
      { id: 'q1', prompt: 'Which hand sets the tempo in MAESTRO?', options: ['The left hand', 'The right hand', 'Both hands equally', 'Neither — tempo is fixed'], answer: 1, explanation: 'The right hand keeps time; the left hand is for dynamics.' },
      { id: 'q2', prompt: 'Where is a beat felt?', options: ['At the start of a stroke', 'At the fastest point of a stroke', 'At the ictus, where the stroke changes direction', 'At the top of the pattern only'], answer: 2, explanation: 'The ictus is the point of rebound where the beat lands.' },
      { id: 'q3', prompt: 'What is a preparation?', options: ['Tuning the orchestra', 'A gesture before the first note showing tempo and character', 'The last beat of a piece', 'A mistake'], answer: 1, explanation: 'The preparation tells the players when and how to begin.' },
    ],
    exercises: [],
  },
  {
    id: 'positioning',
    title: 'Hand positioning',
    summary: 'Where your hands should be — for the orchestra and for the camera.',
    demo: 'frame',
    body: [
      'Stand tall with your feet apart and your shoulders relaxed. Your elbows are slightly bent and in front of you; the conducting space is a box roughly from your waist to your eyes and as wide as your shoulders.',
      'Keep the palms facing down (or slightly toward each other) with relaxed fingers. A tense, clenched hand produces jerky motion and, for MAESTRO, noisier tracking.',
      'For the webcam: sit or stand about one to two arm-lengths back so both hands stay inside the picture throughout the pattern, with plain lighting on your hands and as little clutter behind them as you can manage. Calibrate once from this position.',
    ],
    points: ['Both hands must stay in view for the whole pattern.', 'Relaxed fingers, palms down.', 'Conduct in front of you, between waist and eyes.', 'Light your hands; avoid backlighting.'],
    quiz: [
      { id: 'q1', prompt: 'Roughly where is the conducting space?', options: ['Above the head', 'Between the waist and the eyes, in front of you', 'Behind the shoulders', 'Below the knees'], answer: 1, explanation: 'A comfortable box in front of the body, waist to eyes.' },
      { id: 'q2', prompt: 'Why does MAESTRO ask you to calibrate?', options: ['To tune the instruments', 'To learn your hand range and check which hand is which', 'To increase the volume', 'To save the music'], answer: 1, explanation: 'Calibration verifies left/right labels against the mirrored preview and records your range.' },
      { id: 'q3', prompt: 'For good tracking you should…', options: ['Keep your hands half out of frame', 'Stand directly in front of a bright window', 'Keep both hands in frame with even lighting', 'Wear gloves'], answer: 2, explanation: 'Visible, evenly lit hands are tracked best.' },
    ],
    exercises: [],
  },
  {
    id: 'patterns',
    title: 'Beat patterns',
    summary: 'Strokes, ictus, rebound — and why the pattern starts with a down.',
    demo: 'pattern-4/4',
    body: [
      'A beat pattern is a shape the hand traces so every beat of the bar has a distinct position. Beat one is always the strongest and always goes down, which is why a down stroke is the one gesture MAESTRO uses to re-synchronise if you lose your place.',
      'MAESTRO teaches simplified patterns. Each beat arrives at an ictus; between ictus points the hand travels in a clear direction. MAESTRO recognises beats from the movement’s direction and timing together with where in the bar you are — not from where your hand happens to be on screen.',
      'Small, precise patterns are easier to follow than large, sloppy ones. Keep the strokes even and let the hand rebound.',
    ],
    points: ['Beat 1 is always a downward stroke.', 'Direction matters, not screen position.', 'Even, rebounding strokes.'],
    quiz: [
      { id: 'q1', prompt: 'Which beat of the bar always goes down?', options: ['The last beat', 'Beat 1 — the downbeat', 'Beat 2', 'None of them'], answer: 1, explanation: 'The downbeat is a downward stroke.' },
      { id: 'q2', prompt: 'How does MAESTRO recognise a beat?', options: ['By the hand reaching a fixed spot on screen', 'By the direction and timing of a stroke within the pattern', 'By clapping', 'By hand colour'], answer: 1, explanation: 'Trajectory, direction, timing and pattern state — not screen position alone.' },
      { id: 'q3', prompt: 'If you lose your place mid-bar, what re-synchronises the pattern?', options: ['A clear downward stroke (beat 1)', 'A sideways wave', 'Stopping the camera', 'Nothing'], answer: 0, explanation: 'A strong downbeat re-synchronises the pattern.' },
    ],
    exercises: [],
  },
  {
    id: 'two-four',
    title: '2/4 — conducting in two',
    summary: 'Down, up.',
    demo: 'pattern-2/4',
    body: [
      'Two beats per bar: beat 1 is a firm downward stroke, beat 2 is the upward rebound. Keep the two strokes the same length for an even pulse; marches live here.',
      'You can also conduct a 4/4 piece “in two” when the tempo is brisk: each conducted beat then covers two quarter notes, and MAESTRO scales the tempo accordingly. Try it with Aurora Étude by choosing “2/4 (in two)” under Conduct in.',
      'Because the pattern is so simple, evenness is everything: if the upward rebound is noticeably smaller or faster than the downstroke the pulse will limp. Aim for two strokes of the same size and the same duration.',
    ],
    points: ['Beat 1: down. Beat 2: up.', 'Equal strokes, even rebound.', '4/4 can be conducted in two at fast tempos.'],
    quiz: [
      { id: 'q1', prompt: 'How many beats are in a 2/4 bar?', options: ['1', '2', '3', '4'], answer: 1, explanation: 'A 2/4 bar has two beats: down and up.' },
      { id: 'q2', prompt: 'What is beat 2 in the 2/4 pattern?', options: ['A downward stroke', 'A stroke to the right', 'The upward rebound', 'A pause'], answer: 2, explanation: 'Down, then up.' },
      { id: 'q3', prompt: 'Conducting a 4/4 piece “in two”: one conducted beat equals…', options: ['One quarter note', 'Two quarter notes', 'Half a quarter note', 'A whole bar'], answer: 1, explanation: 'Each conducted beat spans two quarter notes.' },
    ],
    exercises: [
      { id: 'pattern-2-4', kind: 'pattern', title: 'Conduct three clean bars in 2/4', description: 'Down-up, three bars in a row, with no stray strokes. Uses your webcam.', requiresCamera: true, required: false, timeSignature: '2/4' },
    ],
  },
  {
    id: 'three-four',
    title: '3/4 — conducting in three',
    summary: 'Down, right, up.',
    demo: 'pattern-3/4',
    body: [
      'Three beats per bar, as in the minuet and the waltz. Beat 1 down; beat 2 outward to the right; beat 3 back up to where you started.',
      'The feel is a lilt: a strong first beat followed by two lighter ones. Keep beats 2 and 3 smaller than beat 1.',
      'A frequent fault is to rush beat 3 so the bar feels lopsided. Let the upward stroke take exactly as long as the other two, and let it set up the next downbeat. Practise very slowly first, then raise the tempo only when all three strokes are even.',
    ],
    points: ['Down, right, up.', 'Strong 1, lighter 2 and 3.', 'Return to the start each bar.'],
    quiz: [
      { id: 'q1', prompt: 'The 3/4 pattern is…', options: ['Down, up, down', 'Down, right, up', 'Down, left, right', 'Up, down, up'], answer: 1, explanation: 'The 3/4 pattern is down, right, up.' },
      { id: 'q2', prompt: 'Which dance is typically in three?', options: ['March', 'Minuet or waltz', 'Polka', 'Gallop'], answer: 1, explanation: 'The minuet and waltz are in three.' },
      { id: 'q3', prompt: 'Beats 2 and 3 compared with beat 1 should feel…', options: ['Stronger', 'Equal', 'Lighter', 'Absent'], answer: 2, explanation: 'A strong first beat, lighter second and third.' },
    ],
    exercises: [
      { id: 'pattern-3-4', kind: 'pattern', title: 'Conduct three clean bars in 3/4', description: 'Down-right-up, three bars in a row. Uses your webcam.', requiresCamera: true, required: false, timeSignature: '3/4' },
    ],
  },
  {
    id: 'four-four',
    title: '4/4 — conducting in four',
    summary: 'Down, left, right, up.',
    demo: 'pattern-4/4',
    body: [
      'Four beats per bar. Beat 1 down, beat 2 across to the left, beat 3 across to the right, beat 4 up. This is MAESTRO’s simplified teaching pattern; the traditional version crosses the body on beat 2.',
      'Notice that beats 2 and 4 both travel up and to the left: MAESTRO tells them apart by where you are in the bar, which is why keeping count matters.',
    ],
    points: ['Down, left, right, up.', 'Beats 2 and 4 look alike — count!', 'The up stroke prepares the next downbeat.'],
    quiz: [
      { id: 'q1', prompt: 'Which beat travels to the right in MAESTRO’s 4/4 pattern?', options: ['Beat 1', 'Beat 2', 'Beat 3', 'Beat 4'], answer: 2, explanation: 'Down, left, right, up — beat 3.' },
      { id: 'q2', prompt: 'How can the recogniser tell beat 2 from beat 4?', options: ['By the colour of your sleeve', 'By their position in the bar sequence', 'It cannot', 'By volume'], answer: 1, explanation: 'Both move up-left; the pattern state disambiguates.' },
      { id: 'q3', prompt: 'What does beat 4’s upward stroke prepare?', options: ['Nothing', 'The next downbeat', 'A cut-off', 'A crescendo'], answer: 1, explanation: 'It sets up the next bar’s downbeat.' },
    ],
    exercises: [
      { id: 'pattern-4-4', kind: 'pattern', title: 'Conduct three clean bars in 4/4', description: 'Down-left-right-up, three bars in a row. Uses your webcam.', requiresCamera: true, required: false, timeSignature: '4/4' },
    ],
  },
  {
    id: 'tempo',
    title: 'Tempo control',
    summary: 'Faster hands, faster music — steadily.',
    demo: 'tempo',
    body: [
      'Tempo is measured in beats per minute (BPM). MAESTRO measures the time between your recognised beats, discards outliers, and moves the music’s tempo smoothly toward yours — it never jumps. Because the music is scheduled note by note rather than as a recording, tempo changes never change pitch.',
      'A steady tempo is a skill: the way to practise it is to tap or conduct against a reference and check your evenness. The tap exercise below measures both your accuracy and your steadiness from your own tap times.',
      'To speed up or slow down, change the size and speed of your stroke gradually over a few beats. Sudden changes are treated as outliers until they are confirmed by several beats in a row.',
    ],
    points: ['BPM = beats per minute.', 'Change tempo gradually over several beats.', 'Tempo changes never change pitch.', 'If you stop conducting, the music keeps the last tempo.'],
    quiz: [
      { id: 'q1', prompt: 'A tempo of 120 BPM means…', options: ['120 bars per minute', '120 beats per minute', '120 notes per second', '120 seconds per beat'], answer: 1, explanation: 'BPM stands for beats per minute: 120 BPM is two beats every second.' },
      { id: 'q2', prompt: 'If MAESTRO plays faster because you conduct faster, the pitch…', options: ['Rises', 'Falls', 'Stays the same', 'Becomes random'], answer: 2, explanation: 'Notes are scheduled in musical time; pitch is fixed by the note, not the tempo.' },
      { id: 'q3', prompt: 'Why does MAESTRO ignore one wildly mistimed beat?', options: ['It is broken', 'A lone outlier is probably a mistake, not a new tempo', 'It prefers slow music', 'It cannot count'], answer: 1, explanation: 'A real tempo change shows up in several consecutive beats.' },
    ],
    exercises: [
      { id: 'tap-tempo', kind: 'tap-tempo', title: 'Tap a steady 80 BPM', description: 'Tap along with the pulse (button, click or Space) for 12 beats. Judged on accuracy and steadiness. No camera needed.', requiresCamera: false, required: true, targetBpm: 80 },
    ],
  },
  {
    id: 'dynamics',
    title: 'Dynamics, crescendo and diminuendo',
    summary: 'Raise the left hand to get louder.',
    demo: 'dynamics',
    body: [
      'Dynamics run from pianissimo (pp) very soft, through piano (p), mezzo-piano (mp), mezzo-forte (mf) and forte (f), to fortissimo (ff) very loud. In MAESTRO the height of your left hand sets the level, and the sound glides rather than jumps.',
      'A crescendo is a gradual increase in volume; a diminuendo is a gradual decrease. Raise or lower the left hand slowly and steadily and the orchestra follows — MAESTRO notices a sustained rise or fall as a crescendo or diminuendo.',
      'Different sections respond differently: brass cover the widest range, percussion the narrowest, and everything gets brighter when louder, as real instruments do.',
    ],
    points: ['Higher left hand = louder.', 'Slow, steady movement makes a crescendo.', 'If the left hand leaves the frame, the last level is kept.'],
    quiz: [
      { id: 'q1', prompt: 'Which marking is the loudest?', options: ['p', 'mf', 'f', 'ff'], answer: 3, explanation: 'ff stands for fortissimo, the loudest marking.' },
      { id: 'q2', prompt: 'A crescendo is…', options: ['A sudden stop', 'A gradual increase in volume', 'A gradual decrease in volume', 'A change of key'], answer: 1, explanation: 'Crescendo means gradually getting louder.' },
      { id: 'q3', prompt: 'If your left hand leaves the camera frame, MAESTRO…', options: ['Mutes everything', 'Plays at ff', 'Keeps the last dynamic level', 'Stops the piece'], answer: 2, explanation: 'Leaving the frame should not punish the orchestra; the level is held.' },
    ],
    exercises: [
      { id: 'dynamics-hold', kind: 'dynamics', title: 'Reach p, f, pp and ff', description: 'Move your left hand to show each marking and hold it for 1.5 s. Uses your webcam.', requiresCamera: true, required: false },
    ],
  },
  {
    id: 'coordination',
    title: 'Coordinating both hands',
    summary: 'Independent hands, one musical idea.',
    body: [
      'The hard part of conducting is independence: the right hand must keep a steady pattern while the left does something different. A common exercise is to keep the beat absolutely steady while the left hand makes a long crescendo.',
      'In MAESTRO the hands never interfere: the left hand cannot change the tempo and the right hand cannot change the dynamics. That makes it a safe place to practise the independence.',
      'Start slowly. Establish the pattern first; add the left hand only when the right is automatic.',
    ],
    points: ['Right keeps time; left shapes expression.', 'Pattern first, left hand second.', 'Practise a steady beat during a slow crescendo.'],
    quiz: [
      { id: 'q1', prompt: 'In MAESTRO, moving the left hand changes…', options: ['The tempo', 'The dynamics', 'The time signature', 'The composition'], answer: 1, explanation: 'The left hand controls dynamics only.' },
      { id: 'q2', prompt: 'The usual way to learn independence is to…', options: ['Use both hands for the beat', 'Make the pattern automatic first, then add the left hand', 'Close your eyes', 'Conduct faster'], answer: 1, explanation: 'Automatic right hand first.' },
      { id: 'q3', prompt: 'A steady beat during a crescendo shows…', options: ['Independence of the hands', 'Poor tracking', 'A mistake', 'A tempo change'], answer: 0, explanation: 'Different jobs at the same time.' },
    ],
    exercises: [
      { id: 'both-hands', kind: 'both-hands', title: 'Two clean bars with the left hand at forte', description: 'Conduct two clean 4/4 bars while your left hand holds f or ff. Uses your webcam.', requiresCamera: true, required: false, timeSignature: '4/4' },
    ],
  },
  {
    id: 'cues',
    title: 'Starting and stopping',
    summary: 'The preparatory gesture and the cut-off.',
    body: [
      'To start, a conductor raises both hands as the preparation. To end, both hands come down and stop moving — the cut-off. MAESTRO’s cues use the same poses: both hands raised and held still starts the music (and pauses or resumes it while playing); both hands lowered and held still stops it.',
      'Cues need a deliberate hold of about a second, both hands must be visible and still, and ordinary conducting never satisfies that — so they cannot trigger by accident, yet they are always available, even mid-performance. The Pause/Stop buttons and the Space and Esc keys are always there too.',
    ],
    points: ['Both hands raised and still: start / pause / resume.', 'Both hands lowered and still: stop.', 'Holds of ~1 s prevent accidents.', 'Space pauses, Esc stops, any time.'],
    quiz: [
      { id: 'q1', prompt: 'Which pose stops the music?', options: ['Both hands raised and held', 'Both hands lowered and held still', 'Waving', 'Closing your eyes'], answer: 1, explanation: 'Both hands lowered and held still.' },
      { id: 'q2', prompt: 'Why don’t cues trigger during normal conducting?', options: ['They are disabled while playing', 'They need both hands to be still for about a second', 'They need a loud noise', 'They only work on Tuesdays'], answer: 1, explanation: 'A moving conducting hand never satisfies the stillness hold.' },
      { id: 'q3', prompt: 'Which keyboard key stops the performance immediately?', options: ['Space', 'Enter', 'Esc', 'Tab'], answer: 2, explanation: 'Esc stops; Space pauses/resumes.' },
    ],
    exercises: [],
  },
  {
    id: 'mistakes',
    title: 'Common conducting mistakes',
    summary: 'What goes wrong, and how to fix it.',
    body: [
      'Beating too small or too large: tiny strokes are hard to read; huge ones are slow and tiring. Aim for clear, consistent strokes, large enough to see.',
      'An unsteady pulse: speeding up when excited and slowing when careful. Practise with the tap exercise and watch your tempo-consistency figure in Analytics.',
      'No preparation: starting the first beat without showing tempo. Always give a preparatory beat.',
      'Mirror-image confusion: the preview is a mirror, so your right hand appears on the right of the screen. Calibrate to confirm MAESTRO agrees.',
      'Hands leaving the frame: the camera cannot track what it cannot see. MAESTRO holds your tempo and dynamics briefly, then waits for you.',
    ],
    points: ['Clear, consistent stroke size.', 'Steady pulse beats a clever one.', 'Always prepare.', 'Keep both hands in frame.'],
    quiz: [
      { id: 'q1', prompt: 'Very tiny strokes are a problem because…', options: ['They look too big', 'They are hard to read and to track', 'They make the music louder', 'They are illegal'], answer: 1, explanation: 'Small strokes are hard for players — and for the camera.' },
      { id: 'q2', prompt: 'What does the mirror-image preview mean for your right hand?', options: ['It appears on the right of the screen', 'It appears on the left of the screen', 'It disappears', 'It turns blue'], answer: 0, explanation: 'The preview is a mirror: your right hand is on the right.' },
      { id: 'q3', prompt: 'A good habit before the first beat is to…', options: ['Skip the preparation', 'Give a preparatory beat showing tempo', 'Lower the left hand to the floor', 'Look away'], answer: 1, explanation: 'Always prepare.' },
    ],
    exercises: [],
  },
]
