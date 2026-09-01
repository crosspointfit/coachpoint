import {
  HALF_SQUAT_CONFIG,
  processHalfSquatFrame,
  type HalfSquatConfig,
} from "./half-squat.ts";
import {
  createRepCounterState,
  didReachRepTarget,
  resetIncompleteRep,
  summarizeRepCounter,
} from "./rep-counter.ts";
import type {
  BodySide,
  HalfSquatSetSummary,
  KneeFrameAnalysis,
  NormalizedLandmarkLike,
  RepCounterState,
  RepCounterUpdate,
  RepPhase,
} from "./types.ts";

export const DEFAULT_HALF_SQUAT_MISSING_FRAME_THRESHOLD = 5;

export interface HalfSquatSetRunnerOptions {
  readonly targetRepetitions: number;
  readonly missingFrameResetThreshold?: number;
  readonly config?: Partial<HalfSquatConfig>;
}

export type HalfSquatSetRunnerInput =
  | {
      readonly type: "landmarks";
      readonly landmarks: readonly NormalizedLandmarkLike[];
      readonly timestampMs: number;
    }
  | { readonly type: "missing_frame" };

export type HalfSquatSetRunnerTrackingState =
  | "acquiring"
  | "tracked"
  | "lost";

export type HalfSquatSetRunnerCoarseEvent =
  | { readonly type: "tracking_acquired"; readonly side: BodySide }
  | { readonly type: "tracking_lost" }
  | { readonly type: "counter_reset_after_tracking_loss" }
  | {
      readonly type: "rep_completed";
      readonly completedRepetitions: number;
    }
  | {
      readonly type: "target_reached";
      readonly completedRepetitions: number;
    };

export interface HalfSquatSetRunnerSnapshot {
  readonly targetRepetitions: number;
  readonly completedRepetitions: number;
  readonly repPhase: RepPhase;
  readonly lockedSide?: BodySide;
  readonly consecutiveMissingFrames: number;
  readonly trackingState: HalfSquatSetRunnerTrackingState;
  readonly targetReached: boolean;
}

export interface HalfSquatSetRunnerStep {
  readonly analysis: KneeFrameAnalysis;
  readonly update: RepCounterUpdate;
  readonly snapshot: HalfSquatSetRunnerSnapshot;
  readonly targetReached: boolean;
  readonly trackingReset: boolean;
  readonly events: readonly HalfSquatSetRunnerCoarseEvent[];
}

export interface HalfSquatSetRunner {
  process(input: HalfSquatSetRunnerInput): HalfSquatSetRunnerStep;
  reset(): HalfSquatSetRunnerSnapshot;
  getSnapshot(): HalfSquatSetRunnerSnapshot;
  getSummary(): HalfSquatSetSummary;
}

const MISSING_FRAME_CUE =
  "Step back until your full side profile is visible.";
const TARGET_REACHED_CUE = "Set target reached.";

function positiveInteger(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 1
    ? Math.floor(value)
    : fallback;
}

function missingFrameAnalysis(cue = MISSING_FRAME_CUE): KneeFrameAnalysis {
  return { valid: false, cue };
}

/**
 * Owns only the deterministic state required to interpret a single half-squat
 * set. It does not retain landmark inputs or access cameras, React, audio,
 * storage, patient data, or agent tooling.
 */
