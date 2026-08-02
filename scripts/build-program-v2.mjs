// Генератор lib/program/h2-v9-v2.json — жимовая программа, редакция 2.0
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const RM = 115;
const RPES = [6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10];
const T = {
  1: [86.3, 87.8, 89.2, 90.7, 92.2, 93.9, 95.5, 97.8, 100.0],
  2: [83.7, 85.0, 86.3, 87.8, 89.2, 90.7, 92.2, 93.9, 95.5],
  3: [81.1, 82.4, 83.7, 85.0, 86.3, 87.8, 89.2, 90.7, 92.2],
  4: [78.6, 79.9, 81.1, 82.4, 83.7, 85.0, 86.3, 87.8, 89.2],
  5: [76.2, 77.4, 78.6, 79.9, 81.1, 82.4, 83.7, 85.0, 86.3],
};
const rpeOf = (reps, pct) => {
  const row = T[reps];
  if (pct <= row[0]) return Math.round((6 - (row[0] - pct) / 2.6) * 10) / 10;
  for (let i = 0; i < row.length - 1; i++)
    if (pct >= row[i] && pct <= row[i + 1])
      return Math.round((RPES[i] + ((pct - row[i]) / (row[i + 1] - row[i])) * (RPES[i + 1] - RPES[i])) * 10) / 10;
  return 10;
};
const lastRpe = (s, r, p) => Math.round((rpeOf(r, p) + 0.35 * (s - 1)) * 10) / 10;
const kg = (p) => { const x = (RM * p) / 100, lo = Math.floor(x / 2.5) * 2.5; return x - lo <= lo + 2.5 - x ? lo : lo + 2.5; };
const rng = (a, b) => ({ min: a, max: b === undefined ? a : b });

// ---- спецификация 22 циклов (абсолютная нумерация) ----
// w: [role, name, key, sets, reps, pct|null, rpeMin, rpeMax, notes[]]
const P = (sets, reps, pct) => ({ sets, reps, pct, rpe: [Math.max(5, Math.floor(rpeOf(reps, pct))), lastRpe(sets, reps, pct)] });

