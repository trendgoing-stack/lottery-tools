/**
 * 結果をテキストで共有する。Web Share API が使えなければクリップボードにコピーする。
 */
import { toast } from './ui.js'

export async function shareText(text, title = '抽選ツール') {
  if (navigator.share) {
    try {
      await navigator.share({ title, text })
      return 'shared'
    } catch (error) {
      if (error?.name === 'AbortError') return 'cancelled'
      // 共有に失敗したらコピーに切り替える
    }
  }
  if (await copyText(text)) {
    toast('結果をコピーしました')
    return 'copied'
  }
  toast('共有できませんでした')
  return 'failed'
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    // http で開いているときなど、clipboard API が使えない環境向け
    const area = document.createElement('textarea')
    area.value = text
    area.setAttribute('readonly', '')
    area.style.position = 'fixed'
    area.style.opacity = '0'
    document.body.append(area)
    area.select()
    let ok = false
    try {
      ok = document.execCommand('copy')
    } catch {
      ok = false
    }
    area.remove()
    return ok
  }
}
