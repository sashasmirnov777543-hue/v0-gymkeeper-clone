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
 * телефон → часы. Показывается всегда, даже если приложение на экране.
 */
export function sendTestNotification(delayMs = 10_000): () => void {
  const id = window.setTimeout(() => {
    void show(
      "Тест уведомлений",
      "Если видишь это на часах — зеркалирование работает.",
    )
  }, delayMs)
  return () => window.clearTimeout(id)
}

/**
 * Запланировать уведомление на момент конца отдыха `endAtMs`.
 * Показываем всегда, без проверки видимости: на Android при заблокированном
 * экране страница может по-прежнему числиться «видимой»
 * (visibilityState === "visible"), из-за чего уведомления глушились.
 * Лишнее уведомление при открытом приложении безвредно — оно заменяется
 * по tag и закрывается при старте следующего отдыха.
 * Возвращает функцию отмены.
 */
export function scheduleRestEndNotification(
  endAtMs: number,
  body: string,
): () => void {
  const delay = Math.max(0, endAtMs - Date.now())
  const id = window.setTimeout(() => {
    void show("Время! Следующий подход", body)
  }, delay)
  return () => window.clearTimeout(id)
}