const CY = [
  // ===== ГИПЕРТРОФИЙНЫЙ БЛОК (h2-1 … h2-9) =====
  { n: 1, name: "вход в блок · базовый замер", obj: "Задать точку отсчёта всей программы и стандарт техники. Ни одного лишнего килограмма.",
    b2: [["calib"], ["main", 3, 5, 70]], b4: [["main", 3, 5, 65]], acc: "H", card: [40, 20], cp: "baseline",
    rules: ["Базовый замер — самая важная сессия первых двух месяцев. Разминка по тестовой лестнице, видео сбоку обязательно.",
            "Вес тройки подбирается так, чтобы остановиться на RPE 8, а не «сколько получится».",
            "Упоры или страхующий обязательны для всей штанговой работы."] },
  { n: 2, name: "накопление I", obj: "Плавно нарастить повторный объём при одинаковой паузе и точке касания.",
    b2: [["main", 4, 5, 72.5], ["spoto", 2, 5, 65]], b4: [["main", 3, 5, 67.5]], acc: "H", card: [45, 20],
    rules: ["Первый полноценный объёмный цикл. Все подходы должны ощущаться уверенно.",
            "Если первый рабочий подход уже RPE 7 и выше — снизить на 2,5 кг."] },
  { n: 3, name: "накопление II", obj: "Тот же объём при чуть более высокой относительной нагрузке.",
    b2: [["main", 4, 5, 75], ["spoto", 2, 4, 67.5]], b4: [["main", 3, 5, 70]], acc: "H", card: [45, 25],
    rules: ["Spoto укорачивается до четвёрок — акцент смещается на контроль в нижней точке.",
            "Не добавлять подходы, даже если сессия прошла легко."] },
  { n: 4, name: "пик накопления I", obj: "Максимальный объём первой половины блока без выхода за RPE 8.",
    b2: [["main", 4, 4, 77.5], ["spoto", 2, 4, 70]], b4: [["main", 3, 5, 72.5]], acc: "H", card: [50, 25],
    rules: ["Это не неделя демонстрации силы. При RPE выше плана — минус 2,5–5% или минус один подход.",
            "Перед разгрузкой ничего не добавлять."] },
  { n: 5, name: "разгрузка · контрольная точка №1", obj: "Снять общее утомление и сделать первый сравнительный замер.",
    b2: [["calib"], ["main", 2, 4, 65]], b4: [["main", 2, 4, 60]], acc: "D", card: [30, 15], cp: "checkpoint",
    rules: ["Цель цикла — выйти свежее, чем вошёл. Подсобка урезана намеренно, возвращать её нельзя.",
            "После замера обновить RMref по правилу «вес тройки ÷ 0,863», шаг не более ±5 кг."] },
  { n: 6, name: "накопление III", obj: "Первый выход в рабочую зону 80%.",
    b2: [["main", 4, 4, 80], ["spoto", 2, 4, 72.5]], b4: [["main", 3, 5, 72.5]], acc: "H", card: [45, 25],
    rules: ["80% на четвёрки — первая настоящая силовая работа блока.",
            "Отдых между подходами не меньше 3 минут, даже если кажется, что можно быстрее."] },
  { n: 7, name: "накопление IV", obj: "Закрепить 80% и добавить узкий хват для локаута.",
    b2: [["main", 4, 4, 80], ["close", 2, 5, 70]], b4: [["main", 3, 4, 75]], acc: "H", card: [45, 25],
    rules: ["Узкий хват — ровно настолько уже обычного, насколько комфортно локтям.",
            "При боли в локте узкий жим убирается без замены тяжёлым вариантом."] },
  { n: 8, name: "пик гипертрофийного блока", obj: "Закончить блок технически чисто и на самом тяжёлом весе фазы.",
    b2: [["main", 5, 3, 82.5], ["spoto", 2, 3, 75]], b4: [["main", 3, 4, 77.5]], acc: "H", card: [50, 25],
    rules: ["Пять троек на 82,5% — самая объёмная силовая работа блока. Последний подход не выше RPE 8.",
            "Никакого «ещё одного подхода, раз пошло»."] },
  { n: 9, name: "разгрузка · контрольная точка №2 · мост в силовой блок", obj: "Замер, восстановление и переход к силовой работе.",
    b2: [["calib"], ["main", 2, 3, 72.5]], b4: [["main", 2, 4, 65]], acc: "D", card: [30, 15], cp: "checkpoint",
    rules: ["Второй сравнительный замер. Питание переводится с профицита на поддержание.",
            "Если свежесть не вернулась — добавить 1–4 дня отдыха перед следующим циклом. Календарь не важнее готовности."] },
  // ===== СИЛОВОЙ БЛОК (v9-1 … v9-13) =====
  { n: 10, name: "вход в силовой блок", obj: "Войти в силовую работу без спешки. Объём подсобки снижается.",
    b2: [["main", 4, 3, 82.5], ["spoto", 2, 3, 75]], b4: [["main", 3, 4, 75]], acc: "S", card: [45, 25],
    rules: ["Первый цикл силового блока. Даже если легко — ничего не добавлять.",
            "Подсобка сокращена намеренно: освободившийся ресурс восстановления идёт в штангу."] },
  { n: 11, name: "накопление силы I", obj: "Ввести соревновательный жим на 80% во второй зальный день.",
    b2: [["main", 4, 3, 82.5], ["close", 2, 5, 72.5]], b4: [["main", 3, 3, 80]], acc: "S", card: [45, 25],
    rules: ["Впервые оба зальных дня работают в силовой зоне.",
            "Следить за качеством паузы в B4 не меньше, чем в B2."] },
  { n: 12, name: "накопление силы II", obj: "Первый выход на 85% в тройках.",
    b2: [["main", 2, 3, 85], ["backoff", 2, 3, 80]], b4: [["main", 3, 3, 80]], acc: "S", card: [45, 20],
    rules: ["Две тройки на 85% — потолок для этой схемы. Третью не добавлять: расчёт выводит за RPE 8.",
            "Далее две тройки на 80% как бэкофф."] },
  { n: 13, name: "накопление силы III", obj: "Перейти на двойки, сохранив бэкофф-объём.",
    b2: [["main", 3, 2, 87.5], ["backoff", 2, 3, 80]], b4: [["main", 3, 3, 82.5]], acc: "S", card: [45, 20],
    rules: ["87,5% на двойки — рабочая зона пика. Скорость срыва важнее ощущения тяжести.",
            "Если штанга идёт медленно уже на первом повторе — снизить вес."] },
  { n: 14, name: "разгрузка · контрольная точка №3", obj: "Снять утомление и сделать третий замер.",
    b2: [["calib"], ["main", 2, 3, 72.5]], b4: [["main", 2, 3, 70]], acc: "D", card: [30, 15], cp: "checkpoint",
    rules: ["Ключевая точка принятия решения.",
            "Если тройка ниже предыдущей на 2,5 кг и более при сопоставимых условиях — RMref вниз на 2,5 кг и повтор фазы. Это работа системы, а не поражение."] },
  { n: 15, name: "интенсификация I", obj: "Вернуть интенсивность после разгрузки.",
    b2: [["main", 2, 3, 85], ["close", 2, 4, 75]], b4: [["main", 4, 2, 85]], acc: "S", card: [45, 20],
    rules: ["Четыре двойки на 85% в B4 — самый плотный силовой день второго зального слота за всю программу."] },
  { n: 16, name: "интенсификация II", obj: "Двойки на 87,5% плюс бэкофф-тройки.",
    b2: [["main", 3, 2, 87.5], ["backoff", 2, 3, 82.5]], b4: [["main", 3, 3, 82.5]], acc: "S", card: [40, 20],
    rules: ["Восемь рабочих сетов выше 80% за цикл — пик дозы.",
            "Если после этого цикла восстановление проседает два дня подряд, следующий цикл повторяется на тех же весах."] },
  { n: 17, name: "интенсификация III · первые синглы", obj: "Ввести контролируемые одиночные повторы.",
    b2: [["single", 2, 1, 90], ["backoff", 2, 2, 85]], b4: [["main", 3, 2, 85]], acc: "S", card: [40, 20], single: true,
    rules: ["Первые синглы блока. Только уровни допуска 2 и 3 и только при всех четырёх условиях.",
            "Уровень 1: вместо 2×1 на 90% выполнить 3×2 на 85%.",
            "При пропуске сингла не увеличивать число рабочих подходов."] },
  { n: 18, name: "мини-разгрузка", obj: "Разгрузить объём, не теряя интенсивность.",
    b2: [["main", 2, 2, 85], ["backoff", 2, 3, 75]], b4: [["main", 2, 3, 72.5]], acc: "D", card: [30, 15],
    rules: ["Объём вниз, вес держится. Замера здесь нет — это чистое восстановление перед последним рабочим циклом."] },
  { n: 19, name: "специфическая сила", obj: "Последний объёмный тяжёлый цикл программы.",
    b2: [["single", 3, 1, 90], ["backoff", 2, 2, 85]], b4: [["main", 3, 2, 85]], acc: "S", card: [35, 20], single: true,
    rules: ["После этого цикла объём только снижается.",
            "Уровень 1: вместо 3×1 на 90% выполнить 4×2 на 85%.",
            "Не пытаться взять побольше — вся оставшаяся работа направлена на свежесть к тесту."] },
  { n: 20, name: "тейпер I · контрольная точка №4", obj: "Начать подводку и зафиксировать вес теста.",
    b2: [["calib"], ["main", 2, 2, 82.5]], b4: [["main", 2, 3, 70]], acc: "D", card: [25, 15], cp: "checkpoint",
    rules: ["B2 — это T−16, B4 — T−12. Вес этой тройки напрямую задаёт вес теста.",
            "Отличная разминка → +2,5 кг; обычная → тот же вес; тяжёлая → −2,5 кг.",
            "Объём подсобки минимален и не возвращается."] },
  { n: 21, name: "тейпер II · пик", obj: "Самая высокая интенсивность программы при минимальном объёме.",
    b2: [["single", 1, 1, 92.5], ["backoff", 2, 2, 87.5]], b4: [["primer", 2, 1, 90]], acc: "P", card: [20, 10], single: true,
    rules: ["B2 — это T−8, B4 — T−4. Последние выходы в зону 85% и выше перед тестом.",
            "Объём режется, интенсивность держится: в подводке это обязательное условие.",
            "Уровень 1: B2 — 3×2 на 85%; B4 — 2×2 на 85%.",
            "Если праймер T−4 тяжелее RPE 7,6 — остановиться на этом весе, ничего не добавлять."] },
  { n: 22, name: "тест", obj: "Получить чистый итоговый замер тем же протоколом, что и все контрольные точки.",
    b2: [["test"]], b4: [["tech", 2, 5, 50]], acc: "T", card: [0, 25], cp: "test",
    rules: ["B1 — полный отдых. B2 — это T0. Тест выполняется только при зелёной готовности.",
            "При мягком жёлтом статусе — перенос на 24–72 часа. При тяжёлой разминке — не раньше чем на 5–7 дней или завершение блока без теста.",
            "При красном статусе тест не переносится автоматически: действует медицинская ветка."] },
];

