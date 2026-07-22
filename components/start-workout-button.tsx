"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Play, ShieldAlert, X } from "lucide-react";
import { startSession } from "@/app/actions/workout";
import { createLocalSession, findLocalSession } from "@/lib/offline";
import {
  assessReadiness,
  type ClinicalStopFlag,
  type ReadinessInput,
  type ReadinessLevel,
} from "@/lib/readiness";
import type { V913DirectOneRmGates } from "@/lib/program/gates";

const LEVEL_TEXT: Record<ReadinessLevel, { title: string; action: string }> = {
  green: { title: "Зелёный — план допустим", action: "Выполнить план; специальные элементы всё равно требуют своих шлюзов." },
  yellow: { title: "Жёлтый — снизить стресс", action: "Без синглов и тестов. −2,5–5% или −1 сет; кардио 15–20 мин Z1/прогулка/пропуск." },
  orange: { title: "Оранжевый — только техника", action: "50–65% RMref, 2–3×3; подсобка −50% или пропуск. Без тяжёлой работы и тестов." },
  red: { title: "Красный — тренировка заблокирована", action: "Не тренироваться и не разминаться «до нормы». Действовать по медицинской ветке." },
};

const RED_FLAG_OPTIONS: Array<{ flag: ClinicalStopFlag; label: string }> = [
  { flag: "vision_symptoms", label: "Вспышки, новые мушки, тень/занавес или внезапное ухудшение зрения" },
  { flag: "chest_pressure", label: "Боль, давление или сдавление в груди" },
  { flag: "unwell_palpitations", label: "Необычное сердцебиение вместе с плохим самочувствием" },
  { flag: "disproportionate_dyspnea", label: "Выраженная одышка, не соответствующая нагрузке" },
  { flag: "presyncope_or_syncope", label: "Предобморок или обморок" },
  { flag: "severe_dizziness_confusion_or_ataxia", label: "Сильное головокружение, спутанность или заметная шаткость" },
  { flag: "new_or_progressive_neurologic_or_cauda_equina_signs", label: "Новая/нарастающая слабость, онемение или нарушения мочеиспускания/кишечника" },
  { flag: "significant_medication_sedation_confusion_or_hyperthermia", label: "Выраженная седация, спутанность или гипертермия с нарушением координации" },
  { flag: "pain_changes_movement", label: "Боль меняет движение или траекторию" },
  { flag: "unsafe_loss_of_control", label: "Опасная потеря контроля движения или штанги" },
];

type FormState = {
  sleepMinutes: number;
  sleepQuality: number;
  energy: number;
  shoulderPain: number;
  backPain: number;
  unusualShiftFatigue: boolean;
  mildSoreness: boolean;
  heavyButSafeWarmup: boolean;
  clearlyExcessiveWarmupOrFirstSetRpe: boolean;
  rhrDelta: number;
  rhrTwoMornings: boolean;
  poorWellbeing: boolean;
  flags: Partial<Record<ClinicalStopFlag, boolean>>;
};

const INITIAL: FormState = {
  sleepMinutes: 420,
  sleepQuality: 3,
  energy: 3,
  shoulderPain: 0,
  backPain: 0,
  unusualShiftFatigue: false,
  mildSoreness: false,
  heavyButSafeWarmup: false,
  clearlyExcessiveWarmupOrFirstSetRpe: false,
  rhrDelta: 0,
  rhrTwoMornings: false,
  poorWellbeing: false,
  flags: {},
};

function toReadinessInput(data: FormState): ReadinessInput {
  return {
    clinicalStopFlags: data.flags,
    poorSleep: data.sleepMinutes < 360 || data.sleepQuality <= 2,
    unusualShiftFatigue: data.unusualShiftFatigue,
    restingHeartRateTrend: {
      deltaFromBaselineBpm: data.rhrDelta,
      comparableMornings: data.rhrTwoMornings ? 2 : 1,
      poorWellbeing: data.poorWellbeing,
    },
    mildSoreness: data.mildSoreness,
    heavyButSafeWarmup: data.heavyButSafeWarmup,
    clearlyExcessiveWarmupOrFirstSetRpe: data.clearlyExcessiveWarmupOrFirstSetRpe,
    sleepMinutes: data.sleepMinutes,
    sleepQuality: data.sleepQuality,
    shoulderPain: data.shoulderPain,
    backPain: data.backPain,
    energy: data.energy,
  };
}

