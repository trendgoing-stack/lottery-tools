/** アプリ全体の設定（ミュート・演出スキップ） */
import { load, save } from './store.js'

const KEY = 'settings'
const events = new EventTarget()
const raw = load(KEY, {})
const data = {
  muted: raw.muted === true,
  skipAnimation: raw.skipAnimation === true,
}

export function get() {
  return data
}

export function set(patch) {
  Object.assign(data, patch)
  save(KEY, data)
  events.dispatchEvent(new Event('change'))
}

export function onChange(listener) {
  events.addEventListener('change', listener)
}
