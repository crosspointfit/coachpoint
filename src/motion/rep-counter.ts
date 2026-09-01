import type {
  HalfSquatSetSummary,
  RepCounterConfig,
  RepCounterState,
  RepCounterUpdate,
  RepRecord,
} from "./types.ts";

export const DEFAULT_HALF_SQUAT_CONFIG: RepCounterConfig = {
  downThresholdDeg: 135,
  upThresholdDeg: 160,
  targetDepthDeg: 120,
  stableFrames: 3,
  rangeDeclineThresholdDeg: 10,
};

export function createRepCounterState(): RepCounterState {
  return {
    phase: "seeking_standing",
    reps: 0,
    stableCount: 0,
    records: [],
  };
}

export function resetIncompleteRep(
  state: RepCounterState,
): RepCounterState {
  return {
    ...state,
    phase: "seeking_standing",
    stableCount: 0,
    activeRepStartedAtMs: undefined,
    activeMinAngleDeg: undefined,
    activeMaxAngleDeg: undefined,
    records: [...state.records],
  };
}

export function didReachRepTarget(
  update: RepCounterUpdate,
  targetReps: number,
): boolean {
  return (
    Number.isInteger(targetReps) &&
    targetReps > 0 &&
    update.event?.type === "rep_completed" &&
    update.event.record.rep === targetReps
  );
}

function cueFor(state: RepCounterState, config: RepCounterConfig): string {
  switch (state.phase) {
    case "seeking_standing":
      return "Stand tall and keep your full side profile in frame.";
    case "standing":
      return "Ready. Bend your hips and knees when comfortable.";
    case "lowering":
      return (state.lastAngleDeg ?? 180) > config.targetDepthDeg
        ? "Lower with control through the therapist-approved range."
        : "Good depth. Prepare to stand.";
    case "lowered":
      return "Stand tall with control.";
    case "rising":
      return "Keep rising until you are tall.";
  }
}

