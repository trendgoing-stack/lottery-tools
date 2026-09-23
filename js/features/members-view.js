/**
 * メンバー画面：グループの作成・切替・名前変更・複製・削除と、メンバーの登録・編集。
 */
import * as members from '../core/members.js'
import { h, replace, icon, ICONS, iconButton, toast, openSheet, confirmDialog, promptDialog, menuSheet } from '../core/ui.js'

let root
let reorderMode = false

export default {
  id: 'members',
  title: 'メンバー',
  init(el) {
    root = h('div', { class: 'view-inner' })
    el.append(root)
    members.onChange(render)
    render()
  },
}

function render() {
  const group = members.currentGroup()
  const list = members.members()
  const activeCount = list.filter((m) => m.active).length

  replace(
    root,
    // ---- グループ ----
    h(
      'div',
      { class: 'group-chips', role: 'tablist', 'aria-label': 'グループ' },
      members.groups().map((g) =>
        h(
          'button',
          {
            type: 'button',
            class: 'chip',
            role: 'tab',
            'aria-selected': String(g.id === group.id),
            onclick: () => members.selectGroup(g.id),
          },
          g.name,
        ),
      ),
      h('button', { type: 'button', class: 'chip chip-add', onclick: createGroup, 'aria-label': 'グループを追加' }, icon(ICONS.plus), '追加'),
    ),
    h(
      'div',
      { class: 'card group-head' },
      h(
        'div',
        { class: 'row' },
        h('div', { class: 'grow' }, h('div', { class: 'group-name' }, group.name), h('div', { class: 'small muted' }, `参加 ${activeCount} / ${list.length}人`)),
        iconButton('more', 'グループの操作', () => groupMenu(group)),
      ),
      h(
        'form',
        {
          class: 'row add-form',
          onsubmit: (e) => {
            e.preventDefault()
            const result = members.addMember(e.target.elements.name.value)
            if (result.ok) {
              // 追加すると画面を作り直すので、新しい入力欄にフォーカスを戻して続けて入力できるようにする
              root.querySelector('.add-form input')?.focus()
            } else if (result.reason === 'duplicate') {
              toast('同じ名前のメンバーがいます')
            }
          },
        },
        h('input', {
          class: 'input grow',
          name: 'name',
          type: 'text',
          placeholder: '名前を入力して追加',
          maxLength: members.NAME_MAX,
          autocomplete: 'off',
          enterkeyhint: 'enter',
          'aria-label': '追加する名前',
        }),
        h('button', { type: 'submit', class: 'btn btn-primary' }, '追加'),
      ),
      h('button', { type: 'button', class: 'btn btn-ghost btn-block', onclick: openBulkSheet }, '一括入力（改行区切りで貼り付け）'),
    ),

    // ---- メンバー一覧 ----
    h(
      'div',
      { class: 'row list-toolbar' },
      h('div', { class: 'grow section-title', style: { margin: '0' } }, `メンバー（${list.length}人）`),
      list.length > 1
        ? h(
            'button',
            {
              type: 'button',
              class: `btn btn-ghost${reorderMode ? ' is-on' : ''}`,
              'aria-pressed': String(reorderMode),
              onclick: () => {
                reorderMode = !reorderMode
                render()
              },
            },
            reorderMode ? '並べ替えを終了' : '並べ替え',
          )
        : null,
      list.length && !reorderMode
        ? h('button', { type: 'button', class: 'btn btn-ghost', onclick: () => members.setAllActive(activeCount !== list.length) }, activeCount === list.length ? '全員OFF' : '全員ON')
        : null,
    ),
    reorderMode && list.length > 1
      ? h('div', { class: 'btn-row', style: { marginBottom: '8px' } }, h('button', { type: 'button', class: 'btn btn-soft', onclick: () => members.sortMembersByName() }, '名前順に並べる'))
      : null,
    list.length
      ? h(
          'ul',
          { class: 'member-list' },
          list.map((m, i) => memberRow(m, i, list.length)),
        )
      : h(
          'div',
          { class: 'card empty' },
          h('p', { style: { margin: '0 0 4px', fontWeight: '700', color: 'var(--text)' } }, 'まだメンバーがいません'),
          '名前を登録すると、ルーレット・あみだくじ・チーム分けなど全部の機能で使えます。',
        ),
    list.length
      ? h(
          'p',
          { class: 'small muted legend' },
          'スイッチ：今回参加するか（OFFの人は抽選から外れます）　★：リーダー（チーム分けで各チームに分けます）',
        )
      : null,
  )
}

