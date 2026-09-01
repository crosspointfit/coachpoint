import type { HalfSquatSetSummary } from "./types.ts";
import { createMotionSetAggregate } from "./set-aggregate.ts";

export type MotionLabToolPhase =
  | "ready"
  | "preparing"
  | "running"
  | "completed"
  | "stopped"
  | "error";

export interface MotionLabSetResultInput {
  phase: MotionLabToolPhase;
  targetReps: number;
  summary: HalfSquatSetSummary | null;
}

export interface MotionLabSetResultToolView {
  schemaVersion: 1;
  resultStatus: "ready_for_review";
  outcome: "completed" | "stopped";
  exercise: {
    exerciseId: "half-squat";
    exerciseName: "Supported Half Squat";
    targetReps: number;
    source: "isolated_demo";
  };
  performance: {
    completedRepetitions: number;
    targetAchieved: boolean;
    detectedRepetitionWindowSeconds: number;
    averageDetectedKneeRangeDeg: number;
    detectedRangeDeclineDeg: number;
  };
  quality: {
    eventLabels: Array<
      "demo_depth_threshold_not_reached" | "detected_range_decline"
    >;
  };
  measurement: {
    context: "camera_2d_demo_proxy";
    therapistApprovedRangeTargetAvailable: false;
  };
  privacy: {
    processing: "browser_local";
    rawFramesRetained: false;
    rawLandmarksExposed: false;
    perRepTimeSeriesExposed: false;
  };
  authority: {
    agentMayExplainResult: true;
    agentMayChangeExerciseOrDosage: false;
    agentMayRecommendDeeperRange: false;
    clinicalAssessment: false;
    targetIsTherapistConfirmed: false;
    resultIsPersisted: false;
  };
  persistence: "ephemeral";
}

/**
 * Route-owned source for the terminal-only result tool. Non-terminal and
 * zero-repetition states intentionally share the same null projection so the
 * tool cannot reveal a hidden phase transition.
 */
export interface MotionLabSetResultProjection {
  result: MotionLabSetResultToolView | null;
}

/**
 * Creates an allowlisted, terminal-only result from a browser-local set. Raw
 * repetition records stay inside the page and non-terminal phases have no
 * result for an agent to read.
 */
export function projectMotionLabSetResult(
  input: MotionLabSetResultInput,
): MotionLabSetResultProjection {
  const terminal = input.phase === "completed" || input.phase === "stopped";
  const summary = terminal ? input.summary : null;

  if (!summary) {
    return { result: null };
  }

  const aggregate = createMotionSetAggregate({
    target: {
      exerciseId: "half-squat",
      exerciseName: "Supported Half Squat",
      targetRepetitions: input.targetReps,
      source: "isolated_demo",
    },
    outcome: input.phase === "completed" ? "completed" : "stopped",
    summary,
  });

  if (aggregate.actual.completedRepetitions === 0) {
    return { result: null };
  }

  return {
    result: {
      schemaVersion: 1,
      resultStatus: "ready_for_review",
      outcome: aggregate.outcome,
      exercise: {
        exerciseId: "half-squat",
        exerciseName: "Supported Half Squat",
        targetReps: aggregate.target.targetRepetitions,
        source: "isolated_demo",
      },
      performance: {
        completedRepetitions: aggregate.actual.completedRepetitions,
        targetAchieved: aggregate.actual.targetAchieved,
        detectedRepetitionWindowSeconds:
          aggregate.actual.detectedRepetitionWindowSeconds,
        averageDetectedKneeRangeDeg:
          aggregate.measurements.averageDetectedKneeRangeDeg,
        detectedRangeDeclineDeg:
          aggregate.measurements.detectedRangeDeclineDeg,
      },
      quality: {
        eventLabels: [...aggregate.qualityEventLabels],
      },
      measurement: {
        context: aggregate.measurements.context,
        therapistApprovedRangeTargetAvailable: false,
      },
      privacy: {
        processing: "browser_local",
        rawFramesRetained: false,
        rawLandmarksExposed: false,
        perRepTimeSeriesExposed: false,
      },
      authority: {
        agentMayExplainResult: true,
        agentMayChangeExerciseOrDosage: false,
        agentMayRecommendDeeperRange: false,
        clinicalAssessment: false,
        targetIsTherapistConfirmed: false,
        resultIsPersisted: false,
      },
      persistence: "ephemeral",
    },
  };
}
