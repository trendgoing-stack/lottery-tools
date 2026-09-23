/**
 * くじ引き：当たりの本数を決めて、参加メンバーが1人ずつタップして引く。引いた人はもう引けない。
 * 引くたびに、残っているくじから1本を等確率で選ぶ（先に並びを決めておくのと同じ確率）。
 */
import { randInt } from '../../core/random.js'
import { load, save, clampInt, cleanText } from '../../core/store.js'
import * as members from '../../core/members.js'
import { h, replace, groupBar, stepper, resultActions, toast, confirmDialog } from '../../core/ui.js'
import { runShow, isRunning } from '../../core/show.js'
import { sfx } from '../../core/sound.js'
import { showStage } from '../../core/stage.js'
import { shareText } from '../../core/share.js'

const KEY = 'lots'
const raw = load(KEY, {})
const state = {
  prizes: clampInt(raw.prizes, 1, 99, 1),
  label: cleanText(raw.label, 12) || '当たり',
  // { names: [...], remaining: { prize, blank }, drawn: { [name]: true/false（当たりか） }, order: [...] }
  game: raw.game && Array.isArray(raw.game.names) && raw.game.remaining ? raw.game : null,
}

let el = {}

function persist() {
  save(KEY, state)
}

export default {
  id: 'lots',
  title: 'くじ引き',
  init(page) {
    el.body = h('div')
    page.append(groupBar(), el.body)
    members.onChange(() => {
      if (!state.game) renderSetup()
    })
    state.game ? renderGame() : renderSetup()
  },
}

function renderSetup() {
  const n = members.activeMembers().length
  replace(
    el.body,
    h(
      'div',
      { class: 'card' },
      h(
        'div',
        { class: 'row' },
        h('div', { class: 'grow', style: { fontWeight: '700' } }, '当たりの本数'),
        stepper({
          value: Math.min(state.prizes, Math.max(1, n - 1)),
          min: 1,
          max: Math.max(1, n - 1),
          label: '当たりの本数',
          format: (v) => `${v}本`,
          onchange: (v) => {
            state.prizes = v
            persist()
          },
        }),
      ),
      h(
        'label',
        { class: 'row', style: { marginTop: '12px' } },
        h('span', { class: 'grow', style: { fontWeight: '700' } }, '当たりの名前'),
        h('input', {
          class: 'input',
          style: { width: '10em' },
          type: 'text',
          value: state.label,
          maxLength: 12,
          placeholder: '当たり',
          oninput: (e) => {
            state.label = cleanText(e.target.value, 12) || '当たり'
            persist()
          },
        }),
      ),
      h('p', { class: 'small muted', style: { margin: '12px 4px 0' } }, n >= 2 ? `参加メンバー ${n}人分のくじ（全部で${n}本）を用意します` : '参加メンバーが2人以上必要です'),
    ),
    h('button', { type: 'button', class: 'btn btn-primary btn-big', style: { marginTop: '12px' }, disabled: n < 2, onclick: prepare }, 'くじを用意する'),
  )
}

function prepare() {
  const names = members.activeMembers().map((m) => m.name)
  if (names.length < 2) {
    toast('参加メンバーが2人以上必要です')
    return
  }
  const prizes = Math.min(state.prizes, names.length - 1)
  state.game = { names, label: state.label, remaining: { prize: prizes, blank: names.length - prizes }, drawn: {}, order: [] }
  persist()
  renderGame()
  sfx.pop()
}

function renderGame() {
  const game = state.game
  const left = game.remaining.prize + game.remaining.blank
  const finished = left === 0
  replace(
    el.body,
    h(
      'div',
      { class: 'card lots-status' },
      finished
        ? h('div', { style: { fontWeight: '800' } }, 'くじ引き終了')
        : h('div', {}, '残り ', h('b', {}, `${left}本`), `（${game.label} `, h('b', { class: 'lots-prize-count' }, `${game.remaining.prize}本`), '）'),
      h('div', { class: 'small muted' }, finished ? '結果は下にまとめています' : '自分の名前をタップしてくじを引いてください'),
    ),
    h(
      'div',
      { class: 'lots-grid' },
      game.names.map((name) => {
        const done = name in game.drawn
        const won = game.drawn[name]
        return h(
          'button',
          {
            type: 'button',
            class: `lot${done ? (won ? ' is-prize' : ' is-blank') : ''}`,
            disabled: done,
            'data-lock': true,
            'aria-label': done ? `${name}：${won ? game.label : 'ハズレ'}` : `${name}がくじを引く`,
            onclick: (e) => draw(name, e.currentTarget),
          },
          h('span', { class: 'lot-inner' }, h('span', { class: 'lot-front' }, h('span', { class: 'lot-name' }, name), h('span', { class: 'lot-hint' }, 'タップで引く')), h('span', { class: 'lot-back' }, h('span', { class: 'lot-name' }, name), h('span', { class: 'lot-result' }, done ? (won ? game.label : 'ハズレ') : ''))),
        )
      }),
    ),
    game.order.length ? summary() : null,
    h(
      'div',
      { class: 'btn-row', style: { marginTop: '12px' } },
      h(
        'button',
        {
          type: 'button',
          class: 'btn',
          'data-lock': true,
          onclick: async () => {
            if (!finished && game.order.length && !(await confirmDialog({ title: 'くじ引きをやめますか？', message: '途中の結果は消えます。', ok: 'やめる' }))) return
            state.game = null
            persist()
            renderSetup()
          },
        },
        finished ? 'もう一度' : '最初からやり直す',
      ),
    ),
  )
}

function summary() {
  const game = state.game
  const winners = game.order.filter((name) => game.drawn[name])
  const text = `🎟️ くじ引きの結果\n${game.label}：${winners.length ? winners.join('、') : 'まだいません'}\n（${game.order.length}/${game.names.length}人が引きました）`
  return h(
    'div',
    { class: 'card', style: { marginTop: '12px' } },
    h('div', { class: 'small muted' }, `${game.label}を引いた人`),
    h('div', { class: 'lots-winners' }, winners.length ? winners.join('、') : 'まだいません'),
    resultActions({
      onStage: winners.length ? () => showStage({ title: 'くじ引き', lines: [{ text: winners.join('・'), sub: game.label }] }) : null,
      onShare: () => shareText(text),
    }),
  )
}

async function draw(name, button) {
  const game = state.game
  if (isRunning() || name in game.drawn) return
  const left = game.remaining.prize + game.remaining.blank
  if (left === 0) return
  // 残りのくじから1本を等確率で引く
  const won = randInt(left) < game.remaining.prize
  if (won) game.remaining.prize--
  else game.remaining.blank--
  game.drawn[name] = won
  game.order.push(name)
  persist()

  await runShow(async ({ skip, sleep }) => {
    if (skip) return
    button.classList.add('is-shaking')
    sfx.drumroll(0.8)
    await sleep(850)
    button.classList.remove('is-shaking')
    button.classList.add(won ? 'is-prize' : 'is-blank', 'is-flipping')
    button.querySelector('.lot-result').textContent = won ? game.label : 'ハズレ'
    await sleep(600)
  })
  won ? sfx.win() : sfx.lose()
  renderGame()
  if (game.remaining.prize + game.remaining.blank === 0) toast('全員が引き終わりました')
}
