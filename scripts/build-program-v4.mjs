import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const spec = JSON.parse(
  readFileSync(new URL("lib/program/revision-3-spec.json", root), "utf8"),
);
const VERSION = "h2-v9-4.0"; // Storage version; the human-facing program revision is 3.0.
const range = (min, max = min) => ({ min, max });
const deloads = new Set([5, 9, 14, 18]);
const frozen = new Set([1, 5, 9, 14, 18, 20, 21, 22]);
const keys = {
  "Тяга с опорой грудью": ["chest_supported_row", "upper_back"],
  "Сведение на блоках": ["cable_fly", "chest_accessory"],
  "Разгибание рук на блоке": ["triceps_pushdown", "triceps_accessory"],
  "Наклонный жим гантелей 15–30°": [
    "incline_dumbbell_press",
    "chest_accessory",
  ],
  "Верхний блок": ["lat_pulldown", "back_accessory"],
  "Подъём рук в стороны": ["lateral_raise", "shoulder_accessory"],
};
function exercise(workoutId, key, name, sets, reps, role, extra = {}) {
  return {
    id: `${workoutId}-${key}`,
    key,
    name,
    sets: String(sets),
    reps: String(reps),
    role,
    percent: null,
    exampleKg: null,
    targetRpe: null,
    targetRir: null,
    optional: false,
    condition: null,
    excludeFromTonnage: role === "rehab",
    restSeconds: 90,
    notes: [],
    ...extra,
  };
}
function bench(id, segment, index, cycle, side, controlDay) {
  const control = segment.kind === "control" || segment.kind === "test";
  const light =
    controlDay ||
    deloads.has(cycle) ||
    cycle === 20 ||
    cycle === 22 ||
    (cycle === 21 && side === "B");
  const role = control
    ? segment.kind === "test"
      ? "test_triple"
      : "calibration"
    : segment.kind === "backoff" || index > 0
      ? "primary_backoff"
      : "primary_bench";
  const targetRpe = control
    ? range(8)
    : light
      ? range(null, 6)
      : segment.kind === "backoff"
        ? range(null, 7)
        : cycle === 21
          ? range(6, 7)
          : side === "B"
            ? range(6, 7.5)
            : range(6, 8);
  const e = exercise(
    id,
    control ? "control_triple" : `paused_bench_${index}`,
    control ? "Контрольная тройка · жим с паузой" : "Жим лёжа с паузой",
    segment.sets,
    segment.reps,
    role,
    {
      exampleKg: control ? null : range(segment.w),
      percent: control ? null : range((segment.w / 115) * 100),
      targetRpe,
      restSeconds: control ? 300 : light ? 180 : 240,
      afterControlLight: !control && controlDay,
      progressionEligible: !control && !frozen.has(cycle) && index === 0,
      notes: control
        ? [
            "Одна тройка; фактический RPE записывается без подгонки к восьми. Не повторять ради попадания в число.",
            "Без недавней подтверждённой базы — знакомый консервативный вес на 3 повтора при RPE 6–7; не автоматические 100 кг.",
            "Если ограничение не позволяет 3@8 — согласованный фиксированный вес, без пересчёта в максимум.",
          ]
        : [
            "Вес — стартовый пример при R=115, а не обязательное назначение. Фактический RPE важнее цифры.",
            controlDay
              ? "После штатной КТ разрешены только эти лёгкие сеты ≤6. При симптомах, гриндере или нештатно тяжёлой тройке убрать."
              : "До последнего сета при RPE около 7,5 снизить вес на 2,5–5 кг; при RPE 8 обычный основной жим закончить.",
            "Одинаковое касание и пауза около секунды; без отказа и компенсации пропусков.",
          ],
    },
  );
  return e;
}
function accessories(id, cycle, side) {
  return spec.accessories[String(cycle)][side]
    .filter((row) => row[0] !== "Нет")
    .map(([name, scheme, effort]) => {
      const [sets, reps] = scheme.split("×");
      const nums = effort.split("·")[0].match(/\d+/g)?.map(Number) ?? [];
      const [key, role] = keys[name] ?? [
        `accessory_${name.length}`,
        "accessory",
      ];
      const r = effort.includes("≥")
        ? range(nums[0], null)
        : range(nums[0] ?? 3, nums[1] ?? nums[0] ?? 3);
      const rest = effort.split("·")[1]?.trim() ?? "90 с";
      const seconds = /мин/.test(rest)
        ? (Number(rest.match(/\d+/)?.[0]) || 2) * 60
        : Number(rest.match(/\d+/)?.[0]) || 90;
      return exercise(id, key, name, sets, reps, role, {
        targetRir: r,
        restSeconds: seconds,
        notes: [
          "Вес подбирать отдельно по запасу. После двух выполнений всех сетов на верхней границе повторов с целевым RIR — минимальный шаг; затем нижняя граница повторов.",
          "Не переносить прибавку жима на гантели или блок. При боли прекратить провоцирующее упражнение.",
        ],
      });
    });
}
function support(id, side, cycle) {
  if (cycle >= 21) return [];
  const rows =
    side === "A"
      ? [
          [
            "bird_dog",
            "Bird-dog",
            "5 на сторону",
            "Удержание 2–3 с; без запрокидывания поясницы.",
          ],
          [
            "glute_bridge",
            "Ягодичный мост",
            "8",
            "Пауза 1 с; комфортная амплитуда.",
          ],
          [
            "external_rotation",
            "Внешняя ротация",
            "12 на сторону",
            "Очень лёгкое сопротивление, без боли.",
          ],
        ]
      : [
          [
            "dead_bug",
            "Dead bug",
            "5 на сторону",
            "Уменьшить рычаг при потере контроля.",
          ],
          [
            "side_plank",
            "Боковая планка с колен",
            "10–15 с на сторону",
            "Короткое удержание; не задерживать дыхание.",
          ],
          [
            "wall_slide",
            "Скольжения рук по стене",
            "8",
            "Комфортная амплитуда, без боли.",
          ],
        ];
  return rows.map(([key, name, reps, note]) =>
    exercise(id, key, name, 1, reps, "rehab", {
      optional: true,
      condition:
        "Только при согласованной переносимости; выбранный режим заменяет, а не дополняет этот комплекс.",
      restSeconds: 45,
      notes: [
        note,
        "Один спокойный круг, обычно 6–10 минут. Автоматической прогрессии по календарю нет.",
      ],
    }),
  );
}
function directBranch(workoutId, cycle, side) {
  let segments;
  if (cycle === 17 && side === "A")
    segments = [
      [1, 1, 102.5],
      [2, 2, 97.5],
    ];
  if (cycle === 19 && side === "A")
    segments = [
      [1, 1, 102.5],
      [2, 2, 97.5],
      [1, 3, 92.5],
    ];
  if (cycle === 21 && side === "A")
    segments = [
      [1, 1, 102.5],
      [1, 2, 92.5],
    ];
  if (cycle === 21 && side === "B") segments = [[2, 1, 92.5]];
  if (cycle === 22 && side === "A") segments = [[3, 1, null]];
  if (!segments) return [];
  return [
    {
      id: "triple",
      default: true,
      name: "Основная ветка · контрольная тройка",
      exercises: [],
    },
    {
      id: "direct_1rm",
      default: false,
      name: "Отдельная подготовка к 1ПМ",
      conditions: [
        "Отдельно согласованные усилие и натуживание, опыт, страховка и понятная спортивная цель.",
        "Решение до цикла 17; подтверждение или отмена на КТ4. Замена, не добавление к основной строке.",
        "Нет синглов в Ц17/19 или были проблемы — не пробовать первый максимум в день 172.",
      ],
      exercises: segments.map(([sets, reps, w], i) =>
        exercise(
          workoutId,
          `direct_${i}`,
          cycle === 22
            ? "Отдельный тест 1ПМ · до трёх попыток"
            : "Жим с паузой · отдельная ветка 1ПМ",
          sets,
          reps,
          cycle === 22
            ? "direct_1rm"
            : reps === 1
              ? "conditional_single"
              : "primary_backoff",
          {
            branchId: "direct_1rm",
            optional: true,
            exampleKg: w === null ? null : range(w),
            percent: w === null ? null : range((w / 115) * 100),
            targetRpe:
              cycle === 22
                ? null
                : cycle === 21 && side === "B"
                  ? range(null, 6)
                  : range(6, 7),
            restSeconds: cycle === 22 ? 360 : 300,
            notes: [
              "Только вместо основной жимовой строки; общий индивидуальный предел сохраняется.",
              cycle === 22
                ? "До 3 попыток. Первая — уверенный знакомый вес; после неудачи, гриндера, симптомов или потери контроля новых попыток нет."
                : "Вес — пример при R=115; усилие и ограничения имеют приоритет.",
            ],
          },
        ),
      ),
    },
  ];
}
const cycles = spec.matrix.map((p) => {
  const block = p.cycle <= 9 ? "h2" : "v9";
  const number = p.cycle <= 9 ? p.cycle : p.cycle - 9;
  const id = `${block}-${number}`;
  const workouts = ["B1", "B2", "B3", "B4"].map((slot, index) => {
    const side = index < 2 ? "A" : "B";
    const wid = `${id}-${slot.toLowerCase()}`;
    const strength = index % 2 === 1;
    const control = strength && side === "A" && p.control;
    const minutes = side === "A" ? p.cardio_A : p.cardio_B;
    const isRestDay = p.cycle === 22 && slot === "B1";
    const isDeload = deloads.has(p.cycle);
    const isTaper = p.cycle >= 20;
    const zone2 = !strength && side === "B" && !isDeload && !isTaper;
    const exercises = strength
      ? [
          ...p[side].map((s, i) => bench(wid, s, i, p.cycle, side, control)),
          ...accessories(wid, p.cycle, side),
        ]
      : support(wid, side, p.cycle);
    if (strength && !isDeload && !isTaper && p.cycle !== 1)
      exercises.push(
        exercise(
          wid,
          side === "A" ? "leg_extension" : "seated_leg_curl",
          side === "A" ? "Разгибание ног" : "Сгибание ног сидя",
          2,
          "10–15",
          "optional_legs",
          {
            optional: true,
            condition:
              "Необязательная ОФП только при согласованной переносимости. Не в разгрузке и тейпере.",
            targetRir: range(3, 4),
            notes: [
              "Не входит в основную матрицу; без боли и без одновременного увеличения других нагрузок.",
            ],
          },
        ),
      );
    const duration = strength
      ? control
        ? range(p.cycle === 22 ? 35 : 40, p.cycle === 22 ? 55 : 60)
        : isDeload || p.cycle === 20
          ? range(30, 45)
          : p.cycle >= 21
            ? range(25, 40)
            : range(55, 75)
      : range(minutes);
    return {
      id: wid,
      slot,
      day: [3, 4, 7, 8][index],
      kind: strength ? "strength" : "cardio",
      title: strength
        ? `Зал ${side} · ${p.title}`
        : isRestDay
          ? "Полный тренировочный отдых"
          : "Лёгкое кардио и условная поддержка",
      duration,
      isRestDay,
      isDeload,
      isTaper,
      isControl: control,
      cardio: strength
        ? null
        : {
            zone: isRestDay ? null : zone2 ? "Z2" : "Z1",
            warmupMinutes: zone2 ? 5 : 0,
            mainMinutes: range(zone2 ? minutes - 10 : minutes),
            cooldownMinutes: zone2 ? 5 : 0,
            modality: "comfortable_low_impact",
            prescriptionText: isRestDay
              ? "0 минут кардио; 0 тренировочных подходов. Назначения врача самостоятельно не отменять."
              : zone2
                ? `${minutes} минут всего: 5 легко + ${minutes - 10} разговорно + 5 легко.`
                : `${minutes} минут всего, очень легко, свободный разговор.`,
          },
      warmupLevel: strength
        ? control
          ? "control"
          : isDeload ||
              p.cycle === 20 ||
              p.cycle === 22 ||
              (p.cycle === 21 && side === "B")
            ? "light"
            : "normal"
        : null,
      exercises,
      notes: strength
        ? [
            p.note,
            "Сначала симптомы/седация, затем готовность, страховка и разминка. Никаких автоматических медицинских уровней по проценту.",
            control
              ? "Контроль: одна тройка. При утомлении КТ пропускается без компенсации. После штатной 3@8 — только напечатанные лёгкие сеты; после итогового теста подсобки нет."
              : "RPE — фактическая оценка запаса, не прогноз из килограммов. Разминка строится от выбранного рабочего веса и не превышает личного предела.",
            "При нехватке времени: основной жим с полноценным отдыхом → одна тяга → остальная подсобка → необязательная ОФП.",
          ]
        : [
            isRestDay
              ? "День 171: полный тренировочный отдых. Привычная бытовая активность без утомления."
              : "Жёлтый: не более min(план,15 минут), легко. Оранжевый: отдых или короткая привычная прогулка, если безопасно. Красный: отмена. Нулевой план остаётся нулевым.",
            p.cycle >= 21
              ? "Тренировочный комплекс не добавляется. Назначенный специалистом режим согласуется отдельно."
              : "Поддержка опциональна, по переносимости. Нет автоматического перехода на следующую ступень раз в три цикла.",
          ],
      branches: strength ? directBranch(wid, p.cycle, side) : [],
    };
  });
  return {
    id,
    block,
    number,
    name: p.title,
    objective: p.note,
    checkpoint: p.control
      ? {
          id: `${id}-control`,
          type: p.cycle === 22 ? "final_triple" : "comparable_triple",
          programDay: p.start + 3,
        }
      : null,
    workouts,
    rules: [
      "Не догонять пропущенное. При необходимости смещать календарь без уплотнения жимовых дней.",
      "Пересмотреть программу после 2–3 циклов по реальному журналу.",
    ],
    sourceLines: `PDF 3.0, pages ${12 + p.cycle * 2}–${13 + p.cycle * 2}`,
    programVersion: VERSION,
    dayOffset: p.start - 1,
  };
});
const program = {
  version: VERSION,
  source: {
    title: "Жимовая программа — редакция 3.0",
    revision: "3.0",
    date: spec.sourceDate,
    authority:
      "Полная переработка, согласованная в PDF 3.0; стартовые примеры не медицинский допуск",
  },
  durationDays: 176,
  cycleLengthDays: 8,
  defaultRmrefKg: 115,
  workoutSlots: { B1: 3, B2: 4, B3: 7, B4: 8 },
  cycles,
};
const out = new URL("lib/program/h2-v9-v4.json", root);
writeFileSync(out, JSON.stringify(program, null, 2) + "\n");
console.log(
  `Built revision 3.0: ${cycles.length} cycles / ${cycles.flatMap((c) => c.workouts).length} day cards → ${fileURLToPath(out)}`,
);
