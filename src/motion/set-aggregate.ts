import type { HalfSquatSetSummary } from "./types.ts";

export type MotionSetOutcome = "completed" | "stopped";

export type MotionTargetSource =
  | "isolated_demo"
  | "therapist_confirmed";

export type MotionAggregateQualityEvent =
  | "demo_depth_threshold_not_reached"
  | "detected_range_decline";

export interface MotionSetAggregateTargetInput {
  readonly exerciseId: string;
  readonly exerciseName: string;
  readonly targetRepetitions: number;
  readonly source: MotionTargetSource;
}

export interface MotionSetAggregateInput {
  readonly target: MotionSetAggregateTargetInput;
  readonly outcome: MotionSetOutcome;
  readonly summary: HalfSquatSetSummary;
}

/**
 * An allowlisted, JSON-safe set-boundary result. It deliberately contains no
 * raw frames, landmarks, per-frame angles, or per-repetition records.
 */
export interface MotionSetAggregate {
  readonly schemaVersion: 1;
  readonly kind: "motion_set_aggregate";
  readonly target: {
    readonly exerciseId: string;
    readonly exerciseName: string;
    readonly targetRepetitions: number;
    readonly source: MotionTargetSource;
  };
  readonly outcome: MotionSetOutcome;
  readonly actual: {
    readonly completedRepetitions: number;
    readonly targetAchieved: boolean;
    readonly detectedRepetitionWindowSeconds: number;
  };
  readonly measurements: {
    readonly context: "camera_2d_demo_proxy";
    readonly averageDetectedKneeRangeDeg: number;
    readonly detectedRangeDeclineDeg: number;
  };
  readonly qualityEventLabels: readonly MotionAggregateQualityEvent[];
  readonly clinicalBoundary: {
    readonly clinicalAssessment: false;
    readonly intendedUse: "demo_coaching_support_only";
  };
  readonly privacyBoundary: {
    readonly patientIdentityIncluded: false;
    readonly cameraDetailsIncluded: false;
    readonly rawFramesIncluded: false;
    readonly rawLandmarksIncluded: false;
    readonly perRepTimeSeriesIncluded: false;
  };
  readonly authorityBoundary: {
    readonly targetIsTherapistConfirmed: boolean;
    readonly agentCanStartCamera: false;
    readonly agentCanStopCamera: false;
    readonly agentCanControlSet: false;
    readonly agentCanChangeTarget: false;
  };
}

const MAX_EXERCISE_ID_LENGTH = 96;
const MAX_EXERCISE_NAME_LENGTH = 160;

function boundedText(
  value: unknown,
  fallback: string,
  maximumLength: number,
): string {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim().slice(0, maximumLength);
  return normalized || fallback;
}

function positiveInteger(value: unknown, fallback = 1): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 1
    ? Math.floor(value)
    : fallback;
}

function nonNegativeInteger(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : 0;
}

function nonNegativeNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : 0;
}

function normalizedTargetSource(value: unknown): MotionTargetSource {
  return value === "therapist_confirmed"
    ? "therapist_confirmed"
    : "isolated_demo";
}

function normalizedOutcome(value: unknown): MotionSetOutcome {
  return value === "completed" ? "completed" : "stopped";
}

function hasQualityFlag(
  summary: HalfSquatSetSummary,
  flag: "limited_depth" | "range_decline",
): boolean {
  return (
    Array.isArray(summary.qualityFlags) &&
    summary.qualityFlags.some((candidate) => candidate === flag)
  );
}

/**
 * Creates a set-boundary aggregate from the detector summary and an explicit
 * route-owned target. The function copies only known aggregate fields and
 * fails closed to demo/stopped semantics for invalid runtime enum values.
 */
export function createMotionSetAggregate(
  input: MotionSetAggregateInput,
): MotionSetAggregate {
  const targetRepetitions = positiveInteger(input.target.targetRepetitions);
  const completedRepetitions = nonNegativeInteger(
    input.summary.completedReps,
  );
  const source = normalizedTargetSource(input.target.source);

  return {
    schemaVersion: 1,
    kind: "motion_set_aggregate",
    target: {
      exerciseId: boundedText(
        input.target.exerciseId,
        "unknown-exercise",
        MAX_EXERCISE_ID_LENGTH,
      ),
      exerciseName: boundedText(
        input.target.exerciseName,
        "Unknown exercise",
        MAX_EXERCISE_NAME_LENGTH,
      ),
      targetRepetitions,
      source,
    },
    outcome: normalizedOutcome(input.outcome),
    actual: {
      completedRepetitions,
      targetAchieved: completedRepetitions >= targetRepetitions,
      detectedRepetitionWindowSeconds: nonNegativeNumber(
        input.summary.detectedRepetitionWindowSeconds,
      ),
    },
    measurements: {
      context: "camera_2d_demo_proxy",
      averageDetectedKneeRangeDeg: nonNegativeNumber(
        input.summary.averageRangeDeg,
      ),
      detectedRangeDeclineDeg: nonNegativeNumber(
        input.summary.rangeDeclineDeg,
      ),
    },
    qualityEventLabels: [
      ...(hasQualityFlag(input.summary, "limited_depth")
        ? ["demo_depth_threshold_not_reached" as const]
        : []),
      ...(hasQualityFlag(input.summary, "range_decline")
        ? ["detected_range_decline" as const]
        : []),
    ],
    clinicalBoundary: {
      clinicalAssessment: false,
      intendedUse: "demo_coaching_support_only",
    },
    privacyBoundary: {
      patientIdentityIncluded: false,
      cameraDetailsIncluded: false,
      rawFramesIncluded: false,
      rawLandmarksIncluded: false,
      perRepTimeSeriesIncluded: false,
    },
    authorityBoundary: {
      targetIsTherapistConfirmed: source === "therapist_confirmed",
      agentCanStartCamera: false,
      agentCanStopCamera: false,
      agentCanControlSet: false,
      agentCanChangeTarget: false,
    },
  };
}
