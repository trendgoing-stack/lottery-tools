/**
 * あみだくじ：縦線は参加人数（または手動指定）、下端に結果を入力。
 *
 * 横線は段ごとにランダムに引き、隣り合う横線が同じ段に並ばない（＝同じ高さで重ならない）ようにする。
 * 結果の並びは生成時にシャッフルして、どの線を選んでも有利・不利が出にくいようにする。
 * 生成直後は結果を隠し、名前をタップするとその線をたどるアニメーションで結果を見せる。
 */
import { randInt, randFloat, shuffle } from '../core/random.js'
import { load, save, cleanText, clampInt } from '../core/store.js'
import * as members from '../core/members.js'
import { h, replace, PALETTE, groupBar, segmented, stepper, resultActions, toast, confirmDialog } from '../core/ui.js'
import { runShow, isRunning, animate, easeInOutCubic } from '../core/show.js'
import { sfx } from '../core/sound.js'
import { showStage } from '../core/stage.js'
import { shareText } from '../core/share.js'

const KEY = 'amida'
const SVG_NS = 'http://www.w3.org/2000/svg'
const MIN_LINES = 2
const MAX_LINES = 20
const LABEL_MAX = 20
const COL_MIN = 64 // 1列の最小幅（px）。これより狭くなる人数では横スクロール
const ROW_H = 26
const PAD_Y = 10
const TRACE_MS = 1800

const raw = load(KEY, {})
const state = {
  mode: raw.mode === 'manual' ? 'manual' : 'members',
  manualCount: clampInt(raw.manualCount, MIN_LINES, MAX_LINES, 4),
  // 結果の入力（縦線の数に合わせて足りない分は空欄）
  results: Array.isArray(raw.results) ? raw.results.map((r) => cleanText(r, LABEL_MAX)).slice(0, MAX_LINES) : ['当たり'],
  // 生成済みのくじ（アプリを閉じても続きから）
  game: validGame(raw.game) ? raw.game : null,
}

function validGame(g) {
  return (
    g &&
    Array.isArray(g.names) &&
    Array.isArray(g.bottoms) &&
    Array.isArray(g.rungs) &&
    Array.isArray(g.revealed) &&
    g.names.length >= MIN_LINES &&
    g.names.length === g.bottoms.length &&
    Number.isInteger(g.rows)
  )
}

let el = {}

function persist() {
  save(KEY, { mode: state.mode, manualCount: state.manualCount, results: state.results, game: state.game })
}

export default {
  id: 'amida',
  title: 'あみだくじ',
  init(view) {
    el.body = h('div')
    view.append(h('div', { class: 'view-inner' }, groupBar(), el.body))
    members.onChange(() => {
      if (!state.game && state.mode === 'members') renderSetup()
    })
    render()
  },
  show() {
    if (state.game) layoutBoard()
  },
}

function render() {
  if (state.game) renderGame()
  else renderSetup()
}

// ---------- 設定 ----------

function lineNames() {
  if (state.mode === 'members') return members.activeMembers().map((m) => m.name)
  return Array.from({ length: state.manualCount }, (_, i) => `${i + 1}`)
}

