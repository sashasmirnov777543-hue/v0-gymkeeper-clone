"use client"

/** Звуковые сигналы через Web Audio (работают офлайн, без файлов) */

let ctx: AudioContext | null = null

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return null
    ctx = new Ctor()
  }
  if (ctx.state === "suspended") ctx.resume().catch(() => {})
  return ctx
}

function tone(freq: number, durationMs: number, startDelayMs = 0, volume = 0.4) {
  const ac = getCtx()
  if (!ac) return
  const osc = ac.createOscillator()
  const gain = ac.createGain()
  osc.type = "sine"
  osc.frequency.value = freq
  const t0 = ac.currentTime + startDelayMs / 1000
  const t1 = t0 + durationMs / 1000
  gain.gain.setValueAtTime(0, t0)
  gain.gain.linearRampToValueAtTime(volume, t0 + 0.02)
  gain.gain.setValueAtTime(volume, t1 - 0.04)
  gain.gain.linearRampToValueAtTime(0, t1)
  osc.connect(gain)
  gain.connect(ac.destination)
  osc.start(t0)
  osc.stop(t1)
}

function vibrate(pattern: number | number[]) {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    navigator.vibrate(pattern)
  }
}

/** Предупреждение «20 секунд до начала»: два коротких сигнала */
export function warnBeep() {
  tone(880, 150)
  tone(880, 150, 250)
  vibrate([300, 120, 300])
}

/** Старт подхода: длинный высокий сигнал + продолжительная серия вибраций */
export function startBeep() {
  tone(1175, 200)
  tone(1175, 200, 280)
  tone(1568, 450, 560)
  // длинная серия вибраций — одиночный короткий сигнал легко пропустить
  vibrate([0, 500, 200, 500, 200, 500, 200, 900])
}

/** Лёгкий клик-подтверждение */
export function tickBeep() {
  tone(660, 80, 0, 0.2)
}

/** Пульс достиг цели: одиночный сигнал-колокол */
export function hrBeep() {
  tone(988, 180)
  tone(1319, 350, 200)
  vibrate([250, 80, 250])
}

/**
 * Разблокировка аудио по первому касанию (требование мобильных браузеров).
 * Вызывать в обработчике клика, например при записи подхода.
 */
export function unlockAudio() {
  getCtx()
}
