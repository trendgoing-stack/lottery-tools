/**
 * 共通メンバー管理。すべての機能はここから参加メンバーを取り出す。
 *
 * メンバーは名前ではなく id で参照する（名前を変えても NG ペアや前回のチーム分けが壊れない）。
 * データが変わると "change" を通知するので、各画面は onChange で表示を更新する。
 */
import { load, save, uid, cleanText } from './store.js'

const KEY = 'members'
export const NAME_MAX = 20
const GROUP_NAME_MAX = 20

const events = new EventTarget()
let data = normalize(load(KEY, null))

function newGroup(name) {
  return { id: uid('g'), name, members: [] }
}

function normalize(raw) {
  const groups = Array.isArray(raw?.groups)
    ? raw.groups
        .filter((g) => g && typeof g.id === 'string')
        .map((g) => ({
          id: g.id,
          name: cleanText(g.name, GROUP_NAME_MAX) || 'グループ',
          members: Array.isArray(g.members)
            ? g.members
                .filter((m) => m && typeof m.id === 'string' && cleanText(m.name, NAME_MAX))
                .map((m) => ({
                  id: m.id,
                  name: cleanText(m.name, NAME_MAX),
                  active: m.active !== false,
                  leader: m.leader === true,
                }))
            : [],
        }))
    : []
  if (groups.length === 0) groups.push(newGroup('グループ1'))
  const currentGroupId = groups.some((g) => g.id === raw?.currentGroupId)
    ? raw.currentGroupId
    : groups[0].id
  return { schema: 1, currentGroupId, groups }
}

function commit() {
  save(KEY, data)
  events.dispatchEvent(new Event('change'))
}

export function onChange(listener) {
  events.addEventListener('change', listener)
  return () => events.removeEventListener('change', listener)
}

// ---------- グループ ----------

export function groups() {
  return data.groups
}

export function currentGroup() {
  return data.groups.find((g) => g.id === data.currentGroupId) ?? data.groups[0]
}

export function selectGroup(id) {
  if (!data.groups.some((g) => g.id === id) || data.currentGroupId === id) return
  data.currentGroupId = id
  commit()
}

/** 使われていない「グループN」という名前を作る */
export function suggestGroupName() {
  const names = new Set(data.groups.map((g) => g.name))
  for (let i = data.groups.length + 1; ; i++) {
    if (!names.has(`グループ${i}`)) return `グループ${i}`
  }
}

export function createGroup(name) {
  const group = newGroup(cleanText(name, GROUP_NAME_MAX) || suggestGroupName())
  data.groups.push(group)
  data.currentGroupId = group.id
  commit()
  return group
}

export function renameGroup(id, name) {
  const group = data.groups.find((g) => g.id === id)
  const clean = cleanText(name, GROUP_NAME_MAX)
  if (!group || !clean) return
  group.name = clean
  commit()
}

export function duplicateGroup(id) {
  const source = data.groups.find((g) => g.id === id)
  if (!source) return null
  const copy = {
    id: uid('g'),
    name: cleanText(`${source.name}のコピー`, GROUP_NAME_MAX),
    members: source.members.map((m) => ({ ...m, id: uid('m') })),
  }
  data.groups.splice(data.groups.indexOf(source) + 1, 0, copy)
  data.currentGroupId = copy.id
  commit()
  return copy
}

/** 最後の1つは消さない（false を返す） */
export function deleteGroup(id) {
  if (data.groups.length <= 1) return false
  const index = data.groups.findIndex((g) => g.id === id)
  if (index < 0) return false
  data.groups.splice(index, 1)
  if (data.currentGroupId === id) {
    data.currentGroupId = data.groups[Math.min(index, data.groups.length - 1)].id
  }
  commit()
  return true
}

export function moveGroup(id, delta) {
  const index = data.groups.findIndex((g) => g.id === id)
  const to = index + delta
  if (index < 0 || to < 0 || to >= data.groups.length) return
  const [group] = data.groups.splice(index, 1)
  data.groups.splice(to, 0, group)
  commit()
}

// ---------- メンバー（いま選んでいるグループが対象） ----------

export function members() {
  return currentGroup().members
}

/** 「今回参加」がONのメンバー（登録順） */
export function activeMembers() {
  return currentGroup().members.filter((m) => m.active)
}

export function memberById(id) {
  for (const group of data.groups) {
    const found = group.members.find((m) => m.id === id)
    if (found) return found
  }
  return null
}

function hasName(name, exceptId) {
  return currentGroup().members.some((m) => m.name === name && m.id !== exceptId)
}

/**
 * 1人追加する。
 * @returns {{ ok: true, member } | { ok: false, reason: 'empty' | 'duplicate' }}
 */
export function addMember(name) {
  const clean = cleanText(name, NAME_MAX)
  if (!clean) return { ok: false, reason: 'empty' }
  if (hasName(clean)) return { ok: false, reason: 'duplicate' }
  const member = { id: uid('m'), name: clean, active: true, leader: false }
  currentGroup().members.push(member)
  commit()
  return { ok: true, member }
}

/**
 * 改行（またはカンマ・読点）区切りの文字列からまとめて追加する。
 * 空行と、すでにいる名前・入力の中での重複は飛ばす。
 */
export function addMembersFromText(text) {
  const names = String(text ?? '')
    .split(/[\n\r,、，]+/)
    .map((s) => cleanText(s, NAME_MAX))
    .filter(Boolean)
  const added = []
  const skipped = []
  const group = currentGroup()
  for (const name of names) {
    if (group.members.some((m) => m.name === name)) {
      skipped.push(name)
      continue
    }
    const member = { id: uid('m'), name, active: true, leader: false }
    group.members.push(member)
    added.push(member)
  }
  if (added.length) commit()
  return { added, skipped }
}

/** @returns {{ ok: boolean, reason?: 'empty' | 'duplicate' }} */
export function renameMember(id, name) {
  const member = members().find((m) => m.id === id)
  const clean = cleanText(name, NAME_MAX)
  if (!member) return { ok: false }
  if (!clean) return { ok: false, reason: 'empty' }
  if (hasName(clean, id)) return { ok: false, reason: 'duplicate' }
  member.name = clean
  commit()
  return { ok: true }
}

export function setActive(id, active) {
  const member = members().find((m) => m.id === id)
  if (!member || member.active === active) return
  member.active = active
  commit()
}

export function setAllActive(active) {
  members().forEach((m) => {
    m.active = active
  })
  commit()
}

export function setLeader(id, leader) {
  const member = members().find((m) => m.id === id)
  if (!member || member.leader === leader) return
  member.leader = leader
  commit()
}

export function removeMember(id) {
  const group = currentGroup()
  const index = group.members.findIndex((m) => m.id === id)
  if (index < 0) return null
  const [removed] = group.members.splice(index, 1)
  commit()
  return { member: removed, index }
}

/** 削除を取り消す */
export function restoreMember(member, index) {
  const group = currentGroup()
  if (group.members.some((m) => m.id === member.id)) return
  group.members.splice(Math.min(index, group.members.length), 0, member)
  commit()
}

export function removeAllMembers() {
  currentGroup().members = []
  commit()
}

export function moveMember(id, delta) {
  const list = members()
  const index = list.findIndex((m) => m.id === id)
  const to = index + delta
  if (index < 0 || to < 0 || to >= list.length) return
  const [member] = list.splice(index, 1)
  list.splice(to, 0, member)
  commit()
}

export function sortMembersByName() {
  members().sort((a, b) => a.name.localeCompare(b.name, 'ja'))
  commit()
}
