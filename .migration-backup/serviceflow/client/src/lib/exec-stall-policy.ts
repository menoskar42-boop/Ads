export const NOREAL_STALL_MS = 60 * 1000;
export const LOOP_STALL_MS = 8 * 60 * 1000;

export function measureStallPolicy(
  noReal: boolean,
  loop: boolean,
  realStallMs: number,
  measureMaxMs: number,
  pollMs: number,
) {
  const loopNoReal = noReal && loop;
  return {
    stallLimitMs: !noReal ? realStallMs : loop ? LOOP_STALL_MS : NOREAL_STALL_MS,
    reopenOnce: noReal && !loop,
    noRealPerAccountMs: loopNoReal ? LOOP_STALL_MS + pollMs : measureMaxMs,
  };
}
