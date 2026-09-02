import type { ConfirmedProgram, DomainError, DomainResult } from "./types.ts";
import { getExerciseById } from "./catalog.ts";
import type { MotionSetAggregate } from "../motion/set-aggregate.ts";
import type {
  DecideNextSetFocusInput,
  CompleteMotionSetCheckInInput,
  CompleteExerciseSetInput,
  LogPainInput,
  PainEvent,
  PatientCoachingEvidenceCode,
  PatientCoachingFocus,
  PatientExerciseSet,
  PatientMotionAttempt,
  PatientSession,
  PatientSessionProgress,
  PatientSessionSummary,
  SessionFactories,
  SessionIdKind,
  SkipExerciseInput,
  StageNextSetFocusInput,
  StageMotionSetResultInput,
  StartExerciseSetInput,
  StopSessionInput,
  SwitchActiveCameraSetToManualFallbackInput,
} from "./session-types.ts";

export const PAIN_SAFETY_THRESHOLD = 5;
export const MAX_COACHING_FOCUS_TEXT_LENGTH = 240;

const DEFAULT_FACTORIES: SessionFactories = {
  id: (kind) => `${kind}_${secureUuid()}`,
  now: () => new Date(),
};

function secureUuid(): string {
  if (typeof globalThis.crypto?.randomUUID !== "function") {
    throw new Error("A cryptographically secure UUID generator is required.");
  }
  return globalThis.crypto.randomUUID();
}

function success<T>(value: T): DomainResult<T> {
  return { ok: true, value };
}

function failure<T>(...errors: DomainError[]): DomainResult<T> {
  return { ok: false, errors };
}

function error(
  code: string,
  message: string,
  field?: string,
  recoverable = true,
): DomainError {
  return { code, message, field, recoverable };
}

function factories(
  overrides?: Partial<SessionFactories>,
): SessionFactories {
  return { ...DEFAULT_FACTORIES, ...overrides };
}

function timestamp(now: SessionFactories["now"]): DomainResult<string> {
  try {
    const raw = now();
    const date = raw instanceof Date ? raw : new Date(raw);
    if (Number.isNaN(date.getTime())) {
      return failure(
        error(
          "invalid_factory_output",
          "The session time factory returned an invalid date.",
          undefined,
          false,
        ),
      );
    }
    return success(date.toISOString());
  } catch {
    return failure(
      error(
        "factory_failure",
        "The session time factory failed.",
        undefined,
        false,
      ),
    );
  }
}

function makeId(
  idFactory: SessionFactories["id"],
  kind: SessionIdKind,
): DomainResult<string> {
  try {
    const id = idFactory(kind).trim();
    return id
      ? success(id)
      : failure(
          error(
            "invalid_factory_output",
            `The ${kind} ID factory returned an empty value.`,
            undefined,
            false,
          ),
        );
  } catch {
    return failure(
      error("factory_failure", `The ${kind} ID factory failed.`, undefined, false),
    );
  }
}

function makeFocusId(
  idFactory: SessionFactories["id"],
): DomainResult<string> {
  const opaque = makeId(idFactory, "set");
  return opaque.ok ? success(`focus_${opaque.value}`) : opaque;
}

function isResolved(status: PatientExerciseSet["status"]): boolean {
  return status === "completed" || status === "skipped" || status === "stopped";
}

function validateScore(
  value: number | undefined,
  field: string,
): DomainError | null {
  if (value === undefined) return null;
  return Number.isFinite(value) && value >= 0 && value <= 10
    ? null
    : error("invalid_score", `${field} must be between 0 and 10.`, field);
}

function validateRequiredScore(value: unknown, field: string): DomainError | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 10
    ? null
    : error(
        "invalid_score",
        `An explicit ${field} score between 0 and 10 is required.`,
        field,
      );
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const keys = Reflect.ownKeys(value);
  return (
    keys.length === expected.length &&
    keys.every(
      (key) => typeof key === "string" && expected.includes(key),
    )
  );
}

function isFiniteNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return isFiniteNonNegative(value) && Number.isInteger(value);
}

function cloneMotionSetAggregate(
  aggregate: MotionSetAggregate,
): MotionSetAggregate {
  return {
    schemaVersion: 1,
    kind: "motion_set_aggregate",
    target: { ...aggregate.target },
    outcome: aggregate.outcome,
    actual: { ...aggregate.actual },
    measurements: { ...aggregate.measurements },
    qualityEventLabels: [...aggregate.qualityEventLabels],
    clinicalBoundary: { ...aggregate.clinicalBoundary },
    privacyBoundary: { ...aggregate.privacyBoundary },
    authorityBoundary: { ...aggregate.authorityBoundary },
  };
}

function invalidMotionResult(message: string, field = "aggregate") {
  return error("invalid_motion_result", message, field);
}

/**
 * Treats camera output as untrusted at the patient-domain boundary. Only the
 * exact aggregate contract is copied, and its target must match the active,
 * therapist-confirmed set snapshot.
 */
