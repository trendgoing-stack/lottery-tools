/**
 * 画面部品：DOM を組み立てる h()、トースト、シート、確認ダイアログ、グループ表示バーなど。
 */
import * as members from './members.js'

/**
 * 要素を作る。h('button', { class: 'btn', onclick }, '押す')
 * 属性に関数を渡すとイベント、false/null は付けない、true は空の属性として付ける。
 */
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag)
  for (const [key, value] of Object.entries(attrs ?? {})) {
    if (value == null || value === false) continue
    if (key.startsWith('on') && typeof value === 'function') {
      el.addEventListener(key.slice(2), value)
    } else if (key === 'class') {
      el.className = value
    } else if (key === 'dataset') {
      Object.assign(el.dataset, value)
    } else if (key === 'style' && typeof value === 'object') {
      for (const [prop, v] of Object.entries(value)) {
        if (prop.startsWith('--')) el.style.setProperty(prop, v)
        else el.style[prop] = v
      }
    } else if (key in el && typeof value !== 'string') {
      el[key] = value
    } else {
      el.setAttribute(key, value === true ? '' : value)
    }
  }
  append(el, children)
  return el
}

function append(el, children) {
  for (const child of children.flat(Infinity)) {
    if (child == null || child === false) continue
    el.append(child instanceof Node ? child : String(child))
  }
}

/** 中身を入れ替える */
export function replace(el, ...children) {
  el.textContent = ''
  append(el, children)
}

/** SVG のアイコン（24x24 の path を渡す） */
export function icon(d) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('aria-hidden', 'true')
  svg.innerHTML = d
  return svg
}

export const ICONS = {
  plus: '<path d="M12 5v14M5 12h14"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  up: '<path d="M6 15l6-6 6 6"/>',
  down: '<path d="M6 9l6 6 6-6"/>',
  more: '<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>',
  star: '<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.8l-5.2 2.8 1-5.8-4.3-4.1 5.9-.9z"/>',
  chevron: '<path d="M6 9l6 6 6-6"/>',
  share: '<path d="M12 3v12M7 8l5-5 5 5"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/>',
  expand: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><circle cx="17" cy="9" r="2.5"/><path d="M16 14.2a5 5 0 0 1 6 4.8"/>',
  shuffle: '<path d="M4 7h3c5 0 5 10 10 10h3M4 17h3c2 0 3-1.5 4-3.3M20 7h-3c-2 0-3 1.5-4 3.3"/><path d="M18 4l3 3-3 3M18 14l3 3-3 3"/>',
  save: '<path d="M5 4h11l3 3v13H5z"/><path d="M8 4v5h7V4M8 20v-6h8v6"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
}

/** アイコンだけのボタン */
export function iconButton(name, label, onclick, extra = {}) {
  return h('button', { type: 'button', class: 'btn btn-icon', 'aria-label': label, title: label, onclick, ...extra }, icon(ICONS[name]))
}

// ---------- トースト ----------

/** 画面下に短いお知らせを出す。action を渡すとボタン付き（取り消しなど） */
export function toast(message, { duration = 2200, action = null } = {}) {
  const area = document.getElementById('toastArea')
  const el = h('div', { class: 'toast', role: 'status' }, message)
  if (action) {
    el.style.pointerEvents = 'auto'
    el.append(
      ' ',
      h(
        'button',
        {
          type: 'button',
          class: 'toast-action',
          onclick: () => {
            action.run()
            dismiss()
          },
        },
        action.label,
      ),
    )
  }
  area.append(el)
  const timer = setTimeout(dismiss, duration)
  function dismiss() {
    clearTimeout(timer)
    el.classList.add('is-leaving')
    setTimeout(() => el.remove(), 300)
  }
  return dismiss
}

// ---------- シート（下から出る） ----------

/**
 * シートを開く。build(body, close) で中身を作る。
 * @returns {() => void} 閉じる関数
 */
export function openSheet(title, build, { onClose } = {}) {
  const body = h('div', { class: 'sheet-body' })
  const dialog = h(
    'dialog',
    { class: 'sheet', 'aria-label': title },
    h('div', { class: 'sheet-head' }, h('h2', {}, title), iconButton('close', '閉じる', () => close())),
    body,
  )
  let closed = false
  function close() {
    if (closed) return
    closed = true
    dialog.close()
    dialog.remove()
    onClose?.()
  }
  dialog.addEventListener('cancel', (e) => {
    e.preventDefault()
    close()
  })
  // 背景（ダイアログの外）をタップしたら閉じる
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) {
      const r = dialog.getBoundingClientRect()
      const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom
      if (!inside) close()
    }
  })
  build(body, close)
  document.body.append(dialog)
  dialog.showModal()
  // 開いた直後に入力欄へフォーカスが飛んでキーボードが出ないようにする
  if (document.activeElement && dialog.contains(document.activeElement)) {
    const focused = document.activeElement
    if (focused.matches('input, textarea') && !focused.hasAttribute('autofocus')) focused.blur()
  }
  return close
}

