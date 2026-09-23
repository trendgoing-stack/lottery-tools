/**
 * ルーレット：項目ごとに重み（1〜10）を付け、重みに比例した扇形を Canvas に描く。
 *
 * タップした時点で乱数で当たりを決め、その扇形の中の一点が針の位置で止まるように
 * 回転量を逆算して、イージングで減速させる（演出は結果に影響しない）。
 */
import { weightedIndex, randFloat } from '../core/random.js'
import { load, save, uid, cleanText, clampInt } from '../core/store.js'
import { h, replace, iconButton, PALETTE, groupBar, loadMembersButton, switchRow, stepper, resultActions, toast, openSheet, promptDialog, menuSheet, confirmDialog } from '../core/ui.js'
import { runShow, isRunning, animate } from '../core/show.js'
import { sfx } from '../core/sound.js'
import { showStage } from '../core/stage.js'
import { shareText } from '../core/share.js'

const KEY = 'roulette'
const LABEL_MAX = 20
const ITEMS_MAX = 60
const SPIN_MS = 4600
const TAU = Math.PI * 2

const DEFAULT_ITEMS = ['ラーメン', 'カレー', 'お寿司', '焼肉', 'パスタ', '定食']

function newItem(label, weight = 1) {
  return { id: uid('r'), label: cleanText(label, LABEL_MAX), weight: clampInt(weight, 1, 10, 1), excluded: false }
}

function normalizeItems(list) {
  return (Array.isArray(list) ? list : [])
    .filter((i) => i && cleanText(i.label, LABEL_MAX))
    .slice(0, ITEMS_MAX)
    .map((i) => ({ ...newItem(i.label, i.weight), id: typeof i.id === 'string' ? i.id : uid('r'), excluded: i.excluded === true }))
}

const raw = load(KEY, null)
const state = {
  items: raw ? normalizeItems(raw.items) : DEFAULT_ITEMS.map((l) => newItem(l)),
  excludeWinner: raw?.excludeWinner === true,
  sets: Array.isArray(raw?.sets)
    ? raw.sets.filter((s) => s && typeof s.name === 'string').map((s) => ({ id: s.id || uid('s'), name: cleanText(s.name, 20), items: normalizeItems(s.items) }))
    : [],
  rotation: Number.isFinite(raw?.rotation) ? raw.rotation % TAU : 0,
  winnerId: null, // 直前の当たり（除外 ON でも、次に回すまでは円盤に残す）
}

let el = {}

function persist() {
  save(KEY, {
    items: state.items,
    excludeWinner: state.excludeWinner,
    sets: state.sets.map((s) => ({ id: s.id, name: s.name, items: s.items.map(({ label, weight }) => ({ label, weight })) })),
    rotation: state.rotation,
  })
}

/** 円盤に載せる項目 */
function wheelItems() {
  return state.items.filter((i) => !i.excluded || i.id === state.winnerId)
}

export default {
  id: 'roulette',
  title: 'ルーレット',
  init(view) {
    el.canvas = h('canvas', { class: 'wheel-canvas', role: 'img', 'aria-label': 'ルーレットの円盤' })
    el.wheel = h(
      'div',
      { class: 'wheel' },
      el.canvas,
      h('div', { class: 'wheel-pointer', 'aria-hidden': 'true' }),
      h('button', { type: 'button', class: 'wheel-hub', onclick: spin, 'data-lock': true }, 'START'),
    )
    el.result = h('div', { class: 'wheel-result', 'aria-live': 'polite' })
    el.items = h('div')
    el.spinButton = h('button', { type: 'button', class: 'btn btn-primary btn-big', onclick: spin, 'data-lock': true }, 'ルーレットを回す')

    view.append(
      h(
        'div',
        { class: 'view-inner' },
        groupBar(),
        h('div', { class: 'card wheel-card' }, el.wheel, el.result),
        h('div', { style: { marginTop: '12px' } }, el.spinButton),
        h(
          'div',
          { class: 'card', style: { marginTop: '12px' } },
          switchRow('当たった項目を次回から除外', state.excludeWinner, (on) => {
            state.excludeWinner = on
            persist()
          }),
        ),
        el.items,
      ),
    )
    window.addEventListener('resize', () => draw())
    renderItems()
    renderResult(null)
  },
  show() {
    // 非表示のあいだは大きさが取れないので、表示されたときに描き直す
    draw()
  },
}

