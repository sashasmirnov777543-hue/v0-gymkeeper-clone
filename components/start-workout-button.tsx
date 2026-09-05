"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Play, X } from "lucide-react";
import { startSession } from "@/app/actions/workout";
import { createLocalSession, findLocalSession } from "@/lib/offline";
import {
  assessReadiness,
  type ClinicalStopFlag,
  type ReadinessInput,
} from "@/lib/readiness";
import {
  DEFAULT_SAFETY_PROFILE,
  sessionStartReasons,
  type SafetyProfile,
} from "@/lib/program/policy";

const FLAGS: Array<[ClinicalStopFlag, string]> = [
  [
    "vision_symptoms",
    "Вспышки, новые мушки, тень/занавес или внезапное ухудшение зрения",
  ],
  ["chest_pressure", "Боль, давление или сдавление в груди"],
  ["unwell_palpitations", "Необычное сердцебиение с плохим самочувствием"],
  ["disproportionate_dyspnea", "Одышка, несоразмерная нагрузке"],
  ["presyncope_or_syncope", "Предобморок или обморок"],
  [
    "severe_dizziness_confusion_or_ataxia",
    "Сильное головокружение, спутанность или шаткость",
  ],
  [
    "new_or_progressive_neurologic_or_cauda_equina_signs",
    "Новая/нарастающая слабость, онемение или нарушения мочеиспускания/кишечника",
  ],
  [
    "significant_medication_sedation_confusion_or_hyperthermia",
    "Небезопасная седация, спутанность или гипертермия с нарушением координации",
  ],
  ["pain_changes_movement", "Боль меняет движение"],
  ["unsafe_loss_of_control", "Опасная потеря контроля движения или штанги"],
];
export function StartWorkoutButton({
  workoutId,
  workoutKind,
  hasActive,
  activeSessionId,
  testBranches = [],
  isControl = false,
  finalTest = false,
  initialBranch = "triple",
  profile = DEFAULT_SAFETY_PROFILE,
  absoluteCycle = 1,
}: {
  workoutId: number;
  workoutKind: string;
  hasActive: boolean;
  activeSessionId?: number;
  testBranches?: Array<{ id: string; name: string; default?: boolean }>;
  isControl?: boolean;
  finalTest?: boolean;
  initialBranch?: "triple" | "direct_1rm";
  profile?: SafetyProfile;
  absoluteCycle?: number;
}) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [readiness, setReadiness] = useState<ReadinessInput>({});
  const [sleep, setSleep] = useState("");
  const [quality, setQuality] = useState("");
  const [rhr, setRhr] = useState("");
  const [twoMornings, setTwoMornings] = useState(false);
  const [unwell, setUnwell] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const [spotter, setSpotter] = useState(false);
  const [safeties, setSafeties] = useState(false);
  const [branch, setBranch] = useState(initialBranch);
  const [video, setVideo] = useState(false);
  const [planAgreed, setPlanAgreed] = useState(false);
  const [attempts, setAttempts] = useState(1);
  useEffect(() => {
    if (open) dialog.current?.showModal();
    else dialog.current?.close();
  }, [open]);
  const submission: ReadinessInput = {
    ...readiness,
    ...(sleep !== "" ? { sleepMinutes: Number(sleep) } : {}),
    ...(quality !== "" ? { sleepQuality: Number(quality) } : {}),
    ...(rhr !== ""
      ? {
          restingHeartRateTrend: {
            deltaFromBaselineBpm: Number(rhr),
            comparableMornings: twoMornings ? 2 : 1,
            poorWellbeing: unwell,
          },
        }
      : {}),
  };
  const assessment = assessReadiness(submission);
  const reasons = sessionStartReasons({
    profile,
    readiness: assessment.level,
    kind: workoutKind,
    isRestDay: false,
    isControl,
    directBranch: branch === "direct_1rm",
    finalTest,
    cycle: absoluteCycle,
    spotterPresent: spotter,
    safetiesSet: safeties,
    sideVideoReady: video,
    directHistoryVerified: true,
    technicalIssue:
      readiness.heavyButSafeWarmup ||
      readiness.clearlyExcessiveWarmupOrFirstSetRpe,
  });
  // The browser does not certify preparation history; the server checks recorded sets at launch.
  const canStart =
    reviewed &&
    reasons.length === 0 &&
    (!finalTest || branch !== "direct_1rm" || planAgreed);
  const selection = {
    branch,
    spotterPresent: spotter,
    safetiesSet: safeties,
    sideVideoReady: video,
    readinessReviewed: reviewed,
    heavyWarmup: readiness.heavyButSafeWarmup === true,
    technicalIssue: readiness.clearlyExcessiveWarmupOrFirstSetRpe === true,
    directOneRm:
      branch === "direct_1rm"
        ? {
            attemptPlanAgreedBeforeWarmupWithQualifiedCoach: planAgreed,
            plannedAttempts: attempts,
          }
        : undefined,
  };
  const offlineRestricted = isControl || finalTest || branch === "direct_1rm";
  async function launch() {
    if (!canStart) return;
    setBusy(true);
    setError(null);
    try {
      const local = findLocalSession(workoutId);
      if (local) {
        router.push(`/offline-session?key=${local}`);
        return;
      }
      if (!navigator.onLine) {
        if (offlineRestricted)
          throw new Error(
            "Контроль и отдельная ветка 1ПМ запускаются только с сетью. Пропуск не компенсировать.",
          );
        const key = createLocalSession(workoutId, submission, selection);
        router.push(`/offline-session?key=${key}`);
        return;
      }
      await startSession(workoutId, submission, selection);
    } catch (e) {
      if (
        !offlineRestricted &&
        (!navigator.onLine ||
          (e instanceof TypeError && /fetch|network/i.test(e.message)))
      ) {
        try {
          const key = createLocalSession(workoutId, submission, selection);
          router.push(`/offline-session?key=${key}`);
        } catch (cause) {
          setError(
            cause instanceof Error
              ? cause.message
              : "Нет актуального офлайн-плана.",
          );
        }
      } else setError(e instanceof Error ? e.message : "Не удалось начать.");
    } finally {
      setBusy(false);
    }
  }
  const setFlag = (flag: ClinicalStopFlag, value: boolean) =>
    setReadiness({
      ...readiness,
      clinicalStopFlags: { ...readiness.clinicalStopFlags, [flag]: value },
    });
  const field =
    "mt-1 min-h-11 w-full min-w-0 rounded-lg border border-input bg-background px-3 text-base";
  return (
    <>
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          if (hasActive && activeSessionId)
            router.push(`/session/${activeSessionId}`);
          else setOpen(true);
        }}
        className="flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-base font-bold text-primary-foreground shadow-lg disabled:opacity-60"
      >
        <Play className="size-5" />
        {hasActive
          ? "Продолжить активную сессию"
          : "Проверить готовность и начать"}
      </button>
      <dialog
        ref={dialog}
        onCancel={() => setOpen(false)}
        onClose={() => setOpen(false)}
        aria-labelledby="readiness-title"
        className="m-auto max-h-[92dvh] w-[calc(100%_-_2rem)] max-w-lg overflow-y-auto rounded-2xl border border-border bg-card p-5 text-foreground backdrop:bg-black/75"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void launch();
          }}
          className="space-y-4"
        >
          <header className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-primary">
                Перед каждой сессией
              </p>
              <h2 id="readiness-title" className="mt-1 text-xl font-bold">
                Готовность и страховка
              </h2>
            </div>
            <button
              type="button"
              aria-label="Закрыть проверку"
              className="grid size-11 shrink-0 place-items-center"
              onClick={() => setOpen(false)}
            >
              <X className="size-5" />
            </button>
          </header>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Неизвестные показатели оставьте пустыми. Отметьте симптомы и факторы
            восстановления; хорошее самочувствие не заменяет индивидуальные
            ограничения.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm">
              Сон, минут
              <input
                className={field}
                type="number"
                min="0"
                max="1440"
                value={sleep}
                onChange={(e) => setSleep(e.target.value)}
              />
            </label>
            <label className="text-sm">
              Качество сна
              <select
                className={field}
                value={quality}
                onChange={(e) => setQuality(e.target.value)}
              >
                <option value="">Не оценено</option>
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    {n}/5
                  </option>
                ))}
              </select>
            </label>
            <label className="col-span-2 text-sm">
              Утренний пульс относительно личной базы, уд/мин
              <input
                className={field}
                type="number"
                min="-30"
                max="60"
                value={rhr}
                onChange={(e) => setRhr(e.target.value)}
              />
            </label>
          </div>
          <fieldset className="rounded-xl border border-border p-3">
            <legend className="px-1 text-sm font-semibold">
              Восстановление
            </legend>
            <CheckRow
              label="Необычная усталость после смен"
              checked={readiness.unusualShiftFatigue === true}
              set={(v) =>
                setReadiness({ ...readiness, unusualShiftFatigue: v })
              }
            />
            <CheckRow
              label="Лёгкая мышечная болезненность"
              checked={readiness.mildSoreness === true}
              set={(v) => setReadiness({ ...readiness, mildSoreness: v })}
            />
            <CheckRow
              label="RHR повышен два сопоставимых утра"
              checked={twoMornings}
              set={setTwoMornings}
            />
            <CheckRow
              label="Одновременно ухудшилось самочувствие"
              checked={unwell}
              set={setUnwell}
            />
            <CheckRow
              label="Разминка тяжёлая, но безопасная"
              checked={readiness.heavyButSafeWarmup === true}
              set={(v) => setReadiness({ ...readiness, heavyButSafeWarmup: v })}
            />
            <CheckRow
              label="Усилие разминки явно выше ожидаемого"
              checked={readiness.clearlyExcessiveWarmupOrFirstSetRpe === true}
              set={(v) =>
                setReadiness({
                  ...readiness,
                  clearlyExcessiveWarmupOrFirstSetRpe: v,
                })
              }
            />
          </fieldset>
          <fieldset className="rounded-xl border border-destructive/40 bg-destructive/5 p-3">
            <legend className="px-1 text-sm font-semibold text-destructive">
              Красные стоп-сигналы
            </legend>
            {FLAGS.map(([flag, label]) => (
              <CheckRow
                key={flag}
                label={label}
                checked={readiness.clinicalStopFlags?.[flag] === true}
                set={(v) => setFlag(flag, v)}
              />
            ))}
          </fieldset>
          {workoutKind !== "cardio" && (
            <fieldset className="rounded-xl border border-border p-3">
              <legend className="px-1 text-sm font-semibold">
                Страховка штанги
              </legend>
              <p className="mb-2 text-sm">
                Обычная работа: упоры или страхующий. КТ: и упоры, и помощь
                страхующего.
              </p>
              <CheckRow
                label="Упоры правильно выставлены"
                checked={safeties}
                set={setSafeties}
              />
              <CheckRow
                label="Присутствует компетентный страхующий"
                checked={spotter}
                set={setSpotter}
              />
            </fieldset>
          )}
          {testBranches.length > 0 && (
            <fieldset className="rounded-xl border border-primary/40 p-3">
              <legend className="px-1 text-sm font-semibold">
                Одна жимовая ветка
              </legend>
              <label className="text-sm">
                Вариант
                <select
                  className={field}
                  value={branch}
                  onChange={(e) => setBranch(e.target.value as typeof branch)}
                >
                  <option value="triple">Основная · тройка в финале</option>
                  <option value="direct_1rm">Отдельная подготовка 1ПМ</option>
                </select>
              </label>
              <p className="mt-2 text-sm">
                Альтернатива заменяет основной жим; упражнения не складываются.
              </p>
              {finalTest && branch === "direct_1rm" && (
                <>
                  <CheckRow
                    label="Видео сбоку готово"
                    checked={video}
                    set={setVideo}
                  />
                  <CheckRow
                    label="План попыток заранее согласован; не нужен непроверенный скачок веса"
                    checked={planAgreed}
                    set={setPlanAgreed}
                  />
                  <label className="block text-sm">
                    Не более попыток
                    <select
                      className={field}
                      value={attempts}
                      onChange={(e) => setAttempts(Number(e.target.value))}
                    >
                      {[1, 2, 3].map((n) => (
                        <option key={n}>{n}</option>
                      ))}
                    </select>
                  </label>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Подготовительные синглы проверяются по журналу на сервере.
                    Можно закончить ниже истинного максимума.
                  </p>
                </>
              )}
            </fieldset>
          )}
          <div
            className={`rounded-xl border p-4 readiness-${assessment.level}`}
          >
            <strong>
              {assessment.level === "green"
                ? "Зелёный — план с контролем усилия"
                : assessment.level === "yellow"
                  ? "Жёлтый — облегчённый план"
                  : assessment.level === "orange"
                    ? "Оранжевый — техника или отдых"
                    : "Красный — нагрузка отменяется"}
            </strong>
            <p className="mt-2 text-sm leading-relaxed">
              {assessment.level === "yellow"
                ? "Вес −5%, −1 рабочий сет, подсобка примерно вдвое; кардио не более min(план,15)."
                : assessment.level === "orange"
                  ? "При отсутствии симптомов вместо плана 2×3 на 50–60% R, легко и без подсобки; кардио не добавляется."
                  : assessment.level === "red"
                    ? "Не проверять себя разминкой. При внезапных, выраженных или нарастающих симптомах нужна срочная медицинская помощь."
                    : "Реальный RPE после каждого сета; никаких обязательных прибавок."}
            </p>
          </div>
          <CheckRow
            label="Я проверил(а) сегодняшнее состояние и отметил(а) важные симптомы и ограничения"
            checked={reviewed}
            set={setReviewed}
          />
          {reasons.length > 0 && (
            <div className="rounded-lg bg-warning/10 p-3 text-sm leading-relaxed">
              {reasons.map((reason) => (
                <p key={reason} className="mb-1">
                  {reason}
                </p>
              ))}
              {!profile.reviewed && workoutKind !== "cardio" && (
                <Link
                  className="inline-flex min-h-11 items-center font-semibold underline"
                  href="/settings"
                >
                  Открыть настройки режима
                </Link>
              )}
            </div>
          )}
          {error && (
            <p
              role="alert"
              className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive"
            >
              {error}
            </p>
          )}
          <button
            disabled={!canStart || busy}
            className="min-h-12 w-full rounded-xl bg-primary px-4 font-bold text-primary-foreground disabled:opacity-50"
          >
            {busy ? "Проверяю…" : "Начать выбранную сессию"}
          </button>
        </form>
      </dialog>
    </>
  );
}
function CheckRow({
  label,
  checked,
  set,
}: {
  label: string;
  checked: boolean;
  set: (v: boolean) => void;
}) {
  return (
    <label className="flex min-h-11 items-start gap-3 py-2 text-sm leading-relaxed">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => set(e.target.checked)}
        className="mt-1 size-5 shrink-0"
      />
      <span>{label}</span>
    </label>
  );
}
