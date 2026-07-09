// Service worker: офлайн-кэширование страниц и статики
const CACHE = "gym-cache-v6"

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(["/"]))
      // Новый worker остаётся waiting: пользователь сам применяет обновление
      // кнопкой в приложении, не теряя незавершённую тренировку.
      .then(() => undefined),
  )
})

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting()
  if (event.data?.type === "CLEAR_CACHES") {
    event.waitUntil(
      caches.keys().then((keys) => Promise.all(keys.map((key) => caches.delete(key)))),
    )
  }
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
  // приватные API и экран входа не кэшируем никогда
  if (url.pathname.startsWith("/api/") || url.pathname === "/login") return

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

// Серверный Web Push: приходит даже когда система заморозила приложение
// при заблокированном экране (клиентские таймеры в этом случае не срабатывают).
self.addEventListener("push", (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    // не JSON — покажем заголовок по умолчанию
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "Время! Следующий подход", {
      body: data.body || "",
      tag: data.tag || "gym-rest-timer",
      renotify: true,
      // держим уведомление на экране, пока не закроют — легче заметить/ощутить
      requireInteraction: true,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      // длинная серия вибраций: одиночный короткий сигнал на часах легко пропустить
      vibrate: [0, 500, 200, 500, 200, 500, 200, 900],
    }),
  )
})

// Тап по уведомлению (например, "Время! Следующий подход") — открыть приложение
self.addEventListener("notificationclick", (event) => {
  event.notification.close()
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((list) => {
        for (const client of list) {
          if ("focus" in client) return client.focus()
        }
        return self.clients.openWindow("/")
      }),
  )
})
