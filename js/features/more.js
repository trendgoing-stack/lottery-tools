/**
 * 「その他」タブ：順番決め・じゃんけん・くじ引き・コイントスへの入口。
 * #more でメニュー、#more/order などで各画面を開く（見出しに「戻る」が出る）。
 */
import { h, setHeader } from '../core/ui.js'
import order from './more/order.js'
import janken from './more/janken.js'
import lots from './more/lots.js'
import coin from './more/coin.js'

const SUBS = [
  { ...order, emoji: '🔢', desc: '参加メンバーの順番をランダムに決める' },
  { ...janken, emoji: '✊', desc: '全員で同時にじゃんけん。あいこは自動で再戦' },
  { ...lots, emoji: '🎟️', desc: '当たりの本数を決めて、1人ずつ引く' },
  { ...coin, emoji: '🪙', desc: '表か裏か。回数も数える' },
]

let menu
const pages = new Map()
let root

export default {
  id: 'more',
  title: 'その他',
  init(view) {
    root = view
    menu = h(
      'div',
      { class: 'view-inner' },
      h(
        'div',
        { class: 'more-menu' },
        SUBS.map((sub) =>
          h(
            'a',
            { class: 'more-item', href: `#more/${sub.id}` },
            h('span', { class: 'more-emoji', 'aria-hidden': 'true' }, sub.emoji),
            h('span', { class: 'more-text' }, h('span', { class: 'more-title' }, sub.title), h('span', { class: 'more-desc' }, sub.desc)),
          ),
        ),
      ),
    )
    view.append(menu)
  },
  show(subId) {
    const sub = SUBS.find((s) => s.id === subId)
    menu.hidden = Boolean(sub)
    pages.forEach((page) => {
      page.hidden = true
    })
    if (!sub) {
      setHeader('その他')
      return
    }
    let page = pages.get(sub.id)
    if (!page) {
      page = h('div', { class: 'view-inner' })
      root.append(page)
      pages.set(sub.id, page)
      sub.init(page)
    }
    page.hidden = false
    root.scrollTop = 0
    setHeader(sub.title, '#more')
    sub.show?.()
  },
}
