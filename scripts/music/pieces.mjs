// The three ORIGINAL MAESTRO compositions. © MAESTRO project, released under CC0-1.0.
// Written as chord progressions + melodic figures (see theory.mjs / compose.mjs) and rendered to MIDI.

const FIG44 = {
  up: 'c0:1 c1:.5 c2:.5 c3:2', up2: 'c1:1 c2:.5 c3:.5 c2:1 c1:1', dn: 'c3:1 c2:.5 c1:.5 c0:2', run: 'c2:.5 s-1:.5 s-1:.5 s-1:.5 c0:2',
  runup: 'c0:.5 s1:.5 s1:.5 s1:.5 c2:1 c1:1', long: 'c2:2 c1:1 c0:1', dot: 'c0:1.5 c1:.5 c2:1 c1:1', cad: 'c2:1 s-1:1 c0:2',
  sync: 'c0:.5 c2:1 c1:.5 c2:1 c3:1', hold: 'c3:4', fan: 'c0:1.5 c0:.5 c2:1 c3:1',
}
const FIG34 = {
  up: 'c0:1 c1:1 c2:1', up2: 'c0:1 c2:.5 c1:.5 c0:1', dot: 'c2:1.5 c1:.5 c0:1', run: 'c2:.5 s-1:.5 s-1:.5 s-1:.5 c0:1', long: 'c2:2 c1:1',
  cad: 'c1:1 s-1:1 c0:1', turn: 'c0:.5 s1:.5 c1:1 c2:1', dn: 'c3:1 c2:1 c1:1', hold: 'c2:3',
}
const FIG24 = {
  up: 'c0:1 c1:.5 c2:.5', dn: 'c3:1 c2:.5 c1:.5', dot: 'c0:1.5 c1:.5', sync: 'c0:.5 c0:.5 c2:1', long: 'c2:2', run: 'c2:.5 s-1:.5 s-1:.5 c0:.5',
  cad: 'c1:1 c0:1', hold: 'c0:2', fan: 'c0:.5 c0:.5 c2:.5 c3:.5', step: 'c0:.5 s1:.5 s1:.5 c2:.5',
}

// ── 1. Aurora Étude — D major, 4/4, ♩=84 ───────────────────────────────────────────────────────────────────────
const P1 = ['D', 'A', 'Bm', 'F#m', 'G', 'D', 'G', 'A']
const P2 = ['Bm', 'G', 'D', 'A', 'Bm', 'G', 'A', 'A']
const P3 = ['G', 'D', 'A', 'Bm', 'G', 'D', 'A', 'D']
const THEME = ['up', 'up2', 'dn', 'dot', 'up', 'runup', 'run', 'cad']