// ---------- 円盤 ----------

function sectors() {
  const items = wheelItems()
  const total = items.reduce((s, i) => s + i.weight, 0)
  let start = 0
  return items.map((item, index) => {
    const size = (item.weight / total) * TAU
    const sector = { item, start, end: start + size, color: colorFor(index, items.length) }
    start += size
    return sector
  })
}

function colorFor(index, count) {
  let c = index % PALETTE.length
  // 最後と最初が同じ色で隣り合わないようにする
  if (index === count - 1 && count > 1 && c === 0) c = 1 + (index % (PALETTE.length - 1))
  return PALETTE[c]
}

function draw(rotation = state.rotation) {
  const canvas = el.canvas
  const size = el.wheel.clientWidth
  if (!size) return
  const dpr = Math.min(window.devicePixelRatio || 1, 3)
  if (canvas.width !== Math.round(size * dpr)) {
    canvas.width = Math.round(size * dpr)
    canvas.height = Math.round(size * dpr)
  }
  const ctx = canvas.getContext('2d')
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, size, size)
  const c = size / 2
  const r = c - 6
  const list = sectors()
  const dark = window.matchMedia('(prefers-color-scheme: dark)').matches

  if (list.length === 0) {
    ctx.beginPath()
    ctx.arc(c, c, r, 0, TAU)
    ctx.fillStyle = dark ? '#272733' : '#ececf3'
    ctx.fill()
    ctx.fillStyle = dark ? '#9c9cad' : '#6b6b7b'
    ctx.font = '600 16px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('項目を追加してください', c, c + r * 0.55)
    return
  }

  ctx.save()
  ctx.translate(c, c)
  // 円盤上の角度 a（真上から時計回り）は、画面上では a + rotation - 90° に来る
  ctx.rotate(rotation - Math.PI / 2)
  for (const s of list) {
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.arc(0, 0, r, s.start, s.end)
    ctx.closePath()
    ctx.fillStyle = s.color
    ctx.fill()
    if (s.item.id === state.winnerId) {
      ctx.fillStyle = 'rgba(255,255,255,0.28)'
      ctx.fill()
    }
    if (list.length > 1) {
      ctx.strokeStyle = 'rgba(255,255,255,0.85)'
      ctx.lineWidth = 2
      ctx.stroke()
    }
  }
  // ラベル（中心から外へ向けて書く）
  ctx.fillStyle = '#fff'
  ctx.textAlign = 'right'
  ctx.textBaseline = 'middle'
  for (const s of list) {
    const angle = s.end - s.start
    const arcAtLabel = angle * r * 0.62
    if (arcAtLabel < 11) continue
    const fontSize = Math.max(11, Math.min(20, arcAtLabel * 0.55, r * 0.11))
    ctx.save()
    ctx.rotate(s.start + angle / 2)
    ctx.font = `700 ${fontSize}px -apple-system, "Hiragino Sans", sans-serif`
    ctx.shadowColor = 'rgba(0,0,0,0.35)'
    ctx.shadowBlur = 3
    ctx.fillText(fitText(ctx, s.item.label, r * 0.6), r - 14, 0)
    ctx.restore()
  }
  ctx.restore()

  // 外周
  ctx.beginPath()
  ctx.arc(c, c, r, 0, TAU)
  ctx.lineWidth = 5
  ctx.strokeStyle = dark ? '#33333f' : '#ffffff'
  ctx.stroke()
}

function fitText(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text
  let t = text
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxWidth) t = t.slice(0, -1)
  return `${t}…`
}

/** 回転 rotation のとき、針（真上）が指している円盤上の角度 */
function pointerAngle(rotation) {
  return (((-rotation) % TAU) + TAU) % TAU
}

// ---------- 回す ----------

