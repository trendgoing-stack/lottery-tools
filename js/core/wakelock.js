/**
 * 演出中に画面がスリープしないようにする（Screen Wake Lock API）。
 * 非対応の環境や、取得できなかったときは何もしない。
 */

let sentinel = null
let holders = 0

async function request() {
  if (sentinel || !('wakeLock' in navigator) || document.visibilityState !== 'visible') return
  try {
    sentinel = await navigator.wakeLock.request('screen')
    sentinel.addEventListener('release', () => {
      sentinel = null
    })
  } catch {
    sentinel = null
  }
}

export function acquire() {
  holders++
  request()
}

export function release() {
  holders = Math.max(0, holders - 1)
  if (holders === 0 && sentinel) {
    sentinel.release().catch(() => {})
    sentinel = null
  }
}

// アプリを切り替えて戻ってきたとき、演出が続いていれば取り直す
document.addEventListener('visibilitychange', () => {
  if (holders > 0 && document.visibilityState === 'visible') request()
})
