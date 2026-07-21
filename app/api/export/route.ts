import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  cycles,
  loggedSets,
  sessions,
  workoutExercises,
  workouts,
} from "@/lib/db/schema";
import { requireAuth } from "@/lib/require-auth";

export const dynamic = "force-dynamic";
const esc = (value: unknown) => {
  const text = value == null ? "" : typeof value === "object" ? JSON.stringify(value) : String(value);
  return /[",\n;]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

export async function GET() {
  try {
    await requireAuth();
  } catch {
    return new Response("Unauthorized", { status: 401 });
  }
  const rows = await db
    .select({
      date: sessions.startedAt,
      block: cycles.block,
      cycleNumber: cycles.number,
      slot: workouts.label,
      kind: workouts.kind,
      workoutTitle: workouts.title,
      readiness: sessions.readinessLevel,
      sleepMinutes: sessions.sleepMinutes,
      sleepQuality: sessions.sleepQuality,
      rhrDelta: sessions.morningPulseDelta,
      shoulderPain: sessions.shoulderPain,
      backPain: sessions.backPain,
      sessionSymptoms: sessions.symptoms,
      testBranch: sessions.testBranch,
      exercise: workoutExercises.name,
      role: workoutExercises.role,
      setNumber: loggedSets.setNumber,
      isWarmup: loggedSets.isWarmup,
      weight: loggedSets.weight,
      reps: loggedSets.reps,
      rpe: loggedSets.rpe,
      rir: loggedSets.rir,
      pause: loggedSets.pauseQuality,
      touch: loggedSets.touchPoint,
      trajectory: loggedSets.trajectoryQuality,
      techniqueSigns: loggedSets.techniqueSigns,
      setPain: loggedSets.painScore,
      setSymptoms: loggedSets.symptoms,
      cardioModality: sessions.cardioModality,
      cardioWarmupMinutes: sessions.cardioWarmupMinutes,
      cardioMainMinutes: sessions.cardioMainMinutes,
      cardioCooldownMinutes: sessions.cardioCooldownMinutes,
      cardioRpe: sessions.cardioRpe,
      cardioTalkTest: sessions.cardioTalkTest,
      cardioSymptoms: sessions.cardioSymptoms,
      notes: sessions.notes,
    })
    .from(sessions)
    .innerJoin(workouts, eq(sessions.workoutId, workouts.id))
    .innerJoin(cycles, eq(workouts.cycleId, cycles.id))
    .leftJoin(loggedSets, eq(loggedSets.sessionId, sessions.id))
    .leftJoin(workoutExercises, eq(loggedSets.workoutExerciseId, workoutExercises.id))
    .where(eq(sessions.status, "completed"))
    .orderBy(asc(sessions.startedAt), asc(loggedSets.id));

  const header = [
    "Дата", "Блок", "Цикл", "Слот", "Тип", "Тренировка", "Готовность",
    "Сон мин", "Качество сна", "RHR Δ", "Боль плечо", "Боль спина", "Симптомы сессии", "Тестовая ветка",
    "Упражнение", "Роль", "Подход", "Разминка", "Вес кг", "Повторы", "RPE", "RIR",
    "Пауза", "Касание", "Траектория", "Технические признаки", "Боль сет", "Симптомы сет",
    "Кардио модальность", "Разминка кардио", "Основная зона", "Заминка", "RPE кардио", "Разговорный тест", "Симптомы кардио", "Заметка",
  ].join(";");
  const lines = rows.map((row) => [
    row.date.toISOString(), row.block, row.cycleNumber, row.slot, row.kind, row.workoutTitle,
    row.readiness, row.sleepMinutes, row.sleepQuality, row.rhrDelta, row.shoulderPain, row.backPain,
    row.sessionSymptoms, row.testBranch, row.exercise, row.role, row.setNumber, row.isWarmup,
    row.weight, row.reps, row.rpe, row.rir, row.pause, row.touch, row.trajectory,
    row.techniqueSigns, row.setPain, row.setSymptoms, row.cardioModality, row.cardioWarmupMinutes,
    row.cardioMainMinutes, row.cardioCooldownMinutes, row.cardioRpe, row.cardioTalkTest,
    row.cardioSymptoms, row.notes,
  ].map(esc).join(";"));
  const csv = `\uFEFF${[header, ...lines].join("\n")}`;
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="gym-history-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
