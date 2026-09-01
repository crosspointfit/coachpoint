export interface NormalizedLandmarkLike {
  x: number;
  y: number;
  z?: number;
  visibility?: number;
  presence?: number;
}

export type BodySide = "left" | "right";

export type RepPhase =
  | "seeking_standing"
  | "standing"
  | "lowering"
  | "lowered"
  | "rising";

export interface RepCounterConfig {
  downThresholdDeg: number;
  upThresholdDeg: number;
  targetDepthDeg: number;
  stableFrames: number;
  rangeDeclineThresholdDeg: number;
}

export interface RepRecord {
  rep: number;
  startedAtMs: number;
  completedAtMs: number;
  durationMs: number;
  minAngleDeg: number;
  maxAngleDeg: number;
  rangeDeg: number;
  limitedDepth: boolean;
}

export interface RepCounterState {
  phase: RepPhase;
  reps: number;
  stableCount: number;
  lastAngleDeg?: number;
  activeRepStartedAtMs?: number;
  activeMinAngleDeg?: number;
  activeMaxAngleDeg?: number;
  records: readonly RepRecord[];
}

export type RepCounterEvent =
  | { type: "ready" }
  | { type: "bottom" }
  | { type: "rep_completed"; record: RepRecord };

export interface RepCounterUpdate {
  state: RepCounterState;
  event?: RepCounterEvent;
  cue: string;
}

export interface KneeFrameAnalysis {
  valid: boolean;
  side?: BodySide;
  kneeAngleDeg?: number;
  visibility?: number;
  cue: string;
}

export interface HalfSquatSetSummary {
  completedReps: number;
  detectedRepetitionWindowSeconds: number;
  averageRangeDeg: number;
  rangeDeclineDeg: number;
  averageMinAngleDeg: number;
  qualityFlags: string[];
  reps: RepRecord[];
}
