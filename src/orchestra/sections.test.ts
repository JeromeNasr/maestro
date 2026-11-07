import { SECTIONS } from './sections'

describe('orchestra sections', () => {
  it('defines exactly the four required sections with unique ids', () => {
    expect(SECTIONS.map((s) => s.id)).toEqual(['strings', 'woodwinds', 'brass', 'percussion'])
  })
})