function validateAndCloneMotionSetAggregate(
  value: unknown,
  target: PatientExerciseSet,
): DomainResult<MotionSetAggregate> {
  try {
    if (
      !isPlainRecord(value) ||
      !hasExactKeys(value, [
        "schemaVersion",
        "kind",
        "target",
        "outcome",
        "actual",
        "measurements",
        "qualityEventLabels",
        "clinicalBoundary",
        "privacyBoundary",
        "authorityBoundary",
      ])
    ) {
      return failure(
        invalidMotionResult(
          "The motion result must use the allowlisted aggregate contract only.",
        ),
      );
    }

    const aggregateTarget = value.target;
    const actual = value.actual;
    const measurements = value.measurements;
    const clinicalBoundary = value.clinicalBoundary;
    const privacyBoundary = value.privacyBoundary;
    const authorityBoundary = value.authorityBoundary;
    const qualityEventLabels = value.qualityEventLabels;

    if (
      value.schemaVersion !== 1 ||
      value.kind !== "motion_set_aggregate" ||
      (value.outcome !== "completed" && value.outcome !== "stopped") ||
      !isPlainRecord(aggregateTarget) ||
      !hasExactKeys(aggregateTarget, [
        "exerciseId",
        "exerciseName",
        "targetRepetitions",
        "source",
      ]) ||
      !isPlainRecord(actual) ||
      !hasExactKeys(actual, [
        "completedRepetitions",
        "targetAchieved",
        "detectedRepetitionWindowSeconds",
      ]) ||
      !isPlainRecord(measurements) ||
      !hasExactKeys(measurements, [
        "context",
        "averageDetectedKneeRangeDeg",
        "detectedRangeDeclineDeg",
      ]) ||
      !Array.isArray(qualityEventLabels) ||
      !isPlainRecord(clinicalBoundary) ||
      !hasExactKeys(clinicalBoundary, ["clinicalAssessment", "intendedUse"]) ||
      !isPlainRecord(privacyBoundary) ||
      !hasExactKeys(privacyBoundary, [
        "patientIdentityIncluded",
        "cameraDetailsIncluded",
        "rawFramesIncluded",
        "rawLandmarksIncluded",
        "perRepTimeSeriesIncluded",
      ]) ||
      !isPlainRecord(authorityBoundary) ||
      !hasExactKeys(authorityBoundary, [
        "targetIsTherapistConfirmed",
        "agentCanStartCamera",
        "agentCanStopCamera",
        "agentCanControlSet",
        "agentCanChangeTarget",
      ])
    ) {
      return failure(
        invalidMotionResult("The motion result contract is malformed."),
      );
    }

    const prescribedRepetitions = target.prescribedTarget.reps;
    if (
      target.prescribedCoachingMode !== "camera" ||
      target.mode !== "camera" ||
      prescribedRepetitions === undefined ||
      aggregateTarget.exerciseId !== target.exerciseId ||
      aggregateTarget.exerciseName !== target.exerciseName ||
      aggregateTarget.targetRepetitions !== prescribedRepetitions ||
      aggregateTarget.source !== "therapist_confirmed"
    ) {
      return failure(
        invalidMotionResult(
          "The motion result target must exactly match this active therapist-confirmed camera set.",
          "aggregate.target",
        ),
      );
    }

    if (
      !isNonNegativeInteger(actual.completedRepetitions) ||
      actual.completedRepetitions > prescribedRepetitions ||
      typeof actual.targetAchieved !== "boolean" ||
      actual.targetAchieved !==
        (actual.completedRepetitions >= prescribedRepetitions) ||
      !isFiniteNonNegative(actual.detectedRepetitionWindowSeconds) ||
      measurements.context !== "camera_2d_demo_proxy" ||
      !isFiniteNonNegative(measurements.averageDetectedKneeRangeDeg) ||
      measurements.averageDetectedKneeRangeDeg > 180 ||
      !isFiniteNonNegative(measurements.detectedRangeDeclineDeg) ||
      measurements.detectedRangeDeclineDeg > 180
    ) {
      return failure(
        invalidMotionResult(
          "The motion result contains invalid or inconsistent aggregate measurements.",
          "aggregate.actual",
        ),
      );
    }

    const allowedQualityEvents = new Set([
      "demo_depth_threshold_not_reached",
      "detected_range_decline",
    ]);
    if (
      qualityEventLabels.some(
        (label) =>
          typeof label !== "string" || !allowedQualityEvents.has(label),
      ) ||
      new Set(qualityEventLabels).size !== qualityEventLabels.length ||
      clinicalBoundary.clinicalAssessment !== false ||
      clinicalBoundary.intendedUse !== "demo_coaching_support_only" ||
      privacyBoundary.patientIdentityIncluded !== false ||
      privacyBoundary.cameraDetailsIncluded !== false ||
      privacyBoundary.rawFramesIncluded !== false ||
      privacyBoundary.rawLandmarksIncluded !== false ||
      privacyBoundary.perRepTimeSeriesIncluded !== false ||
      authorityBoundary.targetIsTherapistConfirmed !== true ||
      authorityBoundary.agentCanStartCamera !== false ||
      authorityBoundary.agentCanStopCamera !== false ||
      authorityBoundary.agentCanControlSet !== false ||
      authorityBoundary.agentCanChangeTarget !== false
    ) {
      return failure(
        invalidMotionResult(
          "The motion result violates its quality, privacy, clinical, or authority boundary.",
        ),
      );
    }

    if (value.outcome === "stopped" && actual.targetAchieved) {
      return failure(
        invalidMotionResult(
          "A stopped motion result cannot claim that the confirmed target was achieved.",
          "aggregate.outcome",
        ),
      );
    }

    return success(
      cloneMotionSetAggregate(value as unknown as MotionSetAggregate),
    );
  } catch {
    return failure(
      invalidMotionResult("The motion result could not be safely inspected."),
    );
  }
}

function cloneMotionAttempt(
  attempt: PatientMotionAttempt,
): PatientMotionAttempt {
  return {
    status: "awaiting_check_in",
    stagedAt: attempt.stagedAt,
    aggregate: cloneMotionSetAggregate(attempt.aggregate),
    stopReason: attempt.stopReason,
  };
}

function cloneExerciseSet(set: PatientExerciseSet): PatientExerciseSet {
  return {
    ...set,
    prescribedTarget: { ...set.prescribedTarget },
    actual: set.actual
      ? {
          ...set.actual,
          motion: set.actual.motion
            ? cloneMotionSetAggregate(set.actual.motion)
            : undefined,
        }
      : undefined,
    motionAttempt: set.motionAttempt
      ? cloneMotionAttempt(set.motionAttempt)
      : undefined,
  };
}

