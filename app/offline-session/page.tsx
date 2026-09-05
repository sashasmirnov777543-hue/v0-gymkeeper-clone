"use client";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { SessionLogger } from "@/components/session-logger";
import { CardioSession } from "@/components/cardio-session";
import { assessReadiness } from "@/lib/readiness";
import {
  getLocalSession,
  loadLocalSets,
  loadProgramForWorkout,
} from "@/lib/offline";
export default function OfflineSessionPage() {
  return (
    <Suspense fallback={<Message text="Загрузка локальной сессии…" />}>
      <Offline />
    </Suspense>
  );
}
function Offline() {
  const key = useSearchParams().get("key");
  const [loaded, setLoaded] = useState(false);
  const [local, setLocal] = useState<ReturnType<typeof getLocalSession>>(null);
  useEffect(() => {
    setLocal(key ? getLocalSession(key) : null);
    setLoaded(true);
  }, [key]);
  if (!loaded) return <Message text="Загрузка…" />;
  if (!key || !local)
    return (
      <Message text="Локальная сессия не найдена. Проверьте историю и статус синхронизации; очередь автоматически не удаляется." />
    );
  const program = loadProgramForWorkout(local.workoutId);
  const snapshot = local.snapshot;
  const cycle =
    snapshot?.cycle ??
    program?.cycles.find((c) =>
      c.workouts.some((w) => w.id === local.workoutId),
    );
  const workout =
    snapshot?.workout ?? cycle?.workouts.find((w) => w.id === local.workoutId);
  if (!cycle || !workout)
    return (
      <Message text="Контекст старой сессии не найден. Не очищайте хранилище: очередь записей сохранена и может быть синхронизирована с сетью." />
    );
  const assessment = local.readiness ? assessReadiness(local.readiness) : null;
  if (!snapshot)
    return (
      <Message text="Сохранена офлайн-сессия прошлой редакции. Подключите сеть, чтобы перенести фактические записи в историю. Не начинайте по ней новую нагрузку." />
    );
  const status = local.finishedAt ? "pending_sync" : "active";
  if (workout.kind === "cardio")
    return (
      <CardioSession
        session={{
          id: key,
          status,
          startedAt: local.startedAt,
          readinessLevel: assessment?.level,
          adaptationPlan: { revision30: snapshot },
        }}
        workout={{
          id: workout.id,
          title: workout.title,
          cardioZone: workout.cardioZone,
          cardioMinutes: workout.cardioMinutes,
          prescription: workout.prescription,
        }}
        cycle={{ number: cycle.number, name: cycle.name }}
      />
    );
  return (
    <SessionLogger
      session={{
        id: local.remoteId ?? 0,
        status,
        startedAt: local.startedAt,
        readinessLevel: assessment?.level,
        adaptationPlan: { revision30: snapshot },
      }}
      workout={{ id: workout.id, title: workout.title, slot: workout.label }}
      cycle={{
        number: cycle.number,
        name: cycle.name,
        block: cycle.block ?? "h2",
      }}
      exercises={snapshot.exercises}
      initialSets={loadLocalSets(key)}
      lastSetsByName={program?.lastSetsByName ?? {}}
      offlineKey={key}
      profile={snapshot.profile}
      rmrefKg={snapshot.baseKg}
    />
  );
}
function Message({ text }: { text: string }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center gap-4 p-6 text-center">
      <p className="text-base leading-relaxed">{text}</p>
      <Link
        href="/"
        className="inline-flex min-h-12 items-center rounded-lg border border-border px-4"
      >
        На главную
      </Link>
    </main>
  );
}