export const aurora = {
  id: 'aurora-etude', title: 'Aurora Étude', meter: 4, key: 2 /* D */, bpm: 84, ritBars: 4, figures: FIG44,
  sections: [
    { name: 'A — theme (strings, quiet)', chords: P1, melody: THEME, vel: [0.34, 0.42], parts: { violin: 'melody', viola: 'pad', cello: 'bassHalf' } },
    { name: 'A′ — theme (winds join)', chords: P1, melody: ['up', 'up2', 'dn', 'dot', 'up', 'runup', 'run', 'long'], vel: [0.48, 0.58], parts: { violin: 'melody', flute: 'melody8va', viola: 'arp', cello: 'bassWalk', horn: 'pad', timpani: 'timpRoots' } },
    { name: 'B — development', chords: P2, melody: ['dot', 'up2', 'sync', 'long', 'dot', 'up2', 'runup', 'cad'], vel: [0.58, 0.68], counter: ['r', 'dn', 'r', 'dn', 'r', 'dn', 'r', 'dn'], parts: { violin: 'melody', oboe: 'counter', viola: 'arp', cello: 'bassWalk', horn: 'pad3', timpani: 'timpRoots' } },
    { name: 'B′ — building', chords: P2, melody: ['sync', 'up2', 'dot', 'up', 'sync', 'runup', 'run', 'hold'], vel: [0.66, 0.8], parts: { violin: 'melody', flute: 'melody8va', clarinet: 'pad3', viola: 'arp', cello: 'bassWalk', horn: 'pad3', trumpet: 'fanfare', timpani: 'timpRoots' } },
    { name: 'C — tutti', chords: P3, melody: ['up', 'dn', 'up', 'dn', 'runup', 'run', 'sync', 'cad'], vel: [0.82, 0.88], crashAtStart: true, parts: { violin: 'melody', flute: 'melody8va', trumpet: 'melody', horn: 'fanfare', clarinet: 'pad3', viola: 'arp', cello: 'bassWalk', timpani: 'timpRoll', drums: 'pulse' } },
    { name: 'C′ — tutti', chords: P3, melody: ['up2', 'dn', 'up2', 'dn', 'runup', 'run', 'long', 'hold'], vel: [0.88, 0.95], crashAtStart: true, crashAtEnd: true, parts: { violin: 'melody', flute: 'melody8va', trumpet: 'melody', horn: 'fanfare', clarinet: 'pad3', viola: 'arp', cello: 'bassWalk', timpani: 'timpRoll', drums: 'pulse' } },
    { name: 'A″ — reprise (hushed)', chords: P1, melody: THEME, vel: [0.4, 0.3], parts: { violin: 'melody', flute: 'melody8va', viola: 'pad', cello: 'bassHalf' } },
    { name: 'Coda', chords: ['G', 'A', 'D', 'D', 'G', 'A', 'D', 'D'], melody: ['dot', 'sync', 'long', 'hold', 'dot', 'runup', 'long', 'hold'], vel: [0.55, 0.75], crashAtEnd: true, parts: { violin: 'melody', flute: 'melody8va', trumpet: 'melody', horn: 'pad3', viola: 'pad', cello: 'bassHalf', timpani: 'timpRoots' } },
  ],
}

// ── 2. Evening Minuet — G major, 3/4, ♩=100 ─────────────────────────────────────────────────────────────────────
const M1 = ['G', 'D', 'Em', 'D', 'C', 'G', 'D', 'G']
const M2 = ['Em', 'Bm', 'C', 'G', 'Am', 'Em', 'D', 'D']
const M4 = ['Em', 'C', 'G', 'D', 'Em', 'C', 'D', 'G']
const MA = ['up', 'up2', 'dot', 'dn', 'up', 'turn', 'run', 'cad']

export const minuet = {
  id: 'evening-minuet', title: 'Evening Minuet', meter: 3, key: 7 /* G */, bpm: 100, ritBars: 3, figures: FIG34,
  sections: [
    { name: 'A', chords: M1, melody: MA, vel: [0.4, 0.5], parts: { violin: 'melody', viola: 'oom', cello: 'bassRoot' } },
    { name: 'A′', chords: M1, melody: MA, vel: [0.5, 0.58], parts: { violin: 'melody', flute: 'melody8va', viola: 'oom', cello: 'bassRoot', horn: 'pad' } },
    { name: 'B', chords: M2, melody: ['dot', 'turn', 'up2', 'long', 'dot', 'turn', 'run', 'cad'], vel: [0.55, 0.7], parts: { violin: 'melody', oboe: 'melody', viola: 'oom', cello: 'bassWalk', horn: 'pad3', timpani: 'timpRoots' } },
    { name: 'A (return)', chords: M1, melody: MA, vel: [0.5, 0.55], parts: { violin: 'melody', flute: 'melody8va', viola: 'oom', cello: 'bassRoot' } },
    { name: 'Trio (woodwinds)', chords: M4, melody: ['long', 'turn', 'long', 'dot', 'long', 'turn', 'up2', 'cad'], vel: [0.3, 0.4], parts: { flute: 'melody8va', clarinet: 'melody', viola: 'pad', cello: 'bassRoot' } },
    { name: 'Trio′ (strings join)', chords: M4, melody: ['long', 'turn', 'long', 'dot', 'long', 'turn', 'up2', 'cad'], vel: [0.4, 0.52], parts: { violin: 'melody', flute: 'melody8va', clarinet: 'pad3', viola: 'oom', cello: 'bassRoot' } },
    { name: 'A (grand)', chords: M1, melody: MA, vel: [0.62, 0.78], crashAtStart: true, parts: { violin: 'melody', flute: 'melody8va', trumpet: 'melody', horn: 'pad3', viola: 'oom', cello: 'bassWalk', timpani: 'timpRoots' } },
    { name: 'Coda', chords: ['C', 'D', 'G', 'G', 'C', 'D', 'G', 'G'], melody: ['dot', 'up2', 'long', 'hold', 'dot', 'turn', 'long', 'hold'], vel: [0.6, 0.72], crashAtEnd: true, parts: { violin: 'melody', flute: 'melody8va', horn: 'pad3', viola: 'oom', cello: 'bassHalf', timpani: 'timpRoots' } },
  ],
}