function cloneCoachingFocus(
  focus: PatientCoachingFocus,
): PatientCoachingFocus {
  return {
    id: focus.id,
    status: focus.status,
    source: "agent",
    focusText: focus.focusText,
    evidenceCode: focus.evidenceCode,
    basedOnSetId: focus.basedOnSetId,
    targetSetId: focus.targetSetId,
    stagedAt: focus.stagedAt,
    decidedAt: focus.decidedAt,
  };
}

function setDurationSeconds(
  startedAt: string | undefined,
  completedAt: string,
): DomainResult<number> {
  const startMs = startedAt ? new Date(startedAt).getTime() : Number.NaN;
  const completedMs = new Date(completedAt).getTime();
  if (
    !Number.isFinite(startMs) ||
    !Number.isFinite(completedMs) ||
    completedMs < startMs
  ) {
    return failure(
      error(
        "invalid_session_timing",
        "The camera set timestamps are invalid or out of order.",
        "startedAt",
        false,
      ),
    );
  }
  return success((completedMs - startMs) / 1000);
}

function cloneSession(
  session: PatientSession,
  updates: Partial<PatientSession>,
): PatientSession {
  return {
    ...session,
    ...updates,
    program: { ...session.program },
    sets: (updates.sets ?? session.sets).map(cloneExerciseSet),
    painEvents:
      updates.painEvents ?? session.painEvents.map((event) => ({ ...event })),
    coachingFocuses: (updates.coachingFocuses ?? session.coachingFocuses).map(
      cloneCoachingFocus,
    ),
    safetyGate: updates.safetyGate ?? { ...session.safetyGate },
  };
}

function transitionSession(
  session: PatientSession,
  updates: Partial<PatientSession>,
): PatientSession {
  return cloneSession(session, {
    ...updates,
    transitionRevision: session.transitionRevision + 1,
  });
}

function revisionConflict(
  session: PatientSession,
  expectedTransitionRevision: unknown,
): DomainError | null {
  if (
    typeof expectedTransitionRevision !== "number" ||
    !Number.isInteger(expectedTransitionRevision) ||
    expectedTransitionRevision < 0
  ) {
    return error(
      "invalid_transition_revision",
      "A non-negative expected transition revision is required.",
      "expectedTransitionRevision",
    );
  }
  return expectedTransitionRevision === session.transitionRevision
    ? null
    : error(
        "transition_revision_conflict",
        `The patient session is now at transition revision ${session.transitionRevision}. Read the latest visible state before retrying.`,
        "expectedTransitionRevision",
      );
}

function latestCheckedInCompletedCameraSet(
  session: PatientSession,
): PatientExerciseSet | null {
  const candidates = session.sets.filter(
    (set) =>
      set.status === "completed" &&
      set.mode === "camera" &&
      set.motionAttempt === undefined &&
      set.actual?.motion?.outcome === "completed" &&
      set.actual.motion.target.source === "therapist_confirmed",
  );
  return candidates.sort((left, right) => {
    const byTime = (left.completedAt ?? "").localeCompare(
      right.completedAt ?? "",
    );
    return byTime || left.sequence - right.sequence;
  }).at(-1) ?? null;
}

function evidenceSupportsFocus(
  basedOn: PatientExerciseSet,
  evidenceCode: PatientCoachingEvidenceCode,
): boolean {
  const actual = basedOn.actual;
  const motion = actual?.motion;
  if (!actual || !motion) return false;
  switch (evidenceCode) {
    case "target_completed":
      return motion.actual.targetAchieved;
    case "high_effort":
      return typeof actual.rpe === "number" && actual.rpe >= 7;
    case "range_consistent":
      return !motion.qualityEventLabels.includes("detected_range_decline");
  }
}

export function createPatientSession(
  program: ConfirmedProgram,
  factoryOverrides?: Partial<SessionFactories>,
): DomainResult<PatientSession> {
  if (program.confirmedBy !== "therapist" || !program.code) {
    return failure(
      error(
        "confirmed_program_required",
        "A therapist-confirmed program is required to start a patient session.",
        "program",
        false,
      ),
    );
  }

  const resolvedFactories = factories(factoryOverrides);
  const createdAt = timestamp(resolvedFactories.now);
  const sessionId = makeId(resolvedFactories.id, "session");
  if (!createdAt.ok) return createdAt;
  if (!sessionId.ok) return sessionId;

  const sets: PatientExerciseSet[] = [];
  let sequence = 0;

  for (const [programItemIndex, item] of program.items.entries()) {
    const exercise = getExerciseById(item.exerciseId);
    if (!exercise) {
      return failure(
        error(
          "invalid_exercise_id",
          `Exercise '${item.exerciseId}' is not in the curated catalog.`,
          `program.items.${programItemIndex}.exerciseId`,
        ),
      );
    }
    for (
      let frequencyInstance = 1;
      frequencyInstance <= item.frequencyPerDay;
      frequencyInstance += 1
    ) {
      for (let setNumber = 1; setNumber <= item.sets; setNumber += 1) {
        const setId = makeId(resolvedFactories.id, "set");
        if (!setId.ok) return setId;
        sets.push({
          id: setId.value,
          sequence,
          programItemIndex,
          exerciseId: item.exerciseId,
          exerciseName: exercise.name,
          exerciseNameZh: exercise.nameZh,
          prescribedCoachingMode: exercise.coachingMode,
          prescribedTarget: {
            reps: item.reps,
            holdSeconds: item.holdSeconds,
            restSeconds: item.restSeconds,
            frequencyInstance,
            setNumber,
          },
          status: "planned",
        });
        sequence += 1;
      }
    }
  }

  if (sets.length === 0) {
    return failure(
      error(
        "empty_program",
        "The confirmed program does not contain any exercise sets.",
        "program.items",
      ),
    );
  }

  return success({
    id: sessionId.value,
    program: {
      id: program.id,
      code: program.code,
      revision: program.revision,
      patientLabel: program.patientLabel,
      confirmedAt: program.confirmedAt,
    },
    transitionRevision: 0,
    status: "not_started",
    sets,
    painEvents: [],
    coachingFocuses: [],
    safetyGate: {
      active: false,
      threshold: PAIN_SAFETY_THRESHOLD,
    },
    createdAt: createdAt.value,
  });
}

