export type CardioClock = {
  accumulatedMs: number;
  runningSince: number | null;
};
export function elapsedSeconds(clock: CardioClock, now: number): number {
  const running =
    clock.runningSince == null ? 0 : Math.max(0, now - clock.runningSince);
  return Math.max(0, Math.floor((clock.accumulatedMs + running) / 1000));
}
export function pauseClock(clock: CardioClock, now: number): CardioClock {
  return clock.runningSince == null
    ? clock
    : {
        accumulatedMs:
          clock.accumulatedMs + Math.max(0, now - clock.runningSince),
        runningSince: null,
      };
}
export function resumeClock(clock: CardioClock, now: number): CardioClock {
  return clock.runningSince == null ? { ...clock, runningSince: now } : clock;
}