// ---- главные жимовые движения ----
const MAIN = {
  main:    { key: "competition_paused_bench_press", name: "Соревновательный жим лёжа с паузой", role: "primary_bench" },
  backoff: { key: "competition_bench_backoff",      name: "Соревновательный жим лёжа с паузой — бэкофф", role: "primary_backoff" },
  spoto:   { key: "spoto_press",                    name: "Spoto press", role: "secondary_press" },
  close:   { key: "close_grip_bench_press",         name: "Узкий жим лёжа", role: "secondary_press" },
  single:  { key: "conditional_technical_single",   name: "Соревновательный жим лёжа с паузой — контролируемый сингл", role: "conditional_single" },
  primer:  { key: "primer_single",                  name: "Соревновательный жим лёжа с паузой — праймер", role: "primer_single" },
  tech:    { key: "technique_bench_press",          name: "Жим лёжа — только качество движения", role: "technique_press" },
  calib:   { key: "calibration_triple",             name: "Калибровочная тройка — соревновательный жим лёжа с паузой", role: "calibration" },
  test:    { key: "test_triple",                    name: "Тестовая тройка — соревновательный жим лёжа с паузой", role: "test_triple" },
};
const NOTE = {
  main: ["Пауза 1 с без расслабления, одинаковая точка касания.", "Первые подходы должны быть заметно легче последнего."],
  backoff: ["Качество и скорость срыва, без гриндера."],
  spoto: ["Стоп 1–2 см над грудью на 1–2 с, без расслабления."],
  close: ["Уже обычного лишь настолько, насколько комфортно локтям.", "При боли в локте убрать без замены."],
  single: ["Только по единому правилу допуска: уровень 2 или 3, зелёная готовность, страховка или упоры, ожидаемый RPE в цели.",
           "Пропуск не компенсируется подходами, весом или упражнениями."],
  primer: ["Подготовка к тесту, а не тренировочный сингл.", "Если тяжелее целевого RPE — остановиться на этом весе."],
  tech: ["Только качество движения, без напряжения."],
  calib: ["Вес подбирается по разминке так, чтобы остановиться ровно на RPE 8.",
          "Одинаковая пауза, точка касания и хват. Видео сбоку обязательно.",
          "Это не AMRAP, не 3ПМ и не 1ПМ."],
  test: ["Вес: калибровка предыдущей контрольной точки ±2,5 кг по качеству разминки.",
         "Остановиться при гриндере на втором повторе или потере паузы.",
         "e1RM = вес ÷ 0,863. Формула Эпли не применяется."],
};