export function getSessionProgress(
  session: PatientSession,
): PatientSessionProgress {
  const completed = session.sets.filter((set) => set.status === "completed");
  const resolved = session.sets.filter((set) => isResolved(set.status));
  const current = session.sets.find((set) => set.status === "active");
  const next = session.sets.find((set) => set.status === "planned");
  const totalSets = session.sets.length;
  const percentage = (count: number) =>
    totalSets === 0 ? 0 : Math.round((count / totalSets) * 100);

  return {
    totalSets,
    plannedSets: session.sets.filter((set) => set.status === "planned").length,
    activeSets: current ? 1 : 0,
    completedSets: completed.length,
    partialCompletedSets: completed.filter(
      (set) => set.completionKind === "partial",
    ).length,
    skippedSets: session.sets.filter((set) => set.status === "skipped").length,
    stoppedSets: session.sets.filter((set) => set.status === "stopped").length,
    resolvedSets: resolved.length,
    completionPercent: percentage(completed.length),
    resolvedPercent: percentage(resolved.length),
    currentSetId: current?.id,
    nextSetId: next?.id,
    isFinishable:
      totalSets > 0 &&
      resolved.length === totalSets &&
      !current &&
      session.status !== "completed" &&
      session.status !== "stopped",
  };
}

export function startExerciseSet(
  session: PatientSession,
  input: StartExerciseSetInput,
  factoryOverrides?: Partial<SessionFactories>,
): DomainResult<PatientSession> {
  if (session.status === "completed" || session.status === "stopped") {
    return failure(
      error("session_closed", "This session can no longer start a set.", "status"),
    );
  }
  if (session.status === "paused") {
    return failure(
      error("session_paused", "Resume the session before starting a set.", "status"),
    );
  }
  if (session.safetyGate.active) {
    return failure(
      error(
        "pain_safety_gate",
        "The pain safety gate is active. Stop the session and follow therapist instructions.",
        "safetyGate",
      ),
    );
  }
  if (session.sets.some((set) => set.status === "active")) {
    return failure(
      error("set_already_active", "Complete or stop the active set first.", "setId"),
    );
  }

  const target = session.sets.find((set) => set.id === input.setId);
  if (!target || target.status !== "planned") {
    return failure(
      error("set_not_available", "The requested set is not available to start.", "setId"),
    );
  }
  if (
    session.coachingFocuses.some(
      (focus) =>
        focus.status === "pending" && focus.targetSetId === target.id,
    )
  ) {
    return failure(
      error(
        "focus_decision_required",
        "Accept or dismiss the pending coaching focus before starting this set.",
        "setId",
      ),
    );
  }
  if (
    input.mode !== "manual" &&
    input.mode !== "timer" &&
    input.mode !== "camera"
  ) {
    return failure(
      error("invalid_set_mode", "The requested set mode is not supported.", "mode"),
    );
  }
  if (
    input.mode === "camera" &&
    (target.prescribedCoachingMode !== "camera" ||
      target.prescribedTarget.reps === undefined)
  ) {
    return failure(
      error(
        "camera_mode_unavailable",
        "Camera mode is available only for a therapist-confirmed repetition exercise configured for camera coaching.",
        "mode",
      ),
    );
  }

  const now = timestamp(factories(factoryOverrides).now);
  if (!now.ok) return now;

  return success(
    transitionSession(session, {
      status: "active",
      startedAt: session.startedAt ?? now.value,
      pausedAt: undefined,
      sets: session.sets.map((set) =>
        set.id === target.id
          ? { ...set, status: "active", mode: input.mode, startedAt: now.value }
          : { ...set },
      ),
    }),
  );
}

function addPainEvent(
  session: PatientSession,
  value: number,
  recordedAt: string,
  idFactory: SessionFactories["id"],
  options: { note?: string; setId?: string } = {},
): DomainResult<{
  painEvents: readonly PainEvent[];
  safetyGate: PatientSession["safetyGate"];
}> {
  const painId = makeId(idFactory, "pain");
  if (!painId.ok) return painId;
  const event: PainEvent = {
    id: painId.value,
    value,
    note: options.note?.trim() || undefined,
    setId: options.setId,
    recordedAt,
  };
  const gateActive = value >= PAIN_SAFETY_THRESHOLD;
  return success({
    painEvents: [...session.painEvents.map((item) => ({ ...item })), event],
    safetyGate: gateActive
      ? {
          active: true,
          threshold: PAIN_SAFETY_THRESHOLD,
          triggeredByPain: value,
          triggeredAt: recordedAt,
          painEventId: event.id,
        }
      : { ...session.safetyGate },
  });
}

