/**
 * 演出の共通処理。
 *
 *   await runShow(async ({ skip, sleep }) => { ...演出... })
 *
 * - 結果は演出の前に乱数で決めておき、演出はそれを見せるだけにする
 * - 演出中は画面のスリープを防ぎ、data-lock の付いた操作を押せなくする（連打・途中変更の防止）
 * - 「演出スキップ」が ON のとき skip が true になる。各機能は演出を省いてすぐ結果を出す
 */
import * as settings from './settings.js'
import * as wakelock from './wakelock.js'

let running = false

export function isRunning() {
  return running
}

export function shouldSkip() {
  return settings.get().skipAnimation || window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export async function runShow(fn) {
  if (running) return undefined
  running = true
  document.body.classList.add('is-busy')
  wakelock.acquire()
  const skip = shouldSkip()
  try {
    return await fn({
      skip,
      sleep: (ms) => (skip ? Promise.resolve() : new Promise((resolve) => setTimeout(resolve, ms))),
    })
  } finally {
    running = false
    document.body.classList.remove('is-busy')
    wakelock.release()
  }
}

/** requestAnimationFrame で、duration ミリ秒かけて onFrame(0〜1) を呼ぶ */
export function animate(duration, onFrame) {
  return new Promise((resolve) => {
    const start = performance.now()
    function step(now) {
      const t = Math.min(1, (now - start) / duration)
      onFrame(t)
      if (t < 1) requestAnimationFrame(step)
      else resolve()
    }
    requestAnimationFrame(step)
  })
}

export const easeOutCubic = (t) => 1 - (1 - t) ** 3
export const easeOutQuart = (t) => 1 - (1 - t) ** 4
export const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)