// ── 3. Parade March — C major, 2/4, ♩=104 ───────────────────────────────────────────────────────────────────────
const A8 = ['C', 'G', 'C', 'G', 'F', 'C', 'G', 'C']
const B8 = ['Am', 'Em', 'F', 'C', 'Dm', 'G', 'C', 'C']
const T8 = ['F', 'C', 'G', 'C', 'F', 'G', 'C', 'C']
const MARCH = ['up', 'dn', 'dot', 'sync', 'up', 'dn', 'run', 'cad']
const march = (extra = {}) => ({ trumpet: 'melody', violin: 'melody', horn: 'afterbeat', cello: 'bassWalk', timpani: 'timpRoots', drums: 'march', ...extra })

export const parade = {
  id: 'parade-march', title: 'Parade March', meter: 2, key: 0 /* C */, bpm: 104, ritBars: 4, figures: FIG24,
  sections: [
    { name: 'Intro', chords: ['C', 'C', 'G', 'G'], melody: ['fan', 'fan', 'fan', 'hold'], vel: [0.6, 0.75], parts: { trumpet: 'melody', horn: 'pad3', timpani: 'timpRoots', drums: 'snareRoll' } },
    { name: 'A', chords: [...A8, ...A8], melody: [...MARCH, ...MARCH.slice(0, 7), 'hold'], vel: [0.6, 0.66], parts: march({ viola: 'oom' }) },
    { name: 'B', chords: [...B8, ...B8], melody: ['dot', 'up', 'step', 'long', 'dot', 'up', 'run', 'cad', 'dot', 'up', 'step', 'long', 'dot', 'up', 'run', 'hold'], vel: [0.55, 0.7], parts: march({ flute: 'melody8va', viola: 'oom', trumpet: 'pad' }) },
    { name: 'A′', chords: [...A8, ...A8], melody: [...MARCH, ...MARCH.slice(0, 7), 'hold'], vel: [0.72, 0.85], crashAtStart: true, parts: march({ flute: 'melody8va', viola: 'oom', clarinet: 'pad3' }) },
    { name: 'Trio (lyrical)', chords: [...T8, ...T8], melody: ['long', 'dot', 'long', 'dot', 'step', 'up', 'long', 'cad', 'long', 'dot', 'long', 'dot', 'step', 'up', 'long', 'hold'], vel: [0.35, 0.5], parts: { flute: 'melody', clarinet: 'pad3', violin: 'melody', viola: 'pad', cello: 'bassHalf', timpani: 'timpRoots' } },
    { name: 'A″ (finale)', chords: [...A8, ...A8], melody: [...MARCH, ...MARCH.slice(0, 7), 'hold'], vel: [0.85, 0.95], crashAtStart: true, parts: march({ flute: 'melody8va', viola: 'oom', clarinet: 'pad3', horn: 'afterbeat' }) },
    { name: 'Coda', chords: ['F', 'G', 'C', 'C', 'F', 'G', 'C', 'C', 'F', 'G', 'C', 'C'], melody: ['fan', 'fan', 'dot', 'hold', 'fan', 'fan', 'dot', 'hold', 'fan', 'sync', 'long', 'hold'], vel: [0.8, 0.95], crashAtEnd: true, parts: march({ flute: 'melody8va', clarinet: 'pad3' }) },
  ],
}

export const PIECES = [aurora, minuet, parade]