export function completeExerciseSet(
  session: PatientSession,
  input: CompleteExerciseSetInput,
  factoryOverrides?: Partial<SessionFactories>,
): DomainResult<PatientSession> {
  if (session.status === "completed" || session.status === "stopped") {
    return failure(error("session_closed", "This session is already closed.", "status"));
  }
  const target = session.sets.find((set) => set.id === input.setId);
  if (!target || target.status !== "active") {
    return failure(
      error("set_not_active", "Only the active set can be completed.", "setId"),
    );
  }
  if (target.mode === "camera") {
    return failure(
      error(
        "camera_check_in_required",
        "A camera set must stage its terminal aggregate and complete the explicit RPE and pain check-in.",
        "setId",
      ),
    );
  }
  if (!Number.isFinite(input.durationSeconds) || input.durationSeconds < 0) {
    return failure(
      error(
        "invalid_duration",
        "Set duration must be zero or greater.",
        "durationSeconds",
      ),
    );
  }
  if (
    input.completedReps !== undefined &&
    (!Number.isInteger(input.completedReps) || input.completedReps < 0)
  ) {
    return failure(
      error("invalid_completion", "Completed reps must be a non-negative whole number.", "completedReps"),
    );
  }
  if (
    input.completedHoldSeconds !== undefined &&
    (!Number.isFinite(input.completedHoldSeconds) || input.completedHoldSeconds < 0)
  ) {
    return failure(
      error("invalid_completion", "Completed hold seconds must be non-negative.", "completedHoldSeconds"),
    );
  }
  const rpeError = validateScore(input.rpe, "rpe");
  const painError = validateScore(input.pain, "pain");
  if (rpeError || painError) return failure(...[rpeError, painError].filter(Boolean) as DomainError[]);

  const resolvedFactories = factories(factoryOverrides);
  const now = timestamp(resolvedFactories.now);
  if (!now.ok) return now;

  const actual = {
    completedReps: input.completedReps,
    completedHoldSeconds: input.completedHoldSeconds,
    durationSeconds: input.durationSeconds,
    rpe: input.rpe,
    pain: input.pain,
  };
  const full =
    target.prescribedTarget.reps !== undefined
      ? (input.completedReps ?? 0) >= target.prescribedTarget.reps
      : (input.completedHoldSeconds ?? 0) >=
        (target.prescribedTarget.holdSeconds ?? 0);

  let painEvents = session.painEvents.map((event) => ({ ...event }));
  let safetyGate = { ...session.safetyGate };
  if (input.pain !== undefined) {
    const painResult = addPainEvent(
      session,
      input.pain,
      now.value,
      resolvedFactories.id,
      { setId: target.id },
    );
    if (!painResult.ok) return painResult;
    painEvents = [...painResult.value.painEvents];
    safetyGate = { ...painResult.value.safetyGate };
  }

  return success(
    transitionSession(session, {
      status: safetyGate.active ? "paused" : "active",
      pausedAt: safetyGate.active ? now.value : undefined,
      sets: session.sets.map((set) =>
        set.id === target.id
          ? {
              ...set,
              status: "completed",
              completedAt: now.value,
              completionKind: full ? "full" : "partial",
              actual,
            }
          : { ...set },
      ),
      painEvents,
      safetyGate,
    }),
  );
}

export function stageMotionSetResult(
  session: PatientSession,
  input: StageMotionSetResultInput,
  factoryOverrides?: Partial<SessionFactories>,
): DomainResult<PatientSession> {
  if (session.status === "completed" || session.status === "stopped") {
    return failure(
      error("session_closed", "This session is already closed.", "status"),
    );
  }
  if (session.status !== "active" || session.safetyGate.active) {
    return failure(
      error(
        session.safetyGate.active ? "pain_safety_gate" : "session_not_active",
        session.safetyGate.active
          ? "The pain safety gate is active. A camera result cannot be staged."
          : "The session must be active before a camera result can be staged.",
        session.safetyGate.active ? "safetyGate" : "status",
      ),
    );
  }

  const target = session.sets.find((set) => set.id === input.setId);
  if (!target || target.status !== "active" || target.mode !== "camera") {
    return failure(
      error(
        "camera_set_not_active",
        "Only the active camera set can stage a motion result.",
        "setId",
      ),
    );
  }
  if (target.motionAttempt) {
    return failure(
      error(
        "motion_result_already_staged",
        "This camera set is already awaiting RPE and pain check-in.",
        "setId",
      ),
    );
  }

  const validatedAggregate = validateAndCloneMotionSetAggregate(
    input.aggregate,
    target,
  );
  if (!validatedAggregate.ok) return validatedAggregate;

  const stopReason = input.stopReason?.trim();
  if (
    validatedAggregate.value.outcome === "stopped" &&
    (!stopReason || stopReason.length > 240)
  ) {
    return failure(
      error(
        "stop_reason_required",
        "A visible stop reason of 240 characters or fewer is required for a stopped camera set.",
        "stopReason",
      ),
    );
  }
  if (
    validatedAggregate.value.outcome === "completed" &&
    stopReason
  ) {
    return failure(
      error(
        "unexpected_stop_reason",
        "A completed camera result cannot include a stop reason.",
        "stopReason",
      ),
    );
  }

  const stagedAt = timestamp(factories(factoryOverrides).now);
  if (!stagedAt.ok) return stagedAt;
  const stagedDuration = setDurationSeconds(target.startedAt, stagedAt.value);
  if (!stagedDuration.ok) return stagedDuration;
  const attempt: PatientMotionAttempt = {
    status: "awaiting_check_in",
    stagedAt: stagedAt.value,
    aggregate: validatedAggregate.value,
    stopReason:
      validatedAggregate.value.outcome === "stopped" ? stopReason : undefined,
  };

  return success(
    transitionSession(session, {
      sets: session.sets.map((set) =>
        set.id === target.id
          ? { ...cloneExerciseSet(set), motionAttempt: attempt }
          : cloneExerciseSet(set),
      ),
    }),
  );
}

export function switchActiveCameraSetToManualFallback(
  session: PatientSession,
  input: SwitchActiveCameraSetToManualFallbackInput,
): DomainResult<PatientSession> {
  if (session.safetyGate.active) {
    return failure(
      error(
        "pain_safety_gate",
        "The pain safety gate is active. Camera fallback cannot continue the set.",
        "safetyGate",
      ),
    );
  }
  if (session.status !== "active") {
    return failure(
      error(
        "session_not_active",
        "Only an active session can switch a camera set to manual fallback.",
        "status",
      ),
    );
  }

  const target = session.sets.find((set) => set.id === input.setId);
  if (!target || target.status !== "active" || target.mode !== "camera") {
    return failure(
      error(
        "camera_set_not_active",
        "Only the active camera set can switch to manual fallback.",
        "setId",
      ),
    );
  }
  if (target.motionAttempt) {
    return failure(
      error(
        "motion_result_already_staged",
        "A staged camera result must be checked in or stopped; it cannot switch to manual fallback.",
        "setId",
      ),
    );
  }

  return success(
    transitionSession(session, {
      sets: session.sets.map((set) =>
        set.id === target.id
          ? { ...cloneExerciseSet(set), mode: "manual" }
          : cloneExerciseSet(set),
      ),
    }),
  );
}

