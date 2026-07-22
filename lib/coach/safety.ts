export type CoachRedFlagCode =
  | "vision"
  | "chest"
  | "cardiorespiratory"
  | "presyncope"
  | "neurologic"
  | "medication"
  | "movement_changing_pain";

const RED_FLAG_PATTERNS: ReadonlyArray<{
  code: CoachRedFlagCode;
  pattern: RegExp;
}> = [
  {
    code: "vision",
    pattern:
      /(?:вспышк|занавес|тень в поле зрения|много новых мушек|внезапн\w* ухудш\w* зрени|vision suddenly|flashes|curtain in.*vision)/i,
  },
  {
    code: "chest",
    pattern: /(?:боль|давлени|сдавлени).{0,18}(?:в груди|грудной клетк)|chest (?:pain|pressure)/i,
  },
  {
    code: "cardiorespiratory",
    pattern:
      /(?:сердцебиени.{0,30}(?:плохо|слабост|тошн|головокруж)|необычн\w* одышк|не хватает воздуха не по нагрузке|palpitations.{0,30}(?:unwell|dizzy)|unusual shortness of breath)/i,
  },
  {
    code: "presyncope",
    pattern: /(?:предобморок|обморок|теряю сознание|сильн\w* головокруж|шаткост|спутанност|faint|syncope|severe dizziness|confusion|ataxia)/i,
  },
  {
    code: "neurologic",
    pattern:
      /(?:нов\w*|нарастающ\w*).{0,20}(?:слабост|онемени).{0,20}(?:ног|конечност)|онемени.{0,12}(?:промежност|седл)|не могу (?:начать )?мочиться|недержани.{0,15}(?:мочи|кала)|new.{0,20}(?:weakness|numbness)|saddle numbness|urinary retention/i,
  },
  {
    code: "medication",
    pattern:
      /(?:выраженн\w* сонливост|сильн\w* заторможенн|гипертерми|спутанност.{0,20}(?:лекар|препарат)|severe sedation|hyperthermia)/i,
  },
  {
    code: "movement_changing_pain",
    pattern: /(?:боль|pain).{0,35}(?:меняет|изменила|ломает).{0,20}(?:движени|техник|траектор)/i,
  },
];

export function detectCoachRedFlags(text: string): CoachRedFlagCode[] {
  return RED_FLAG_PATTERNS.filter(({ pattern }) => pattern.test(text)).map(
    ({ code }) => code,
  );
}

export function redFlagCoachResponse(codes: readonly CoachRedFlagCode[]) {
  return {
    message:
      "Описан возможный красный стоп-сигнал. Прекратите тренировку и не пытайтесь «разогреться до нормы». Нужна подходящая медицинская оценка; при внезапных, выраженных или нарастающих симптомах обращайтесь за срочной помощью.",
    questions: [
      "Вы сейчас прекратили нагрузку и находитесь в безопасном месте?",
      "Симптом сохраняется, усиливается или появился внезапно?",
    ],
    proposal: null,
    redFlagDetected: true,
    localRedFlagCodes: codes,
  } as const;
}
