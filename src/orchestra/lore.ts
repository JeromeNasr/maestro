/**
 * Reference material for the Orchestra page. Everything here is general, well-documented music knowledge; ranges are the
 * usual practical orchestral ranges at SOUNDING pitch (MIDI note numbers, 60 = middle C) and are approximate by nature.
 */
import type { InstrumentId } from '@/audio/instruments'
import type { SectionId } from './sections'

export interface Famous {
  name: string
  /** Who they are, in a few words. */
  note: string
}

export interface InstrumentLore {
  name: string
  /** Which recorded instrument plays it on the Orchestra page. */
  sound: InstrumentId
  /** A few celebrated players (a selection, not a ranking). */
  famous: Famous[]
  /** Lowest and highest usual sounding note (MIDI). null = unpitched. */
  range: [number, number] | null
  /** One line on what it is / how it sounds. */
  voice: string
  /** One thing worth knowing. */
  detail: string
}

export interface FamilyLore {
  id: SectionId
  numeral: string
  title: string
  /** Where they sit and what they do for a conductor. */
  intro: string
  instruments: InstrumentLore[]
}

export const FAMILIES: FamilyLore[] = [
  {
    id: 'strings',
    numeral: 'I',
    title: 'Strings',
    intro: 'The largest group, seated in a fan around the conductor — often more than half of the players. They carry the melody, the harmony and the pulse, and they follow the length and weight of your stroke the way a bow follows an arm.',
    instruments: [
      { name: 'Violin', sound: 'violins', famous: [{ name: 'Niccolò Paganini', note: 'Italian virtuoso (1782–1840) whose 24 Caprices are still a test of technique' }, { name: 'Jascha Heifetz', note: 'Lithuanian-born American, the model of 20th-century violin playing' }, { name: 'Itzhak Perlman', note: 'Israeli-American, loved for his warm tone and his film and concert work' }, { name: 'Anne-Sophie Mutter', note: 'German soloist, discovered as a child by Herbert von Karajan' }, { name: 'Hilary Hahn', note: 'American soloist known for Bach and for new works' }], range: [55, 100], voice: 'The highest string voice; the first and second violins together are the biggest section.', detail: 'Four strings tuned a fifth apart — Sol, Re, La, Mi. Violins made in Cremona around three centuries ago are still played in concert halls today.' },
      { name: 'Viola', sound: 'violas', famous: [{ name: 'Lionel Tertis', note: 'English violist who campaigned for the viola as a solo instrument' }, { name: 'William Primrose', note: 'Scottish violist, one of the great soloists of the 20th century' }, { name: 'Yuri Bashmet', note: 'Russian violist and conductor' }, { name: 'Kim Kashkashian', note: 'American violist known for contemporary music' }], range: [48, 88], voice: 'A little larger and darker than the violin, tuned a fifth lower.', detail: 'Violists read mostly in the alto clef, a clef that almost nobody else in the orchestra uses.' },
      { name: 'Cello', sound: 'cellos', famous: [{ name: 'Pablo Casals', note: 'Catalan cellist (1876–1973) who made the Bach cello suites famous' }, { name: 'Mstislav Rostropovich', note: 'Russian cellist and conductor; dozens of works were written for him' }, { name: 'Jacqueline du Pré', note: 'English cellist whose Elgar concerto recording is legendary' }, { name: 'Yo-Yo Ma', note: 'French-born American cellist, known across classical and world music' }], range: [36, 81], voice: 'Warm and singing, closest to the range of the human voice.', detail: 'The player sits and holds it between the knees, resting it on an endpin — a spike that became standard practice in the 19th century.' },
      { name: 'Double bass', sound: 'basses', famous: [{ name: 'Giovanni Bottesini', note: 'Italian (1821–1889), nicknamed “the Paganini of the double bass”' }, { name: 'Gary Karr', note: 'American soloist who made the double bass a concert instrument' }, { name: 'Edgar Meyer', note: 'American bassist crossing classical, bluegrass and jazz' }], range: [28, 67], voice: 'The foundation: the lowest notes in the string section.', detail: 'It is tuned in fourths rather than fifths, and its music is written an octave higher than it sounds, to avoid a forest of ledger lines.' },
    ],
  },
  {
    id: 'woodwinds',
    numeral: 'II',
    title: 'Woodwinds',
    intro: 'Seated in the middle, in pairs. Each player is a soloist: one voice, one colour. They need to breathe before they play, so they watch for the breath in your preparation.',
    instruments: [
      { name: 'Flute', sound: 'flutes', famous: [{ name: 'Jean-Pierre Rampal', note: 'French flautist who did much to revive the flute as a solo instrument' }, { name: 'James Galway', note: 'Northern Irish flautist nicknamed “the man with the golden flute”' }, { name: 'Emmanuel Pahud', note: 'Swiss flautist, principal of the Berlin Philharmonic' }, { name: 'Marcel Moyse', note: 'French flautist and teacher whose exercises are still used' }], range: [60, 96], voice: 'Bright and airy, with no reed at all.', detail: 'The sound is made by blowing across an edge, like a bottle. Modern flutes are metal, yet they still count as woodwinds, because of how they make their sound.' },
      { name: 'Oboe', sound: 'oboes', famous: [{ name: 'Léon Goossens', note: 'English oboist who inspired many British composers' }, { name: 'Heinz Holliger', note: 'Swiss oboist and composer' }, { name: 'Albrecht Mayer', note: 'German oboist, principal of the Berlin Philharmonic' }], range: [58, 93], voice: 'Penetrating and plaintive, a double reed.', detail: 'Before a concert the oboe plays a La (A), and the whole orchestra tunes to it — the oboe’s pitch is clear and cuts through the room.' },
      { name: 'Clarinet', sound: 'clarinets', famous: [{ name: 'Anton Stadler', note: 'Austrian clarinettist for whom Mozart wrote his clarinet concerto and quintet' }, { name: 'Benny Goodman', note: 'American “King of Swing” who also commissioned and played classical works' }, { name: 'Sabine Meyer', note: 'German clarinettist, a leading soloist today' }, { name: 'Richard Stoltzman', note: 'American clarinettist who moves between classical music and jazz' }], range: [50, 94], voice: 'Smooth, with an enormous range of colour and volume.', detail: 'The usual orchestral clarinet is in Si♭: when the player reads a Do, a Si♭ sounds. The part is transposed on the page.' },
      { name: 'Bassoon', sound: 'bassoons', famous: [{ name: 'Klaus Thunemann', note: 'German bassoonist who brought the instrument to soloist status' }, { name: 'Milan Turković', note: 'Croatian-born bassoonist and Vienna Philharmonic principal' }, { name: 'Judith LeClair', note: 'American bassoonist, principal of the New York Philharmonic' }], range: [34, 75], voice: 'Woody and a little comic in the low register, tender in the high.', detail: 'Its tube is about 2.5 metres long, folded in half to make it playable. A double reed sits on a thin curved tube called the bocal.' },
    ],
  },
  {
    id: 'brass',
    numeral: 'III',
    title: 'Brass',
    intro: 'Seated behind the woodwinds. Their sound arrives with a delay and can easily overpower everyone else, so a big part of the conductor’s job is balance — and an early, unhurried preparation.',
    instruments: [
      { name: 'French horn', sound: 'horns', famous: [{ name: 'Dennis Brain', note: 'English horn player (1921–1957) whose Mozart concerto recordings remain famous' }, { name: 'Barry Tuckwell', note: 'Australian horn player and conductor' }, { name: 'Hermann Baumann', note: 'German horn soloist known for playing the natural horn too' }], range: [35, 77], voice: 'Mellow, round, equally at home with the woodwinds and the brass.', detail: 'Roughly 3.7 metres of tubing coiled into a circle. The player’s right hand sits in the bell to shape pitch and tone.' },
      { name: 'Trumpet', sound: 'trumpets', famous: [{ name: 'Maurice André', note: 'French trumpeter who made the Baroque trumpet repertoire popular' }, { name: 'Wynton Marsalis', note: 'American trumpeter who plays both classical and jazz at the highest level' }, { name: 'Håkan Hardenberger', note: 'Swedish soloist who commissioned many new concertos' }, { name: 'Alison Balsom', note: 'English soloist' }], range: [54, 84], voice: 'Brilliant and commanding; the fanfare voice.', detail: 'Three valves change the length of the tube. Orchestral trumpets are most often in Si♭ or Do.' },
      { name: 'Trombone', sound: 'trombones', famous: [{ name: 'Christian Lindberg', note: 'Swedish trombonist and conductor who commissioned dozens of works' }, { name: 'Joseph Alessi', note: 'American trombonist, principal of the New York Philharmonic' }, { name: 'Jörgen van Rijen', note: 'Dutch trombonist, principal of the Concertgebouw Orchestra' }], range: [40, 77], voice: 'Noble and powerful, from a whisper to a roar.', detail: 'It has a slide with seven positions instead of valves, so the player finds each pitch by ear and arm.' },
      { name: 'Tuba', sound: 'tuba', famous: [{ name: 'Arnold Jacobs', note: 'American tubist (1915–1998), Chicago Symphony, revered as a teacher of breathing' }, { name: 'Roger Bobo', note: 'American tubist who helped win the tuba a solo repertoire' }, { name: 'Øystein Baadsvik', note: 'Norwegian tuba soloist' }], range: [26, 65], voice: 'The deepest voice of the brass: a soft, wide, low cushion.', detail: 'Many metres of tubing wound into a coil. It usually appears in the orchestra only when a composer wants the very bottom of the sound.' },
    ],
  },
  {
    id: 'percussion',
    numeral: 'IV',
    title: 'Percussion',
    intro: 'At the back, and furthest from you — so they hear the others late. They live and die by the exact moment of your ictus. Rests are long, so a quiet look a bar ahead means a lot.',
    instruments: [
      { name: 'Timpani', sound: 'timpani', famous: [{ name: 'Saul Goodman', note: 'principal timpanist of the New York Philharmonic for decades' }, { name: 'Cloyd Duff', note: 'principal timpanist of the Cleveland Orchestra' }, { name: 'Jonathan Haas', note: 'American timpanist and soloist' }], range: [38, 57], voice: 'The only drums in the orchestra tuned to definite notes.', detail: 'A pedal changes the tension of the head and therefore the pitch, sometimes in the middle of a piece. A set is usually four drums of different sizes.' },
      { name: 'Snare drum', sound: 'snareDrum', famous: [{ name: 'Evelyn Glennie', note: 'Scottish solo percussionist, profoundly deaf since childhood, who plays barefoot to feel the sound' }, { name: 'Colin Currie', note: 'Scottish percussionist for whom many new concertos have been written' }, { name: 'Martin Grubinger', note: 'Austrian percussionist famous for marathon, all-instrument recitals' }], range: null, voice: 'Crisp and martial, with a rattle underneath.', detail: 'Wires of metal or gut are stretched across the lower head, and they buzz against it when the top is struck.' },
      { name: 'Bass drum', sound: 'bassDrum', famous: [{ name: 'Evelyn Glennie', note: 'Scottish solo percussionist, profoundly deaf since childhood, who plays barefoot to feel the sound' }, { name: 'Colin Currie', note: 'Scottish percussionist for whom many new concertos have been written' }, { name: 'Martin Grubinger', note: 'Austrian percussionist famous for marathon, all-instrument recitals' }], range: null, voice: 'A deep thud that you feel as much as hear.', detail: 'It is the largest drum in the orchestra. A single soft roll on it can sound like distant thunder.' },
      { name: 'Cymbals', sound: 'cymbals', famous: [{ name: 'Evelyn Glennie', note: 'Scottish solo percussionist, profoundly deaf since childhood, who plays barefoot to feel the sound' }, { name: 'Colin Currie', note: 'Scottish percussionist for whom many new concertos have been written' }, { name: 'Martin Grubinger', note: 'Austrian percussionist famous for marathon, all-instrument recitals' }], range: null, voice: 'A splash of bright noise: crashed together or struck with a mallet.', detail: 'A pair is struck together; a single suspended cymbal can be rolled very softly with timpani sticks for a shimmer.' },
      { name: 'Triangle', sound: 'triangle', famous: [{ name: 'Evelyn Glennie', note: 'Scottish solo percussionist, profoundly deaf since childhood, who plays barefoot to feel the sound' }, { name: 'Colin Currie', note: 'Scottish percussionist for whom many new concertos have been written' }, { name: 'Martin Grubinger', note: 'Austrian percussionist famous for marathon, all-instrument recitals' }], range: null, voice: 'A small, clear ring.', detail: 'Tiny and light, it still carries over a full orchestra because its sound is so pure and high.' },
    ],
  },
]

