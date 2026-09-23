/**
 * チーム分け：「1チームの人数」か「チーム数」を指定。端数は各チームに均等に振り分ける。
 *
 * 条件（リーダーの分散・NG ペア・前回と同じ組み合わせを避ける）は、ランダムな分け方を
 * たくさん作って点数を付け、いちばん条件に合うものを選ぶ（同点の中からは等確率で選ぶ）。
 */
import { randInt, shuffle } from '../core/random.js'
import { load, save, clampInt } from '../core/store.js'
import * as members from '../core/members.js'
import { h, replace, PALETTE, groupBar, segmented, stepper, switchRow, resultActions, toast, openSheet, iconButton } from '../core/ui.js'
import { runShow, isRunning } from '../core/show.js'
import { sfx } from '../core/sound.js'
import { showStage } from '../core/stage.js'
import { shareText } from '../core/share.js'

const KEY = 'teams'
const CANDIDATES = 800
const TEAM_NAMES = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

const raw = load(KEY, {})
const state = {
  mode: raw.mode === 'count' ? 'count' : 'size',
  size: clampInt(raw.size, 2, 50, 3),
  count: clampInt(raw.count, 2, 26, 2),
  spreadLeaders: raw.spreadLeaders !== false,
  avoidPrevious: raw.avoidPrevious === true,
  ngPairs: Array.isArray(raw.ngPairs) ? raw.ngPairs.filter((p) => Array.isArray(p) && p.length === 2 && typeof p[0] === 'string') : [],
  // 直前の結果（グループごと）: { [groupId]: [[memberId, ...], ...] }
  last: raw.last && typeof raw.last === 'object' ? raw.last : {},
}

let el = {}
let shown = null // 画面に出している結果 [[member, ...], ...]

function persist() {
  save(KEY, state)
}

export default {
  id: 'teams',
  title: 'チーム分け',
  init(view) {
    el.settings = h('div')
    el.result = h('div', { class: 'teams-result' })
    view.append(
      h(
        'div',
        { class: 'view-inner' },
        groupBar(),
        el.settings,
        h('button', { type: 'button', class: 'btn btn-primary btn-big', style: { marginTop: '12px' }, 'data-lock': true, onclick: divide }, 'チーム分けする'),
        el.result,
      ),
    )
    members.onChange(() => {
      renderSettings()
      // グループを切り替えたら、前のグループの結果は消す
      if (shown && !shown.flat().every((m) => members.members().some((x) => x.id === m.id))) {
        shown = null
        renderResult()
      }
    })
    renderSettings()
    renderResult()
  },
}

// ---------- 人数の計算 ----------

function teamCount(n) {
  if (state.mode === 'count') return Math.min(state.count, n)
  return Math.max(1, Math.floor(n / state.size))
}

/** n 人を k チームに、できるだけ均等に分けたときの各チームの人数 */
function teamSizes(n, k) {
  const base = Math.floor(n / k)
  return Array.from({ length: k }, (_, i) => base + (i < n % k ? 1 : 0))
}

function activeNgPairs(list) {
  const ids = new Set(list.map((m) => m.id))
  return state.ngPairs.filter(([a, b]) => ids.has(a) && ids.has(b))
}

// ---------- 設定画面 ----------

function renderSettings() {
  const list = members.activeMembers()
  const n = list.length
  const k = teamCount(n)
  const sizes = teamSizes(n, k)
  const leaders = list.filter((m) => m.leader).length
  const ngCount = activeNgPairs(list).length
  const uniqueSizes = [...new Set(sizes)].sort((a, b) => b - a)

  replace(
    el.settings,
    h(
      'div',
      { class: 'card' },
      segmented(
        [
          { value: 'size', label: '1チームの人数' },
          { value: 'count', label: 'チーム数' },
        ],
        state.mode,
        (v) => {
          state.mode = v
          persist()
          renderSettings()
        },
        { 'data-lock': true },
      ),
      h(
        'div',
        { class: 'row', style: { marginTop: '12px' } },
        h('div', { class: 'grow', style: { fontWeight: '700' } }, state.mode === 'size' ? '1チームの人数' : 'チーム数'),
        state.mode === 'size'
          ? stepper({
              value: state.size,
              min: 2,
              max: 50,
              label: '1チームの人数',
              format: (v) => `${v}人`,
              onchange: (v) => {
                state.size = v
                persist()
                renderSettings()
              },
            })
          : stepper({
              value: state.count,
              min: 2,
              max: 26,
              label: 'チーム数',
              format: (v) => `${v}チーム`,
              onchange: (v) => {
                state.count = v
                persist()
                renderSettings()
              },
            }),
      ),
      h(
        'p',
        { class: 'teams-preview' },
        n < 2
          ? '参加メンバーが2人以上必要です'
          : k < 2
            ? `参加 ${n}人では2チーム以上に分けられません`
            : `参加 ${n}人 → ${k}チーム（${uniqueSizes.length === 1 ? `各${uniqueSizes[0]}人` : uniqueSizes.map((s) => `${s}人×${sizes.filter((x) => x === s).length}`).join('、')}）`,
      ),
    ),
    h(
      'div',
      { class: 'card', 'data-lock': true },
      switchRow(
        'リーダーを各チームに分散',
        state.spreadLeaders,
        (on) => {
          state.spreadLeaders = on
          persist()
        },
        { note: leaders ? `リーダー：${list.filter((m) => m.leader).map((m) => m.name).join('、')}` : 'メンバー画面の ★ でリーダーを設定できます' },
      ),
      switchRow(
        '前回と同じ組み合わせをなるべく避ける',
        state.avoidPrevious,
        (on) => {
          state.avoidPrevious = on
          persist()
        },
        { note: state.last[members.currentGroup().id] ? '直前の結果と比べます' : 'まだ前回の結果がありません' },
      ),
      h(
        'button',
        { type: 'button', class: 'switch-row ng-row', onclick: openNgSheet },
        h('span', { class: 'grow', style: { textAlign: 'left' } }, '別チームにする2人（NGペア）', h('div', { class: 'small muted' }, ngCount ? `${ngCount}組` : '設定なし')),
        h('span', { class: 'btn btn-soft', style: { minHeight: '36px', padding: '4px 12px' } }, '設定'),
      ),
    ),
  )
}