export function updateRepCounter(
  previous: RepCounterState,
  angleDeg: number,
  timestampMs: number,
  config: RepCounterConfig = DEFAULT_HALF_SQUAT_CONFIG,
): RepCounterUpdate {
  if (!Number.isFinite(angleDeg) || !Number.isFinite(timestampMs)) {
    return { state: previous, cue: "Keep your full side profile in frame." };
  }

  let state: RepCounterState = {
    ...previous,
    lastAngleDeg: angleDeg,
    records: [...previous.records],
  };
  let event: RepCounterUpdate["event"];

  if (state.phase === "seeking_standing") {
    const stableCount = angleDeg >= config.upThresholdDeg ? state.stableCount + 1 : 0;
    state = { ...state, stableCount };
    if (stableCount >= config.stableFrames) {
      state = { ...state, phase: "standing", stableCount: 0 };
      event = { type: "ready" };
    }
  } else if (state.phase === "standing") {
    if (angleDeg < config.upThresholdDeg) {
      state = {
        ...state,
        phase: "lowering",
        stableCount: angleDeg <= config.downThresholdDeg ? 1 : 0,
        activeRepStartedAtMs: timestampMs,
        activeMinAngleDeg: angleDeg,
        activeMaxAngleDeg: angleDeg,
      };
    }
  } else if (state.phase === "lowering") {
    const minAngle = Math.min(state.activeMinAngleDeg ?? angleDeg, angleDeg);
    const maxAngle = Math.max(state.activeMaxAngleDeg ?? angleDeg, angleDeg);
    if (angleDeg >= config.upThresholdDeg) {
      state = {
        ...state,
        phase: "standing",
        stableCount: 0,
        activeRepStartedAtMs: undefined,
        activeMinAngleDeg: undefined,
        activeMaxAngleDeg: undefined,
      };
    } else {
      const stableCount = angleDeg <= config.downThresholdDeg ? state.stableCount + 1 : 0;
      state = {
        ...state,
        stableCount,
        activeMinAngleDeg: minAngle,
        activeMaxAngleDeg: maxAngle,
      };
      if (stableCount >= config.stableFrames) {
        state = { ...state, phase: "lowered", stableCount: 0 };
        event = { type: "bottom" };
      }
    }
  } else if (state.phase === "lowered") {
    state = {
      ...state,
      activeMinAngleDeg: Math.min(state.activeMinAngleDeg ?? angleDeg, angleDeg),
      activeMaxAngleDeg: Math.max(state.activeMaxAngleDeg ?? angleDeg, angleDeg),
    };
    if (angleDeg > config.downThresholdDeg) {
      state = {
        ...state,
        phase: "rising",
        stableCount: angleDeg >= config.upThresholdDeg ? 1 : 0,
      };
    }
  } else if (state.phase === "rising") {
    const minAngle = Math.min(state.activeMinAngleDeg ?? angleDeg, angleDeg);
    const maxAngle = Math.max(state.activeMaxAngleDeg ?? angleDeg, angleDeg);
    if (angleDeg <= config.downThresholdDeg) {
      state = {
        ...state,
        phase: "lowered",
        stableCount: 0,
        activeMinAngleDeg: minAngle,
        activeMaxAngleDeg: maxAngle,
      };
    } else {
      const stableCount = angleDeg >= config.upThresholdDeg ? state.stableCount + 1 : 0;
      state = {
        ...state,
        stableCount,
        activeMinAngleDeg: minAngle,
        activeMaxAngleDeg: maxAngle,
      };
      if (stableCount >= config.stableFrames) {
        const completedAtMs = timestampMs;
        const startedAtMs = state.activeRepStartedAtMs ?? completedAtMs;
        const record: RepRecord = {
          rep: state.reps + 1,
          startedAtMs,
          completedAtMs,
          durationMs: Math.max(0, completedAtMs - startedAtMs),
          minAngleDeg: minAngle,
          maxAngleDeg: Math.max(maxAngle, angleDeg),
          rangeDeg: Math.max(0, Math.max(maxAngle, angleDeg) - minAngle),
          limitedDepth: minAngle > config.targetDepthDeg,
        };
        state = {
          ...state,
          phase: "standing",
          reps: record.rep,
          stableCount: 0,
          activeRepStartedAtMs: undefined,
          activeMinAngleDeg: undefined,
          activeMaxAngleDeg: undefined,
          records: [...state.records, record],
        };
        event = { type: "rep_completed", record };
      }
    }
  }

  return { state, event, cue: cueFor(state, config) };
}

function average(values: readonly number[]): number {
  return values.length === 0
    ? 0
    : values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function summarizeRepCounter(
  state: RepCounterState,
  config: RepCounterConfig = DEFAULT_HALF_SQUAT_CONFIG,
): HalfSquatSetSummary {
  const records = state.records.map((record) => ({ ...record }));
  const split = Math.max(1, Math.ceil(records.length / 2));
  const firstRange = average(records.slice(0, split).map((record) => record.rangeDeg));
  const secondRange = average(records.slice(split).map((record) => record.rangeDeg));
  const rangeDeclineDeg = records.length < 2 ? 0 : Math.max(0, firstRange - secondRange);
  const qualityFlags: string[] = [];
  if (records.some((record) => record.limitedDepth)) {
    qualityFlags.push("limited_depth");
  }
  if (rangeDeclineDeg >= config.rangeDeclineThresholdDeg) {
    qualityFlags.push("range_decline");
  }
  const startedAt = records[0]?.startedAtMs;
  const completedAt = records.at(-1)?.completedAtMs;
  return {
    completedReps: records.length,
    detectedRepetitionWindowSeconds:
      startedAt === undefined || completedAt === undefined
        ? 0
        : Math.round(((completedAt - startedAt) / 1000) * 10) / 10,
    averageRangeDeg: Math.round(average(records.map((record) => record.rangeDeg)) * 10) / 10,
    rangeDeclineDeg: Math.round(rangeDeclineDeg * 10) / 10,
    averageMinAngleDeg:
      Math.round(average(records.map((record) => record.minAngleDeg)) * 10) / 10,
    qualityFlags,
    reps: records,
  };
}
