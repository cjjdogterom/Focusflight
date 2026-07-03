// Ambience synthesiser using the Web Audio API — no asset files, works
// offline. Every soundscape is generated: filtered noise, LFO swells and
// scheduled micro-events (thunder, crickets, crackles).

export type SoundscapeId = 'cabin' | 'ocean' | 'evening' | 'storm' | 'rain' | 'fire'

export const SOUNDSCAPES: { id: SoundscapeId; name: string }[] = [
  { id: 'cabin', name: 'Vliegtuigcabine' },
  { id: 'ocean', name: 'Oceaangolven' },
  { id: 'evening', name: 'Zwoele zomeravond' },
  { id: 'storm', name: 'Onweersbui' },
  { id: 'rain', name: 'Regen op het raam' },
  { id: 'fire', name: 'Knapperend haardvuur' },
]

let ctx: AudioContext | null = null
let master: GainNode | null = null
let nodes: AudioNode[] = []
let timers: number[] = []
let running: SoundscapeId | null = null

function keep<T extends AudioNode>(n: T): T {
  nodes.push(n)
  return n
}

function later(fn: () => void, ms: number) {
  timers.push(window.setTimeout(fn, ms))
}

/** soft brown-ish noise (integrated white) */
function brownBuffer(c: AudioContext, seconds = 2): AudioBuffer {
  const buffer = c.createBuffer(1, c.sampleRate * seconds, c.sampleRate)
  const data = buffer.getChannelData(0)
  let last = 0
  for (let i = 0; i < data.length; i++) {
    const white = Math.random() * 2 - 1
    last = (last + 0.02 * white) / 1.02
    data[i] = last * 3.5
  }
  return buffer
}