// ---- подсобка ----
const A = (key, name, role, sets, reps, rirMin, rirMax, notes = [], optional = false) =>
  ({ key, name, role, sets, reps, rir: [rirMin, rirMax], notes, optional });
const ACC = {
  H_B2: [A("cable_fly", "Сведение на блоке", "chest_accessory", "3", "10–15", 2, 2, ["Без растяжения через боль."]),
         A("chest_supported_t_bar_row", "Тяга Т-штанги с опорой грудью", "upper_back", "4", "8–10", 2, 2, ["Поясница не разгибается."]),
         A("lat_pulldown", "Верхний блок", "back_accessory", "3", "10–12", 2, 2),
         A("overhead_triceps_extension", "Разгибание на трицепс из-за головы", "triceps_accessory", "2", "12–15", 2, 2, ["Убрать при боли в локте."]),
         A("face_pull", "Face pull", "shoulder_rehab", "2", "15", 3, 4, ["Легко. Первым убирается при нехватке времени."])],
  H_B4: [A("incline_dumbbell_press", "Жим гантелей на наклонной 20–30°", "chest_accessory", "3", "8–12", 2, 2, ["Комфортная нижняя точка."]),
         A("cable_fly", "Сведение на блоке", "chest_accessory", "2", "12–15", 2, 2),
         A("chest_supported_row", "Горизонтальная тяга с опорой грудью", "upper_back", "4", "8–10", 2, 2),
         A("lat_pulldown_alt_grip", "Верхний блок", "back_accessory", "3", "10–12", 2, 2, ["Хват отличается от B2."]),
         A("lateral_raise", "Махи в стороны", "deltoid_accessory", "3", "15–20", 2, 2),
         A("hammer_curl", "Молотковые сгибания", "biceps_accessory", "2", "10–15", 2, 2, ["Единственная работа на бицепс в цикле."]),
         A("face_pull_external_rotation", "Face pull и внешняя ротация", "shoulder_rehab", "2", "15 / 12", 3, 4, ["Легко, без пампа до отказа."])],
  S_B2: [A("cable_fly", "Сведение на блоке", "chest_accessory", "2", "10–15", 2, 2),
         A("chest_supported_t_bar_row", "Тяга Т-штанги с опорой грудью", "upper_back", "4", "6–8", 2, 2),
         A("lat_pulldown", "Верхний блок", "back_accessory", "2", "10–12", 2, 2),
         A("overhead_triceps_extension", "Разгибание на трицепс из-за головы", "triceps_accessory", "2", "10–15", 2, 2),
         A("face_pull", "Face pull", "shoulder_rehab", "2", "15", 3, 4, ["Легко."])],
  S_B4: [A("incline_dumbbell_press", "Жим гантелей на наклонной 20–30°", "chest_accessory", "3", "8–10", 2, 2),
         A("chest_supported_row", "Горизонтальная тяга с опорой грудью", "upper_back", "4", "8", 2, 2),
         A("lat_pulldown", "Верхний блок", "back_accessory", "2", "10–12", 2, 2),
         A("lateral_raise", "Махи в стороны", "deltoid_accessory", "3", "15", 2, 2),
         A("hammer_curl", "Молотковые сгибания", "biceps_accessory", "2", "10–12", 2, 2),
         A("face_pull_external_rotation", "Face pull и внешняя ротация", "shoulder_rehab", "2", "15 / 12", 3, 4, ["Легко."])],
  D_B2: [A("chest_supported_t_bar_row", "Тяга Т-штанги с опорой грудью", "upper_back", "2", "8", 4, 4),
         A("lat_pulldown", "Верхний блок", "back_accessory", "2", "10", 4, 4, ["Легко."]),
         A("face_pull", "Face pull", "shoulder_rehab", "2", "15", 4, 4, ["Очень легко."])],
  D_B4: [A("chest_supported_row", "Горизонтальная тяга с опорой грудью", "upper_back", "2", "10", 4, 4),
         A("lateral_raise", "Махи в стороны", "deltoid_accessory", "2", "15", 4, 4, ["Легко."]),
         A("face_pull_external_rotation", "Face pull и внешняя ротация", "shoulder_rehab", "1", "15 / 12", 4, 4, ["Очень легко. Можно пропустить при накопленной усталости."], true)],
  P_B2: [A("chest_supported_t_bar_row", "Тяга Т-штанги с опорой грудью", "upper_back", "3", "6–8", 3, 3),
         A("face_pull", "Face pull", "shoulder_rehab", "2", "15", 4, 4, ["Легко. Изоляцию рук убрать."])],
  P_B4: [A("lat_pulldown", "Верхний блок", "back_accessory", "2", "8–10", 4, 4, ["Легко."]),
         A("face_pull", "Face pull", "shoulder_rehab", "1", "15", 4, 4, ["Легко. Никаких бэкоффов."])],
  T_B2: [],
  T_B4: [A("chest_supported_row", "Горизонтальная тяга с опорой грудью", "upper_back", "2", "10", 4, 4, ["Легко."], true),
         A("lat_pulldown", "Верхний блок", "back_accessory", "2", "10", 4, 4, ["Легко."], true),
         A("face_pull", "Face pull", "shoulder_rehab", "2", "15", 4, 4, ["Легко."], true)],
};
// ---- поясничный и плечевой блок на кардио-днях ----
const REHAB = [
  A("glute_bridge", "Ягодичный мостик", "rehab", "2", "10–12", 3, 4, ["Пауза 2 с в верхней точке."]),
  A("bird_dog", "Bird-dog", "rehab", "2", "8 на сторону", 3, 4, ["Медленно, без ротации таза."]),
  A("side_plank", "Боковая планка", "rehab", "2", "20–30 с на сторону", 3, 4),
  A("dead_bug", "Dead bug", "rehab", "2", "8 на сторону", 3, 4, ["Поясница прижата."]),
  A("hip_flexor_stretch", "Растяжка сгибателей бедра", "rehab", "2", "30 с на сторону", 4, 4),
  A("external_rotation", "Внешняя ротация", "rehab", "1–2", "12", 4, 4, ["Очень легко."]),
  A("face_pull_rehab", "Face pull", "rehab", "1–2", "15", 4, 4, ["Очень легко. Не превращать в тренировку рук."]),
];