function memberRow(m, index, total) {
  const classes = `member${m.active ? '' : ' is-off'}${m.leader ? ' is-leader' : ''}`
  if (reorderMode) {
    return h(
      'li',
      { class: classes },
      h('span', { class: 'member-index' }, index + 1),
      h('span', { class: 'member-name' }, m.name),
      iconButton('up', `${m.name}を上へ`, () => members.moveMember(m.id, -1), { disabled: index === 0 }),
      iconButton('down', `${m.name}を下へ`, () => members.moveMember(m.id, 1), { disabled: index === total - 1 }),
    )
  }
  return h(
    'li',
    { class: classes },
    h('input', {
      type: 'checkbox',
      class: 'switch',
      role: 'switch',
      checked: m.active,
      'aria-label': `${m.name}の今回参加`,
      onchange: (e) => members.setActive(m.id, e.target.checked),
    }),
    h('button', { type: 'button', class: 'member-name', onclick: () => renameMember(m) }, m.name),
    h(
      'button',
      {
        type: 'button',
        class: 'btn btn-icon leader-btn',
        'aria-label': `${m.name}をリーダーにする`,
        'aria-pressed': String(m.leader),
        title: 'リーダー',
        onclick: () => members.setLeader(m.id, !m.leader),
      },
      icon(ICONS.star),
    ),
    iconButton('more', `${m.name}の操作`, () => memberMenu(m)),
  )
}

async function renameMember(m) {
  const name = await promptDialog({ title: '名前を変更', value: m.name, maxLength: members.NAME_MAX, ok: '変更' })
  if (name == null) return
  const result = members.renameMember(m.id, name)
  if (result.reason === 'duplicate') toast('同じ名前のメンバーがいます')
}

async function memberMenu(m) {
  const action = await menuSheet(m.name, [
    { value: 'rename', label: '名前を変更', icon: 'edit' },
    { value: 'leader', label: m.leader ? 'リーダーを外す' : 'リーダーにする', icon: 'star' },
    { value: 'delete', label: '削除', icon: 'trash', danger: true },
  ])
  if (action === 'rename') renameMember(m)
  if (action === 'leader') members.setLeader(m.id, !m.leader)
  if (action === 'delete') {
    const removed = members.removeMember(m.id)
    if (removed) {
      toast(`${m.name}を削除しました`, {
        duration: 4000,
        action: { label: '元に戻す', run: () => members.restoreMember(removed.member, removed.index) },
      })
    }
  }
}

async function createGroup() {
  const name = await promptDialog({ title: '新しいグループ', message: '例：家族、職場、サークル', value: members.suggestGroupName(), ok: '作成', maxLength: 20 })
  if (name == null) return
  members.createGroup(name)
  toast('グループを作成しました')
}

async function groupMenu(group) {
  const all = members.groups()
  const index = all.indexOf(group)
  const action = await menuSheet(group.name, [
    { value: 'rename', label: 'グループ名を変更', icon: 'edit' },
    { value: 'duplicate', label: 'グループを複製', icon: 'copy' },
    { value: 'left', label: 'グループの順番を左へ', icon: 'up', disabled: index === 0 },
    { value: 'right', label: 'グループの順番を右へ', icon: 'down', disabled: index === all.length - 1 },
    { value: 'clear', label: 'メンバーを全員削除', icon: 'trash', danger: true, disabled: group.members.length === 0 },
    { value: 'delete', label: 'グループを削除', icon: 'trash', danger: true, disabled: all.length <= 1 },
  ])
  if (action === 'rename') {
    const name = await promptDialog({ title: 'グループ名を変更', value: group.name, ok: '変更', maxLength: 20 })
    if (name != null) members.renameGroup(group.id, name)
  } else if (action === 'duplicate') {
    members.duplicateGroup(group.id)
    toast('グループを複製しました')
  } else if (action === 'left') {
    members.moveGroup(group.id, -1)
  } else if (action === 'right') {
    members.moveGroup(group.id, 1)
  } else if (action === 'clear') {
    if (await confirmDialog({ title: 'メンバーを全員削除しますか？', message: `「${group.name}」の ${group.members.length}人を削除します。`, ok: '削除', danger: true })) {
      members.removeAllMembers()
    }
  } else if (action === 'delete') {
    if (await confirmDialog({ title: 'グループを削除しますか？', message: `「${group.name}」とメンバー ${group.members.length}人を削除します。元に戻せません。`, ok: '削除', danger: true })) {
      members.deleteGroup(group.id)
    }
  }
}

function openBulkSheet() {
  openSheet('一括入力', (body, close) => {
    const area = h('textarea', {
      class: 'input',
      placeholder: '1行に1人ずつ入力\n例：\n山田\n佐藤\n鈴木',
      'aria-label': '追加する名前（改行区切り）',
    })
    body.append(
      h('p', { class: 'small muted', style: { marginTop: '0' } }, `「${members.currentGroup().name}」に追加します。改行・カンマ・読点で区切れます。すでにいる名前は追加しません。`),
      area,
      h(
        'button',
        {
          type: 'button',
          class: 'btn btn-primary btn-block',
          style: { marginTop: '12px' },
          onclick: () => {
            const { added, skipped } = members.addMembersFromText(area.value)
            if (added.length === 0 && skipped.length === 0) {
              toast('名前が入力されていません')
              return
            }
            close()
            toast(skipped.length ? `${added.length}人を追加（重複 ${skipped.length}人は除外）` : `${added.length}人を追加しました`)
          },
        },
        'まとめて追加',
      ),
    )
  })
}
