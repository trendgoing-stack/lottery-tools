/**
 * PWA 用アイコン(PNG)を生成するスクリプト。外部ライブラリは使わない。
 *   node scripts/generate-icons.mjs
 *
 * 紫の背景に、少し傾けた白いサイコロ（5の目、中央だけ金色）を置いたデザイン。
 */
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'icons')

const BG_TOP = [110, 92, 245]
const BG_BOTTOM = [70, 52, 200]
const SHADOW = [48, 34, 150]
const DIE = [255, 255, 255]
const PIP = [70, 52, 200]
const GOLD = [245, 158, 11]
function crc32(buf) {
  const table = []
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  let crc = 0xffffffff
  for (const byte of buf) crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(typeAndData))
  return Buffer.concat([length, typeAndData, crc])
}

function encodePng(size, colorAt) {
  const raw = Buffer.alloc(size * (size * 3 + 1))
  let offset = 0
  const SAMPLES = 3 // 3x3 で平均してギザギザを抑える
  for (let y = 0; y < size; y++) {
    raw[offset++] = 0 // filter: none
    for (let x = 0; x < size; x++) {
      let r = 0
      let g = 0
      let b = 0
      for (let sy = 0; sy < SAMPLES; sy++) {
        for (let sx = 0; sx < SAMPLES; sx++) {
          const px = (x + (sx + 0.5) / SAMPLES) / size
          const py = (y + (sy + 0.5) / SAMPLES) / size
          const c = colorAt(px, py)
          r += c[0]
          g += c[1]
          b += c[2]
        }
      }
      const n = SAMPLES * SAMPLES
      raw[offset++] = Math.round(r / n)
      raw[offset++] = Math.round(g / n)
      raw[offset++] = Math.round(b / n)
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 2 // color type: truecolor
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}


const ANGLE = (-12 * Math.PI) / 180

/** 角の丸い正方形（中心 0,0、半辺 half、角の半径 r）の内側か */
function inRoundedSquare(x, y, half, r) {
  const qx = Math.abs(x) - (half - r)
  const qy = Math.abs(y) - (half - r)
  const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0))
  return outside + Math.min(Math.max(qx, qy), 0) - r <= 0
}

const PIPS = [
  [-1, -1],
  [1, -1],
  [0, 0],
  [-1, 1],
  [1, 1],
]

/** x, y は 0..1。scale を小さくすると絵柄が内側に寄る（maskable 用）。 */
function colorAt(x, y, scale) {
  const bg = BG_TOP.map((c, i) => Math.round(c + (BG_BOTTOM[i] - c) * y))
  const nx = (x - 0.5) / scale
  const ny = (y - 0.5) / scale
  const rot = (px, py) => [px * Math.cos(ANGLE) + py * Math.sin(ANGLE), -px * Math.sin(ANGLE) + py * Math.cos(ANGLE)]

  const [rx, ry] = rot(nx, ny)
  if (inRoundedSquare(rx, ry, 0.3, 0.07)) {
    for (let i = 0; i < PIPS.length; i++) {
      const [px, py] = PIPS[i]
      if (Math.hypot(rx - px * 0.15, ry - py * 0.15) < 0.058) return i === 2 ? GOLD : PIP
    }
    return DIE
  }
  // 影
  const [sx, sy] = rot(nx - 0.025, ny - 0.04)
  if (inRoundedSquare(sx, sy, 0.3, 0.07)) return SHADOW
  return bg
}

function makeIcon(size, { maskable }) {
  const scale = maskable ? 0.78 : 1
  return encodePng(size, (x, y) => colorAt(x, y, scale))
}

mkdirSync(OUT_DIR, { recursive: true })
const files = [
  ['icon-192.png', 192, { maskable: false }],
  ['icon-512.png', 512, { maskable: false }],
  ['icon-maskable-512.png', 512, { maskable: true }],
  ['apple-touch-icon.png', 180, { maskable: false }],
]
for (const [name, size, options] of files) {
  writeFileSync(join(OUT_DIR, name), makeIcon(size, options))
  console.log('generated', name)
}
