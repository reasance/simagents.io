/** Simulated time as day and clock, e.g. "D2 04:12". Day 1 starts at 0 ms. */
export function formatSimTime(simTimeMs: number): string {
  const totalMinutes = Math.max(0, Math.floor(simTimeMs / 60_000));
  const day = Math.floor(totalMinutes / 1440) + 1;
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  return `D${day} ${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}
