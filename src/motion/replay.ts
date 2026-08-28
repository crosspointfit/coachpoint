export interface ReplayFrame {
  timestampMs: number;
  kneeAngleDeg: number;
}

const REP_DEPTHS = [116, 123, 132] as const;

export const HALF_SQUAT_REPLAY: readonly ReplayFrame[] = (() => {
  const angles: number[] = [170, 170, 170];
  for (const depth of REP_DEPTHS) {
    angles.push(154, 144, 136, depth, depth, depth, 142, 152, 164, 166, 168);
  }
  return angles.map((kneeAngleDeg, index) => ({
    kneeAngleDeg,
    timestampMs: index * 100,
  }));
})();