// ---------- 確認・入力ダイアログ ----------

function modal(build) {
  return new Promise((resolve) => {
    const dialog = h('dialog', { class: 'modal' })
    let done = false
    function finish(value) {
      if (done) return
      done = true
      dialog.close()
      dialog.remove()
      resolve(value)
    }
    dialog.addEventListener('cancel', (e) => {
      e.preventDefault()
      finish(null)
    })
    build(dialog, finish)
    document.body.append(dialog)
    dialog.showModal()
  })
}

/** はい/いいえ。true か false を返す */
export function confirmDialog({ title, message = '', ok = 'OK', cancel = 'キャンセル', danger = false }) {
  return modal((dialog, finish) => {
    dialog.append(
      h('h2', {}, title),
      message ? h('p', {}, message) : null,
      h(
        'div',
        { class: 'btn-row' },
        h('button', { type: 'button', class: 'btn', onclick: () => finish(false) }, cancel),
        h('button', { type: 'button', class: `btn ${danger ? 'btn-danger' : 'btn-primary'}`, onclick: () => finish(true) }, ok),
      ),
    )
  }).then((v) => v === true)
}

/** 文字を入力してもらう。キャンセルなら null */
export function promptDialog({ title, message = '', value = '', placeholder = '', ok = 'OK', maxLength = 30 }) {
  return modal((dialog, finish) => {
    const input = h('input', { class: 'input', type: 'text', value, placeholder, maxLength, enterkeyhint: 'done' })
    const form = h(
      'form',
      {
        method: 'dialog',
        onsubmit: (e) => {
          e.preventDefault()
          finish(input.value)
        },
      },
      h('h2', {}, title),
      message ? h('p', {}, message) : null,
      input,
      h(
        'div',
        { class: 'btn-row' },
        h('button', { type: 'button', class: 'btn', onclick: () => finish(null) }, 'キャンセル'),
        h('button', { type: 'submit', class: 'btn btn-primary' }, ok),
      ),
    )
    dialog.append(form)
    requestAnimationFrame(() => {
      input.focus()
      input.select()
    })
  })
}

/** 選択肢のシート（メニュー）。選んだ項目の value を返す（閉じたら null） */
export function menuSheet(title, items) {
  return new Promise((resolve) => {
    let chosen = null
    openSheet(
      title,
      (body, close) => {
        body.append(
          h(
            'ul',
            { class: 'list' },
            items.map((item) =>
              h(
                'li',
                {},
                h(
                  'button',
                  {
                    type: 'button',
                    class: 'list-btn',
                    style: item.danger ? { color: 'var(--danger)' } : null,
                    disabled: item.disabled,
                    onclick: () => {
                      chosen = item.value
                      close()
                    },
                  },
                  item.icon ? icon(ICONS[item.icon]) : null,
                  h('span', { class: 'grow' }, item.label),
                ),
              ),
            ),
          ),
        )
      },
      { onClose: () => resolve(chosen) },
    )
  })
}

// ---------- 小さな入力部品 ----------

/** 段階ボタン。options: [{ value, label }] */
export function segmented(options, value, onchange, extra = {}) {
  const root = h('div', { class: 'segmented', role: 'group', ...extra })
  function render(current) {
    replace(
      root,
      options.map((o) =>
        h(
          'button',
          {
            type: 'button',
            'aria-pressed': String(o.value === current),
            onclick: () => {
              if (o.value === current) return
              render(o.value)
              onchange(o.value)
            },
          },
          o.label,
        ),
      ),
    )
  }
  render(value)
  root.setValue = render
  return root
}

/** − 数 ＋ */
export function stepper({ value, min, max, onchange, format = (v) => v, label = '' }) {
  const output = h('output', {}, format(value))
  const minus = h('button', { type: 'button', 'aria-label': `${label}を減らす`, onclick: () => set(value - 1) }, '−')
  const plus = h('button', { type: 'button', 'aria-label': `${label}を増やす`, onclick: () => set(value + 1) }, '＋')
  function set(v, silent = false) {
    value = Math.min(max, Math.max(min, v))
    output.textContent = format(value)
    minus.disabled = value <= min
    plus.disabled = value >= max
    if (!silent) onchange(value)
  }
  set(value, true)
  const root = h('div', { class: 'stepper' }, minus, output, plus)
  root.setValue = (v) => set(v, true)
  root.setRange = (lo, hi) => {
    min = lo
    max = hi
    set(value, true)
  }
  return root
}

/** ラベル付きスイッチ（行全体をタップできる） */
export function switchRow(label, checked, onchange, { note = '' } = {}) {
  const input = h('input', { type: 'checkbox', class: 'switch', role: 'switch', checked, onchange: () => onchange(input.checked) })
  const row = h('label', { class: 'switch-row' }, h('span', { class: 'grow' }, label, note ? h('div', { class: 'small muted' }, note) : null), input)
  row.input = input
  return row
}

// ---------- グループ表示バー ----------

