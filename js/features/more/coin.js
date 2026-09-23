/** コイントス：先に表裏を決めて、コインを回転させてからその面で止める。表裏の回数も数える。 */
import { coin as flip, randFloat } from '../../core/random.js'
import { load, save, clampInt } from '../../core/store.js'
import { h, replace, groupBar, resultActions } from '../../core/ui.js'
import { runShow, isRunning } from '../../core/show.js'
import { sfx } from '../../core/sound.js'
import { showStage } from '../../core/stage.js'
import { shareText } from '../../core/share.js'

const KEY = 'coin'
const HISTORY_MAX = 30
const FLIP_MS = 1600

const raw = load(KEY, {})
const state = {
  heads: clampInt(raw.heads, 0, 1e9, 0),
  tails: clampInt(raw.tails, 0, 1e9, 0),
  history: Array.isArray(raw.history) ? raw.history.filter((x) => typeof x === 'boolean').slice(0, HISTORY_MAX) : [],
}

let el = {}
let angle = 0 // コインの累積回転（度）

function persist() {
  save(KEY, state)
}

export default {
  id: 'coin',
  title: 'コイントス',
  init(page) {
    el.coin = h('div', { class: 'coin' }, h('div', { class: 'coin-face coin-heads' }, '表'), h('div', { class: 'coin-face coin-tails' }, '裏'))
    el.result = h('div', { class: 'coin-result', 'aria-live': 'polite' })
    el.actions = h('div')
    el.stats = h('div')
    page.append(
      groupBar(),
      h('div', { class: 'card coin-stage' }, h('button', { type: 'button', class: 'coin-button', 'aria-label': 'コインを投げる', 'data-lock': true, onclick: toss }, el.coin), el.result, el.actions),
      h('button', { type: 'button', class: 'btn btn-primary btn-big', style: { marginTop: '12px' }, 'data-lock': true, onclick: toss }, 'コインを投げる'),
      el.stats,
    )
    if (state.history.length) {
      angle = state.history[0] ? 0 : 180
      el.coin.style.transform = `rotateX(${angle}deg)`
    }
    replace(el.result, h('span', { class: 'muted' }, 'タップして投げる'))
    renderStats()
  },
}

async function toss() {
  if (isRunning()) return
  const heads = flip()
  replace(el.result, h('span', { class: 'muted' }, '…'))
  replace(el.actions)

  await runShow(async ({ skip, sleep }) => {
    // 5〜7回転してから、表なら 0°、裏なら 180° の向きで止まる
    const turns = 5 + Math.floor(randFloat() * 3)
    const base = Math.ceil(angle / 360) * 360 + turns * 360
    angle = base + (heads ? 0 : 180)
    el.coin.style.transition = skip ? 'none' : `transform ${FLIP_MS}ms cubic-bezier(0.15, 0.6, 0.3, 1)`
    el.coin.style.transform = `rotateX(${angle}deg)`
    if (!skip) {
      sfx.coin()
      el.coin.parentElement.classList.remove('is-tossing')
      void el.coin.offsetWidth
      el.coin.parentElement.classList.add('is-tossing')
      await sleep(FLIP_MS)
      el.coin.parentElement.classList.remove('is-tossing')
    }
  })

  if (heads) state.heads++
  else state.tails++
  state.history.unshift(heads)
  state.history = state.history.slice(0, HISTORY_MAX)
  persist()
  const label = heads ? '表' : '裏'
  replace(el.result, h('span', { class: `coin-label ${heads ? 'is-heads' : 'is-tails'}` }, label))
  replace(
    el.actions,
    resultActions({
      onStage: () => showStage({ title: 'コイントス', lines: [label] }),
      onShare: () => shareText(`🪙 コイントス：${label}（これまで 表${state.heads}回・裏${state.tails}回）`),
    }),
  )
  renderStats()
  sfx.pop()
}

function renderStats() {
  const total = state.heads + state.tails
  replace(
    el.stats,
    h(
      'div',
      { class: 'card coin-stats', style: { marginTop: '12px' } },
      h(
        'div',
        { class: 'coin-counts' },
        h('div', {}, h('div', { class: 'small muted' }, '表'), h('div', { class: 'coin-count' }, state.heads)),
        h('div', {}, h('div', { class: 'small muted' }, '裏'), h('div', { class: 'coin-count' }, state.tails)),
        h('div', {}, h('div', { class: 'small muted' }, '表の割合'), h('div', { class: 'coin-count' }, total ? `${Math.round((state.heads / total) * 100)}%` : '−')),
      ),
      state.history.length ? h('div', { class: 'coin-history', 'aria-label': '最近の結果（左が新しい）' }, state.history.map((x) => h('span', { class: x ? 'is-heads' : 'is-tails' }, x ? '表' : '裏'))) : null,
      total
        ? h(
            'button',
            {
              type: 'button',
              class: 'btn btn-ghost btn-block',
              'data-lock': true,
              onclick: () => {
                state.heads = 0
                state.tails = 0
                state.history = []
                persist()
                renderStats()
              },
            },
            '回数をリセット',
          )
        : null,
    ),
  )
}
