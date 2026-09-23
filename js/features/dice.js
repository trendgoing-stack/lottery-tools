/**
 * サイコロ：個数 1〜10、面数 4/6/8/10/12/20/100/任意。
 * 6面は CSS の 3D キューブを回し、それ以外は数字を高速で切り替える演出。
 */
import { randRange, randFloat } from '../core/random.js'
import { load, save, clampInt } from '../core/store.js'
import { h, replace, groupBar, segmented, stepper, resultActions, toast, promptDialog } from '../core/ui.js'
import { runShow, isRunning } from '../core/show.js'
import { sfx } from '../core/sound.js'
import { showStage } from '../core/stage.js'
import { shareText } from '../core/share.js'

const KEY = 'dice'
const PRESETS = [4, 6, 8, 10, 12, 20, 100]
const HISTORY_MAX = 30
const HISTORY_SHOWN = 10
const ROLL_MS = 1100

// 3D キューブで、各目を正面に向けるための回転（面の配置は buildCube と対応）
const FACE_ROTATION = {
  1: [0, 0],
  2: [-90, 0],
  3: [0, -90],
  4: [0, 90],
  5: [90, 0],
  6: [0, 180],
}
// 3x3 のマス目のどこに目を打つか（0〜8）
const PIPS = {
  1: [4],
  2: [2, 6],
  3: [2, 4, 6],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
}

const raw = load(KEY, {})
const state = {
  count: clampInt(raw.count, 1, 10, 1),
  sides: clampInt(raw.sides, 2, 1000, 6),
  history: Array.isArray(raw.history) ? raw.history.filter((r) => Array.isArray(r?.values)).slice(0, HISTORY_MAX) : [],
  last: null,
}
if (raw.last && Array.isArray(raw.last.values)) state.last = raw.last

let el = {}
// キューブごとの累積回転（回すたびに足して、前の向きから続けて回す）
let spins = []

function persist() {
  save(KEY, { count: state.count, sides: state.sides, history: state.history, last: state.last })
}

export default {
  id: 'dice',
  title: 'サイコロ',
  init(view) {
    el.tray = h('button', { type: 'button', class: 'dice-tray', 'aria-label': 'サイコロを振る', onclick: roll, 'data-lock': true })
    el.total = h('div', { class: 'dice-total', 'aria-live': 'polite' })
    el.actions = h('div')
    el.history = h('div')
    el.sides = h('div', { class: 'sides-picker' })
    el.count = stepper({
      value: state.count,
      min: 1,
      max: 10,
      label: '個数',
      format: (v) => `${v}個`,
      onchange: (v) => {
        state.count = v
        state.last = null
        persist()
        renderTray()
      },
    })
    el.count.setAttribute('data-lock', '')

    view.append(
      h(
        'div',
        { class: 'view-inner' },
        groupBar(),
        h(
          'div',
          { class: 'card' },
          h('div', { class: 'row' }, h('div', { class: 'grow', style: { fontWeight: '700' } }, '個数'), el.count),
          h('div', { style: { fontWeight: '700', margin: '12px 0 8px' } }, '面数'),
          el.sides,
        ),
        h('div', { class: 'card dice-stage' }, el.tray, el.total, el.actions),
        h('button', { type: 'button', class: 'btn btn-primary btn-big', style: { marginTop: '12px' }, onclick: roll, 'data-lock': true }, 'サイコロを振る'),
        el.history,
      ),
    )
    renderSides()
    renderTray()
    renderHistory()
  },
}

function renderSides() {
  const isCustom = !PRESETS.includes(state.sides)
  replace(
    el.sides,
    segmented(
      PRESETS.map((n) => ({ value: n, label: String(n) })).concat({ value: 'custom', label: isCustom ? `${state.sides}` : '任意' }),
      isCustom ? 'custom' : state.sides,
      async (value) => {
        if (value === 'custom') {
          const input = await promptDialog({
            title: '面数を入力',
            message: '2〜1000 の数を入力してください',
            value: isCustom ? String(state.sides) : '',
            placeholder: '例：3',
            maxLength: 4,
          })
          const n = Number(String(input ?? '').replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)))
          if (input == null || !Number.isInteger(n) || n < 2 || n > 1000) {
            if (input != null) toast('2〜1000 の整数を入力してください')
            renderSides()
            return
          }
          state.sides = n
        } else {
          state.sides = value
        }
        state.last = null
        persist()
        renderSides()
        renderTray()
      },
      { 'data-lock': true, 'aria-label': '面数', class: 'segmented sides-segmented' },
    ),
  )
}

// ---------- 表示 ----------

function buildCube(value) {
  const faces = [
    ['front', 1],
    ['top', 2],
    ['right', 3],
    ['left', 4],
    ['bottom', 5],
    ['back', 6],
  ]
  const cube = h(
    'div',
    { class: 'cube' },
    faces.map(([pos, n]) =>
      h(
        'div',
        { class: `face face-${pos}${n === 1 ? ' face-one' : ''}` },
        Array.from({ length: 9 }, (_, i) => h('span', { class: PIPS[n].includes(i) ? 'pip' : '' })),
      ),
    ),
  )
  const [x, y] = FACE_ROTATION[value]
  cube.style.transform = `rotateX(${x}deg) rotateY(${y}deg) rotateZ(0deg)`
  return h('div', { class: 'die die-cube' }, cube)
}

function buildTile(value) {
  return h('div', { class: 'die die-tile' }, h('span', { class: 'die-num' }, value ?? '?'), h('span', { class: 'die-label' }, `d${state.sides}`))
}

