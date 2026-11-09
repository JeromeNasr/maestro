/**
 * Reference material for the Orchestra page. Everything here is general, well-documented music knowledge; ranges are the
 * usual practical orchestral ranges at SOUNDING pitch (MIDI note numbers, 60 = middle C) and are approximate by nature.
 */
import type { SectionId } from './sections'

export interface InstrumentLore {
  name: string
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
      { name: 'Violin', range: [55, 100], voice: 'The highest string voice; the first and second violins together are the biggest section.', detail: 'Four strings tuned a fifth apart — G, D, A, E. Violins made in Cremona around three centuries ago are still played in concert halls today.' },
      { name: 'Viola', range: [48, 88], voice: 'A little larger and darker than the violin, tuned a fifth lower.', detail: 'Violists read mostly in the alto clef, a clef that almost nobody else in the orchestra uses.' },
      { name: 'Cello', range: [36, 81], voice: 'Warm and singing, closest to the range of the human voice.', detail: 'The player sits and holds it between the knees, resting it on an endpin — a spike that became standard practice in the 19th century.' },
      { name: 'Double bass', range: [28, 67], voice: 'The foundation: the lowest notes in the string section.', detail: 'It is tuned in fourths rather than fifths, and its music is written an octave higher than it sounds, to avoid a forest of ledger lines.' },
    ],
  },
  {
    id: 'woodwinds',
    numeral: 'II',
    title: 'Woodwinds',
    intro: 'Seated in the middle, in pairs. Each player is a soloist: one voice, one colour. They need to breathe before they play, so they watch for the breath in your preparation.',
    instruments: [
      { name: 'Flute', range: [60, 96], voice: 'Bright and airy, with no reed at all.', detail: 'The sound is made by blowing across an edge, like a bottle. Modern flutes are metal, yet they still count as woodwinds, because of how they make their sound.' },
      { name: 'Oboe', range: [58, 93], voice: 'Penetrating and plaintive, a double reed.', detail: 'Before a concert the oboe plays an A, and the whole orchestra tunes to it — the oboe’s pitch is clear and cuts through the room.' },
      { name: 'Clarinet', range: [50, 94], voice: 'Smooth, with an enormous range of colour and volume.', detail: 'The usual orchestral clarinet is in B♭: when the player reads a C, a B♭ sounds. The part is transposed on the page.' },
      { name: 'Bassoon', range: [34, 75], voice: 'Woody and a little comic in the low register, tender in the high.', detail: 'Its tube is about 2.5 metres long, folded in half to make it playable. A double reed sits on a thin curved tube called the bocal.' },
    ],
  },
  {
    id: 'brass',
    numeral: 'III',
    title: 'Brass',
    intro: 'Seated behind the woodwinds. Their sound arrives with a delay and can easily overpower everyone else, so a big part of the conductor’s job is balance — and an early, unhurried preparation.',
    instruments: [
      { name: 'French horn', range: [35, 77], voice: 'Mellow, round, equally at home with the woodwinds and the brass.', detail: 'Roughly 3.7 metres of tubing coiled into a circle. The player’s right hand sits in the bell to shape pitch and tone.' },
      { name: 'Trumpet', range: [54, 84], voice: 'Brilliant and commanding; the fanfare voice.', detail: 'Three valves change the length of the tube. Orchestral trumpets are most often in B♭ or C.' },
      { name: 'Trombone', range: [40, 77], voice: 'Noble and powerful, from a whisper to a roar.', detail: 'It has a slide with seven positions instead of valves, so the player finds each pitch by ear and arm.' },
      { name: 'Tuba', range: [26, 65], voice: 'The deepest voice of the brass: a soft, wide, low cushion.', detail: 'Many metres of tubing wound into a coil. It usually appears in the orchestra only when a composer wants the very bottom of the sound.' },
    ],
  },
  {
    id: 'percussion',
    numeral: 'IV',
    title: 'Percussion',
    intro: 'At the back, and furthest from you — so they hear the others late. They live and die by the exact moment of your ictus. Rests are long, so a quiet look a bar ahead means a lot.',
    instruments: [
      { name: 'Timpani', range: [38, 57], voice: 'The only drums in the orchestra tuned to definite notes.', detail: 'A pedal changes the tension of the head and therefore the pitch, sometimes in the middle of a piece. A set is usually four drums of different sizes.' },
      { name: 'Snare drum', range: null, voice: 'Crisp and martial, with a rattle underneath.', detail: 'Wires of metal or gut are stretched across the lower head, and they buzz against it when the top is struck.' },
      { name: 'Bass drum', range: null, voice: 'A deep thud that you feel as much as hear.', detail: 'It is the largest drum in the orchestra. A single soft roll on it can sound like distant thunder.' },
      { name: 'Cymbals', range: null, voice: 'A splash of bright noise: crashed together or struck with a mallet.', detail: 'A pair is struck together; a single suspended cymbal can be rolled very softly with timpani sticks for a shimmer.' },
      { name: 'Triangle', range: null, voice: 'A small, clear ring.', detail: 'Tiny and light, it still carries over a full orchestra because its sound is so pure and high.' },
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
  { title: 'The orchestra tunes to an A', text: 'The oboe sounds an A, usually at 440 hertz, then the other woodwinds, brass and strings join it. The concertmaster, the leader of the first violins, tunes the strings.' },
  { title: 'The concertmaster', text: 'The principal first violin is the conductor’s right-hand person. By tradition the conductor shakes their hand when walking on, and the leader helps pass instructions along the strings.' },
  { title: 'How big is an orchestra?', text: 'A full symphony orchestra usually has somewhere between seventy and a hundred players. Mozart’s symphonies were written for far fewer, sometimes as few as thirty or forty.' },
  { title: 'Where everyone sits', text: 'Seating varies. A common plan puts the first violins to the conductor’s left, the cellos to the right, the woodwinds in the middle, then the brass, and the percussion at the very back. Some conductors prefer the second violins opposite the firsts, so the two parts answer across the stage.' },
]
