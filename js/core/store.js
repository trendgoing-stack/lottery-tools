/**
 * localStorage の読み書き。
 *
 * GitHub Pages では同じアカウントの他のアプリ（/reversi/ など）と保存領域を共有するため、
 * キーには必ず接頭辞 "lt." を付けて、ほかのアプリのデータと混ざらないようにする。
 * 読み込めない・壊れているときは初期値を返す（アプリが止まらないことを優先）。
 */
import { randInt } from './random.js'

const PREFIX = 'lt.'

export function load(key, fallback) {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    if (raw == null) return structuredClone(fallback)
    const value = JSON.parse(raw)
    return value ?? structuredClone(fallback)
  } catch {
    return structuredClone(fallback)
  }
}

export function save(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value))
    return true
  } catch {
    return false
  }
}

/** このアプリのデータだけをすべて消す */
export function clearAll() {
  try {
    const keys = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && key.startsWith(PREFIX)) keys.push(key)
    }
    keys.forEach((key) => localStorage.removeItem(key))
  } catch {
    /* 消せなくても続ける */
  }
}

/** 保存データの中で使う短い ID */
export function uid(prefix = '') {
  return prefix + Date.now().toString(36) + randInt(36 ** 5).toString(36).padStart(5, '0')
}

/** 文字列を整える（前後の空白を除き、長すぎる分は切る） */
export function cleanText(value, max = 30) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
}

/** 数値を範囲内の整数にそろえる */
export function clampInt(value, min, max, fallback = min) {
  const n = Math.round(Number(value))
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}
