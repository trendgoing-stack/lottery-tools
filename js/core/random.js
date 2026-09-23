/**
 * 乱数はすべてここを通す（Math.random は使わない）。
 *
 * crypto.getRandomValues で 32bit の値を取り、「n で割り切れる範囲」を超えた値は
 * 捨てて引き直す（棄却サンプリング）。単純に % n すると小さい値がわずかに
 * 出やすくなるので、それを防ぐ。
 */

const RANGE = 0x100000000 // 2^32
const buffer = new Uint32Array(1)

function nextUint32() {
  crypto.getRandomValues(buffer)
  return buffer[0]
}

/** 0 以上 n 未満の整数を偏りなく返す */
export function randInt(n) {
  if (!Number.isInteger(n) || n <= 0 || n > RANGE) {
    throw new RangeError(`randInt: n は 1〜2^32 の整数にしてください（${n}）`)
  }
  const limit = RANGE - (RANGE % n)
  let x
  do {
    x = nextUint32()
  } while (x >= limit)
  return x % n
}

/** min 以上 max 以下の整数 */
export function randRange(min, max) {
  return min + randInt(max - min + 1)
}

/** 0 以上 1 未満の小数（演出の揺らぎ用。結果を決めるときは randInt を使う） */
export function randFloat() {
  return nextUint32() / RANGE
}

/** 表か裏か（true / false） */
export function coin() {
  return randInt(2) === 1
}

/** 配列から1つ選ぶ */
export function pick(array) {
  return array[randInt(array.length)]
}

/** Fisher–Yates で並べ替えた新しい配列を返す（元の配列は変えない） */
export function shuffle(array) {
  const result = array.slice()
  for (let i = result.length - 1; i > 0; i--) {
    const j = randInt(i + 1)
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

/** 重み（0 以上の整数）に比例した確率で添字を選ぶ。重みがすべて 0 なら -1 */
export function weightedIndex(weights) {
  const total = weights.reduce((sum, w) => sum + w, 0)
  if (total <= 0) return -1
  let r = randInt(total)
  for (let i = 0; i < weights.length; i++) {
    if (r < weights[i]) return i
    r -= weights[i]
  }
  return weights.length - 1
}