async function spin() {
  if (isRunning()) return
  // 除外 ON のとき、前回の当たりはここで円盤から外す
  if (state.winnerId) {
    state.winnerId = null
    draw()
    renderItems()
  }
  const list = sectors()
  if (list.length === 0) {
    toast(state.items.length ? 'すべての項目が除外されています。「除外をリセット」で戻せます' : '項目を追加してください', { duration: 3000 })
    return
  }

  // 1. 先に当たりを決める（重みに比例）
  const index = weightedIndex(list.map((s) => s.item.weight))
  const target = list[index]
  // 2. 扇形の中の止まる位置（端すぎると、どちらに止まったか見分けにくいので避ける）
  const within = 0.12 + randFloat() * 0.76
  const targetAngle = target.start + (target.end - target.start) * within
  // 3. 針がその角度を指す回転量を逆算する（最低5回転）
  const from = state.rotation
  const delta = ((((-targetAngle - from) % TAU) + TAU) % TAU) + TAU * (5 + Math.floor(randFloat() * 2))
  const to = from + delta

  renderResult(null)
  replace(el.result, h('div', { class: 'wheel-result-label muted' }, '…'))

  await runShow(async ({ skip }) => {
    if (skip) {
      draw(to)
      return
    }
    let lastSector = -1
    await animate(SPIN_MS, (t) => {
      // 最初は速く、最後はゆっくり止まる
      const rotation = from + delta * (1 - (1 - t) ** 4)
      draw(rotation)
      const a = pointerAngle(rotation)
      const current = list.findIndex((s) => a >= s.start && a < s.end)
      if (current !== lastSector) {
        if (lastSector !== -1) sfx.tick()
        lastSector = current
      }
    })
  })

  state.rotation = to % TAU
  state.winnerId = target.item.id
  if (state.excludeWinner) target.item.excluded = true
  persist()
  draw()
  renderResult(target.item)
  renderItems()
  sfx.win()
}

function renderResult(item) {
  if (!item) {
    replace(el.result, h('div', { class: 'wheel-result-label muted' }, 'START を押すと回ります'))
    return
  }
  replace(
    el.result,
    h('div', { class: 'wheel-result-label' }, item.label),
    resultActions({
      onStage: () => showStage({ title: 'ルーレット', lines: [item.label] }),
      onShare: () => shareText(`🎯 ルーレットの結果\n${item.label}`),
    }),
  )
}

// ---------- 項目の編集 ----------

function renderItems() {
  const excludedCount = state.items.filter((i) => i.excluded).length
  replace(
    el.items,
    h(
      'div',
      { class: 'row', style: { margin: '20px 4px 8px' } },
      h('div', { class: 'grow small muted', style: { fontWeight: '700' } }, `項目（${state.items.length}）`),
      iconButton('save', '項目セットを保存', saveSet, { 'data-lock': true, class: 'btn btn-icon btn-ghost' }),
      iconButton('folder', '項目セットを呼び出す', openSets, { 'data-lock': true, class: 'btn btn-icon btn-ghost' }),
    ),
    h(
      'div',
      { class: 'card roulette-items', 'data-lock': true },
      h('div', { class: 'btn-row' }, loadMembersButton(loadMembers)),
      excludedCount
        ? h(
            'div',
            { class: 'row excluded-note' },
            h('span', { class: 'grow small' }, `除外中：${excludedCount}件`),
            h(
              'button',
              {
                type: 'button',
                class: 'btn btn-ghost',
                onclick: () => {
                  state.items.forEach((i) => (i.excluded = false))
                  state.winnerId = null
                  persist()
                  renderItems()
                  draw()
                },
              },
              '除外をリセット',
            ),
          )
        : null,
      state.items.length
        ? h(
            'ul',
            { class: 'item-list' },
            state.items.map((item) => itemRow(item)),
          )
        : h('div', { class: 'empty' }, '項目がありません'),
      h(
        'form',
        {
          class: 'row',
          style: { marginTop: '12px' },
          onsubmit: (e) => {
            e.preventDefault()
            const input = e.target.elements.label
            const label = cleanText(input.value, LABEL_MAX)
            if (!label) return
            if (state.items.length >= ITEMS_MAX) {
              toast(`項目は${ITEMS_MAX}個までです`)
              return
            }
            state.items.push(newItem(label))
            changed()
            el.items.querySelector('form input')?.focus()
          },
        },
        h('input', { class: 'input grow', name: 'label', type: 'text', placeholder: '項目を追加', maxLength: LABEL_MAX, autocomplete: 'off', enterkeyhint: 'enter', 'aria-label': '追加する項目' }),
        h('button', { type: 'submit', class: 'btn btn-primary' }, '追加'),
      ),
      state.items.length
        ? h(
            'button',
            {
              type: 'button',
              class: 'btn btn-ghost btn-block',
              style: { marginTop: '8px', color: 'var(--danger)' },
              onclick: async () => {
                if (await confirmDialog({ title: '項目をすべて削除しますか？', ok: '削除', danger: true })) {
                  state.items = []
                  changed()
                }
              },
            },
            'すべて削除',
          )
        : null,
    ),
  )
}