function renderSetup() {
  const names = lineNames()
  const count = Math.min(MAX_LINES, names.length)
  while (state.results.length < count) state.results.push('')

  const resultInputs = Array.from({ length: count }, (_, i) =>
    h(
      'li',
      { class: 'result-input-row' },
      h('span', { class: 'result-index' }, i + 1),
      h('input', {
        class: 'input',
        type: 'text',
        value: state.results[i] ?? '',
        placeholder: 'ハズレ',
        maxLength: LABEL_MAX,
        'aria-label': `結果${i + 1}`,
        oninput: (e) => {
          state.results[i] = cleanText(e.target.value, LABEL_MAX)
          persist()
        },
      }),
    ),
  )

  let prizeCount = Math.max(1, Math.min(count - 1, state.results.slice(0, count).filter((r) => r === '当たり').length || 1))

  replace(
    el.body,
    h(
      'div',
      { class: 'card' },
      h('div', { style: { fontWeight: '700', marginBottom: '8px' } }, '縦線の数'),
      segmented(
        [
          { value: 'members', label: '参加メンバー' },
          { value: 'manual', label: '本数を指定' },
        ],
        state.mode,
        (v) => {
          state.mode = v
          persist()
          renderSetup()
        },
      ),
      state.mode === 'members'
        ? h(
            'p',
            { class: 'small muted', style: { margin: '10px 4px 0' } },
            names.length >= MIN_LINES
              ? `参加メンバー ${names.length}人：${names.join('、')}`
              : '参加メンバーが2人以上必要です。上のグループ表示から参加を切り替えられます。',
            names.length > MAX_LINES ? `（最大${MAX_LINES}人まで）` : null,
          )
        : h(
            'div',
            { class: 'row', style: { marginTop: '12px' } },
            h('div', { class: 'grow' }, '本数'),
            stepper({
              value: state.manualCount,
              min: MIN_LINES,
              max: MAX_LINES,
              label: '本数',
              format: (v) => `${v}本`,
              onchange: (v) => {
                state.manualCount = v
                persist()
                renderSetup()
              },
            }),
          ),
    ),
    h(
      'div',
      { class: 'card' },
      h('div', { style: { fontWeight: '700' } }, '下の結果'),
      h('p', { class: 'small muted', style: { margin: '2px 0 10px' } }, '空欄は「ハズレ」になります。並びはくじを作るときにシャッフルされます。'),
      count >= MIN_LINES
        ? [
            h(
              'div',
              { class: 'row', style: { flexWrap: 'wrap', marginBottom: '10px' } },
              h('span', { class: 'small' }, '当たり'),
              stepper({
                value: prizeCount,
                min: 1,
                max: count - 1,
                label: '当たりの数',
                format: (v) => `${v}本`,
                onchange: (v) => {
                  prizeCount = v
                },
              }),
              h(
                'button',
                {
                  type: 'button',
                  class: 'btn btn-soft',
                  onclick: () => {
                    state.results = Array.from({ length: count }, (_, i) => (i < prizeCount ? '当たり' : 'ハズレ'))
                    persist()
                    renderSetup()
                  },
                },
                '入れる',
              ),
            ),
            h(
              'div',
              { class: 'btn-row', style: { marginBottom: '10px' } },
              h(
                'button',
                {
                  type: 'button',
                  class: 'btn',
                  onclick: () => {
                    state.results = Array.from({ length: count }, (_, i) => `${i + 1}位`)
                    persist()
                    renderSetup()
                  },
                },
                '順位を入れる',
              ),
              h(
                'button',
                {
                  type: 'button',
                  class: 'btn',
                  onclick: () => {
                    state.results = []
                    persist()
                    renderSetup()
                  },
                },
                '空にする',
              ),
            ),
            h('ol', { class: 'result-inputs' }, resultInputs),
          ]
        : h('div', { class: 'empty' }, '縦線が2本以上になると入力できます'),
    ),
    h(
      'button',
      { type: 'button', class: 'btn btn-primary btn-big', style: { marginTop: '12px' }, disabled: count < MIN_LINES, onclick: () => createGame() },
      'あみだくじを作る',
    ),
  )
}

// ---------- くじを作る ----------

/**
 * 横線をランダムに引く。
 * 段ごとに左から見て、左隣に横線がある場所には引かない（同じ高さで横線がつながらないように）。
 * どの隣り合う2本の間にも、最低2本は横線が入るように補う。
 */
