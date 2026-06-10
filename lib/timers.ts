"use client"

import { useCallback, useEffect, useRef, useState } from "react"

/**
 * Обратный отсчёт. Возвращает оставшиеся секунды и управление.
 * onWarn срабатывает один раз за `warnAt` секунд до конца, onDone — в конце.
 */
export function useCountdown(opts: {
  onWarn?: () => void
  onDone?: () => void
  warnAt?: number
}) {
  const { onWarn, onDone, warnAt = 20 } = opts
  const [remaining, setRemaining] = useState(0)
  const [total, setTotal] = useState(0)
  const [running, setRunning] = useState(false)
  const endRef = useRef<number>(0)
  const warnedRef = useRef(false)
  const rafRef = useRef<number | null>(null)

  const tick = useCallback(() => {
    const ms = endRef.current - Date.now()
    const secs = Math.max(0, Math.ceil(ms / 1000))
    setRemaining(secs)

    if (!warnedRef.current && secs <= warnAt && secs > 0) {
      warnedRef.current = true
      onWarn?.()
    }
    if (ms <= 0) {
      setRunning(false)
      onDone?.()
      return
    }
    rafRef.current = requestAnimationFrame(tick)
  }, [onWarn, onDone, warnAt])

  const start = useCallback(
    (seconds: number) => {
      if (seconds <= 0) return
      endRef.current = Date.now() + seconds * 1000
      warnedRef.current = seconds <= warnAt
      setTotal(seconds)
      setRemaining(seconds)
      setRunning(true)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      rafRef.current = requestAnimationFrame(tick)
    },
    [tick, warnAt],
  )

  const stop = useCallback(() => {
    setRunning(false)
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = null
  }, [])

  const adjust = useCallback((deltaSeconds: number) => {
    endRef.current += deltaSeconds * 1000
    const secs = Math.max(0, Math.ceil((endRef.current - Date.now()) / 1000))
    setRemaining(secs)
    setTotal((t) => Math.max(secs, t + deltaSeconds))
  }, [])

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [])

  return { remaining, total, running, start, stop, adjust }
}
