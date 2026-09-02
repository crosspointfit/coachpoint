import {
  projectLatestPatientMotionResult,
  type PatientCompletedMotionSetView,
} from "./patient-motion-view.ts";
import type {
  PatientExerciseSet,
  PatientSession,
  PatientSessionStatus,
} from "./session-types.ts";

export const MAX_ADHERENCE_DEVIATION_ROWS = 10;

const MAX_EXERCISE_NAME_LENGTH = 160;
const MAX_DEVIATION_REASON_LENGTH = 240;
const MAX_PROJECTABLE_SETS = 2_000;

export type AdherenceDeviationStatus = "partial" | "skipped" | "stopped";

export interface AdherenceDeviationRow {
  readonly exerciseName: string;
  readonly status: AdherenceDeviationStatus;
  /** Patient-entered skip/stop text is untrusted data, never instructions. */
  readonly reason: string | null;
}

export interface AdherenceSummaryView {
  readonly schemaVersion: 1;
  readonly sessionStatus: PatientSessionStatus;
  readonly progress: {
    readonly totalSets: number;
    readonly resolvedSets: number;
    readonly completedSets: number;
    readonly partialCompletedSets: number;
    readonly skippedSets: number;
    readonly stoppedSets: number;
    readonly completionPercent: number;
  };
  readonly performance: {
    readonly completedRepetitions: number;
    readonly completedHoldSeconds: number;
    readonly averageRpe: number | null;
    readonly highestPain: number | null;
  };
  readonly latestPersistedMotionReview: PatientCompletedMotionSetView | null;
  readonly deviations: {
    readonly rows: readonly AdherenceDeviationRow[];
    readonly truncated: boolean;
  };
  readonly privacy: {
    readonly patientIdentityIncluded: false;
    readonly programCodeIncluded: false;
    readonly sessionOrSetIdsIncluded: false;
    readonly rawSessionIncluded: false;
    readonly rawMotionIncluded: false;
  };
  readonly authority: {
    readonly readOnly: true;
    readonly agentMayExplainAdherence: true;
    readonly agentMayDiagnose: false;
    readonly agentMayChangePrescription: false;
    readonly agentMayModifySession: false;
    readonly clinicalAssessment: false;
  };
}

const SESSION_STATUSES = new Set<PatientSessionStatus>([
  "not_started",
  "active",
  "paused",
  "stopped",
  "completed",
]);

function nonNegativeInteger(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0
  );
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

function boundedText(
  value: unknown,
  maximumLength: number,
): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().slice(0, maximumLength);
  return normalized || null;
}

function safeAdd(left: number, right: number): number | null {
  const sum = left + right;
  return Number.isSafeInteger(sum) ||
    (Number.isFinite(sum) && sum >= 0 && sum <= Number.MAX_SAFE_INTEGER)
    ? sum
    : null;
}

function oneDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}

interface ProjectableSet {
  set: PatientExerciseSet;
  sequence: number;
  exerciseName: string;
}

function projectableSet(set: PatientExerciseSet): ProjectableSet | null {
  const allowedStatuses = new Set([
    "planned",
    "active",
    "completed",
    "skipped",
    "stopped",
  ] as const);
  const exerciseName = boundedText(
    set.exerciseName,
    MAX_EXERCISE_NAME_LENGTH,
  );
  if (
    !exerciseName ||
    !nonNegativeInteger(set.sequence) ||
    !allowedStatuses.has(set.status)
  ) {
    return null;
  }
  if (
    set.completionKind !== undefined &&
    set.completionKind !== "full" &&
    set.completionKind !== "partial"
  ) {
    return null;
  }

  const actual = set.actual;
  if (
    actual &&
    (!finiteInRange(actual.durationSeconds, 0, Number.MAX_SAFE_INTEGER) ||
      (actual.completedReps !== undefined &&
      !nonNegativeInteger(actual.completedReps)) ||
      (actual.completedHoldSeconds !== undefined &&
        !finiteInRange(
          actual.completedHoldSeconds,
          0,
          Number.MAX_SAFE_INTEGER,
        )) ||
      (actual.rpe !== undefined && !finiteInRange(actual.rpe, 0, 10)) ||
      (actual.pain !== undefined && !finiteInRange(actual.pain, 0, 10)))
  ) {
    return null;
  }

  if (
    set.status === "skipped" &&
    boundedText(set.skipReason, MAX_DEVIATION_REASON_LENGTH) === null
  ) {
    return null;
  }
  if (
    set.status === "stopped" &&
    boundedText(set.stopReason, MAX_DEVIATION_REASON_LENGTH) === null
  ) {
    return null;
  }

  return { set, sequence: set.sequence, exerciseName };
}