// ---- сборка ----
const pickLadder = (works) => {
  if (works.some((w) => w[0] === "calib" || w[0] === "test")) return "ТЕСТ";
  const tops = works.filter((w) => w[3] != null).map((w) => w[3]);
  if (!tops.length) return "L0";
  const m = Math.max(...tops);
  return m <= 65 ? "L0" : m <= 72.5 ? "L1" : m <= 85 ? "L2" : "L3";
};
const CARDIO_TXT = (min, isB1) =>
  min === 0 ? "Полный отдых. Допустимо 10–15 мин очень лёгкого велосипеда только для самочувствия."
  : isB1 && min >= 35 ? `${min} мин: 5 мин очень легко → ${min - 10} мин Z2 → 5 мин очень легко`
  : `${min} мин Z1, свободный разговор, RPE 1–2`;

function buildWork(spec, cycleAbs, wid) {
  const [kind, sets, reps, pct] = spec;
  const m = MAIN[kind];
  const base = {
    key: m.key, name: m.name, role: m.role,
    optional: kind === "single", condition: kind === "single" ? "clearance_level_2_or_3_and_all_four_gates" : null,
    excludeFromTonnage: false, notes: [...NOTE[kind]],
  };
  if (kind === "calib" || kind === "test") {
    return { ...base, sets: "1", reps: "3", percent: null, exampleKg: null,
      targetRpe: rng(8, 8), targetRir: null, id: `${wid}-${m.key}` };
  }
  const r1 = rpeOf(reps, pct), rl = lastRpe(sets, reps, pct);
  const nn = [...base.notes];
  if (sets > 1) nn.push(`Целевой RPE: первый подход около ${String(r1).replace(".", ",")}, последний около ${String(rl).replace(".", ",")}.`);
  else nn.push(`Целевой RPE около ${String(r1).replace(".", ",")}.`);
  // Потолок 8 — норма программы. Пол 4 — очень лёгкая техническая работа
  // на разгрузках: линейная экстраполяция таблицы RPE ниже 6 даёт бессмысленные числа.
  const clamp = (x) => Math.min(8, Math.max(4, x));
  const capMin = clamp(Math.min(r1, rl)), capMax = clamp(Math.max(r1, rl));
  return { ...base, notes: nn, sets: String(sets), reps: String(reps),
    percent: rng(pct), exampleKg: rng(kg(pct)),
    targetRpe: rng(capMin, capMax), targetRir: null, id: `${wid}-${m.key}` };
}
const accEx = (a, wid) => ({
  key: a.key, name: a.name, sets: a.sets, reps: a.reps, percent: null, exampleKg: null,
  targetRpe: null, targetRir: rng(a.rir[0], a.rir[1]), role: a.role, optional: a.optional,
  condition: null, excludeFromTonnage: a.role === "rehab", notes: a.notes, id: `${wid}-${a.key}`,
});

