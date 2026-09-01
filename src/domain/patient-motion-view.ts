import type {
  PatientExerciseSet,
  PatientSession,
} from "./session-types.ts";
import type {
  MotionAggregateQualityEvent,
  MotionSetAggregate,
} from "../motion/set-aggregate.ts";

const MAX_STOP_REASON_LENGTH = 240;

export type PatientMotionContinuationBlock =
  | "pain_safety_gate"
  | "no_next_set"
  | "session_paused"
  | "session_closed"
  | "session_not_active";

export interface PatientCompletedMotionSetView {
  schemaVersion: 1;
  resultStatus: "ready_for_review";
  target: {
    exerciseName: string;
    targetRepetitions: number;
    source: "therapist_confirmed";
  };
  outcome: "completed" | "stopped";
  performance: {
    completedRepetitions: number;
    targetAchieved: boolean;
    setDurationSeconds: number;
    detectedRepetitionWindowSeconds: number;
  };
  measurements: {
    context: "camera_2d_demo_proxy";
    averageDetectedKneeRangeDeg: number;
    detectedRangeDeclineDeg: number;
  };
  quality: {
    eventLabels: MotionAggregateQualityEvent[];
  };
  checkIn: {
    rpe: number;
    pain: number;
  };
  stopReason: string | null;
  continuation: {
    allowed: boolean;
    blockedBy: PatientMotionContinuationBlock | null;
    painGateActive: boolean;
    painThreshold: number;
  };
  privacy: {
    patientIdentityIncluded: false;
    programCodeIncluded: false;
    routeOrRecordIdsIncluded: false;
    cameraDetailsIncluded: false;
    rawFramesIncluded: false;
    rawLandmarksIncluded: false;
    perRepTimeSeriesIncluded: false;
  };
  authority: {
    targetIsTherapistConfirmed: true;
    resultIsPersisted: true;
    agentMayExplainResult: true;
    agentMayChangeExerciseOrDosage: false;
    agentMayStartOrStopCamera: false;
    agentMayOverridePainGate: false;
    clinicalAssessment: false;
  };
}

interface ValidCandidate {
  set: PatientExerciseSet;
  aggregate: MotionSetAggregate;
  resolvedAtMs: number;
  rpe: number;
  pain: number;
  stopReason: string | null;
}

function finiteInRange(
  value: unknown,
  minimum: number,
  maximum: number,
): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= minimum &&
    value <= maximum
  );
}

function nonNegativeInteger(value: unknown): value is number {
  return finiteInRange(value, 0, Number.MAX_SAFE_INTEGER) && Number.isInteger(value);
}

function boundedNonEmptyText(value: unknown, maximumLength: number): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().slice(0, maximumLength);
  return normalized || null;
}

function resolvedAt(set: PatientExerciseSet): number | null {
  const timestamp = set.completedAt ?? set.stoppedAt;
  if (!timestamp) return null;
  const value = new Date(timestamp).getTime();
  return Number.isFinite(value) ? value : null;
}

function validQualityLabels(
  labels: readonly MotionAggregateQualityEvent[],
): labels is readonly MotionAggregateQualityEvent[] {
  const allowed = new Set<MotionAggregateQualityEvent>([
    "demo_depth_threshold_not_reached",
    "detected_range_decline",
  ]);
  return (
    Array.isArray(labels) &&
    labels.length <= allowed.size &&
    labels.every((label) => allowed.has(label)) &&
    new Set(labels).size === labels.length
  );
}

function candidateFromSet(set: PatientExerciseSet): ValidCandidate | null {
  try {
    if (
      (set.status !== "completed" && set.status !== "stopped") ||
      !set.actual?.motion ||
      set.motionAttempt !== undefined ||
      set.mode !== "camera" ||
      set.prescribedCoachingMode !== "camera"
    ) {
      return null;
    }

    const aggregate = set.actual.motion;
    const targetRepetitions = set.prescribedTarget.reps;
    const completedRepetitions = set.actual.completedReps;
    const resolvedAtMs = resolvedAt(set);
    const rpe = set.actual.rpe;
    const pain = set.actual.pain;
    const stopReason =
      set.status === "stopped"
        ? boundedNonEmptyText(set.stopReason, MAX_STOP_REASON_LENGTH)
        : null;

    if (
      aggregate.schemaVersion !== 1 ||
      aggregate.kind !== "motion_set_aggregate" ||
      aggregate.target.source !== "therapist_confirmed" ||
      aggregate.authorityBoundary.targetIsTherapistConfirmed !== true ||
      aggregate.authorityBoundary.agentCanStartCamera !== false ||
      aggregate.authorityBoundary.agentCanStopCamera !== false ||
      aggregate.authorityBoundary.agentCanControlSet !== false ||
      aggregate.authorityBoundary.agentCanChangeTarget !== false ||
      aggregate.clinicalBoundary.clinicalAssessment !== false ||
      aggregate.clinicalBoundary.intendedUse !==
        "demo_coaching_support_only" ||
      aggregate.privacyBoundary.patientIdentityIncluded !== false ||
      aggregate.privacyBoundary.cameraDetailsIncluded !== false ||
      aggregate.privacyBoundary.rawFramesIncluded !== false ||
      aggregate.privacyBoundary.rawLandmarksIncluded !== false ||
      aggregate.privacyBoundary.perRepTimeSeriesIncluded !== false ||
      aggregate.measurements.context !== "camera_2d_demo_proxy" ||
      aggregate.target.exerciseId !== set.exerciseId ||
      aggregate.target.exerciseName !== set.exerciseName ||
      !nonNegativeInteger(targetRepetitions) ||
      targetRepetitions < 1 ||
      aggregate.target.targetRepetitions !== targetRepetitions ||
      !nonNegativeInteger(completedRepetitions) ||
      completedRepetitions > targetRepetitions ||
      aggregate.actual.completedRepetitions !== completedRepetitions ||
      aggregate.actual.targetAchieved !==
        (completedRepetitions >= targetRepetitions) ||
      aggregate.outcome !== set.status ||
      (set.status === "stopped" && aggregate.actual.targetAchieved) ||
      !finiteInRange(set.actual.durationSeconds, 0, Number.MAX_SAFE_INTEGER) ||
      !finiteInRange(
        aggregate.actual.detectedRepetitionWindowSeconds,
        0,
        Number.MAX_SAFE_INTEGER,
      ) ||
      !finiteInRange(aggregate.measurements.averageDetectedKneeRangeDeg, 0, 180) ||
      !finiteInRange(aggregate.measurements.detectedRangeDeclineDeg, 0, 180) ||
      !validQualityLabels(aggregate.qualityEventLabels) ||
      !finiteInRange(rpe, 0, 10) ||
      !finiteInRange(pain, 0, 10) ||
      resolvedAtMs === null ||
      (set.status === "stopped" && stopReason === null) ||
      (set.status === "completed" && set.stopReason !== undefined)
    ) {
      return null;
    }

    return { set, aggregate, resolvedAtMs, rpe, pain, stopReason };
  } catch {
    return null;
  }
}

