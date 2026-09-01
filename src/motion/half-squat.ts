import { calculateAngleDeg, selectKneeSide } from "./angle.ts";
import {
  DEFAULT_HALF_SQUAT_CONFIG,
  updateRepCounter,
} from "./rep-counter.ts";
import type {
  BodySide,
  KneeFrameAnalysis,
  NormalizedLandmarkLike,
  RepCounterConfig,
  RepCounterState,
  RepCounterUpdate,
} from "./types.ts";

export interface HalfSquatConfig extends RepCounterConfig {
  minVisibility: number;
  sideHysteresisMargin?: number;
}

export const HALF_SQUAT_CONFIG: HalfSquatConfig = {
  ...DEFAULT_HALF_SQUAT_CONFIG,
  minVisibility: 0.6,
  sideHysteresisMargin: 0.08,
};

export function analyzeHalfSquatLandmarks(
  landmarks: readonly NormalizedLandmarkLike[],
  config: HalfSquatConfig = HALF_SQUAT_CONFIG,
  preferredSide?: BodySide,
): KneeFrameAnalysis {
  const selection = selectKneeSide(
    landmarks,
    preferredSide,
    config.sideHysteresisMargin,
  );
  if (!selection || selection.visibility < config.minVisibility) {
    return {
      valid: false,
      cue: "Step back until your hip, knee, and ankle are visible from the side.",
    };
  }
  const angle = calculateAngleDeg(
    selection.triplet.hip,
    selection.triplet.knee,
    selection.triplet.ankle,
  );
  if (angle === null) {
    return { valid: false, cue: "Hold still while the knee angle is reacquired." };
  }
  return {
    valid: true,
    side: selection.side,
    kneeAngleDeg: Math.round(angle * 10) / 10,
    visibility: selection.visibility,
    cue: "Pose detected.",
  };
}

export function processHalfSquatFrame(
  state: RepCounterState,
  landmarks: readonly NormalizedLandmarkLike[],
  timestampMs: number,
  config: HalfSquatConfig = HALF_SQUAT_CONFIG,
  preferredSide?: BodySide,
): { analysis: KneeFrameAnalysis; update: RepCounterUpdate } {
  const analysis = analyzeHalfSquatLandmarks(
    landmarks,
    config,
    preferredSide,
  );
  return {
    analysis,
    update:
      analysis.valid && analysis.kneeAngleDeg !== undefined
        ? updateRepCounter(state, analysis.kneeAngleDeg, timestampMs, config)
        : { state, cue: analysis.cue },
  };
}