function itemRow(item) {
  const color = sectors().find((s) => s.item.id === item.id)?.color
  return h(
    'li',
    { class: `item-row${item.excluded ? ' is-excluded' : ''}` },
    h('span', { class: 'item-swatch', style: { background: item.excluded && item.id !== state.winnerId ? 'transparent' : color } }),
    h('input', {
      class: 'item-label',
      type: 'text',
      value: item.label,
      maxLength: LABEL_MAX,
      'aria-label': '項目名',
      oninput: (e) => {
        const label = cleanText(e.target.value, LABEL_MAX)
        if (label) {
          item.label = label
          draw()
        }
      },
      onchange: (e) => {
        if (!cleanText(e.target.value, LABEL_MAX)) e.target.value = item.label
        persist()
      },
    }),
    item.excluded
      ? h(
          'button',
          {
            type: 'button',
            class: 'btn btn-ghost item-restore',
            onclick: () => {
              item.excluded = false
              if (state.winnerId === item.id) state.winnerId = null
              changed()
            },
          },
          '戻す',
        )
      : stepper({
          value: item.weight,
          min: 1,
          max: 10,
          label: `${item.label}の重み`,
          format: (v) => `×${v}`,
          onchange: (v) => {
            item.weight = v
            persist()
            draw()
          },
        }),
    iconButton('close', `${item.label}を削除`, () => {
      state.items = state.items.filter((i) => i !== item)
      changed()
    }),
  )
}

function changed() {
  state.winnerId = null
  persist()
  renderItems()
  renderResult(null)
  draw()
}

async function loadMembers(names) {
  let mode = 'replace'
  if (state.items.length) {
    mode = await menuSheet('参加メンバーを読み込む', [
      { value: 'replace', label: `今の項目と置き換える（${names.length}人）` },
      { value: 'append', label: '今の項目の後ろに追加する' },
    ])
    if (!mode) return
  }
  const items = names.map((n) => newItem(n))
  state.items = mode === 'replace' ? items : state.items.concat(items).slice(0, ITEMS_MAX)
  changed()
  toast(`${names.length}人を読み込みました`)
}

// ---------- 項目セット ----------

async function saveSet() {
  if (state.items.length === 0) {
    toast('保存する項目がありません')
    return
  }
  const name = await promptDialog({ title: '項目セットを保存', message: '今の項目と重みを名前を付けて保存します', value: '', placeholder: '例：ランチ候補', ok: '保存', maxLength: 20 })
  const clean = cleanText(name, 20)
  if (!clean) return
  const items = state.items.map((i) => ({ label: i.label, weight: i.weight }))
  const existing = state.sets.find((s) => s.name === clean)
  if (existing) {
    if (!(await confirmDialog({ title: `「${clean}」を上書きしますか？`, ok: '上書き' }))) return
    existing.items = normalizeItems(items)
  } else {
    state.sets.push({ id: uid('s'), name: clean, items: normalizeItems(items) })
  }
  persist()
  toast(`「${clean}」を保存しました`)
}

function openSets() {
  openSheet('項目セット', (body, close) => {
    function render() {
      if (state.sets.length === 0) {
        replace(body, h('div', { class: 'empty' }, '保存した項目セットはありません', h('div', { class: 'small' }, 'フロッピーのボタンで、今の項目を保存できます')))
        return
      }
      replace(
        body,
        h(
          'ul',
          { class: 'list' },
          state.sets.map((set) =>
            h(
              'li',
              { class: 'row', style: { gap: '0' } },
              h(
                'button',
                {
                  type: 'button',
                  class: 'list-btn grow',
                  onclick: () => {
                    state.items = set.items.map((i) => newItem(i.label, i.weight))
                    changed()
                    close()
                    toast(`「${set.name}」を呼び出しました`)
                  },
                },
                h('span', { class: 'grow' }, set.name),
                h('span', { class: 'small muted' }, `${set.items.length}項目`),
              ),
              iconButton('trash', `${set.name}を削除`, async () => {
                if (!(await confirmDialog({ title: `「${set.name}」を削除しますか？`, ok: '削除', danger: true }))) return
                state.sets = state.sets.filter((s) => s !== set)
                persist()
                render()
              }, { class: 'btn btn-icon btn-ghost' }),
            ),
          ),
        ),
      )
    }
    render()
  })
}
