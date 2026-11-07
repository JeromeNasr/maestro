import { readFileSync } from 'node:fs'

const html = readFileSync('index.html', 'utf8')
const csp = /http-equiv="Content-Security-Policy"\s+content="([^"]+)"/.exec(html)?.[1] ?? ''
const connectSrc = (/connect-src([^;]*)/.exec(csp)?.[1] ?? '').trim().split(/\s+/)

describe('privacy: Content-Security-Policy', () => {
  it('restricts network connections (connect-src) in the shipped HTML', () => {
    expect(csp).not.toBe('')
    expect(connectSrc).toContain("'self'")
  })
  it('never allows wildcard or arbitrary https/http/ws destinations', () => {
    for (const src of connectSrc) {
      expect(['*', 'https:', 'http:', 'ws:', 'wss:']).not.toContain(src)
    }
  })
  it('only allows the documented CDN fallbacks as external hosts', () => {
    const external = connectSrc.filter((s) => s.startsWith('https://'))
    expect(external.sort()).toEqual(['https://cdn.jsdelivr.net', 'https://storage.googleapis.com'])
  })
  it("does not allow MediaPipe's usage-logging endpoint", () => {
    expect(csp).not.toContain('odml.pa.googleapis.com')
    expect(csp).not.toContain('googleapis.com/v1/log')
  })
})