function renderTray() {
  const values = state.last && state.last.sides === state.sides && state.last.values.length === state.count ? state.last.values : null
  const dice = []
  spins = []
  for (let i = 0; i < state.count; i++) {
    if (state.sides === 6) {
      const v = values ? values[i] : 1 + (i % 6)
      dice.push(buildCube(v))
      spins.push({ x: FACE_ROTATION[v][0], y: FACE_ROTATION[v][1], z: 0 })
    } else {
      dice.push(buildTile(values ? values[i] : null))
    }
  }
  el.tray.classList.toggle('is-many', state.count > 6)
  el.tray.classList.toggle('is-idle', !values)
  replace(el.tray, dice)
  renderTotal(values)
}

function renderTotal(values) {
  if (!values) {
    replace(el.total, h('span', { class: 'muted' }, 'タップして振る'))
    replace(el.actions)
    return
  }
  const sum = values.reduce((a, b) => a + b, 0)
  replace(
    el.total,
    values.length > 1 ? h('div', { class: 'dice-values' }, values.join(' + ')) : null,
    h('div', { class: 'dice-sum' }, values.length > 1 ? h('small', {}, '合計 ') : null, sum),
  )
  replace(
    el.actions,
    resultActions({
      onStage: () =>
        showStage({
          title: `サイコロ（${state.sides}面×${values.length}）`,
          lines: values.length > 1 ? [{ text: String(sum), sub: `合計（${values.join(' + ')}）` }] : [String(sum)],
        }),
      onShare: () => shareText(resultText(values)),
    }),
  )
}

function resultText(values) {
  const sum = values.reduce((a, b) => a + b, 0)
  return values.length > 1
    ? `🎲 サイコロ（${state.sides}面×${values.length}）\n${values.join(', ')}\n合計 ${sum}`
    : `🎲 サイコロ（${state.sides}面）\n${sum}`
}

function renderHistory() {
  if (state.history.length === 0) {
    replace(el.history)
    return
  }
  replace(
    el.history,
    h(
      'div',
      { class: 'row', style: { margin: '20px 4px 8px' } },
      h('div', { class: 'grow small muted', style: { fontWeight: '700' } }, '履歴'),
      h(
        'button',
        {
          type: 'button',
          class: 'btn btn-ghost',
          'data-lock': true,
          onclick: () => {
            state.history = []
            persist()
            renderHistory()
          },
        },
        '消去',
      ),
    ),
    h(
      'ol',
      { class: 'history-list' },
      state.history.slice(0, HISTORY_SHOWN).map((r) => {
        const sum = r.values.reduce((a, b) => a + b, 0)
        return h(
          'li',
          {},
          h('span', { class: 'history-meta' }, `${r.sides}面×${r.values.length}`),
          h('span', { class: 'history-values' }, r.values.join(', ')),
          r.values.length > 1 ? h('span', { class: 'history-sum' }, `計${sum}`) : null,
        )
      }),
    ),
  )
}

// ---------- 振る ----------

async function roll() {
  if (isRunning()) return
  // 先に結果を決めて、演出はそれに向かって止める
  const values = Array.from({ length: state.count }, () => randRange(1, state.sides))

  await runShow(async ({ skip, sleep }) => {
    el.tray.classList.remove('is-idle')
    renderTotal(null)
    replace(el.total, h('span', { class: 'muted' }, '…'))
    if (!skip) sfx.rattle()

    const diceEls = [...el.tray.children]
    if (state.sides === 6) {
      diceEls.forEach((die, i) => {
        const cube = die.firstChild
        const [fx, fy] = FACE_ROTATION[values[i]]
        const s = spins[i]
        // 今の向きから、少なくとも2〜3回転してから目的の面で止まる
        const nx = nextAngle(s.x, fx, 2 + Math.floor(randFloat() * 2))
        const ny = nextAngle(s.y, fy, 2 + Math.floor(randFloat() * 2))
        const nz = s.z + 360 * (randFloat() < 0.5 ? 1 : -1)
        spins[i] = { x: nx, y: ny, z: nz }
        cube.style.transition = skip ? 'none' : `transform ${ROLL_MS + i * 60}ms cubic-bezier(0.2, 0.7, 0.25, 1)`
        cube.style.transform = `rotateX(${nx}deg) rotateY(${ny}deg) rotateZ(${nz}deg)`
        if (!skip) {
          die.classList.remove('is-rolling')
          void die.offsetWidth
          die.classList.add('is-rolling')
        }
      })
      await sleep(ROLL_MS + state.count * 60)
    } else if (!skip) {
      // 数字を高速で切り替えて、だんだん遅くしてから止める
      diceEls.forEach((die) => die.classList.add('is-rolling'))
      const start = performance.now()
      let delay = 40
      while (performance.now() - start < ROLL_MS) {
        diceEls.forEach((die) => {
          die.querySelector('.die-num').textContent = randRange(1, state.sides)
        })
        sfx.tick()
        await sleep(delay)
        delay *= 1.12
      }
      diceEls.forEach((die) => die.classList.remove('is-rolling'))
    }
    diceEls.forEach((die, i) => {
      const num = die.querySelector('.die-num')
      if (num) num.textContent = values[i]
      die.classList.add('is-landed')
      setTimeout(() => die.classList.remove('is-landed', 'is-rolling'), 400)
    })
  })

  state.last = { sides: state.sides, values }
  state.history.unshift({ sides: state.sides, values, at: Date.now() })
  state.history = state.history.slice(0, HISTORY_MAX)
  persist()
  renderTotal(values)
  renderHistory()
  sfx.pop()
}

/** from から、target（0〜360 の向き）と同じ向きになる角度まで turns 回転以上進めた値 */
function nextAngle(from, target, turns) {
  const base = from + turns * 360
  const mod = (((base - target) % 360) + 360) % 360
  return base - mod + 360
}