export function completeMotionSetCheckIn(
  session: PatientSession,
  input: CompleteMotionSetCheckInInput,
  factoryOverrides?: Partial<SessionFactories>,
): DomainResult<PatientSession> {
  if (session.status === "completed" || session.status === "stopped") {
    return failure(
      error("session_closed", "This session is already closed.", "status"),
    );
  }
  if (session.safetyGate.active) {
    return failure(
      error(
        "pain_safety_gate",
        "The pain safety gate is active. The staged camera result cannot override it.",
        "safetyGate",
      ),
    );
  }
  if (session.status !== "active") {
    return failure(
      error(
        "session_not_active",
        "Resume the session before completing the camera check-in.",
        "status",
      ),
    );
  }

  const target = session.sets.find((set) => set.id === input.setId);
  if (
    !target ||
    target.status !== "active" ||
    target.mode !== "camera" ||
    target.motionAttempt?.status !== "awaiting_check_in"
  ) {
    return failure(
      error(
        "motion_check_in_unavailable",
        "This active camera set does not have a staged result awaiting check-in.",
        "setId",
      ),
    );
  }

  const rpeError = validateRequiredScore(input.rpe, "rpe");
  const painError = validateRequiredScore(input.pain, "pain");
  if (rpeError || painError) {
    return failure(
      ...([rpeError, painError].filter(Boolean) as DomainError[]),
    );
  }

  const aggregateResult = validateAndCloneMotionSetAggregate(
    target.motionAttempt.aggregate,
    target,
  );
  if (!aggregateResult.ok) return aggregateResult;
  const aggregate = aggregateResult.value;
  if (aggregate.outcome === "stopped" && !target.motionAttempt.stopReason) {
    return failure(
      error(
        "stop_reason_required",
        "The staged stopped camera result has no visible stop reason.",
        "motionAttempt.stopReason",
      ),
    );
  }

  const resolvedFactories = factories(factoryOverrides);
  const completedAt = timestamp(resolvedFactories.now);
  if (!completedAt.ok) return completedAt;
  const duration = setDurationSeconds(
    target.startedAt,
    target.motionAttempt.stagedAt,
  );
  if (!duration.ok) return duration;
  const checkInOrder = setDurationSeconds(
    target.motionAttempt.stagedAt,
    completedAt.value,
  );
  if (!checkInOrder.ok) return checkInOrder;

  const painResult = addPainEvent(
    session,
    input.pain,
    completedAt.value,
    resolvedFactories.id,
    {
      note: "Patient-reported during camera set check-in.",
      setId: target.id,
    },
  );
  if (!painResult.ok) return painResult;

  const actual = {
    completedReps: aggregate.actual.completedRepetitions,
    durationSeconds: duration.value,
    rpe: input.rpe,
    pain: input.pain,
    motion: aggregate,
  };
  const safetyGate = { ...painResult.value.safetyGate };

  return success(
    transitionSession(session, {
      status: safetyGate.active ? "paused" : "active",
      pausedAt: safetyGate.active ? completedAt.value : undefined,
      sets: session.sets.map((set) => {
        if (set.id !== target.id) return cloneExerciseSet(set);
        if (aggregate.outcome === "stopped") {
          return {
            ...cloneExerciseSet(set),
            status: "stopped",
            stoppedAt: completedAt.value,
            stopReason: target.motionAttempt?.stopReason,
            completionKind: undefined,
            actual,
            motionAttempt: undefined,
          };
        }
        return {
          ...cloneExerciseSet(set),
          status: "completed",
          completedAt: completedAt.value,
          completionKind: aggregate.actual.targetAchieved ? "full" : "partial",
          actual,
          motionAttempt: undefined,
        };
      }),
      painEvents: painResult.value.painEvents,
      safetyGate,
    }),
  );
}

