/** 順番決め：参加メンバーをシャッフルして、1位から順に演出付きで表示する */
import { shuffle } from '../../core/random.js'
import * as members from '../../core/members.js'
import { h, replace, groupBar, resultActions, toast } from '../../core/ui.js'
import { runShow, isRunning } from '../../core/show.js'
import { sfx } from '../../core/sound.js'
import { showStage } from '../../core/stage.js'
import { shareText } from '../../core/share.js'

let el = {}
let result = null

export default {
  id: 'order',
  title: '順番決め',
  init(page) {
    el.list = h('ol', { class: 'order-list', 'aria-live': 'polite' })
    el.actions = h('div')
    page.append(
      groupBar(),
      h('button', { type: 'button', class: 'btn btn-primary btn-big', 'data-lock': true, onclick: decide }, '順番を決める'),
      h('div', { style: { marginTop: '12px' } }, el.list, el.actions),
    )
    renderEmpty()
  },
}

function renderEmpty() {
  replace(el.list, h('li', { class: 'empty order-empty' }, '参加メンバーの順番をランダムに決めます'))
  replace(el.actions)
}

async function decide() {
  if (isRunning()) return
  const list = members.activeMembers()
  if (list.length < 2) {
    toast('参加メンバーが2人以上必要です')
    return
  }
  result = shuffle(list).map((m) => m.name)
  replace(el.list)
  replace(el.actions)

  await runShow(async ({ skip, sleep }) => {
    // 最初の数人はドラムロールでためて、残りはテンポよく
    for (let i = 0; i < result.length; i++) {
      const slow = i < 3
      if (!skip && slow) {
        el.list.append(h('li', { class: 'order-item is-pending' }, h('span', { class: 'order-rank' }, `${i + 1}`), h('span', { class: 'order-name' }, '・・・')))
        sfx.drumroll(0.7)
        await sleep(750)
        el.list.lastChild.remove()
      }
      el.list.append(
        h(
          'li',
          { class: `order-item${i === 0 ? ' is-first' : ''}${skip ? '' : ' is-new'}` },
          h('span', { class: 'order-rank' }, `${i + 1}`),
          h('span', { class: 'order-name' }, result[i]),
        ),
      )
      if (!skip) {
        i === 0 ? sfx.win() : sfx.pop()
        el.list.lastChild.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
        await sleep(slow ? 450 : 220)
      }
    }
  })

  replace(
    el.actions,
    resultActions({
      onStage: () => showStage({ title: '順番', lines: result.map((name, i) => `${i + 1}. ${name}`) }),
      onShare: () => shareText(`🔢 順番決めの結果\n${result.map((name, i) => `${i + 1}. ${name}`).join('\n')}`),
    }),
  )
}