function generateRungs(lines, rows) {
  const grid = Array.from({ length: rows }, () => new Array(lines - 1).fill(false))
  for (let r = 0; r < rows; r++) {
    for (let g = 0; g < lines - 1; g++) {
      if (g > 0 && grid[r][g - 1]) continue
      grid[r][g] = randInt(100) < 42
    }
  }
  for (let g = 0; g < lines - 1; g++) {
    let count = grid.reduce((n, row) => n + (row[g] ? 1 : 0), 0)
    const candidates = shuffle(Array.from({ length: rows }, (_, r) => r))
    for (const r of candidates) {
      if (count >= 2) break
      if (grid[r][g] || (g > 0 && grid[r][g - 1]) || (g < lines - 2 && grid[r][g + 1])) continue
      grid[r][g] = true
      count++
    }
  }
  const rungs = []
  grid.forEach((row, r) =>
    row.forEach((on, g) => {
      // 高さを少しずらして手書きらしく（段の中で ±30% まで。隣の段とは入れ替わらない）
      if (on) rungs.push({ row: r, gap: g, offset: Math.round((randFloat() - 0.5) * 0.6 * 100) / 100 })
    }),
  )
  return rungs
}

async function createGame() {
  const names = lineNames().slice(0, MAX_LINES)
  if (names.length < MIN_LINES) {
    toast('縦線が2本以上必要です')
    return
  }
  const bottoms = shuffle(Array.from({ length: names.length }, (_, i) => state.results[i] || 'ハズレ'))
  const rows = Math.min(36, Math.max(10, names.length * 2 + 4))
  state.game = { names, bottoms, rows, rungs: generateRungs(names.length, rows), revealed: [] }
  persist()
  renderGame()
  sfx.pop()
}

/** start 番目の線をたどって、着く下端の番号と通る点（列・段の座標）を返す */
function trace(game, start) {
  const byRow = Array.from({ length: game.rows }, () => [])
  game.rungs.forEach((rung) => byRow[rung.row].push(rung))
  let col = start
  const points = [{ col, y: 0 }]
  for (let r = 0; r < game.rows; r++) {
    const rung = byRow[r].find((x) => x.gap === col || x.gap === col - 1)
    if (!rung) continue
    const y = rowY(r, rung.offset)
    points.push({ col, y })
    col = rung.gap === col ? col + 1 : col - 1
    points.push({ col, y })
  }
  points.push({ col, y: boardHeight(game) })
  return { end: col, points }
}

function rowY(row, offset) {
  return PAD_Y + (row + 0.5 + offset) * ROW_H
}

function boardHeight(game) {
  return PAD_Y * 2 + game.rows * ROW_H
}

// ---------- 遊ぶ ----------

function renderGame() {
  const game = state.game
  const n = game.names.length
  el.scroll = h('div', { class: 'amida-scroll' })
  el.board = h('div', { class: 'amida-board' })
  el.names = h('div', { class: 'amida-row amida-names' })
  el.bottoms = h('div', { class: 'amida-row amida-bottoms' })
  el.svg = document.createElementNS(SVG_NS, 'svg')
  el.svg.setAttribute('class', 'amida-svg')
  el.svg.setAttribute('aria-hidden', 'true')
  el.board.append(el.names, el.svg, el.bottoms)
  el.scroll.append(el.board)
  el.summary = h('div', { class: 'amida-summary' })

  game.names.forEach((name, i) => {
    el.names.append(
      h(
        'button',
        {
          type: 'button',
          class: 'amida-name',
          style: { '--c': colorOf(i) },
          'data-lock': true,
          'aria-label': `${name}の線をたどる`,
          onclick: () => reveal([i]),
        },
        h('span', {}, name),
      ),
    )
  })
  for (let i = 0; i < n; i++) el.bottoms.append(h('div', { class: 'amida-bottom' }))

  replace(
    el.body,
    h('p', { class: 'small muted', style: { margin: '0 4px 8px' } }, '名前をタップすると、線をたどって結果がわかります'),
    h('div', { class: 'card amida-card' }, el.scroll),
    h(
      'div',
      { class: 'btn-row', style: { marginTop: '12px' } },
      h('button', { type: 'button', class: 'btn btn-primary', 'data-lock': true, onclick: revealAll }, '全員一気に結果を見る'),
    ),
    el.summary,
    h(
      'div',
      { class: 'btn-row', style: { marginTop: '12px' } },
      h('button', { type: 'button', class: 'btn', 'data-lock': true, onclick: remake }, '横線を引き直す'),
      h('button', { type: 'button', class: 'btn', 'data-lock': true, onclick: backToSetup }, '設定に戻る'),
    ),
  )
  layoutBoard()
  renderRevealed()
}