export function stageNextSetFocus(
  session: PatientSession,
  input: StageNextSetFocusInput,
  factoryOverrides?: Partial<SessionFactories>,
): DomainResult<PatientSession> {
  const conflict = revisionConflict(
    session,
    input.expectedTransitionRevision,
  );
  if (conflict) return failure(conflict);
  if (session.safetyGate.active) {
    return failure(
      error(
        "pain_safety_gate",
        "The pain safety gate is active. No next-set focus can be staged.",
        "safetyGate",
      ),
    );
  }
  if (session.status !== "active") {
    return failure(
      error(
        "session_not_active",
        "A next-set focus can be staged only while the session is active between sets.",
        "status",
      ),
    );
  }
  if (session.sets.some((set) => set.status === "active")) {
    return failure(
      error(
        "set_still_active",
        "Finish the active set and its check-in before staging a next-set focus.",
        "sets",
      ),
    );
  }
  if (session.coachingFocuses.some((focus) => focus.status === "pending")) {
    return failure(
      error(
        "focus_decision_required",
        "The existing pending coaching focus must be accepted or dismissed first.",
        "coachingFocuses",
      ),
    );
  }

  const basedOn = latestCheckedInCompletedCameraSet(session);
  if (!basedOn) {
    return failure(
      error(
        "completed_camera_result_required",
        "A persisted, checked-in completed camera set is required before staging a focus.",
        "sets",
      ),
    );
  }
  const target = session.sets.find((set) => set.status === "planned");
  if (
    !target ||
    target.sequence <= basedOn.sequence ||
    target.exerciseId !== basedOn.exerciseId
  ) {
    return failure(
      error(
        "same_exercise_next_set_required",
        "The next planned set must be another set of the same exercise.",
        "sets",
      ),
    );
  }
  if (
    session.coachingFocuses.some(
      (focus) =>
        focus.basedOnSetId === basedOn.id && focus.targetSetId === target.id,
    )
  ) {
    return failure(
      error(
        "focus_already_staged",
        "A coaching focus has already been recorded for this result and target set.",
        "coachingFocuses",
      ),
    );
  }

  const focusText =
    typeof input.focusText === "string" ? input.focusText.trim() : "";
  if (
    !focusText ||
    focusText.length > MAX_COACHING_FOCUS_TEXT_LENGTH
  ) {
    return failure(
      error(
        "invalid_focus_text",
        `Focus text must be between 1 and ${MAX_COACHING_FOCUS_TEXT_LENGTH} characters.`,
        "focusText",
      ),
    );
  }
  if (
    input.evidenceCode !== "target_completed" &&
    input.evidenceCode !== "high_effort" &&
    input.evidenceCode !== "range_consistent"
  ) {
    return failure(
      error(
        "invalid_evidence_code",
        "The coaching focus must use an allowlisted non-clinical evidence code.",
        "evidenceCode",
      ),
    );
  }
  if (!evidenceSupportsFocus(basedOn, input.evidenceCode)) {
    return failure(
      error(
        "unsupported_focus_evidence",
        "The latest checked-in camera result does not support that coaching evidence.",
        "evidenceCode",
      ),
    );
  }

  const resolvedFactories = factories(factoryOverrides);
  const stagedAt = timestamp(resolvedFactories.now);
  if (!stagedAt.ok) return stagedAt;
  const focusId = makeFocusId(resolvedFactories.id);
  if (!focusId.ok) return focusId;
  const focus: PatientCoachingFocus = {
    id: focusId.value,
    status: "pending",
    source: "agent",
    focusText,
    evidenceCode: input.evidenceCode,
    basedOnSetId: basedOn.id,
    targetSetId: target.id,
    stagedAt: stagedAt.value,
  };

  return success(
    transitionSession(session, {
      coachingFocuses: [
        ...session.coachingFocuses.map(cloneCoachingFocus),
        focus,
      ],
    }),
  );
}

function decideNextSetFocus(
  session: PatientSession,
  input: DecideNextSetFocusInput,
  decision: "accepted" | "dismissed",
  factoryOverrides?: Partial<SessionFactories>,
): DomainResult<PatientSession> {
  const conflict = revisionConflict(
    session,
    input.expectedTransitionRevision,
  );
  if (conflict) return failure(conflict);
  if (session.status === "completed" || session.status === "stopped") {
    return failure(
      error(
        "session_closed",
        "This session can no longer decide a coaching focus.",
        "status",
      ),
    );
  }
  if (typeof input.focusId !== "string" || !input.focusId.trim()) {
    return failure(
      error(
        "focus_id_required",
        "A pending coaching focus ID is required.",
        "focusId",
      ),
    );
  }
  const pending = session.coachingFocuses.find(
    (focus) => focus.id === input.focusId && focus.status === "pending",
  );
  if (!pending) {
    return failure(
      error(
        "pending_focus_not_found",
        "The requested pending coaching focus is unavailable or already decided.",
        "focusId",
      ),
    );
  }

  if (decision === "accepted") {
    if (session.status !== "active" || session.safetyGate.active) {
      return failure(
        error(
          session.safetyGate.active ? "pain_safety_gate" : "session_not_active",
          session.safetyGate.active
            ? "The pain safety gate is active. A next-set focus cannot be accepted."
            : "The session must be active before accepting a next-set focus.",
          session.safetyGate.active ? "safetyGate" : "status",
        ),
      );
    }
    const target = session.sets.find((set) => set.id === pending.targetSetId);
    if (!target || target.status !== "planned") {
      return failure(
        error(
          "focus_target_unavailable",
          "The coaching focus target set is no longer planned.",
          "focusId",
        ),
      );
    }
  }

  const decidedAt = timestamp(factories(factoryOverrides).now);
  if (!decidedAt.ok) return decidedAt;
  return success(
    transitionSession(session, {
      coachingFocuses: session.coachingFocuses.map((focus) =>
        focus.id === pending.id
          ? {
              ...cloneCoachingFocus(focus),
              status: decision,
              decidedAt: decidedAt.value,
            }
          : cloneCoachingFocus(focus),
      ),
    }),
  );
}

/** Human UI only: accepts a pending suggestion without changing dosage. */
export function acceptNextSetFocus(
  session: PatientSession,
  input: DecideNextSetFocusInput,
  factoryOverrides?: Partial<SessionFactories>,
): DomainResult<PatientSession> {
  return decideNextSetFocus(session, input, "accepted", factoryOverrides);
}

/** Human UI only: dismisses a pending suggestion without changing dosage. */
export function dismissNextSetFocus(
  session: PatientSession,
  input: DecideNextSetFocusInput,
  factoryOverrides?: Partial<SessionFactories>,
): DomainResult<PatientSession> {
  return decideNextSetFocus(session, input, "dismissed", factoryOverrides);
}

export function pauseSession(
  session: PatientSession,
  factoryOverrides?: Partial<SessionFactories>,
): DomainResult<PatientSession> {
  if (session.status !== "active") {
    return failure(error("invalid_transition", "Only an active session can be paused.", "status"));
  }
  const now = timestamp(factories(factoryOverrides).now);
  if (!now.ok) return now;
  return success(
    transitionSession(session, { status: "paused", pausedAt: now.value }),
  );
}

export function resumeSession(
  session: PatientSession,
): DomainResult<PatientSession> {
  if (session.status !== "paused") {
    return failure(error("invalid_transition", "Only a paused session can be resumed.", "status"));
  }
  if (session.safetyGate.active) {
    return failure(
      error(
        "pain_safety_gate",
        "The pain safety gate is active. This session cannot be resumed.",
        "safetyGate",
      ),
    );
  }
  return success(
    transitionSession(session, { status: "active", pausedAt: undefined }),
  );
}

