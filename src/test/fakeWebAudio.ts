/** A just-enough fake of the Web Audio API that records what the sampled backend builds and plays. */
export class FakeParam {
  value = 0
  events: { type: string; v?: number; t: number }[] = []
  setValueAtTime(v: number, t: number) { this.value = v; this.events.push({ type: 'set', v, t }); return this }
  linearRampToValueAtTime(v: number, t: number) { this.events.push({ type: 'ramp', v, t }); this.value = v; return this }
  setTargetAtTime(v: number, t: number) { this.events.push({ type: 'target', v, t }); return this }
  cancelScheduledValues(t: number) { this.events.push({ type: 'cancel', t }); return this }
}
export class FakeNode {
  connections: FakeNode[] = []
  disconnected = false
  constructor(public kind: string) {}
  connect(n: FakeNode) { this.connections.push(n); return n }
  disconnect() { this.disconnected = true }
}
export class FakeGain extends FakeNode { gain = new FakeParam(); constructor() { super('gain'); this.gain.value = 1 } }
export class FakeSource extends FakeNode {
  buffer: FakeBuffer | null = null
  playbackRate = new FakeParam()
  loop = false
  loopStart = 0
  loopEnd = 0
  started: number | null = null
  stopped: number | null = null
  onended: (() => void) | null = null
  constructor(kind = 'source') { super(kind); this.playbackRate.value = 1 }
  start(t: number) { this.started = t }
  stop(t = 0) { this.stopped = t }
  frequency = new FakeParam()
  type = 'sine'
}
export class FakeBuffer { constructor(public id: string, public length = 48000, public numberOfChannels = 1, public sampleRate = 48000) {} get duration() { return this.length / this.sampleRate } getChannelData() { return new Float32Array(this.length) } }
export class FakeAnalyser extends FakeNode { fftSize = 1024; constructor() { super('analyser') } getFloatTimeDomainData(a: Float32Array) { a.fill(0) } }

export class FakeAudioContext {
  currentTime = 10
  sampleRate = 48000
  baseLatency = 0.01
  state = 'running'
  destination = new FakeNode('destination')
  created: { sources: FakeSource[]; gains: FakeGain[]; panners: (FakeNode & { pan: FakeParam })[] } = { sources: [], gains: [], panners: [] }
  decoded: string[] = []
  closed = false
  resume() { return Promise.resolve() }
  close() { this.closed = true; return Promise.resolve() }
  createGain() { const g = new FakeGain(); this.created.gains.push(g); return g }
  createBufferSource() { const s = new FakeSource(); this.created.sources.push(s); return s }
  createOscillator() { const s = new FakeSource('osc'); this.created.sources.push(s); return s }
  createStereoPanner() { const p = Object.assign(new FakeNode('pan'), { pan: new FakeParam() }); this.created.panners.push(p); return p }
  createBiquadFilter() { return Object.assign(new FakeNode('filter'), { type: 'lowpass', frequency: new FakeParam(), Q: new FakeParam() }) }
  createAnalyser() { return new FakeAnalyser() }
  createWaveShaper() { return Object.assign(new FakeNode('shaper'), { curve: null as Float32Array | null, oversample: 'none' }) }
  createDynamicsCompressor() { const p = () => new FakeParam(); return Object.assign(new FakeNode('comp'), { threshold: p(), knee: p(), ratio: p(), attack: p(), release: p() }) }
  createConvolver() { return Object.assign(new FakeNode('conv'), { buffer: null as unknown }) }
  createBuffer(ch: number, len: number, sr: number) { const b = new FakeBuffer('ir', len, ch, sr); return Object.assign(b, { getChannelData: () => new Float32Array(len) }) }
  decodeAudioData(bytes: ArrayBuffer) {
    const id = new TextDecoder().decode(new Uint8Array(bytes))
    this.decoded.push(id)
    return Promise.resolve(new FakeBuffer(id))
  }
}