// ---------- NG ペア ----------

function openNgSheet() {
  openSheet('別チームにする2人', (body) => {
    function render() {
      const list = members.members()
      const byId = new Map(list.map((m) => [m.id, m]))
      const pairs = state.ngPairs.filter(([a, b]) => byId.has(a) && byId.has(b))
      const selectA = h('select', { class: 'input', 'aria-label': '1人目' }, list.map((m) => h('option', { value: m.id }, m.name)))
      const selectB = h('select', { class: 'input', 'aria-label': '2人目' }, list.map((m) => h('option', { value: m.id }, m.name)))
      if (list[1]) selectB.value = list[1].id
      replace(
        body,
        h('p', { class: 'small muted', style: { marginTop: '0' } }, `「${members.currentGroup().name}」のメンバーから選びます。指定した2人は、できるかぎり別のチームになります。`),
        list.length < 2
          ? h('div', { class: 'empty' }, 'メンバーが2人以上必要です')
          : h(
              'div',
              { class: 'ng-form' },
              selectA,
              h('span', { class: 'muted' }, '×'),
              selectB,
              h(
                'button',
                {
                  type: 'button',
                  class: 'btn btn-primary',
                  onclick: () => {
                    const a = selectA.value
                    const b = selectB.value
                    if (a === b) {
                      toast('別々の2人を選んでください')
                      return
                    }
                    if (state.ngPairs.some(([x, y]) => (x === a && y === b) || (x === b && y === a))) {
                      toast('すでに登録されています')
                      return
                    }
                    state.ngPairs.push([a, b])
                    persist()
                    render()
                    renderSettings()
                  },
                },
                '追加',
              ),
            ),
        pairs.length
          ? h(
              'ul',
              { class: 'list', style: { marginTop: '16px' } },
              pairs.map((pair) =>
                h(
                  'li',
                  { class: 'list-item' },
                  h('span', { class: 'grow' }, `${byId.get(pair[0]).name} × ${byId.get(pair[1]).name}`),
                  iconButton('close', '削除', () => {
                    state.ngPairs = state.ngPairs.filter((p) => p !== pair)
                    persist()
                    render()
                    renderSettings()
                  }, { class: 'btn btn-icon btn-ghost' }),
                ),
              ),
            )
          : h('div', { class: 'empty' }, 'NGペアはまだありません'),
      )
    }
    render()
  })
}

// ---------- 分ける ----------

/** 条件を考えずに、ランダムな分け方を1つ作る */
function candidate(list, sizes) {
  const k = sizes.length
  const order = shuffle(sizes.map((size, i) => ({ size, i })))
  const teams = order.map(() => [])
  const capacity = order.map((t) => t.size)
  let rest = list
  if (state.spreadLeaders) {
    // リーダーを先に、チームを順番に回りながら1人ずつ入れる
    const leaders = shuffle(list.filter((m) => m.leader))
    let t = randInt(k)
    for (const leader of leaders) {
      let tries = 0
      while (teams[t].length >= capacity[t] && tries++ < k) t = (t + 1) % k
      teams[t].push(leader)
      t = (t + 1) % k
    }
    rest = list.filter((m) => !m.leader)
  }
  let t = 0
  for (const member of shuffle(rest)) {
    while (teams[t].length >= capacity[t]) t++
    teams[t].push(member)
  }
  return teams
}

