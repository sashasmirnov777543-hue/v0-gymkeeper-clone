"use client";

import { useState } from "react";
import { ShieldCheck, ShieldX } from "lucide-react";
import { evaluateConditionalSingle } from "@/app/actions/gates";
import {
  CLEARANCE_LEVEL_LABEL,
  DEFAULT_CLEARANCE_LEVEL,
  clearanceAllowsSingles,
  type ClearanceLevel,
} from "@/lib/program/version";

const REASON_TEXT: Record<string, string> = {
  "location-not-programmed": "сингл не предусмотрен в этом цикле/слоте",
  "medical-clearance-required": "уровень допуска не разрешает синглы — нужен уровень 2 или 3",
  "clearance-level-insufficient": "уровень допуска не разрешает синглы — нужен уровень 2 или 3",
  "readiness-not-green": "готовность не зелёная",
  "red-flag-symptoms": "есть красный стоп-сигнал",
  "spotter-or-safeties-required": "нет страхующего или выставленных упоров",
  "warmup-not-safe": "разминка не подтверждает безопасную готовность",
  "invalid-expected-rpe": "ожидаемый RPE не указан",
  "expected-rpe-above-absolute-cap": "ожидаемый RPE выше абсолютного потолка 8",
  "expected-rpe-outside-6-to-7": "ожидаемый RPE вне цели 6–7,5",
  "expected-rpe-outside-6-to-7.5": "ожидаемый RPE вне цели 6–7,5",
  "expected-rpe-outside-6-to-7-5": "ожидаемый RPE вне цели 6–7,5",
};

export function SingleGate({
  sessionId,
  offline,
  clearanceLevel = DEFAULT_CLEARANCE_LEVEL,
  onDecision,
}: {
  sessionId: number;
  offline: boolean;
  clearanceLevel?: ClearanceLevel;
  onDecision: (allowed: boolean) => void;
}) {
  const singlesAllowedByClearance = clearanceAllowsSingles(clearanceLevel);
  const [spotter, setSpotter] = useState(false);
  const [safeties, setSafeties] = useState(false);
  const [warmupSafe, setWarmupSafe] = useState(false);
  const [expectedRpe, setExpectedRpe] = useState(7);
  const [result, setResult] = useState<
    | { allowed: true; plannedSingles: number }
    | { allowed: false; reasons: readonly string[] }
    | null
  >(null);
  const [busy, setBusy] = useState(false);

  if (offline) {
    return (
      <div className="rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm">
        <strong>Условный сингл недоступен офлайн.</strong>
        <p className="mt-1 text-muted-foreground">Пропустите его без компенсации либо вернитесь к шлюзу после синхронизации.</p>
      </div>
    );
  }

  async function check() {
    if (!singlesAllowedByClearance) return;
    setBusy(true);
    try {
      const decision = await evaluateConditionalSingle({
        sessionId,
        medicalClearanceForPlannedLoadAndStraining: singlesAllowedByClearance,
        spotterPresent: spotter,
        safetiesSet: safeties,
        warmupSafe,
        expectedRpe,
      });
      setResult(decision);
      onDecision(decision.allowed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border border-primary/40 bg-primary/5 p-4">
      <div className="flex items-start gap-3">
        <ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" />
        <div>
          <h3 className="font-bold">Шлюз условного сингла</h3>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Это техническая практика, не тест. Все условия обязательны; пропуск не компенсируется.</p>
        </div>
      </div>
      <div className="mt-3 rounded-lg border border-border bg-background/60 px-3 py-2 text-xs leading-relaxed">
        <strong>Ваш допуск:</strong> {CLEARANCE_LEVEL_LABEL[clearanceLevel]}
        <p className="mt-1 text-muted-foreground">
          {singlesAllowedByClearance
            ? "Синглы разрешены с уровня 2. Уровень меняется только по итогам разговора с врачом — в настройках программы."
            : "На уровне 1 синглы не выполняются: пропустите элемент без компенсации. Уровень меняется только по итогам разговора с врачом — в настройках программы."}
        </p>
      </div>
      {singlesAllowedByClearance && (
        <>
          <div className="mt-3 space-y-1">
            <Check label="Присутствует компетентный страхующий" value={spotter} set={setSpotter} />
            <Check label="Либо заранее выставлены надёжные упоры" value={safeties} set={setSafeties} />
            <Check label="Разминка безопасна и соответствует ожиданиям" value={warmupSafe} set={setWarmupSafe} />
          </div>
          <label className="mt-3 block text-sm font-medium">
            Ожидаемый RPE: {expectedRpe}
            <input type="range" min="5" max="9" step="0.5" value={expectedRpe} onChange={(event) => setExpectedRpe(Number(event.target.value))} className="mt-2 w-full" />
          </label>
        </>
      )}
      <button type="button" disabled={busy || !singlesAllowedByClearance} onClick={() => void check()} className="mt-3 min-h-11 w-full rounded-lg bg-primary px-4 font-semibold text-primary-foreground disabled:opacity-50">
        {!singlesAllowedByClearance ? "Недоступно на уровне 1" : busy ? "Проверяю…" : "Проверить все условия"}
      </button>
      {result && (
        <div className={`mt-3 rounded-lg p-3 text-sm ${result.allowed ? "bg-success/15 text-success" : "bg-destructive/10 text-destructive"}`}>
          {result.allowed ? (
            <p><strong>Разрешено:</strong> {result.plannedSingles === 3 ? "репетиция 3×1" : "один запланированный сингл"}; цель RPE 6–7,5, потолок 8.</p>
          ) : (
            <div className="flex gap-2">
              <ShieldX className="mt-0.5 size-4 shrink-0" />
              <div>
                <strong>Пропустить без компенсации.</strong>
                <ul className="mt-1 list-disc pl-4">
                  {result.reasons.map((reason) => <li key={reason}>{REASON_TEXT[reason] ?? reason}</li>)}
                </ul>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function Check({ label, value, set }: { label: string; value: boolean; set: (value: boolean) => void }) {
  return (
    <label className="flex min-h-10 items-start gap-3 py-1.5 text-sm leading-snug">
      <input type="checkbox" checked={value} onChange={(event) => set(event.target.checked)} className="mt-0.5 size-4 shrink-0 accent-current" />
      <span>{label}</span>
    </label>
  );
}
