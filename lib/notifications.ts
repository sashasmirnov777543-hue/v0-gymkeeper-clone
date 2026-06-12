"use client"

// Уведомления о конце отдыха: показываются на телефоне и зеркалятся
// на смарт-часы (Huawei Health, Garmin, Wear OS и т.п. — вибрация на запястье).

const SETTING_KEY = "gym:rest-notify"
const TAG = "gym-rest-timer"

export function notificationsSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window
}

export function getRestNotifySetting(): boolean {
  if (typeof localStorage === "undefined") return false
  return localStorage.getItem(SETTING_KEY) === "1"
}

export function setRestNotifySetting(on: boolean) {
  localStorage.setItem(SETTING_KEY, on ? "1" : "0")
}

/** Запросить разрешение (вызывать из обработчика клика). true = разрешено. */
export async function ensureNotificationPermission(): Promise<boolean> {
  if (!notificationsSupported()) return false
  if (Notification.permission === "granted") return true
  if (Notification.permission === "denied") return false
  try {
    const res = await Notification.requestPermission()
    return res === "granted"
  } catch {
    return false
  }
}

async function show(title: string, body: string) {
  if (!notificationsSupported() || Notification.permission !== "granted") return
  const options = {
    body,
    tag: TAG,
    renotify: true,
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    // вибрация телефона; часы вибрируют сами при зеркалировании
    vibrate: [300, 100, 300, 100, 500],
  } as NotificationOptions
  try {
    const reg = await navigator.serviceWorker?.getRegistration()
    if (reg) {
      await reg.showNotification(title, options)
      return
    }
  } catch {
    // нет service worker — пробуем напрямую
  }
  try {
    // на Android Chrome без SW бросит исключение — глотаем
    new Notification(title, options)
  } catch {
    // не поддерживается — ничего не делаем
  }
}

/** Закрыть висящие уведомления таймера (например, при старте нового подхода). */
export async function closeRestNotifications() {
  try {
    const reg = await navigator.serviceWorker?.getRegistration()
    const list = await reg?.getNotifications({ tag: TAG })
    for (const n of list ?? []) n.close()
  } catch {
    // ignore
  }
}

/**
 * Тестовое уведомление через `delayMs` — для проверки связки
 * телефон → часы. Идёт через серверный Web Push (тот же канал, что и
 * боевое уведомление таймера); локальный таймер — запасной вариант.
 */
export function sendTestNotification(delayMs = 10_000): () => void {
  const endAt = Date.now() + delayMs
  const title = "Тест уведомлений"
  const body = "Если видишь это на часах — всё работает."
  let cancelled = false
  let localId: number | null = window.setTimeout(() => {
    void show(title, body)
  }, delayMs)

  void (async () => {
    const sub = await getPushSubscription()
    if (!sub || cancelled) return
    try {
      const res = await fetch("/api/push", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "schedule",
          subscription: sub.toJSON(),
          endAt,
          title,
          body,
          clientTs: Date.now(),
        }),
      })
      if (res.ok && !cancelled && localId !== null) {
        window.clearTimeout(localId)
        localId = null
      }
    } catch {
      // остаёмся на локальном таймере
    }
  })()

  return () => {
    cancelled = true
    if (localId !== null) window.clearTimeout(localId)
  }
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4)
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/")
  const raw = atob(b64)
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)))
}

/** Подписка на серверный Web Push (создаётся один раз, дальше переиспользуется). */
async function getPushSubscription(): Promise<PushSubscription | null> {
  try {
    const reg = await navigator.serviceWorker?.getRegistration()
    if (!reg?.pushManager) return null
    const existing = await reg.pushManager.getSubscription()
    if (existing) return existing
    const res = await fetch("/api/push")
    if (!res.ok) return null
    const { publicKey } = (await res.json()) as { publicKey?: string }
    if (!publicKey) return null
    return await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
    })
  } catch {
    return null
  }
}

/** Заранее создать push-подписку (вызывать при включении тумблера). */
export async function ensurePushReady(): Promise<void> {
  await getPushSubscription()
}

async function cancelServerPush(endpoint: string) {
  try {
    await fetch("/api/push", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "cancel", endpoint, clientTs: Date.now() }),
    })
  } catch {
    // не страшно: новое расписание всё равно перетрёт старое
  }
}

/**
 * Запланировать уведомление на момент конца отдыха `endAtMs`.
 * Основной путь — серверный Web Push: он доходит, даже когда система
 * заморозила приложение при заблокированном экране (клиентский setTimeout
 * в этом случае не срабатывает). Локальный таймер остаётся запасным
 * вариантом на случай, если подписаться/связаться с сервером не удалось
 * (например, нет сети). Возвращает функцию отмены.
 */
export function scheduleRestEndNotification(
  endAtMs: number,
  body: string,
): () => void {
  let cancelled = false
  let endpoint: string | null = null
  let localId: number | null = window.setTimeout(
    () => {
      void show("Время! Следующий подход", body)
    },
    Math.max(0, endAtMs - Date.now()),
  )

  void (async () => {
    const sub = await getPushSubscription()
    if (!sub) return
    endpoint = sub.endpoint
    if (cancelled) return
    try {
      const res = await fetch("/api/push", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "schedule",
          subscription: sub.toJSON(),
          endAt: endAtMs,
          body,
          clientTs: Date.now(),
        }),
      })
      if (!res.ok) return
      if (cancelled) {
        // отменили, пока договаривались с сервером — гасим и там
        void cancelServerPush(endpoint)
        return
      }
      // сервер доставит пуш — локальный дубль больше не нужен
      if (localId !== null) {
        window.clearTimeout(localId)
        localId = null
      }
    } catch {
      // остаёмся на локальном таймере
    }
  })()

  return () => {
    cancelled = true
    if (localId !== null) {
      window.clearTimeout(localId)
      localId = null
    }
    if (endpoint) void cancelServerPush(endpoint)
  }
}
