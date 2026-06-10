"use client"

import { useCallback, useEffect, useRef, useState } from "react"

/**
 * Пульс по Bluetooth (Web Bluetooth, стандартный профиль Heart Rate).
 * Работает с HUAWEI WATCH GT 5 PRO в режиме «Трансляция пульса»
 * (на часах: начать тренировку -> настройки -> Трансляция пульса),
 * а также с любым нагрудным датчиком (Polar, Garmin и т.п.).
 */

export type HrStatus = "idle" | "connecting" | "connected" | "error" | "unsupported"

type HrState = {
  status: HrStatus
  bpm: number | null
  deviceName: string | null
  error: string | null
}

// один общий коннект на всё приложение (таймер и кардио делят датчик)
let globalState: HrState = { status: "idle", bpm: null, deviceName: null, error: null }
let device: BluetoothDevice | null = null
const listeners = new Set<(s: HrState) => void>()
// история пульса для расчёта среднего за тренировку
let bpmLog: { t: number; bpm: number }[] = []

function emit(partial: Partial<HrState>) {
  globalState = { ...globalState, ...partial }
  for (const l of listeners) l(globalState)
}

function parseHeartRate(value: DataView): number {
  // спецификация Heart Rate Measurement: флаг в первом байте
  const flags = value.getUint8(0)
  return flags & 0x01 ? value.getUint16(1, true) : value.getUint8(1)
}

export function isBluetoothSupported(): boolean {
  return typeof navigator !== "undefined" && "bluetooth" in navigator
}

export async function connectHeartRate(): Promise<void> {
  if (!isBluetoothSupported()) {
    emit({ status: "unsupported", error: "Браузер не поддерживает Bluetooth. Откройте приложение в Chrome." })
    return
  }
  emit({ status: "connecting", error: null })
  try {
    device = await navigator.bluetooth.requestDevice({
      filters: [{ services: ["heart_rate"] }],
      optionalServices: ["battery_service"],
    })
    device.addEventListener("gattserverdisconnected", () => {
      emit({ status: "idle", bpm: null })
    })
    const server = await device.gatt?.connect()
    if (!server) throw new Error("GATT недоступен")
    const service = await server.getPrimaryService("heart_rate")
    const char = await service.getCharacteristic("heart_rate_measurement")
    await char.startNotifications()
    char.addEventListener("characteristicvaluechanged", (e) => {
      const target = e.target as BluetoothRemoteGATTCharacteristic
      if (!target.value) return
      const bpm = parseHeartRate(target.value)
      bpmLog.push({ t: Date.now(), bpm })
      // храним максимум 4 часа истории
      if (bpmLog.length > 14400) bpmLog = bpmLog.slice(-14400)
      emit({ status: "connected", bpm })
    })
    emit({ status: "connected", deviceName: device.name ?? "Датчик пульса" })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    // пользователь закрыл окно выбора — не ошибка
    if (msg.includes("cancelled") || msg.includes("User cancelled")) {
      emit({ status: "idle", error: null })
    } else {
      emit({ status: "error", error: msg })
    }
  }
}

export function disconnectHeartRate() {
  try {
    device?.gatt?.disconnect()
  } catch {
    // уже отключён
  }
  device = null
  emit({ status: "idle", bpm: null, deviceName: null })
}

/** Средний пульс за период (для записи кардио-сессии) */
export function averageBpmSince(sinceMs: number): number | null {
  const slice = bpmLog.filter((p) => p.t >= sinceMs)
  if (slice.length === 0) return null
  return Math.round(slice.reduce((a, p) => a + p.bpm, 0) / slice.length)
}

export function useHeartRate() {
  const [state, setState] = useState<HrState>(globalState)

  useEffect(() => {
    listeners.add(setState)
    setState(globalState)
    return () => {
      listeners.delete(setState)
    }
  }, [])

  const connect = useCallback(() => connectHeartRate(), [])
  const disconnect = useCallback(() => disconnectHeartRate(), [])

  return { ...state, connect, disconnect, supported: isBluetoothSupported() }
}

/** Держит экран включённым, пока компонент смонтирован (Wake Lock API) */
export function useWakeLock(enabled = true) {
  const lockRef = useRef<WakeLockSentinel | null>(null)

  useEffect(() => {
    if (!enabled || typeof navigator === "undefined" || !("wakeLock" in navigator)) return

    let released = false
    const acquire = async () => {
      try {
        lockRef.current = await navigator.wakeLock.request("screen")
      } catch {
        // не критично (низкий заряд и т.п.)
      }
    }
    acquire()
    // повторный захват при возвращении на вкладку
    const onVisible = () => {
      if (!released && document.visibilityState === "visible") acquire()
    }
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      released = true
      document.removeEventListener("visibilitychange", onVisible)
      lockRef.current?.release().catch(() => {})
      lockRef.current = null
    }
  }, [enabled])
}