/**
 * 各機能の画面上部に置く「グループ名 · 参加 n/m人」。
 * タップするとグループの切り替えと参加の ON/OFF ができるシートが開く。
 */
export function groupBar() {
  const name = h('span', { class: 'name' })
  const count = h('span', { class: 'count' })
  const button = h(
    'button',
    { type: 'button', class: 'group-bar-btn', onclick: openGroupSheet, 'aria-label': 'グループと参加メンバーを変更' },
    icon(ICONS.users),
    name,
    count,
    icon(ICONS.chevron),
  )
  function render() {
    const group = members.currentGroup()
    name.textContent = group.name
    replace(count, '参加 ', h('b', {}, members.activeMembers().length), ` / ${group.members.length}人`)
  }
  render()
  members.onChange(render)
  return h('div', { class: 'group-bar' }, button)
}

export function openGroupSheet() {
  let unsubscribe = null
  openSheet(
    'グループと参加メンバー',
    (body, close) => {
      function render() {
        const current = members.currentGroup()
        const list = members.members()
        replace(
          body,
          h('div', { class: 'section-title', style: { marginTop: '0' } }, 'グループ'),
          h(
            'ul',
            { class: 'list' },
            members.groups().map((g) =>
              h(
                'li',
                {},
                h(
                  'button',
                  {
                    type: 'button',
                    class: `list-btn${g.id === current.id ? ' is-current' : ''}`,
                    'aria-pressed': String(g.id === current.id),
                    onclick: () => members.selectGroup(g.id),
                  },
                  h('span', { class: 'grow' }, g.name),
                  h('span', { class: 'small muted' }, `${g.members.filter((m) => m.active).length}/${g.members.length}人`),
                  g.id === current.id ? h('span', { 'aria-hidden': 'true' }, '✓') : null,
                ),
              ),
            ),
          ),
          h(
            'div',
            { class: 'row', style: { margin: '20px 4px 8px' } },
            h('div', { class: 'grow small muted', style: { fontWeight: '700' } }, `今回参加（${members.activeMembers().length}/${list.length}人）`),
            list.length
              ? h('button', { type: 'button', class: 'btn btn-ghost', onclick: () => members.setAllActive(!list.every((m) => m.active)) }, list.every((m) => m.active) ? '全員OFF' : '全員ON')
              : null,
          ),
          list.length
            ? h(
                'ul',
                { class: 'list' },
                list.map((m) =>
                  h(
                    'li',
                    {},
                    h(
                      'label',
                      { class: 'list-item', style: { cursor: 'pointer' } },
                      h('span', { class: 'grow', style: m.active ? null : { color: 'var(--text-2)' } }, m.leader ? '★ ' : '', m.name),
                      h('input', {
                        type: 'checkbox',
                        class: 'switch',
                        role: 'switch',
                        checked: m.active,
                        'aria-label': `${m.name}の参加`,
                        onchange: (e) => members.setActive(m.id, e.target.checked),
                      }),
                    ),
                  ),
                ),
              )
            : h('div', { class: 'empty' }, 'このグループにはまだメンバーがいません'),
          h(
            'a',
            {
              class: 'btn btn-soft btn-block',
              href: '#members',
              style: { marginTop: '16px' },
              onclick: () => close(),
            },
            'メンバーを編集する',
          ),
        )
      }
      render()
      unsubscribe = members.onChange(render)
    },
    { onClose: () => unsubscribe?.() },
  )
}

/**
 * 「参加メンバーを読み込む」ボタン。押すと参加メンバーの名前の配列を onload に渡す。
 */
export function loadMembersButton(onload, label = '参加メンバーを読み込む') {
  return h(
    'button',
    {
      type: 'button',
      class: 'btn btn-soft',
      'data-lock': true,
      onclick: () => {
        const list = members.activeMembers()
        if (list.length === 0) {
          toast('参加メンバーがいません。メンバー画面で登録してください')
          return
        }
        onload(list.map((m) => m.name), list)
      },
    },
    icon(ICONS.users),
    label,
  )
}

/** 結果の下に置く「全画面」「共有」ボタン */
export function resultActions({ onStage, onShare }) {
  return h(
    'div',
    { class: 'result-actions' },
    onStage ? h('button', { type: 'button', class: 'btn', onclick: onStage }, icon(ICONS.expand), '全画面') : null,
    onShare ? h('button', { type: 'button', class: 'btn', onclick: onShare }, icon(ICONS.share), '共有') : null,
  )
}

export function setHeader(title, backHref = null) {
  document.getElementById('headerTitle').textContent = title
  const back = document.getElementById('headerBack')
  back.hidden = !backHref
  if (backHref) back.href = backHref
}

/** 項目ごとの色（ルーレットの扇形、あみだの線など） */
export const PALETTE = ['#ef4444', '#f59e0b', '#eab308', '#22c55e', '#14b8a6', '#3b82f6', '#6366f1', '#a855f7', '#ec4899', '#f97316', '#84cc16', '#06b6d4']

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
