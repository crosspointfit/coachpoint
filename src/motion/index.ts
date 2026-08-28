export { calculateAngleDeg, selectKneeSide } from "./angle.ts";
export {
  HALF_SQUAT_CONFIG,
  analyzeHalfSquatLandmarks,
  processHalfSquatFrame,
  type HalfSquatConfig,
} from "./half-squat.ts";
export {
  DEFAULT_HALF_SQUAT_CONFIG,
  createRepCounterState,
  summarizeRepCounter,
  updateRepCounter,
} from "./rep-counter.ts";
export { HALF_SQUAT_REPLAY, type ReplayFrame } from "./replay.ts";
export type {
  BodySide,
  HalfSquatSetSummary,
  KneeFrameAnalysis,
  NormalizedLandmarkLike,
  RepCounterConfig,
  RepCounterEvent,
  RepCounterState,
  RepCounterUpdate,
  RepPhase,
  RepRecord,
} from "./types.ts";

