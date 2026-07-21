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
  const estimate = reps === 1 ? weight : weight * (1 + reps / 30);
  return Math.round(estimate * 10) / 10;
}