function colorOf(i) {
  return PALETTE[i % PALETTE.length]
}

/** 画面の幅に合わせて列の幅を決め、SVG を描き直す */
function layoutBoard() {
  const game = state.game
  if (!game || !el.scroll) return
  const n = game.names.length
  const available = el.scroll.clientWidth || 320
  const colW = Math.max(COL_MIN, available / n)
  const width = colW * n
  el.board.style.width = `${width}px`
  el.board.style.setProperty('--col', `${colW}px`)
  el.colW = colW
  const height = boardHeight(game)
  el.svg.setAttribute('viewBox', `0 0 ${width} ${height}`)
  el.svg.setAttribute('width', width)
  el.svg.setAttribute('height', height)
  el.svg.textContent = ''

  const x = (col) => (col + 0.5) * colW
  const base = document.createElementNS(SVG_NS, 'g')
  base.setAttribute('class', 'amida-lines')
  for (let i = 0; i < n; i++) base.append(svgLine(x(i), 0, x(i), height))
  game.rungs.forEach((r) => {
    const y = rowY(r.row, r.offset)
    base.append(svgLine(x(r.gap), y, x(r.gap + 1), y))
  })
  el.svg.append(base)
  el.paths = document.createElementNS(SVG_NS, 'g')
  el.svg.append(el.paths)
  // たどり済みの線は、描き直したときもそのまま表示する
  game.revealed.forEach((start) => {
    const path = tracePath(start)
    path.style.strokeDasharray = 'none'
  })
}

function svgLine(x1, y1, x2, y2) {
  const line = document.createElementNS(SVG_NS, 'line')
  line.setAttribute('x1', x1)
  line.setAttribute('y1', y1)
  line.setAttribute('x2', x2)
  line.setAttribute('y2', y2)
  return line
}