function continuationState(
  session: PatientSession,
  checkedInPain: number,
): Pick<
  PatientCompletedMotionSetView,
  "continuation"
>["continuation"] {
  const painThreshold = finiteInRange(session.safetyGate.threshold, 0, 10)
    ? session.safetyGate.threshold
    : 5;
  const painGateActive =
    session.safetyGate.active === true || checkedInPain >= painThreshold;
  let blockedBy: PatientMotionContinuationBlock | null = null;
  if (painGateActive) blockedBy = "pain_safety_gate";
  else if (session.status === "paused") blockedBy = "session_paused";
  else if (session.status === "completed" || session.status === "stopped") {
    blockedBy = "session_closed";
  } else if (session.status !== "active") blockedBy = "session_not_active";
  else if (!session.sets.some((set) => set.status === "planned")) {
    blockedBy = "no_next_set";
  }

  return {
    allowed: blockedBy === null,
    blockedBy,
    painGateActive,
    painThreshold,
  };
}

/**
 * Projects the newest persisted camera set that has completed explicit RPE and
 * pain check-in. Staged attempts and active-set state are intentionally absent.
 */
export function projectLatestPatientMotionResult(
  session: PatientSession,
): PatientCompletedMotionSetView | null {
  try {
    if (
      typeof session.safetyGate.active !== "boolean" ||
      !finiteInRange(session.safetyGate.threshold, 0, 10) ||
      session.sets.some((set) => set.status === "active")
    ) {
      return null;
    }
    const resolvedMotionSets = session.sets
      .filter(
        (set) =>
          (set.status === "completed" || set.status === "stopped") &&
          set.actual?.motion !== undefined,
      )
      .map((set) => ({ set, resolvedAtMs: resolvedAt(set) }));
    if (
      resolvedMotionSets.some(({ resolvedAtMs }) => resolvedAtMs === null)
    ) {
      return null;
    }
    resolvedMotionSets.sort(
      (left, right) =>
        (right.resolvedAtMs as number) - (left.resolvedAtMs as number) ||
        right.set.sequence - left.set.sequence,
    );
    const latestSet = resolvedMotionSets[0]?.set;
    if (!latestSet) return null;
    const latest = candidateFromSet(latestSet);
    if (!latest) return null;

    const { set, aggregate } = latest;
    return {
      schemaVersion: 1,
      resultStatus: "ready_for_review",
      target: {
        exerciseName: aggregate.target.exerciseName,
        targetRepetitions: aggregate.target.targetRepetitions,
        source: "therapist_confirmed",
      },
      outcome: aggregate.outcome,
      performance: {
        completedRepetitions: aggregate.actual.completedRepetitions,
        targetAchieved: aggregate.actual.targetAchieved,
        setDurationSeconds: set.actual!.durationSeconds,
        detectedRepetitionWindowSeconds:
          aggregate.actual.detectedRepetitionWindowSeconds,
      },
      measurements: {
        context: "camera_2d_demo_proxy",
        averageDetectedKneeRangeDeg:
          aggregate.measurements.averageDetectedKneeRangeDeg,
        detectedRangeDeclineDeg:
          aggregate.measurements.detectedRangeDeclineDeg,
      },
      quality: {
        eventLabels: [...aggregate.qualityEventLabels],
      },
      checkIn: {
        rpe: latest.rpe,
        pain: latest.pain,
      },
      stopReason: latest.stopReason,
      continuation: continuationState(
        session,
        latest.pain,
      ),
      privacy: {
        patientIdentityIncluded: false,
        programCodeIncluded: false,
        routeOrRecordIdsIncluded: false,
        cameraDetailsIncluded: false,
        rawFramesIncluded: false,
        rawLandmarksIncluded: false,
        perRepTimeSeriesIncluded: false,
      },
      authority: {
        targetIsTherapistConfirmed: true,
        resultIsPersisted: true,
        agentMayExplainResult: true,
        agentMayChangeExerciseOrDosage: false,
        agentMayStartOrStopCamera: false,
        agentMayOverridePainGate: false,
        clinicalAssessment: false,
      },
    };
  } catch {
    return null;
  }
}
