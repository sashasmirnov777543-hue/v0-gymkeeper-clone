// Historical regression fixture for revision 2.1. Not used by active UI.
/** e1RM имеет смысл только для вариантов жима и подходов 1–10 повторов. */
export function isE1rmExercise(name: string): boolean {
  const v = name.toLocaleLowerCase("ru-RU");
  return /жим.*л[её]жа|соревновательн.*жим|паузн.*жим|спото|spoto|жим.*узк|узк.*жим|close.?grip/.test(
    v,
  );
}
export function e1rmForStats(
  name: string,
  weight: number,
  reps: number,
): number | null {
  if (!isE1rmExercise(name) || reps < 1 || reps > 10 || weight <= 0)
    return null;
  // Редакция 2.0: для тройки используется коэффициент RPE-таблицы (÷0,863),
  // а не Эпли — она занижает неотказной подход примерно на 5%.
  const estimate =
    reps === 1 ? weight : reps === 3 ? weight / 0.863 : weight * (1 + reps / 30);
  return Math.round(estimate * 10) / 10;
}
