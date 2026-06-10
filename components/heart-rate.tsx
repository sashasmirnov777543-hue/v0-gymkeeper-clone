"use client"

import { Bluetooth, BluetoothConnected, BluetoothOff, Heart } from "lucide-react"
import { useHeartRate } from "@/lib/heart-rate"

/** Компактный бейдж пульса для шапки тренировки/кардио. */
export function HeartRateBadge() {
  const hr = useHeartRate()

  if (!hr.supported) {
    return (
      <span className="flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-xs text-muted-foreground">
        <BluetoothOff className="size-3.5" aria-hidden="true" />
        Нет BLE
      </span>
    )
  }

  if (hr.status === "connected") {
    return (
      <button
        type="button"
        onClick={hr.disconnect}
        className="flex items-center gap-1.5 rounded-full bg-primary/15 px-2.5 py-1 text-sm font-bold text-primary"
        aria-label="Пульс подключён, нажмите чтобы отключить"
      >
        <Heart className="size-4 animate-pulse fill-primary" aria-hidden="true" />
        {hr.bpm ?? "—"}
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={hr.connect}
      disabled={hr.status === "connecting"}
      className="flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-secondary-foreground disabled:opacity-60"
    >
      {hr.status === "connecting" ? (
        <Bluetooth className="size-3.5 animate-pulse" aria-hidden="true" />
      ) : (
        <BluetoothConnected className="size-3.5" aria-hidden="true" />
      )}
      {hr.status === "connecting" ? "Поиск…" : "Пульс"}
    </button>
  )
}
