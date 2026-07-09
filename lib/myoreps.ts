export const MYOREPS_REST_SECONDS = 20
export const MYOREPS_MIN_REPS = 3
export const MYOREPS_MAX_REPS = 5
export const MYOREPS_MAX_MINI_SETS = 4

/** Миорепсы оставляем только для бицепса/брахиалиса — не для жима, трицепса и предплечий. */
export function isMyorepsEligible(name: string): boolean {
  const normalized = name.toLocaleLowerCase("ru-RU")
  const target = /бицеп|молотк|сгибан/.test(normalized)
  const excluded = /запяст|обратн|трицеп|разгибан/.test(normalized)
  return target && !excluded
}

/** Фазы, где дополнительная усталость не окупается. */
export function isMyorepsAllowed(block: string, cycleNumber: number): boolean {
  if (block === "v9") return ![4, 8, 10, 11, 12, 13].includes(cycleNumber)
  if (block === "h2") return ![5, 9].includes(cycleNumber)
  return false
}

export function myorepsStopReason(input: {
  miniSets: number
  lastMiniSetReps: number | null
  techniqueOk: boolean
  pain: boolean
}): string | null {
  if (input.pain) return "Стоп: появилась боль."
  if (!input.techniqueOk) return "Стоп: техника или скорость ухудшились."
  if (input.lastMiniSetReps != null && input.lastMiniSetReps < MYOREPS_MIN_REPS) {
    return "Стоп: в мини-серии меньше 3 повторов."
  }
  if (input.miniSets >= MYOREPS_MAX_MINI_SETS) return "Лимит 4 мини-серии достигнут."
  return null
}
