// Sound notifications using Web Audio API — no external files required.
// Respects browser autoplay policy: sounds only play after a user gesture.

type SoundType =
  | 'success'
  | 'error'
  | 'notification'
  | 'boarding_ok'
  | 'boarding_absent'
  | 'trip_start'
  | 'trip_end'
  | 'list_closed'

const SOUNDS: Record<SoundType, { freq: number[]; dur: number[]; type: OscillatorType }> = {
  success:        { freq: [440, 554, 660],  dur: [0.08, 0.08, 0.18], type: 'sine' },
  error:          { freq: [330, 220],        dur: [0.12, 0.22],        type: 'sawtooth' },
  notification:   { freq: [660, 880],        dur: [0.07, 0.14],        type: 'sine' },
  boarding_ok:    { freq: [523, 659],        dur: [0.07, 0.16],        type: 'sine' },
  boarding_absent:{ freq: [392, 311],        dur: [0.09, 0.18],        type: 'triangle' },
  trip_start:     { freq: [440, 554, 659, 880], dur: [0.07, 0.07, 0.07, 0.2], type: 'sine' },
  trip_end:       { freq: [880, 659, 523],   dur: [0.07, 0.07, 0.22],  type: 'sine' },
  list_closed:    { freq: [523, 659, 784],   dur: [0.08, 0.08, 0.2],   type: 'sine' },
}

let ctx: AudioContext | null = null

function getCtx(): AudioContext | null {
  try {
    if (!ctx || ctx.state === 'closed') ctx = new AudioContext()
    if (ctx.state === 'suspended') ctx.resume()
    return ctx
  } catch {
    return null
  }
}

function isMuted(): boolean {
  try { return localStorage.getItem('deskbus_muted') === 'true' } catch { return false }
}

export function setMuted(val: boolean) {
  try { localStorage.setItem('deskbus_muted', val ? 'true' : 'false') } catch { /* ignore */ }
}

export function getMuted(): boolean { return isMuted() }

export function playSound(type: SoundType) {
  if (isMuted()) return
  const ac = getCtx()
  if (!ac) return

  const { freq, dur, type: waveType } = SOUNDS[type]
  let t = ac.currentTime

  freq.forEach((f, i) => {
    const osc = ac.createOscillator()
    const gain = ac.createGain()
    osc.type = waveType
    osc.frequency.setValueAtTime(f, t)
    gain.gain.setValueAtTime(0.18, t)
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur[i])
    osc.connect(gain)
    gain.connect(ac.destination)
    osc.start(t)
    osc.stop(t + dur[i] + 0.01)
    t += dur[i] * 0.6
  })
}