/** 点数（小さいほど良い）：NG ペアの同居 > リーダーの偏り > 前回と同じペアの数 */
function score(teams, ngPairs, previousPairs) {
  const teamOf = new Map()
  teams.forEach((team, i) => team.forEach((m) => teamOf.set(m.id, i)))
  let ng = 0
  for (const [a, b] of ngPairs) if (teamOf.get(a) === teamOf.get(b)) ng++
  let leaderGap = 0
  if (state.spreadLeaders) {
    const counts = teams.map((team) => team.filter((m) => m.leader).length)
    leaderGap = Math.max(...counts) - Math.min(...counts)
  }
  let repeats = 0
  if (previousPairs) {
    for (const team of teams) {
      for (let i = 0; i < team.length; i++) {
        for (let j = i + 1; j < team.length; j++) if (previousPairs.has(pairKey(team[i].id, team[j].id))) repeats++
      }
    }
  }
  return { ng, total: ng * 1e6 + leaderGap * 1e3 + repeats }
}

function pairKey(a, b) {
  return a < b ? `${a}|${b}` : `${b}|${a}`
}

function bestDivision(list, k) {
  const sizes = teamSizes(list.length, k)
  const ngPairs = activeNgPairs(list)
  const group = members.currentGroup()
  let previousPairs = null
  if (state.avoidPrevious && Array.isArray(state.last[group.id])) {
    previousPairs = new Set()
    for (const team of state.last[group.id]) {
      for (let i = 0; i < team.length; i++) for (let j = i + 1; j < team.length; j++) previousPairs.add(pairKey(team[i], team[j]))
    }
  }
  // 条件がなければ1回で十分（どれも同じく「良い」）
  const needSearch = ngPairs.length > 0 || previousPairs || (state.spreadLeaders && list.some((m) => m.leader))
  let best = null
  let bestScore = null
  let ties = 0
  for (let i = 0; i < (needSearch ? CANDIDATES : 1); i++) {
    const teams = candidate(list, sizes)
    const s = score(teams, ngPairs, previousPairs)
    if (!best || s.total < bestScore.total) {
      best = teams
      bestScore = s
      ties = 1
    } else if (s.total === bestScore.total) {
      // 同点のものからは等確率で選ぶ
      ties++
      if (randInt(ties) === 0) best = teams
    }
  }
  return { teams: best, ngFailed: bestScore.ng }
}

async function divide() {
  if (isRunning()) return
  const list = members.activeMembers()
  const k = teamCount(list.length)
  if (list.length < 2 || k < 2) {
    toast(list.length < 2 ? '参加メンバーが2人以上必要です' : '2チーム以上に分けられる人数にしてください')
    return
  }
  const { teams, ngFailed } = bestDivision(list, k)
  state.last[members.currentGroup().id] = teams.map((team) => team.map((m) => m.id))
  persist()
  shown = teams

  await runShow(async ({ skip, sleep }) => {
    renderResult({ hidden: !skip })
    if (skip) return
    // 1人ずつカードに入っていく演出
    const chips = [...el.result.querySelectorAll('.team-member')]
    const order = shuffle(chips.map((_, i) => i))
    const delay = Math.max(60, Math.min(180, 2400 / chips.length))
    for (const i of order) {
      chips[i].classList.remove('is-hidden')
      sfx.tick()
      await sleep(delay)
    }
  })
  sfx.win()
  renderSettings()
  if (ngFailed) toast(`NGペアのうち${ngFailed}組は、人数の都合で同じチームになりました`, { duration: 3500 })
}

function teamName(i) {
  return `チーム${TEAM_NAMES[i] ?? i + 1}`
}

function renderResult({ hidden = false } = {}) {
  if (!shown) {
    replace(el.result)
    return
  }
  replace(
    el.result,
    h('div', { class: 'section-title' }, `結果（${shown.length}チーム）`),
    h(
      'div',
      { class: 'team-grid' },
      shown.map((team, i) =>
        h(
          'div',
          { class: 'team-card', style: { '--c': PALETTE[i % PALETTE.length] } },
          h('div', { class: 'team-head' }, h('span', {}, teamName(i)), h('span', { class: 'small' }, `${team.length}人`)),
          h(
            'ul',
            { class: 'team-members' },
            team.map((m) => h('li', { class: `team-member${hidden ? ' is-hidden' : ''}` }, m.leader ? h('span', { class: 'team-leader', 'aria-label': 'リーダー' }, '★') : null, m.name)),
          ),
        ),
      ),
    ),
    resultActions({
      onStage: () => showStage({ title: 'チーム分け', lines: shown.map((team, i) => ({ text: team.map((m) => m.name).join('・'), sub: teamName(i) })) }),
      onShare: () => shareText(`👥 チーム分けの結果\n${shown.map((team, i) => `【${teamName(i)}】${team.map((m) => m.name).join('、')}`).join('\n')}`),
    }),
    h('button', { type: 'button', class: 'btn btn-soft btn-block', style: { marginTop: '12px' }, 'data-lock': true, onclick: divide }, 'もう一度シャッフル'),
  )
}
