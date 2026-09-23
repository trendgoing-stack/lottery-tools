/**
 * 全画面モード：結果を大きな文字で表示して、みんなに画面を見せる。
 * iPhone では Fullscreen API が使えないので、画面全体を覆う表示で代用する。
 * 文字の大きさは、画面に収まる最大の大きさに自動で合わせる。
 */
import { h } from './ui.js'
import * as wakelock from './wakelock.js'

/**
 * @param {object} options
 * @param {string} options.title  上に小さく出す見出し（例：「サイコロ」）
 * @param {Array<string | {text: string, sub?: string}>} options.lines  大きく出す行
 */
export function showStage({ title = '', lines = [] }) {
  const body = h(
    'div',
    { class: 'stage-body' },
    lines.map((line) =>
      typeof line === 'string'
        ? h('div', { class: 'stage-line' }, line)
        : h('div', { class: 'stage-line' }, line.text, line.sub ? h('div', { class: 'stage-sub' }, line.sub) : null),
    ),
  )
  const stage = h(
    'div',
    { class: 'stage', role: 'dialog', 'aria-modal': 'true', 'aria-label': title || '結果', tabindex: '-1' },
    h('p', { class: 'stage-title' }, title),
    body,
    h('p', { class: 'stage-hint' }, 'タップで閉じる'),
  )

  function fit() {
    // 大きい文字から始め、はみ出さなくなるまで小さくする（二分探索）
    let lo = 16
    let hi = 280
    while (hi - lo > 2) {
      const mid = (lo + hi) / 2
      body.style.fontSize = `${mid}px`
      const overflow = body.scrollHeight > body.clientHeight + 1 || body.scrollWidth > body.clientWidth + 1
      if (overflow) hi = mid
      else lo = mid
    }
    body.style.fontSize = `${lo}px`
  }

  function close() {
    window.removeEventListener('resize', fit)
    document.removeEventListener('keydown', onKey)
    stage.remove()
    wakelock.release()
  }
  function onKey(e) {
    if (e.key === 'Escape') close()
  }

  stage.addEventListener('click', close)
  document.addEventListener('keydown', onKey)
  window.addEventListener('resize', fit)
  document.body.append(stage)
  wakelock.acquire()
  fit()
  stage.focus()
  return close
}