const cycles = CY.map((c) => {
  const abs = c.n, block = abs <= 9 ? "h2" : "v9", num = abs <= 9 ? abs : abs - 9;
  const cid = `${block}-${num}`;
  const [c1, c3] = c.card;
  const mk = (slot, day, kind, title, works, accKey, cardioMin, isB1) => {
    const wid = `${cid}-${slot.toLowerCase()}`;
    if (kind === "cardio") {
      return { id: wid, slot, day, kind, title,
        duration: cardioMin === 0 ? rng(0, 15) : rng(cardioMin),
        cardio: { zone: isB1 && cardioMin >= 35 ? "Z2" : "Z1",
          warmupMinutes: isB1 && cardioMin >= 35 ? 5 : 0,
          mainMinutes: rng(isB1 && cardioMin >= 35 ? cardioMin - 10 : cardioMin),
          cooldownMinutes: isB1 && cardioMin >= 35 ? 5 : 0,
          modality: "bike_or_elliptical", prescriptionText: CARDIO_TXT(cardioMin, isB1) },
        warmupLevel: null, exercises: REHAB.map((a) => accEx(a, wid)),
        notes: ["Поясничный и плечевой блок выполняется после кардио, без боли. При иррадиации в ногу — прекратить и обсудить с врачом.",
                "При плохом сне, тренде пульса с ухудшением самочувствия, перегреве или оранжевом статусе — 15–20 мин Z1, прогулка либо пропуск. Пропущенные минуты не переносятся."],
        branches: [] };
    }
    return { id: wid, slot, day, kind, title, duration: null, cardio: null,
      warmupLevel: pickLadder(works),
      exercises: [...works.map((w) => buildWork(w, abs, wid)), ...ACC[accKey].map((a) => accEx(a, wid))],
      notes: ["Перед началом: проверить стоп-сигналы и седацию, оценить сон, утренний пульс и последствия смен, выбрать цвет светофора, и только затем брать вес.",
              "Упоры или страхующий обязательны для всей штанговой работы. Без них штанговый жим не выполняется.",
              "При нехватке времени порядок: соревновательный жим → второе жимовое → тяга → остальное."],
      branches: [] };
  };
  const b2 = mk("B2", 4, "strength", `Зал A · ${c.name}`, c.b2, `${c.acc}_B2`);
  const b4 = mk("B4", 8, "strength", `Зал B · второй жимовой день`, c.b4, `${c.acc}_B4`);
  if (abs === 22) {
    const wid = "v9-13-b2";
    b2.branches = [
      { id: "triple", default: true, name: "Стандартизированная тройка и e1RM",
        objective: "Основной тест. Тот же протокол, что во всех контрольных точках.",
        conditions: ["Зелёная готовность", "Упоры или страхующие", "Видео сбоку",
                     "Разминка по тестовой лестнице без неожиданной тяжести"],
        exercises: [], notes: ["Вес: калибровка Ц20 ±2,5 кг по качеству разминки.", "e1RM = вес ÷ 0,863."] },
      { id: "direct_1rm", default: false, name: "Прямой 1ПМ",
        objective: "Отдельная ветка. Не по умолчанию.",
        conditions: ["Уровень допуска 3: явное разрешение врача на максимальное усилие",
                     "Актуальная оценка офтальмолога или ретинолога при миопии −6D",
                     "Зелёная готовность без симптомов",
                     "Сингл цикла 21 прошёл в пределах RPE 8",
                     "Праймер T−4 прошёл без ухудшения техники",
                     "План попыток зафиксирован до разминки, не более трёх синглов"],
        exercises: [{ key: "direct_1rm_attempts", name: "Прямой 1ПМ — попытки", sets: "1–3", reps: "1",
          percent: null, exampleKg: null, targetRpe: null, targetRir: null, role: "direct_1rm_test",
          optional: true, condition: "clearance_level_3_only", excludeFromTonnage: false,
          notes: ["Шаг между верхними попытками 2,5–5 кг.", "Вес нельзя повышать по адреналину сверх записанного плана.",
                  "Тройка и прямой 1ПМ в один день не выполняются."], id: `${wid}-direct_1rm_attempts` }],
        warmup: { universalLadderDefined: false },
        notes: ["Ветка выбирается до начала разминки."] },
    ];
  }
  return { id: cid, block, number: num, name: c.name, objective: c.obj,
    checkpoint: c.cp ? { id: `${cid}-checkpoint`, type: c.cp === "test" ? "mutually_exclusive_branch_test" : c.cp === "baseline" ? "baseline_calibration_triple" : "calibration_triple" } : null,
    workouts: [ mk("B1", 3, "cardio", `Кардио и восстановительный блок`, [], null, c1, true), b2,
                mk("B3", 7, "cardio", `Кардио и восстановительный блок`, [], null, c3, false), b4 ],
    rules: c.rules, sourceLines: `редакция 2.0, цикл ${abs}`, programVersion: "h2-v9-2.0", dayOffset: (abs - 1) * 8 };
});

const program = {
  version: "h2-v9-2.0",
  source: { title: "Жимовая программа — редакция 2.0", revision: "2.0", date: "2026-08-02",
    authority: "Редакция 2.0 после числового и методического аудита редакции 1.0" },
  durationDays: 176, cycleLengthDays: 8, defaultRmrefKg: 115,
  workoutSlots: { B1: 3, B2: 4, B3: 7, B4: 8 },
  clearanceLevels: [
    { id: "level_1", name: "Консервативный", ceilingPercent: 85, singlesAllowed: false, directOneRmAllowed: false },
    { id: "level_2", name: "Стандартный", ceilingPercent: 92.5, singlesAllowed: true, directOneRmAllowed: false },
    { id: "level_3", name: "Полный", ceilingPercent: 100, singlesAllowed: true, directOneRmAllowed: true },
  ],
  cycles,
};
writeFileSync(join(root, "lib/program/h2-v9-v2.json"), JSON.stringify(program, null, 2) + "\n");
const w = cycles.flatMap((c) => c.workouts);
const ex = w.flatMap((x) => [...x.exercises, ...x.branches.flatMap((b) => b.exercises ?? [])]);
console.log(`циклов ${cycles.length} | сессий ${w.length} | упражнений ${ex.length}`);