export function skipExercise(
  session: PatientSession,
  input: SkipExerciseInput,
  factoryOverrides?: Partial<SessionFactories>,
): DomainResult<PatientSession> {
  if (session.status === "completed" || session.status === "stopped") {
    return failure(error("session_closed", "This session is already closed.", "status"));
  }
  if (!input.reason.trim()) {
    return failure(error("reason_required", "A visible skip reason is required.", "reason"));
  }
  if (
    session.sets.some(
      (set) => set.exerciseId === input.exerciseId && set.status === "active",
    )
  ) {
    return failure(
      error("set_active", "Stop the active set before skipping this exercise.", "exerciseId"),
    );
  }
  const planned = session.sets.filter(
    (set) => set.exerciseId === input.exerciseId && set.status === "planned",
  );
  if (planned.length === 0) {
    return failure(
      error("nothing_to_skip", "No planned sets remain for this exercise.", "exerciseId"),
    );
  }
  const now = timestamp(factories(factoryOverrides).now);
  if (!now.ok) return now;
  return success(
    transitionSession(session, {
      sets: session.sets.map((set) =>
        set.exerciseId === input.exerciseId && set.status === "planned"
          ? {
              ...set,
              status: "skipped",
              skippedAt: now.value,
              skipReason: input.reason.trim(),
            }
          : { ...set },
      ),
    }),
  );
}

export function logPain(
  session: PatientSession,
  input: LogPainInput,
  factoryOverrides?: Partial<SessionFactories>,
): DomainResult<PatientSession> {
  if (session.status === "completed" || session.status === "stopped") {
    return failure(error("session_closed", "This session is already closed.", "status"));
  }
  const painError = validateScore(input.pain, "pain");
  if (painError) return failure(painError);
  const resolvedFactories = factories(factoryOverrides);
  const now = timestamp(resolvedFactories.now);
  if (!now.ok) return now;
  const active = session.sets.find((set) => set.status === "active");
  const painResult = addPainEvent(
    session,
    input.pain,
    now.value,
    resolvedFactories.id,
    { note: input.note, setId: active?.id },
  );
  if (!painResult.ok) return painResult;
  const gateActive = painResult.value.safetyGate.active;
  return success(
    transitionSession(session, {
      status: gateActive ? "paused" : session.status,
      pausedAt: gateActive ? now.value : session.pausedAt,
      sets: gateActive
        ? session.sets.map((set) =>
            set.status === "active"
              ? {
                  ...set,
                  status: "stopped",
                  stoppedAt: now.value,
                  stopReason: "Pain safety gate activated.",
                  // Safety wins over a pending camera completion. Without the
                  // explicit RPE check-in, no motion actual is committed.
                  motionAttempt: undefined,
                }
              : { ...set },
          )
        : session.sets.map((set) => ({ ...set })),
      painEvents: painResult.value.painEvents,
      safetyGate: painResult.value.safetyGate,
    }),
  );
}

export function stopSession(
  session: PatientSession,
  input: StopSessionInput,
  factoryOverrides?: Partial<SessionFactories>,
): DomainResult<PatientSession> {
  if (session.status === "completed" || session.status === "stopped") {
    return failure(error("session_closed", "This session is already closed.", "status"));
  }
  if (!input.reason.trim()) {
    return failure(error("reason_required", "A visible stop reason is required.", "reason"));
  }
  const now = timestamp(factories(factoryOverrides).now);
  if (!now.ok) return now;
  return success(
    transitionSession(session, {
      status: "stopped",
      stoppedAt: now.value,
      stopReason: input.reason.trim(),
      sets: session.sets.map((set) =>
        set.status === "active"
          ? {
              ...set,
              status: "stopped",
              stoppedAt: now.value,
              stopReason: input.reason.trim(),
              actual: input.actual,
              // A global Stop cannot silently consume a pending camera result
              // that still requires explicit RPE and pain check-in.
              motionAttempt: undefined,
            }
          : { ...set },
      ),
    }),
  );
}

function makeSummary(
  session: PatientSession,
  completedAt: string,
): PatientSessionSummary {
  const progress = getSessionProgress(session);
  const completed = session.sets.filter((set) => set.status === "completed");
  const rpes = completed
    .map((set) => set.actual?.rpe)
    .filter((value): value is number => value !== undefined);
  const pains = session.painEvents.map((event) => event.value);
  return {
    totalSets: progress.totalSets,
    completedSets: progress.completedSets,
    partialCompletedSets: progress.partialCompletedSets,
    skippedSets: progress.skippedSets,
    stoppedSets: progress.stoppedSets,
    completedReps: completed.reduce(
      (sum, set) => sum + (set.actual?.completedReps ?? 0),
      0,
    ),
    completedHoldSeconds: completed.reduce(
      (sum, set) => sum + (set.actual?.completedHoldSeconds ?? 0),
      0,
    ),
    averageRpe:
      rpes.length > 0
        ? Math.round((rpes.reduce((sum, value) => sum + value, 0) / rpes.length) * 10) /
          10
        : undefined,
    highestPain: pains.length > 0 ? Math.max(...pains) : undefined,
    startedAt: session.startedAt,
    completedAt,
  };
}

export function finishSession(
  session: PatientSession,
  factoryOverrides?: Partial<SessionFactories>,
): DomainResult<PatientSession> {
  const progress = getSessionProgress(session);
  if (!progress.isFinishable) {
    return failure(
      error(
        "session_not_finishable",
        "Resolve every planned set before finishing the session.",
        "sets",
      ),
    );
  }
  const now = timestamp(factories(factoryOverrides).now);
  if (!now.ok) return now;
  const completedForSummary = cloneSession(session, {
    status: "completed",
    completedAt: now.value,
  });
  return success(
    transitionSession(session, {
      status: "completed",
      completedAt: now.value,
      summary: makeSummary(completedForSummary, now.value),
    }),
  );
}
