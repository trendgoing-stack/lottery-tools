/**
 * 起動：タブ切替（URL の #hash）、設定、効果音の解除、Service Worker の登録と更新バナー。
 *
 * 各機能は { id, title, init(el), show(sub), hide() } の形のオブジェクト。
 * init は初めてその画面を開いたときに1回だけ呼ぶ。
 */
import { APP_VERSION } from './version.js'
import * as settings from './core/settings.js'
import { unlock, sfx } from './core/sound.js'
import { clearAll, load, save } from './core/store.js'
import { h, openSheet, switchRow, confirmDialog, setHeader } from './core/ui.js'
import membersView from './features/members-view.js'
import dice from './features/dice.js'
import roulette from './features/roulette.js'
import amida from './features/amida.js'
import teams from './features/teams.js'
import more from './features/more.js'

const FEATURES = [
  membersView,
  dice,
  roulette,
  amida,
  teams,
  more,
]
const DEFAULT_TAB = 'members'

const initialized = new Set()
let currentTab = null

function parseHash() {
  const [tab, sub = ''] = location.hash.replace(/^#/, '').split('/')
  return { tab, sub }
}

function route() {
  let { tab, sub } = parseHash()
  let feature = FEATURES.find((f) => f.id === tab)
  if (!feature) {
    const last = load('lastTab', DEFAULT_TAB)
    feature = FEATURES.find((f) => f.id === last) ?? FEATURES[0]
    history.replaceState(null, '', `#${feature.id}`)
    sub = ''
  }

  if (currentTab && currentTab !== feature.id) {
    FEATURES.find((f) => f.id === currentTab)?.hide?.()
  }
  document.querySelectorAll('.view').forEach((view) => {
    view.hidden = view.dataset.view !== feature.id
  })
  document.querySelectorAll('.tab').forEach((tabEl) => {
    if (tabEl.dataset.tab === feature.id) tabEl.setAttribute('aria-current', 'page')
    else tabEl.removeAttribute('aria-current')
  })

  const viewEl = document.querySelector(`.view[data-view="${feature.id}"]`)
  if (!initialized.has(feature.id)) {
    initialized.add(feature.id)
    feature.init(viewEl)
  }
  setHeader(feature.title)
  currentTab = feature.id
  save('lastTab', feature.id)
  // 「その他」のように画面の中で見出しを変える機能は、show の中で setHeader し直す
  feature.show?.(sub)
}

// ---------- 設定 ----------

function renderMuteButton() {
  const button = document.getElementById('btnMute')
  const muted = settings.get().muted
  button.classList.toggle('is-muted', muted)
  button.setAttribute('aria-label', muted ? '効果音：オフ（タップでオン）' : '効果音：オン（タップでオフ）')
  button.setAttribute('aria-pressed', String(!muted))
}

function openSettings() {
  openSheet('設定', (body) => {
    body.append(
      h(
        'div',
        { class: 'card', style: { boxShadow: 'none', background: 'var(--surface-2)' } },
        switchRow('効果音', !settings.get().muted, (on) => settings.set({ muted: !on })),
        switchRow('演出スキップ', settings.get().skipAnimation, (on) => settings.set({ skipAnimation: on }), {
          note: 'アニメーションを省いて、すぐに結果を表示します',
        }),
      ),
      h('div', { class: 'section-title' }, 'データ'),
      h(
        'p',
        { class: 'small muted', style: { margin: '0 4px 12px' } },
        'メンバーや設定は、この端末の中だけに保存されます。外部には送信しません。',
      ),
      h(
        'button',
        {
          type: 'button',
          class: 'btn btn-block',
          style: { color: 'var(--danger)' },
          onclick: async () => {
            const ok = await confirmDialog({
              title: 'すべてのデータを消しますか？',
              message: 'グループ・メンバー・保存した項目・設定をすべて削除します。元に戻せません。',
              ok: 'すべて消す',
              danger: true,
            })
            if (!ok) return
            clearAll()
            location.reload()
          },
        },
        'すべてのデータを消す',
      ),
      h('p', { class: 'small muted', style: { textAlign: 'center', margin: '20px 0 0' } }, `抽選ツール バージョン ${APP_VERSION}`),
    )
  })
}

// ---------- Service Worker ----------

function showUpdateBanner(worker) {
  const banner = document.getElementById('updateBanner')
  banner.hidden = false
  banner.onclick = () => {
    banner.disabled = true
    worker.postMessage({ type: 'SKIP_WAITING' })
  }
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return
  // localhost 以外の http では Service Worker が使えない（iPhone 実機は GitHub Pages の https で確認する）
  if (location.protocol !== 'https:' && location.hostname !== 'localhost') return
  // 手元での開発中はキャッシュされると編集が反映されないので、localhost では ?sw を付けたときだけ登録する
  if (location.hostname === 'localhost' && !new URLSearchParams(location.search).has('sw')) return

  let reloading = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return
    reloading = true
    location.reload()
  })

  navigator.serviceWorker
    .register('sw.js', { scope: './' })
    .then((reg) => {
      // 前回開いたときに、すでに新しいバージョンを取得済み
      if (reg.waiting && navigator.serviceWorker.controller) showUpdateBanner(reg.waiting)

      reg.addEventListener('updatefound', () => {
        const worker = reg.installing
        if (!worker) return
        worker.addEventListener('statechange', () => {
          // controller がある＝初回インストールではなく更新
          if (worker.state === 'installed' && navigator.serviceWorker.controller) showUpdateBanner(worker)
        })
      })

      // ホーム画面から起動したアプリは開きっぱなしになりやすいので、表示のたびに更新を確認する
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') reg.update().catch(() => {})
      })
    })
    .catch(() => {
      /* 登録できなくても使える */
    })
}

// ---------- 起動 ----------

function init() {
  document.getElementById('btnSettings').addEventListener('click', openSettings)
  document.getElementById('btnMute').addEventListener('click', () => {
    settings.set({ muted: !settings.get().muted })
    if (!settings.get().muted) sfx.tap()
  })
  settings.onChange(renderMuteButton)
  renderMuteButton()

  // iOS は最初のタップの中でないと音を鳴らせない
  document.addEventListener('pointerdown', unlock, { once: true, capture: true })

  window.addEventListener('hashchange', route)
  route()
  registerServiceWorker()
}

init()
