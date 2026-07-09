"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { applyAmrapTmRecalc, applyManualTrainingMax, latestAmrapSessionId, undoLatestTmRecalc } from "@/lib/tm-recalc"
import { roundToStep } from "@/lib/training-logic"
import { requireAuth } from "@/lib/require-auth"

export async function saveManualTm(formData: FormData) {
  await requireAuth()
  const macro = Number(formData.get("macro"))
  const raw = Number(String(formData.get("tm") ?? "").replace(",", "."))
  if (![1, 2, 3].includes(macro) || !Number.isFinite(raw) || raw <= 0) {
    redirect("/settings?error=Некорректный+TM")
  }
  const tm = roundToStep(raw)
  const updated = await applyManualTrainingMax(macro, tm)
  revalidatePath("/")
  revalidatePath("/settings")
  redirect(`/settings?message=TM+Макро+${macro}+установлен+${tm}+кг,+обновлено+${updated}+упражнений`)
}

export async function recalculateLastAmrap() {
  await requireAuth()
  const sessionId = await latestAmrapSessionId()
  if (sessionId == null) redirect("/settings?error=AMRAP-сессия+не+найдена")
  const result = await applyAmrapTmRecalc(sessionId, { force: true })
  if (!result) redirect("/settings?error=AMRAP+не+подходит+для+пересчёта")
  revalidatePath("/")
  revalidatePath("/history")
  revalidatePath("/settings")
  redirect(`/settings?message=AMRAP+пересчитан:+TM+${result.newTm}+кг`)
}

export async function undoLastTmChange() {
  await requireAuth()
  const result = await undoLatestTmRecalc()
  if (!result) redirect("/settings?error=Нет+пересчёта,+который+можно+отменить")
  revalidatePath("/")
  revalidatePath("/settings")
  redirect(`/settings?message=TM+Макро+${result.macro}+возвращён+к+${result.restoredTm}+кг`)
}
