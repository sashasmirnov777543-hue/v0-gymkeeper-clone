// Service worker: офлайн-кэширование страниц и статики
const CACHE = "gym-cache-v1"

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(["/"]))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  )
})

self.addEventListener("fetch", (event) => {
  const req = event.request
  if (req.method !== "GET") return

  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return
  // синхронизацию не кэшируем никогда
  if (url.pathname.startsWith("/api/sync")) return

  const isStatic =
    url.pathname.startsWith("/_next/static") ||
    /\.(png|jpg|svg|ico|woff2?)$/.test(url.pathname)

  if (isStatic) {
    // статика: cache-first
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone()
              caches.open(CACHE).then((c) => c.put(req, copy))
            }
            return res
          }),
      ),
    )
    return
  }

  // страницы и данные: network-first с фолбэком на кэш
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put(req, copy))
        }
        return res
      })
      .catch(() =>
        caches.match(req).then((hit) => {
          if (hit) return hit
          if (req.mode === "navigate") return caches.match("/")
          return Response.error()
        }),
      ),
  )
})