function tracePath(start) {
  const { points } = trace(state.game, start)
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${(p.col + 0.5) * el.colW} ${p.y}`).join(' ')
  const path = document.createElementNS(SVG_NS, 'path')
  path.setAttribute('d', d)
  path.setAttribute('class', 'amida-trace')
  path.style.stroke = colorOf(start)
  el.paths.append(path)
  return path
}

async function reveal(starts) {
  const game = state.game
  const todo = starts.filter((s) => !game.revealed.includes(s))
  if (todo.length === 0 || isRunning()) {
    if (todo.length === 0 && starts.length === 1) toast(`${game.names[starts[0]]}さんはもう結果が出ています`)
    return
  }

  await runShow(async ({ skip }) => {
    const items = todo.map((start) => {
      const path = tracePath(start)
      const length = path.getTotalLength()
      const dot = document.createElementNS(SVG_NS, 'circle')
      dot.setAttribute('r', 6)
      dot.setAttribute('class', 'amida-dot')
      dot.style.fill = colorOf(start)
      el.paths.append(dot)
      el.names.children[start].classList.add('is-tracing')
      return { start, path, length, dot }
    })
    if (!skip) {
      items.forEach(({ path, length }) => {
        path.style.strokeDasharray = `${length}`
        path.style.strokeDashoffset = `${length}`
      })
      // 1人だけのときは、たどっている点が見えるように横スクロールを追う
      const follow = items.length === 1
      let lastCol = -1
      await animate(TRACE_MS + (todo.length > 1 ? 400 : 0), (t) => {
        const e = easeInOutCubic(t)
        items.forEach(({ path, length, dot }) => {
          path.style.strokeDashoffset = `${length * (1 - e)}`
          const p = path.getPointAtLength(length * e)
          dot.setAttribute('cx', p.x)
          dot.setAttribute('cy', p.y)
          if (follow) {
            const col = Math.floor(p.x / el.colW)
            if (col !== lastCol) {
              if (lastCol !== -1) sfx.tick()
              lastCol = col
              const target = p.x - el.scroll.clientWidth / 2
              el.scroll.scrollTo({ left: target, behavior: 'smooth' })
            }
          }
        })
      })
    }
    items.forEach(({ path, dot, start }) => {
      path.style.strokeDasharray = 'none'
      dot.remove()
      el.names.children[start].classList.remove('is-tracing')
    })
  })

  todo.forEach((s) => game.revealed.push(s))
  persist()
  renderRevealed(todo)
  const won = todo.some((s) => isPrize(game.bottoms[trace(game, s).end]))
  won ? sfx.win() : sfx.pop()
}

function revealAll() {
  const game = state.game
  reveal(game.names.map((_, i) => i))
}

function isPrize(text) {
  return text !== 'ハズレ'
}

function renderRevealed(justNow = []) {
  const game = state.game
  const reached = new Map() // 下端の番号 → たどってきた人の番号
  game.revealed.forEach((s) => reached.set(trace(game, s).end, s))
  ;[...el.bottoms.children].forEach((cell, i) => {
    const who = reached.get(i)
    if (who == null) {
      cell.className = 'amida-bottom is-hidden'
      replace(cell, h('span', {}, '？'))
      cell.removeAttribute('style')
    } else {
      cell.className = `amida-bottom${isPrize(game.bottoms[i]) ? ' is-prize' : ''}${justNow.includes(who) ? ' is-new' : ''}`
      cell.style.setProperty('--c', colorOf(who))
      replace(cell, h('span', {}, game.bottoms[i]))
    }
  })
  ;[...el.names.children].forEach((btn, i) => btn.classList.toggle('is-done', game.revealed.includes(i)))

  const lines = resultLines()
  if (lines.length === 0) {
    replace(el.summary)
    return
  }
  replace(
    el.summary,
    h('div', { class: 'section-title' }, `結果（${lines.length}/${game.names.length}人）`),
    h(
      'ul',
      { class: 'history-list amida-results' },
      lines.map(({ name, result, start }) =>
        h(
          'li',
          { class: isPrize(result) ? 'is-prize' : '' },
          h('span', { class: 'amida-swatch', style: { background: colorOf(start) } }),
          h('span', { class: 'history-values' }, name),
          h('span', { class: 'amida-result-text' }, result),
        ),
      ),
    ),
    resultActions({
      onStage: () =>
        showStage({
          title: 'あみだくじ',
          lines: justNowLines(justNow, lines).map((l) => ({ text: l.result, sub: l.name })),
        }),
      onShare: () => shareText(`🪜 あみだくじの結果\n${lines.map((l) => `${l.name} → ${l.result}`).join('\n')}`),
    }),
  )
}

/** 全画面に出すのは、1人ずつなら直前の人、それ以外は全員 */
function justNowLines(justNow, lines) {
  if (justNow.length === 1) return lines.filter((l) => l.start === justNow[0])
  return lines
}

function resultLines() {
  const game = state.game
  return game.names
    .map((name, start) => ({ name, start }))
    .filter(({ start }) => game.revealed.includes(start))
    .map(({ name, start }) => ({ name, start, result: game.bottoms[trace(game, start).end] }))
}

async function remake() {
  const game = state.game
  if (game.revealed.length && !(await confirmDialog({ title: '横線を引き直しますか？', message: '今の結果は消えます。', ok: '引き直す' }))) return
  const bottoms = shuffle(game.bottoms)
  state.game = { ...game, bottoms, rungs: generateRungs(game.names.length, game.rows), revealed: [] }
  persist()
  renderGame()
  sfx.pop()
}

async function backToSetup() {
  const game = state.game
  if (game.revealed.length < game.names.length && game.revealed.length > 0) {
    if (!(await confirmDialog({ title: '設定に戻りますか？', message: '今のくじは消えます。', ok: '戻る' }))) return
  }
  state.game = null
  persist()
  renderSetup()
}

window.addEventListener('resize', () => {
  if (state.game && el.scroll?.isConnected) layoutBoard()
})
