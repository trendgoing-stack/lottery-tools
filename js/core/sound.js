/**
 * 効果音。音声ファイルは使わず、Web Audio API でその場で音を作る。
 *
 * iOS では、利用者の操作（タップ）の中で AudioContext を作って鳴らさないと音が出ないため、
 * 最初のタップで unlock() する。
 */
import * as settings from './settings.js'

let ctx = null
let noiseBuffer = null

function audio() {
  if (settings.get().muted) return null
  if (!ctx) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext
    if (!AudioCtx) return null
    try {
      ctx = new AudioCtx()
    } catch {
      return null
    }
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {})
  return ctx
}

/** 最初のタップで呼ぶ（iOS の自動再生制限の解除） */
export function unlock() {
  const ac = audio()
  if (!ac) return
  const source = ac.createBufferSource()
  source.buffer = ac.createBuffer(1, 1, 22050)
  source.connect(ac.destination)
  source.start(0)
}

function tone(freq, { at = 0, dur = 0.12, type = 'sine', gain = 0.18, to = null } = {}) {
  const ac = audio()
  if (!ac) return
  const t = ac.currentTime + at
  const osc = ac.createOscillator()
  const amp = ac.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, t)
  if (to) osc.frequency.exponentialRampToValueAtTime(to, t + dur)
  amp.gain.setValueAtTime(0.0001, t)
  amp.gain.exponentialRampToValueAtTime(gain, t + 0.008)
  amp.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  osc.connect(amp).connect(ac.destination)
  osc.start(t)
  osc.stop(t + dur + 0.02)
}

function noise({ at = 0, dur = 0.05, gain = 0.25, freq = 1800 } = {}) {
  const ac = audio()
  if (!ac) return
  if (!noiseBuffer) {
    noiseBuffer = ac.createBuffer(1, ac.sampleRate * 0.5, ac.sampleRate)
    const channel = noiseBuffer.getChannelData(0)
    // 音色のための雑音。結果には関係しないので、ここだけは決まった式で作る
    let seed = 12345
    for (let i = 0; i < channel.length; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff
      channel[i] = (seed / 0x3fffffff - 1) * 0.9
    }
  }
  const t = ac.currentTime + at
  const source = ac.createBufferSource()
  const filter = ac.createBiquadFilter()
  const amp = ac.createGain()
  source.buffer = noiseBuffer
  filter.type = 'bandpass'
  filter.frequency.value = freq
  filter.Q.value = 1.2
  amp.gain.setValueAtTime(gain, t)
  amp.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  source.connect(filter).connect(amp).connect(ac.destination)
  source.start(t)
  source.stop(t + dur + 0.02)
}

export const sfx = {
  /** 軽いタップ音 */
  tap() {
    tone(660, { dur: 0.05, type: 'triangle', gain: 0.1 })
  },
  /** ルーレットの針・数字の切り替わりなど */
  tick() {
    tone(1400, { dur: 0.03, type: 'square', gain: 0.05 })
  },
  /** サイコロがぶつかる音 */
  rattle() {
    for (let i = 0; i < 5; i++) noise({ at: i * 0.07, dur: 0.04, gain: 0.3, freq: 900 + i * 250 })
  },
  /** 決定音 */
  pop() {
    tone(520, { dur: 0.1, type: 'triangle', gain: 0.2, to: 900 })
  },
  /** 当たり・勝者の発表 */
  win() {
    ;[523, 659, 784, 1047].forEach((f, i) => tone(f, { at: i * 0.1, dur: 0.22, type: 'triangle', gain: 0.18 }))
  },
  /** ハズレ */
  lose() {
    tone(392, { dur: 0.25, type: 'sawtooth', gain: 0.08, to: 196 })
  },
  /** コインを弾く音 */
  coin() {
    tone(2200, { dur: 0.08, type: 'square', gain: 0.05 })
    tone(3300, { at: 0.05, dur: 0.2, type: 'sine', gain: 0.1 })
  },
  /** ドラムロール（秒数を指定） */
  drumroll(seconds = 1.2) {
    const count = Math.floor(seconds / 0.045)
    for (let i = 0; i < count; i++) {
      noise({ at: i * 0.045, dur: 0.05, gain: 0.12 + (0.2 * i) / count, freq: 350 })
    }
  },
}