function whiteBuffer(c: AudioContext, seconds = 2): AudioBuffer {
  const buffer = c.createBuffer(1, c.sampleRate * seconds, c.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  return buffer
}

/** looping noise source through a filter into a gain — the base of everything */
function noiseLayer(
  c: AudioContext,
  out: AudioNode,
  buffer: AudioBuffer,
  filterType: BiquadFilterType,
  freq: number,
  gain: number,
  q = 1,
): { src: AudioBufferSourceNode; filter: BiquadFilterNode; gain: GainNode } {
  const src = keep(c.createBufferSource())
  src.buffer = buffer
  src.loop = true
  const filter = keep(c.createBiquadFilter())
  filter.type = filterType
  filter.frequency.value = freq
  filter.Q.value = q
  const g = keep(c.createGain())
  g.gain.value = gain
  src.connect(filter).connect(g).connect(out)
  src.start()
  return { src, filter, gain: g }
}

/** slow sine LFO wired into an AudioParam (adds ±depth around the param's value) */
function lfo(c: AudioContext, param: AudioParam, hz: number, depth: number) {
  const osc = keep(c.createOscillator())
  osc.frequency.value = hz
  const g = keep(c.createGain())
  g.gain.value = depth
  osc.connect(g).connect(param)
  osc.start()
}

// ---- soundscapes ----

function buildCabin(c: AudioContext, out: GainNode) {
  noiseLayer(c, out, brownBuffer(c), 'lowpass', 620, 0.8)
  const hum = keep(c.createOscillator())
  hum.type = 'sine'
  hum.frequency.value = 82
  const humGain = keep(c.createGain())
  humGain.gain.value = 0.06
  hum.connect(humGain).connect(out)
  hum.start()
}

function buildOcean(c: AudioContext, out: GainNode) {
  // steady deep wash
  noiseLayer(c, out, brownBuffer(c, 4), 'lowpass', 340, 0.35)
  // swelling wave layer: two slightly-detuned LFOs so waves never repeat exactly
  const swell = noiseLayer(c, out, brownBuffer(c, 4), 'lowpass', 520, 0.28)
  lfo(c, swell.gain.gain, 0.07, 0.22)
  lfo(c, swell.gain.gain, 0.113, 0.1)
  lfo(c, swell.filter.frequency, 0.07, 260)
  // sizzle of foam on the beach, breathing along
  const foam = noiseLayer(c, out, whiteBuffer(c, 4), 'bandpass', 2400, 0.045, 0.6)
  lfo(c, foam.gain.gain, 0.07, 0.035)
}

function buildRain(c: AudioContext, out: GainNode) {
  // patter on the glass + muffled body behind it
  noiseLayer(c, out, whiteBuffer(c, 4), 'bandpass', 2600, 0.16, 0.5)
  noiseLayer(c, out, brownBuffer(c, 4), 'lowpass', 700, 0.4)
  const gusts = noiseLayer(c, out, whiteBuffer(c, 4), 'bandpass', 1400, 0.05, 0.8)
  lfo(c, gusts.gain.gain, 0.19, 0.04)
}

function buildStorm(c: AudioContext, out: GainNode) {
  buildRain(c, out)
  // scheduled thunder: a lowpassed noise burst with a long exponential tail
  const rumble = () => {
    if (!ctx || running !== 'storm') return
    const src = c.createBufferSource()
    src.buffer = brownBuffer(c, 6)
    const lp = c.createBiquadFilter()
    lp.type = 'lowpass'
    const g = c.createGain()
    src.connect(lp).connect(g).connect(out)
    const t = c.currentTime
    const far = Math.random() < 0.5 // distant vs nearby strike
    lp.frequency.setValueAtTime(far ? 160 : 420, t)
    lp.frequency.exponentialRampToValueAtTime(55, t + 2.5)
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(far ? 0.5 : 1.1, t + (far ? 0.5 : 0.12))
    g.gain.exponentialRampToValueAtTime(0.0001, t + (far ? 6 : 4.2))
    src.start(t)
    src.stop(t + 7)
    later(rumble, 9000 + Math.random() * 16000)
  }
  later(rumble, 2500 + Math.random() * 4000)
}

function buildEvening(c: AudioContext, out: GainNode) {
  // warm night-air floor
  noiseLayer(c, out, brownBuffer(c, 4), 'lowpass', 420, 0.12)
  // crickets: short pulse trains around 4.2 kHz, two individuals out of sync
  const cricket = (baseHz: number, everyMs: number) => {
    const osc = keep(c.createOscillator())
    osc.type = 'triangle'
    osc.frequency.value = baseHz
    const g = keep(c.createGain())
    g.gain.value = 0
    const bp = keep(c.createBiquadFilter())
    bp.type = 'bandpass'
    bp.frequency.value = baseHz
    bp.Q.value = 4
    osc.connect(bp).connect(g).connect(out)
    osc.start()
    const chirp = () => {
      if (!ctx || running !== 'evening') return
      const t = c.currentTime
      for (let i = 0; i < 3; i++) {
        const s = t + i * 0.055
        g.gain.setValueAtTime(0, s)
        g.gain.linearRampToValueAtTime(0.05, s + 0.012)
        g.gain.linearRampToValueAtTime(0, s + 0.038)
      }
      later(chirp, everyMs + Math.random() * 300)
    }
    later(chirp, Math.random() * 800)
  }
  cricket(4200, 620)
  cricket(3800, 810)
  // an occasional blackbird phrase: a few soft gliding whistle notes
  const bird = () => {
    if (!ctx || running !== 'evening') return
    const notes = 2 + Math.floor(Math.random() * 3)
    const t0 = c.currentTime
    for (let i = 0; i < notes; i++) {
      const osc = c.createOscillator()
      osc.type = 'sine'
      const g = c.createGain()
      osc.connect(g).connect(out)
      const s = t0 + i * (0.28 + Math.random() * 0.12)
      const f1 = 2100 + Math.random() * 1400
      const f2 = f1 * (0.75 + Math.random() * 0.5)
      osc.frequency.setValueAtTime(f1, s)
      osc.frequency.exponentialRampToValueAtTime(f2, s + 0.22)
      g.gain.setValueAtTime(0, s)
      g.gain.linearRampToValueAtTime(0.055, s + 0.04)
      g.gain.exponentialRampToValueAtTime(0.0001, s + 0.26)
      osc.start(s)
      osc.stop(s + 0.3)
    }
    later(bird, 6000 + Math.random() * 12000)
  }
  later(bird, 3000 + Math.random() * 3000)
}

function buildFire(c: AudioContext, out: GainNode) {
  // warm glow underneath
  noiseLayer(c, out, brownBuffer(c, 4), 'lowpass', 260, 0.3)
  const hiss = noiseLayer(c, out, whiteBuffer(c, 4), 'bandpass', 900, 0.02, 0.4)
  lfo(c, hiss.gain.gain, 0.31, 0.012)
  // crackles: dense stream of tiny filtered bursts
  const crackle = () => {
    if (!ctx || running !== 'fire') return
    if (Math.random() < 0.72) {
      const src = c.createBufferSource()
      src.buffer = whiteBuffer(c, 0.1)
      const bp = c.createBiquadFilter()
      bp.type = 'bandpass'
      bp.frequency.value = 1400 + Math.random() * 3800
      bp.Q.value = 1.5
      const g = c.createGain()
      src.connect(bp).connect(g).connect(out)
      const t = c.currentTime
      g.gain.setValueAtTime(0.05 + Math.random() * 0.22, t)
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.02 + Math.random() * 0.05)
      src.start(t)
      src.stop(t + 0.09)
    }
    later(crackle, 40 + Math.random() * 140)
  }
  later(crackle, 200)
}

const BUILDERS: Record<SoundscapeId, (c: AudioContext, out: GainNode) => void> = {
  cabin: buildCabin,
  ocean: buildOcean,
  evening: buildEvening,
  storm: buildStorm,
  rain: buildRain,
  fire: buildFire,
}

export function startAmbience(scape: SoundscapeId = 'cabin', volume = 0.5) {
  if (running === scape) {
    setVolume(volume)
    return
  }
  stopAmbience()
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
  ctx = new AC()
  master = ctx.createGain()
  master.gain.value = 0
  master.connect(ctx.destination)
  running = scape
  BUILDERS[scape](ctx, master)
  // short fade-in so switching soundscapes never clicks
  master.gain.setTargetAtTime(volume, ctx.currentTime, 0.4)
}

export function stopAmbience() {
  if (!running) return
  for (const t of timers) window.clearTimeout(t)
  timers = []
  try {
    for (const n of nodes) {
      if ('stop' in n && typeof (n as OscillatorNode).stop === 'function') {
        try {
          ;(n as OscillatorNode).stop()
        } catch {
          /* already stopped */
        }
      }
      n.disconnect()
    }
    master?.disconnect()
    void ctx?.close()
  } catch {
    /* noop */
  }
  ctx = null
  master = null
  nodes = []
  running = null
}

export function setVolume(v: number) {
  if (master && ctx) {
    master.gain.setTargetAtTime(v, ctx.currentTime, 0.1)
  }
}
