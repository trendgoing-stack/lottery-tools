/**
 * じゃんけん：参加メンバー全員の手を同時に出す。
 * あいこ（全員同じ手、または3種類そろった）なら自動で再戦し、勝った人だけで続けて、1人になるまで表示する。
 */
import { randInt, randFloat } from '../../core/random.js'
import * as members from '../../core/members.js'
import { h, replace, groupBar, resultActions, toast } from '../../core/ui.js'
import { runShow, isRunning } from '../../core/show.js'
import { sfx } from '../../core/sound.js'
import { showStage } from '../../core/stage.js'
import { shareText } from '../../core/share.js'

const HANDS = [
  { emoji: '✊', name: 'グー' },
  { emoji: '✌️', name: 'チョキ' },
  { emoji: '✋', name: 'パー' },
]
const AIKO_SHOWN = 3 // あいこが続くとき、そのまま見せる回数

let el = {}
let winner = null

export default {
  id: 'janken',
  title: 'じゃんけん',
  init(page) {
    el.rounds = h('div', { class: 'janken-rounds', 'aria-live': 'polite' })
    el.final = h('div')
    page.append(
      groupBar(),
      h('button', { type: 'button', class: 'btn btn-primary btn-big', 'data-lock': true, onclick: play }, 'じゃんけんする'),
      el.final,
      el.rounds,
    )
    replace(el.rounds, h('div', { class: 'card empty' }, '参加メンバー全員で、同時にじゃんけんします'))
  },
}

/*
 * 人数が多いと、あいこ（全員同じか3種類そろう）がほとんどになる（9人で決着する確率は約8%、20人では約0.0003%）。
 * 1回ずつ試すと終わらないので、ルールはそのままで次のように同じ確率を再現する：
 *  1. 決着するまでのあいこの回数を、幾何分布から一度に引く
 *  2. 見せるあいこの回は「あいこになる出し方」から、決着の回は「決着する出し方」から等確率で選ぶ
 */

/** k 人で1回じゃんけんして決着する確率 */
function decisiveProbability(k) {
  return (3 * (2 ** k - 2)) / 3 ** k
}

function aikoCount(k) {
  const p = decisiveProbability(k)
  const u = 1 - randFloat() // 0 より大きく 1 以下
  return Math.floor(Math.log(u) / Math.log1p(-p))
}

function aikoHands(k) {
  for (;;) {
    const hands = Array.from({ length: k }, () => randInt(3))
    if (new Set(hands).size !== 2) return hands
  }
}

function decisiveHands(k) {
  // 出ている2種類を等確率で選び、全員が同じにならない出し方を等確率で選ぶ
  const first = randInt(3)
  const kinds = [first, (first + 1) % 3]
  for (;;) {
    const hands = Array.from({ length: k }, () => kinds[randInt(2)])
    if (new Set(hands).size === 2) return hands
  }
}

/** グー(0)はチョキ(1)に、チョキ(1)はパー(2)に、パー(2)はグー(0)に勝つ */
function winningHand(hands) {
  const [a, b] = [...new Set(hands)]
  return (a + 1) % 3 === b ? a : b
}

/** 1人になるまでの全部の回を決める。長く続くあいこは、最初の数回だけ見せてまとめる */
function playAll(names) {
  const rounds = []
  let players = names
  let number = 1
  while (players.length > 1) {
    const aiko = aikoCount(players.length)
    const shown = aiko > AIKO_SHOWN ? AIKO_SHOWN - 1 : aiko
    for (let i = 0; i < shown; i++) rounds.push({ number: number++, players, hands: aikoHands(players.length), winners: [] })
    if (aiko > shown) {
      rounds.push({ number, players, skipped: aiko - shown })
      number += aiko - shown
    }
    const hands = decisiveHands(players.length)
    const win = winningHand(hands)
    const winners = players.filter((_, i) => hands[i] === win)
    rounds.push({ number: number++, players, hands, winners })
    players = winners
  }
  return { rounds, winner: players[0], total: number - 1 }
}

async function play() {
  if (isRunning()) return
  const list = members.activeMembers().map((m) => m.name)
  if (list.length < 2) {
    toast('参加メンバーが2人以上必要です')
    return
  }

  // 先に最後までの勝負を決めておく
  const { rounds, winner: champion, total } = playAll(list)
  winner = champion

  replace(el.rounds)
  replace(el.final)
  await runShow(async ({ skip, sleep }) => {
    for (let i = 0; i < rounds.length; i++) {
      const round = rounds[i]
      if (round.skipped) {
        el.rounds.prepend(skippedBlock(round))
        if (!skip) await sleep(700)
        continue
      }
      const block = roundBlock(round, !skip)
      el.rounds.prepend(block)
      if (skip) continue
      // あいこが続くときは、2回目以降のかけ声を短くする
      const quick = round.number > 1 && rounds[i - 1] && !rounds[i - 1].winners?.length
      // じゃん・けん・ぽん
      const call = block.querySelector('.janken-call')
      for (const word of ['じゃん', 'けん', 'ぽん！']) {
        call.textContent = word
        sfx.tick()
        await sleep(word === 'ぽん！' ? 150 : quick ? 200 : 380)
      }
      block.classList.remove('is-waiting')
      sfx.pop()
      await sleep(round.winners.length ? 900 : 700)
    }
  })

  if (winner) {
    replace(
      el.final,
      h('div', { class: 'card janken-winner' }, h('div', { class: 'small muted' }, `${total.toLocaleString()}回戦で決着`), h('div', { class: 'janken-winner-name' }, `🏆 ${winner}`)),
      resultActions({
        onStage: () => showStage({ title: 'じゃんけん', lines: [{ text: winner, sub: '優勝' }] }),
        onShare: () => shareText(`✊ じゃんけんの結果\n勝者：${winner}（${list.length}人・${total.toLocaleString()}回戦）`),
      }),
    )
    sfx.win()
  }
}

function skippedBlock(round) {
  return h(
    'div',
    { class: 'card janken-round janken-skipped' },
    h(
      'div',
      { class: 'row janken-round-head' },
      h('span', { class: 'grow' }, `${round.number.toLocaleString()}〜${(round.number + round.skipped - 1).toLocaleString()}回戦（${round.players.length}人）`),
      h('span', { class: 'janken-badge is-aiko' }, `あいこ ×${round.skipped.toLocaleString()}`),
    ),
    h('div', { class: 'small muted' }, '人数が多いので、あいこが続きました'),
  )
}

function roundBlock(round, waiting) {
  const aiko = round.winners.length === 0
  return h(
    'div',
    { class: `card janken-round${waiting ? ' is-waiting' : ''}` },
    h(
      'div',
      { class: 'row janken-round-head' },
      h('span', { class: 'grow' }, `${round.number.toLocaleString()}回戦（${round.players.length}人）`),
      h('span', { class: `janken-badge${aiko ? ' is-aiko' : ''}` }, aiko ? 'あいこ' : `${round.winners.length}人勝ち`),
    ),
    h('div', { class: 'janken-call', 'aria-hidden': 'true' }),
    h(
      'ul',
      { class: 'janken-hands' },
      round.players.map((name, i) =>
        h(
          'li',
          { class: aiko ? '' : round.winners.includes(name) ? 'is-win' : 'is-lose' },
          h('span', { class: 'janken-hand', 'aria-label': HANDS[round.hands[i]].name }, HANDS[round.hands[i]].emoji),
          h('span', { class: 'janken-name' }, name),
        ),
      ),
    ),
  )
}