export function StartWorkoutButton({
  workoutId,
  hasActive,
  activeSessionId,
  testBranches,
}: {
  workoutId: number;
  workoutKind: string;
  hasActive: boolean;
  activeSessionId?: number;
  testBranches?: Array<{ id: string; name: string; default?: boolean }>;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(INITIAL);
  const [error, setError] = useState<string | null>(null);
  const [testBranch, setTestBranch] = useState<"triple" | "direct_1rm">(
    testBranches?.find((branch) => branch.default)?.id === "direct_1rm"
      ? "direct_1rm"
      : "triple",
  );
  const [testGate, setTestGate] = useState({
    spotterPresent: false,
    safetiesSet: false,
    sideVideoReady: false,
    heavyWarmup: false,
    technicalIssue: false,
    medicalClearance: false,
    ophthalmologySatisfied: false,
    noRelevantSymptoms: false,
    noRecentMedicationIllnessHydrationSleepIssue: false,
    v911SingleConfident: false,
    v911SingleRpe: 8,
    v912Clean: false,
    attemptPlanAgreed: false,
    plannedAttempts: 3,
    noLargeUnverifiedJump: false,
  });
  const submission = useMemo(() => toReadinessInput(data), [data]);
  const assessment = useMemo(() => assessReadiness(submission), [submission]);
  const commonTestGateReady =
    !testBranches?.length ||
    (assessment.level === "green" &&
      (testGate.spotterPresent || testGate.safetiesSet) &&
      testGate.sideVideoReady &&
      !testGate.heavyWarmup &&
      !testGate.technicalIssue);
  const directTestGateReady =
    testBranch !== "direct_1rm" ||
    (testGate.medicalClearance &&
      testGate.ophthalmologySatisfied &&
      testGate.noRelevantSymptoms &&
      testGate.noRecentMedicationIllnessHydrationSleepIssue &&
      testGate.v911SingleConfident &&
      testGate.v911SingleRpe <= 8 &&
      testGate.v912Clean &&
      testGate.attemptPlanAgreed &&
      testGate.plannedAttempts >= 1 &&
      testGate.plannedAttempts <= 3 &&
      testGate.noLargeUnverifiedJump);
  const canStart =
    assessment.level !== "red" && commonTestGateReady && directTestGateReady;

  async function launch() {
    if (!canStart) return;
    setBusy(true);
    setError(null);
    if (testBranches?.length && !navigator.onLine) {
      setError("Тестовая сессия и её защитные шлюзы недоступны офлайн");
      setBusy(false);
      return;
    }
    const local = findLocalSession(workoutId);
    if (local) {
      router.push(`/offline-session?key=${local}`);
      return;
    }
    const directOneRm: V913DirectOneRmGates | undefined =
      testBranch === "direct_1rm"
        ? {
            medicalClearanceForPlannedLoadAndStraining: testGate.medicalClearance,
            ophthalmologyRequirementsSatisfied: testGate.ophthalmologySatisfied,
            relevantSymptomsOrTechniqueChangingPain: !testGate.noRelevantSymptoms,
            recentMedicationChangeIllnessDehydrationOrSevereSleepLoss:
              !testGate.noRecentMedicationIllnessHydrationSleepIssue,
            v911ConditionalSingleConfident: testGate.v911SingleConfident,
            v911ConditionalSingleRpe: testGate.v911SingleRpe,
            v912B2AndPrimerCompletedWithoutTechniqueDeclineOrSymptoms: testGate.v912Clean,
            attemptPlanAgreedBeforeWarmupWithQualifiedCoach: testGate.attemptPlanAgreed,
            plannedAttempts: testGate.plannedAttempts,
            largeUnverifiedJumpRequired: !testGate.noLargeUnverifiedJump,
          }
        : undefined;
    const testSelection = testBranches?.length
      ? {
          branch: testBranch,
          spotterPresent: testGate.spotterPresent,
          safetiesSet: testGate.safetiesSet,
          sideVideoReady: testGate.sideVideoReady,
          heavyWarmup: testGate.heavyWarmup,
          technicalIssue: testGate.technicalIssue,
          directOneRm,
        }
      : undefined;
    try {
      await startSession(workoutId, submission, testSelection);
    } catch (cause) {
      if (!testBranches?.length && (!navigator.onLine || cause instanceof TypeError)) {
        const key = createLocalSession(workoutId, submission);
        router.push(`/offline-session?key=${key}`);
      } else {
        setError(cause instanceof Error ? cause.message : "Не удалось начать тренировку");
      }
    } finally {
      setBusy(false);
    }
  }

  function click() {
    if (hasActive && activeSessionId) {
      router.push(`/session/${activeSessionId}`);
      return;
    }
    setOpen(true);
  }

  return (
    <>
      <button
        type="button"
        onClick={click}
        disabled={busy}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-4 text-base font-bold text-primary-foreground shadow-lg disabled:opacity-60"
      >
        <Play className="size-5" />
        {busy ? "Открываю…" : hasActive ? "Продолжить тренировку" : "Проверить готовность и начать"}
      </button>

      {open && (
        <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/75 p-0 sm:items-center sm:p-4">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void launch();
            }}
            className="max-h-[96dvh] w-full max-w-md overflow-y-auto rounded-t-2xl border border-border bg-card p-5 sm:rounded-2xl"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-mono text-xs uppercase tracking-widest text-primary">Светофор готовности</p>
                <h2 className="mt-1 text-xl font-bold">Проверка перед каждой сессией</h2>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="grid size-10 place-items-center" aria-label="Закрыть">
                <X className="size-5" />
              </button>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <NumberField label="Сон, минут" value={data.sleepMinutes} min={0} max={900} onChange={(value) => setData({ ...data, sleepMinutes: value })} />
              <Scale label="Качество сна" value={data.sleepQuality} min={1} max={5} onChange={(value) => setData({ ...data, sleepQuality: value })} />
              <Scale label="Энергия" value={data.energy} min={1} max={5} onChange={(value) => setData({ ...data, energy: value })} />
              <NumberField label="RHR к базе" value={data.rhrDelta} min={-20} max={40} suffix="уд/мин" onChange={(value) => setData({ ...data, rhrDelta: value })} />
              <Scale label="Боль в плече" value={data.shoulderPain} min={0} max={10} onChange={(value) => setData({ ...data, shoulderPain: value })} />
              <Scale label="Боль в спине" value={data.backPain} min={0} max={10} onChange={(value) => setData({ ...data, backPain: value })} />
            </div>

            <fieldset className="mt-5 rounded-xl border border-border p-3">
              <legend className="px-1 text-sm font-semibold">Факторы восстановления</legend>
              <CheckRow label="Необычная усталость после смен" checked={data.unusualShiftFatigue} onChange={(checked) => setData({ ...data, unusualShiftFatigue: checked })} />
              <CheckRow label="Лёгкая мышечная болезненность" checked={data.mildSoreness} onChange={(checked) => setData({ ...data, mildSoreness: checked })} />
              <CheckRow label="RHR повышен два сопоставимых утра подряд" checked={data.rhrTwoMornings} onChange={(checked) => setData({ ...data, rhrTwoMornings: checked })} />
              <CheckRow label="Одновременно ухудшено самочувствие" checked={data.poorWellbeing} onChange={(checked) => setData({ ...data, poorWellbeing: checked })} />
              <CheckRow label="Разминка тяжёлая, но безопасная" checked={data.heavyButSafeWarmup} onChange={(checked) => setData({ ...data, heavyButSafeWarmup: checked })} />
              <CheckRow label="RPE разминки/первого сета явно выше плана" checked={data.clearlyExcessiveWarmupOrFirstSetRpe} onChange={(checked) => setData({ ...data, clearlyExcessiveWarmupOrFirstSetRpe: checked })} />
            </fieldset>

            <fieldset className="mt-4 rounded-xl border border-destructive/40 bg-destructive/5 p-3">
              <legend className="flex items-center gap-2 px-1 text-sm font-semibold text-destructive">
                <ShieldAlert className="size-4" /> Красные стоп-сигналы
              </legend>
              <p className="mb-2 text-xs leading-relaxed text-muted-foreground">Отметьте даже один пункт — запуск будет заблокирован.</p>
              {RED_FLAG_OPTIONS.map(({ flag, label }) => (
                <CheckRow
                  key={flag}
                  label={label}
                  checked={data.flags[flag] === true}
                  onChange={(checked) => setData({ ...data, flags: { ...data.flags, [flag]: checked } })}
                />
              ))}
            </fieldset>

            {testBranches && testBranches.length > 0 && (
              <fieldset className="mt-4 rounded-xl border border-primary/40 bg-primary/5 p-3">
                <legend className="px-1 text-sm font-semibold text-primary">
                  Шлюз теста V9-13
                </legend>
                <p className="mb-3 text-xs leading-relaxed text-muted-foreground">
                  Выберите одну ветку до разминки. Тройка и прямой 1ПМ взаимоисключающие.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => setTestBranch("triple")} className={`min-h-12 rounded-lg border px-3 text-sm font-semibold ${testBranch === "triple" ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}>
                    Тройка + e1RM
                  </button>
                  <button type="button" onClick={() => setTestBranch("direct_1rm")} className={`min-h-12 rounded-lg border px-3 text-sm font-semibold ${testBranch === "direct_1rm" ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}>
                    Прямой 1ПМ
                  </button>
                </div>
                <div className="mt-3">
                  <CheckRow label="Присутствует компетентный страхующий" checked={testGate.spotterPresent} onChange={(value) => setTestGate({ ...testGate, spotterPresent: value })} />
                  <CheckRow label="Либо заранее выставлены надёжные упоры" checked={testGate.safetiesSet} onChange={(value) => setTestGate({ ...testGate, safetiesSet: value })} />
                  <CheckRow label="Видео сбоку готово" checked={testGate.sideVideoReady} onChange={(value) => setTestGate({ ...testGate, sideVideoReady: value })} />
                  <CheckRow label="Разминка неожиданно тяжёлая" checked={testGate.heavyWarmup} onChange={(value) => setTestGate({ ...testGate, heavyWarmup: value })} />
                  <CheckRow label="На разминке появилась техническая проблема" checked={testGate.technicalIssue} onChange={(value) => setTestGate({ ...testGate, technicalIssue: value })} />
                </div>
                {testBranch === "direct_1rm" && (
                  <div className="mt-3 rounded-lg border border-warning/40 bg-warning/10 p-3">
                    <p className="text-xs font-semibold text-warning">Дополнительные обязательные условия прямого 1ПМ</p>
                    <CheckRow label="Есть явный персональный допуск к планируемой нагрузке и натуживанию" checked={testGate.medicalClearance} onChange={(value) => setTestGate({ ...testGate, medicalClearance: value })} />
                    <CheckRow label="Актуальная офтальмологическая оценка и ограничения выполнены" checked={testGate.ophthalmologySatisfied} onChange={(value) => setTestGate({ ...testGate, ophthalmologySatisfied: value })} />
                    <CheckRow label="Нет симптомов и боли, меняющей технику" checked={testGate.noRelevantSymptoms} onChange={(value) => setTestGate({ ...testGate, noRelevantSymptoms: value })} />
                    <CheckRow label="Нет недавней смены лекарств, болезни, обезвоживания или выраженного недосыпа" checked={testGate.noRecentMedicationIllnessHydrationSleepIssue} onChange={(value) => setTestGate({ ...testGate, noRecentMedicationIllnessHydrationSleepIssue: value })} />
                    <CheckRow label="Сингл V9-11 прошёл уверенно при RPE ≤8" checked={testGate.v911SingleConfident} onChange={(value) => setTestGate({ ...testGate, v911SingleConfident: value })} />
                    <CheckRow label="V9-12 B2 и праймер прошли без симптомов и ухудшения техники" checked={testGate.v912Clean} onChange={(value) => setTestGate({ ...testGate, v912Clean: value })} />
                    <CheckRow label="План попыток заранее согласован с квалифицированным тренером" checked={testGate.attemptPlanAgreed} onChange={(value) => setTestGate({ ...testGate, attemptPlanAgreed: value })} />
                    <CheckRow label="Не требуется большой непроверенный скачок веса" checked={testGate.noLargeUnverifiedJump} onChange={(value) => setTestGate({ ...testGate, noLargeUnverifiedJump: value })} />
                    <div className="mt-2 grid grid-cols-2 gap-3">
                      <NumberField label="RPE сингла V9-11" value={testGate.v911SingleRpe} min={1} max={10} onChange={(value) => setTestGate({ ...testGate, v911SingleRpe: value })} />
                      <NumberField label="План попыток" value={testGate.plannedAttempts} min={1} max={3} onChange={(value) => setTestGate({ ...testGate, plannedAttempts: value })} />
                    </div>
                  </div>
                )}
              </fieldset>
            )}

            <div className={`mt-4 rounded-xl border p-4 readiness-${assessment.level}`}>
              <strong>{LEVEL_TEXT[assessment.level].title}</strong>
              <p className="mt-1 text-sm text-muted-foreground">{LEVEL_TEXT[assessment.level].action}</p>
              {assessment.reasonCodes.length > 0 && assessment.level !== "green" && (
                <p className="mt-2 font-mono text-[11px] text-muted-foreground">{assessment.reasonCodes.join(" · ")}</p>
              )}
            </div>

            {assessment.level === "red" ? (
              <div className="mt-4 flex gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" /> Не пытайтесь исправить красный день кофеином, разминкой или снижением веса.
              </div>
            ) : (
              <>
                {testBranches?.length && !canStart && (
                  <p className="mt-4 rounded-lg bg-warning/10 p-3 text-sm text-warning">
                    Тест можно начать только при зелёной готовности и после выполнения всех условий выбранной ветки.
                  </p>
                )}
                <button disabled={busy || !canStart} className="mt-4 min-h-12 w-full rounded-lg bg-primary px-4 font-bold text-primary-foreground disabled:opacity-50">
                  Начать с планом «{assessment.level}»
                </button>
              </>
            )}
            {error && <p className="mt-3 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
          </form>
        </div>
      )}
    </>
  );
}

function NumberField({ label, value, min, max, suffix, onChange }: { label: string; value: number; min: number; max: number; suffix?: string; onChange: (value: number) => void }) {
  return (
    <label className="text-xs font-medium text-muted-foreground">
      {label}
      <div className="mt-1 flex items-center rounded-lg border border-input bg-background px-3">
        <input type="number" value={value} min={min} max={max} onChange={(event) => onChange(Number(event.target.value))} className="h-11 min-w-0 flex-1 bg-transparent text-base text-foreground outline-none" />
        {suffix && <span>{suffix}</span>}
      </div>
    </label>
  );
}

function Scale({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (value: number) => void }) {
  return (
    <label className="text-xs font-medium text-muted-foreground">
      {label}: <span className="text-foreground">{value}</span>
      <input type="range" min={min} max={max} value={value} onChange={(event) => onChange(Number(event.target.value))} className="mt-3 w-full accent-current" />
    </label>
  );
}

function CheckRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex min-h-11 items-start gap-3 py-2 text-sm leading-snug">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="mt-0.5 size-4 shrink-0 accent-current" />
      <span>{label}</span>
    </label>
  );
}