export interface WardrobeItem {
  item: string
  note: string
}

/** What a conductor wears — traditions, not rules. */
export const WARDROBE: WardrobeItem[] = [
  { item: 'The tailcoat', note: 'Evening concerts have traditionally been conducted in “white tie”: a black tailcoat, white waistcoat, starched wing-collar shirt and white bow tie. The coat is cut short in front and the sleeves for freedom of the arms.' },
  { item: 'The modern alternative', note: 'Many conductors today wear an all-black suit, or a black jacket with a mandarin collar and no tie. Whatever it is, it should never restrict the shoulders — and should not distract from the hands.' },
  { item: 'A spare shirt', note: 'Conducting is physical, and a big symphony is long. It is common to change shirts at the interval.' },
  { item: 'The baton', note: 'A light stick of about 30–40 cm, made of wood, fibreglass or carbon fibre, with a handle of cork or wood. Some conductors never use one.' },
  { item: 'Polished, flat-soled shoes', note: 'You stand on a small raised platform, the podium, for hours; grip and comfort matter more than style.' },
  { item: 'The score', note: 'On a stand in front of the conductor. Many conductors turn the pages, many know the music by heart, and the score is always there.' },
]

export interface FunFact {
  title: string
  text: string
}

export const FUN_FACTS: FunFact[] = [
  { title: '“Maestro” just means “master”', text: 'It is simply the Italian word for master or teacher. In Italian it is used for composers, teachers and conductors alike, and some orchestras use it as a courtesy title for their conductor.' },
  { title: 'The conductor makes no sound', text: 'It is the one musician on the stage who does not play an instrument — and the one the whole room is looking at.' },
  { title: 'The silent first beat', text: 'The orchestra does not play on the first thing you do. The upbeat, a preparation that sets the tempo, the loudness and the character, is silent; the first sound lands on the downbeat that follows it.' },
  { title: 'A deadly walking stick', text: 'Before batons, orchestras were often led by a heavy staff pounded on the floor. According to the usual account, the composer Jean-Baptiste Lully struck his own foot with one in 1687 and died of the resulting infection.' },
  { title: 'The orchestra tunes to an A', text: 'The oboe sounds a La (A), usually at 440 hertz, then the other woodwinds, brass and strings join it. The concertmaster, the leader of the first violins, tunes the strings.' },
  { title: 'The concertmaster', text: 'The principal first violin is the conductor’s right-hand person. By tradition the conductor shakes their hand when walking on, and the leader helps pass instructions along the strings.' },
  { title: 'How big is an orchestra?', text: 'A full symphony orchestra usually has somewhere between seventy and a hundred players. Mozart’s symphonies were written for far fewer, sometimes as few as thirty or forty.' },
  { title: 'Where everyone sits', text: 'Seating varies. A common plan puts the first violins to the conductor’s left, the cellos to the right, the woodwinds in the middle, then the brass, and the percussion at the very back. Some conductors prefer the second violins opposite the firsts, so the two parts answer across the stage.' },
]
