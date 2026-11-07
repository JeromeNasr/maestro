/** The four orchestra sections. Shared by the UI, the mixer and the audio engine. */
export const SECTIONS = [
  { id: 'strings', label: 'Strings' },
  { id: 'woodwinds', label: 'Woodwinds' },
  { id: 'brass', label: 'Brass' },
  { id: 'percussion', label: 'Percussion' },
] as const

export type SectionId = (typeof SECTIONS)[number]['id']