export function createHalfSquatSetRunner(
  options: HalfSquatSetRunnerOptions,
): HalfSquatSetRunner {
  const targetRepetitions = positiveInteger(options.targetRepetitions, 1);
  const missingFrameResetThreshold = positiveInteger(
    options.missingFrameResetThreshold,
    DEFAULT_HALF_SQUAT_MISSING_FRAME_THRESHOLD,
  );
  const configOverrides = options.config;
  const config: HalfSquatConfig = {
    downThresholdDeg:
      configOverrides?.downThresholdDeg ?? HALF_SQUAT_CONFIG.downThresholdDeg,
    upThresholdDeg:
      configOverrides?.upThresholdDeg ?? HALF_SQUAT_CONFIG.upThresholdDeg,
    targetDepthDeg:
      configOverrides?.targetDepthDeg ?? HALF_SQUAT_CONFIG.targetDepthDeg,
    stableFrames:
      configOverrides?.stableFrames ?? HALF_SQUAT_CONFIG.stableFrames,
    rangeDeclineThresholdDeg:
      configOverrides?.rangeDeclineThresholdDeg ??
      HALF_SQUAT_CONFIG.rangeDeclineThresholdDeg,
    minVisibility:
      configOverrides?.minVisibility ?? HALF_SQUAT_CONFIG.minVisibility,
    sideHysteresisMargin:
      configOverrides?.sideHysteresisMargin ??
      HALF_SQUAT_CONFIG.sideHysteresisMargin,
  };

  let repState: RepCounterState = createRepCounterState();
  let lockedSide: BodySide | undefined;
  let consecutiveMissingFrames = 0;
  let trackingState: HalfSquatSetRunnerTrackingState = "acquiring";
  let trackingWasAcquired = false;
  let reachedTarget = false;

  const snapshot = (): HalfSquatSetRunnerSnapshot => ({
    targetRepetitions,
    completedRepetitions: repState.reps,
    repPhase: repState.phase,
    lockedSide,
    consecutiveMissingFrames,
    trackingState,
    targetReached: reachedTarget,
  });

  const terminalStep = (): HalfSquatSetRunnerStep => ({
    analysis: missingFrameAnalysis(TARGET_REACHED_CUE),
    update: { state: repState, cue: TARGET_REACHED_CUE },
    snapshot: snapshot(),
    targetReached: true,
    trackingReset: false,
    events: [],
  });

  const process = (
    input: HalfSquatSetRunnerInput,
  ): HalfSquatSetRunnerStep => {
    if (reachedTarget) return terminalStep();

    const events: HalfSquatSetRunnerCoarseEvent[] = [];
    const processed =
      input.type === "landmarks"
        ? processHalfSquatFrame(
            repState,
            input.landmarks,
            input.timestampMs,
            config,
            lockedSide,
          )
        : {
            analysis: missingFrameAnalysis(),
            update: { state: repState, cue: MISSING_FRAME_CUE },
          };

    let update = processed.update;
    let trackingReset = false;

    if (
      processed.analysis.valid &&
      processed.analysis.side !== undefined
    ) {
      if (trackingState !== "tracked") {
        events.push({
          type: "tracking_acquired",
          side: processed.analysis.side,
        });
      }
      trackingWasAcquired = true;
      trackingState = "tracked";
      consecutiveMissingFrames = 0;
      lockedSide = processed.analysis.side;
      repState = update.state;
    } else {
      consecutiveMissingFrames += 1;
      if (trackingWasAcquired && trackingState === "tracked") {
        events.push({ type: "tracking_lost" });
      }
      trackingState = trackingWasAcquired ? "lost" : "acquiring";

      if (
        trackingWasAcquired &&
        consecutiveMissingFrames === missingFrameResetThreshold
      ) {
        repState = resetIncompleteRep(update.state);
        lockedSide = undefined;
        trackingReset = true;
        events.push({ type: "counter_reset_after_tracking_loss" });
        update = { state: repState, cue: processed.analysis.cue };
      } else {
        repState = update.state;
      }
    }

    if (update.event?.type === "rep_completed") {
      events.push({
        type: "rep_completed",
        completedRepetitions: update.event.record.rep,
      });
    }

    if (didReachRepTarget(update, targetRepetitions)) {
      reachedTarget = true;
      events.push({
        type: "target_reached",
        completedRepetitions: repState.reps,
      });
    }

    return {
      analysis: processed.analysis,
      update,
      snapshot: snapshot(),
      targetReached: reachedTarget,
      trackingReset,
      events,
    };
  };

  const reset = (): HalfSquatSetRunnerSnapshot => {
    repState = createRepCounterState();
    lockedSide = undefined;
    consecutiveMissingFrames = 0;
    trackingState = "acquiring";
    trackingWasAcquired = false;
    reachedTarget = false;
    return snapshot();
  };

  return {
    process,
    reset,
    getSnapshot: snapshot,
    getSummary: () => summarizeRepCounter(repState, config),
  };
}
