/**
 * Service Worker：キャッシュファーストで完全オフライン動作させる。
 *
 * 更新の流れ：
 *  1. ファイルを変更したら VERSION を上げる（node scripts/bump-version.mjs <版>）
 *  2. ブラウザが sw.js の変化を検出すると、新しい SW がファイルを取り直してキャッシュする
 *     （HTTP キャッシュを使わず必ずサーバーから取る。古いファイルと新しいファイルが混ざらないように）
 *  3. 画面上部に「更新があります」を出し、タップされたら新しい SW に切り替えて再読み込みする
 *  4. 切り替わった SW が古いバージョンのキャッシュを削除する
 *
 * パスはすべて「この sw.js が置かれている場所」からの相対で解決するので、
 * GitHub Pages のサブパス配信（/lottery-tools/）でもそのまま動く。
 * 同じドメインの他のアプリ（/reversi/ など）のキャッシュを消さないよう、接頭辞で区別する。
 */
const VERSION = '1.0.1'
const CACHE_PREFIX = 'lottery-tools-'
const CACHE_NAME = `${CACHE_PREFIX}v${VERSION}`

// scripts/bump-version.mjs が、ここに漏れがないか確認する
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/base.css',
  './css/features.css',
  './js/version.js',
  './js/app.js',
  './js/core/random.js',
  './js/core/store.js',
  './js/core/members.js',
  './js/core/settings.js',
  './js/core/sound.js',
  './js/core/wakelock.js',
  './js/core/ui.js',
  './js/core/share.js',
  './js/core/stage.js',
  './js/core/show.js',
  './js/features/members-view.js',
  './js/features/dice.js',
  './js/features/roulette.js',
  './js/features/amida.js',
  './js/features/teams.js',
  './js/features/more.js',
  './js/features/more/order.js',
  './js/features/more/janken.js',
  './js/features/more/lots.js',
  './js/features/more/coin.js',
  './icons/apple-touch-icon.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll(ASSETS.map((url) => new Request(url, { cache: 'reload' }))),
    ),
  )
  // すぐには切り替えない（画面側で「更新があります」をタップしてもらう）
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting()
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  // スコープ外（同じドメインの他のアプリ）には関わらない
  if (!url.href.startsWith(self.registration.scope)) return

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME)
      // ページの表示は常にキャッシュ済みの index.html を返す
      const cached =
        request.mode === 'navigate'
          ? await cache.match('./index.html')
          : await cache.match(request, { ignoreSearch: true })
      if (cached) return cached
      return fetch(request)
    })(),
  )
})