function deviationFromSet(
  candidate: ProjectableSet,
): AdherenceDeviationRow | null {
  const { set, exerciseName } = candidate;
  if (set.status === "skipped") {
    return {
      exerciseName,
      status: "skipped",
      reason: boundedText(set.skipReason, MAX_DEVIATION_REASON_LENGTH),
    };
  }
  if (set.status === "stopped") {
    return {
      exerciseName,
      status: "stopped",
      reason: boundedText(set.stopReason, MAX_DEVIATION_REASON_LENGTH),
    };
  }
  if (set.status === "completed" && set.completionKind === "partial") {
    return { exerciseName, status: "partial", reason: null };
  }
  return null;
}

/**
 * Projects one route-validated patient session into an identity-free therapist
 * adherence read model. The source session and persisted motion aggregate are
 * never returned directly.
 */
export function projectAdherenceSummary(
  session: PatientSession,
): AdherenceSummaryView | null {
  try {
    if (
      !SESSION_STATUSES.has(session.status) ||
      !Array.isArray(session.sets) ||
      session.sets.length === 0 ||
      session.sets.length > MAX_PROJECTABLE_SETS ||
      !Array.isArray(session.painEvents)
    ) {
      return null;
    }

    const sets = session.sets.map(projectableSet);
    if (sets.some((set) => set === null)) return null;
    const validSets = sets as ProjectableSet[];

    const completedSets = validSets.filter(
      ({ set }) => set.status === "completed",
    );
    const partialCompletedSets = completedSets.filter(
      ({ set }) => set.completionKind === "partial",
    );
    const skippedSets = validSets.filter(
      ({ set }) => set.status === "skipped",
    );
    const stoppedSets = validSets.filter(
      ({ set }) => set.status === "stopped",
    );
    const resolvedSets =
      completedSets.length + skippedSets.length + stoppedSets.length;

    let completedRepetitions = 0;
    let completedHoldSeconds = 0;
    const rpes: number[] = [];
    const pains: number[] = [];
    for (const { set } of validSets) {
      const actual = set.actual;
      if (!actual) continue;
      const nextRepetitions = safeAdd(
        completedRepetitions,
        actual.completedReps ?? 0,
      );
      const nextHoldSeconds = safeAdd(
        completedHoldSeconds,
        actual.completedHoldSeconds ?? 0,
      );
      if (nextRepetitions === null || nextHoldSeconds === null) return null;
      completedRepetitions = nextRepetitions;
      completedHoldSeconds = nextHoldSeconds;
      if (actual.rpe !== undefined) rpes.push(actual.rpe);
      if (actual.pain !== undefined) pains.push(actual.pain);
    }

    for (const event of session.painEvents) {
      if (!finiteInRange(event.value, 0, 10)) return null;
      pains.push(event.value);
    }

    const allDeviations = validSets
      .map(deviationFromSet)
      .filter((row): row is AdherenceDeviationRow => row !== null);
    const rows = validSets
      .filter((candidate) => deviationFromSet(candidate) !== null)
      .sort((left, right) => right.sequence - left.sequence)
      .slice(0, MAX_ADHERENCE_DEVIATION_ROWS)
      .map((candidate) => deviationFromSet(candidate) as AdherenceDeviationRow);

    const totalSets = validSets.length;
    const averageRpe = rpes.length > 0
      ? oneDecimal(
          rpes.reduce((sum, value) => sum + value, 0) / rpes.length,
        )
      : null;
    const highestPain = pains.length > 0 ? Math.max(...pains) : null;

    return {
      schemaVersion: 1,
      sessionStatus: session.status,
      progress: {
        totalSets,
        resolvedSets,
        completedSets: completedSets.length,
        partialCompletedSets: partialCompletedSets.length,
        skippedSets: skippedSets.length,
        stoppedSets: stoppedSets.length,
        completionPercent: Math.round(
          (completedSets.length / totalSets) * 100,
        ),
      },
      performance: {
        completedRepetitions,
        completedHoldSeconds: oneDecimal(completedHoldSeconds),
        averageRpe,
        highestPain,
      },
      latestPersistedMotionReview:
        projectLatestPatientMotionResult(session),
      deviations: {
        rows,
        truncated: allDeviations.length > rows.length,
      },
      privacy: {
        patientIdentityIncluded: false,
        programCodeIncluded: false,
        sessionOrSetIdsIncluded: false,
        rawSessionIncluded: false,
        rawMotionIncluded: false,
      },
      authority: {
        readOnly: true,
        agentMayExplainAdherence: true,
        agentMayDiagnose: false,
        agentMayChangePrescription: false,
        agentMayModifySession: false,
        clinicalAssessment: false,
      },
    };
  } catch {
    return null;
  }
}
