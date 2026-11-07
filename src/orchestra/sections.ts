/** The four orchestra sections. Shared by the UI now and by the audio engine in Phase 4. */
export const SECTIONS = [
  { id: 'strings', label: 'Strings' },
  { id: 'woodwinds', label: 'Woodwinds' },
  { id: 'brass', label: 'Brass' },
  { id: 'percussion', label: 'Percussion' },
] as const

export type SectionId = (typeof SECTIONS)[number]['id']
