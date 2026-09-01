import type { PatientSession } from "../domain/session-types.ts";

const V1_SESSION_KEY_PREFIX = "coachpoint:patient-session:v1:";
const V2_SESSION_KEY_PREFIX = "coachpoint:patient-session:v2:";
const V2_ENVELOPE_VERSION = 2;

const MAX_PROGRAM_CODE_LENGTH = 512;
const MAX_ID_LENGTH = 512;
const MAX_TEXT_LENGTH = 20_000;
const MAX_SETS = 2_000;
const MAX_PAIN_EVENTS = 5_000;

interface PatientSessionEnvelopeV2 {
  readonly version: 2;
  readonly programCode: string;
  readonly session: PatientSession;
}

type PlainRecord = Record<string, unknown>;

function v1SessionKey(programCode: string): string {
  return `${V1_SESSION_KEY_PREFIX}${programCode}`;
}

function v2SessionKey(programCode: string): string {
  return `${V2_SESSION_KEY_PREFIX}${programCode}`;
}

function validProgramCode(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= MAX_PROGRAM_CODE_LENGTH
  );
}

function isPlainRecord(value: unknown): value is PlainRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasOnlyDataProperties(
  value: PlainRecord,
  required: readonly string[],
  optional: readonly string[] = [],
): boolean {
  const allowed = new Set([...required, ...optional]);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(descriptors);

  if (
    keys.some((key) =>
      typeof key !== "string" ||
      !allowed.has(key) ||
      key === "__proto__" ||
      key === "prototype" ||
      key === "constructor"
    )
  ) {
    return false;
  }

  for (const key of required) {
    if (!Object.hasOwn(descriptors, key)) return false;
  }

  return Object.values(descriptors).every(
    (descriptor) =>
      "value" in descriptor &&
      descriptor.enumerable === true &&
      descriptor.get === undefined &&
      descriptor.set === undefined,
  );
}

function isString(
  value: unknown,
  options: { nonEmpty?: boolean; maximumLength?: number } = {},
): value is string {
  if (typeof value !== "string") return false;
  if (options.nonEmpty && value.length === 0) return false;
  return value.length <= (options.maximumLength ?? MAX_TEXT_LENGTH);
}

function isOptionalString(value: unknown): boolean {
  return value === undefined || isString(value);
}

function isTimestamp(value: unknown): value is string {
  if (!isString(value, { nonEmpty: true, maximumLength: 64 })) return false;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value;
}

function isOptionalTimestamp(value: unknown): boolean {
  return value === undefined || isTimestamp(value);
}

function isFiniteNumber(value: unknown, minimum = 0): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= minimum;
}

function isInteger(value: unknown, minimum = 0): value is number {
  return Number.isInteger(value) && (value as number) >= minimum;
}

function isOptionalFiniteNumber(
  value: unknown,
  minimum = 0,
  maximum = Number.POSITIVE_INFINITY,
): boolean {
  return (
    value === undefined ||
    (isFiniteNumber(value, minimum) && value <= maximum)
  );
}

function isOptionalInteger(value: unknown, minimum = 0): boolean {
  return value === undefined || isInteger(value, minimum);
}

function isOneOf<T extends string>(
  value: unknown,
  values: readonly T[],
): value is T {
  return typeof value === "string" && values.includes(value as T);
}

function validateProgramSnapshot(value: unknown): boolean {
  if (!isPlainRecord(value)) return false;
  if (
    !hasOnlyDataProperties(value, [
      "id",
      "code",
      "revision",
      "patientLabel",
      "confirmedAt",
    ])
  ) {
    return false;
  }
  return (
    isString(value.id, { nonEmpty: true, maximumLength: MAX_ID_LENGTH }) &&
    validProgramCode(value.code) &&
    isInteger(value.revision, 0) &&
    isString(value.patientLabel, {
      nonEmpty: true,
      maximumLength: MAX_TEXT_LENGTH,
    }) &&
    isTimestamp(value.confirmedAt)
  );
}

function validatePrescribedTarget(value: unknown): boolean {
  if (!isPlainRecord(value)) return false;
  if (
    !hasOnlyDataProperties(
      value,
      ["restSeconds", "frequencyInstance", "setNumber"],
      ["reps", "holdSeconds"],
    )
  ) {
    return false;
  }
  const hasReps = value.reps !== undefined;
  const hasHold = value.holdSeconds !== undefined;
  return (
    hasReps !== hasHold &&
    isOptionalInteger(value.reps, 1) &&
    isOptionalFiniteNumber(value.holdSeconds, 0) &&
    isInteger(value.restSeconds, 0) &&
    isInteger(value.frequencyInstance, 1) &&
    isInteger(value.setNumber, 1)
  );
}

function validateMotionAggregate(
  value: unknown,
  expectedSet: PlainRecord,
): boolean {
  if (!isPlainRecord(value)) return false;
  if (
    !hasOnlyDataProperties(value, [
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
    ]) ||
    value.schemaVersion !== 1 ||
    value.kind !== "motion_set_aggregate"
  ) {
    return false;
  }

  const target = value.target;
  const actual = value.actual;
  const measurements = value.measurements;
  const clinical = value.clinicalBoundary;
  const privacy = value.privacyBoundary;
  const authority = value.authorityBoundary;
  if (
    !isPlainRecord(target) ||
    !hasOnlyDataProperties(target, [
      "exerciseId",
      "exerciseName",
      "targetRepetitions",
      "source",
    ]) ||
    !isString(target.exerciseId, {
      nonEmpty: true,
      maximumLength: MAX_ID_LENGTH,
    }) ||
    !isString(target.exerciseName, {
      nonEmpty: true,
      maximumLength: MAX_TEXT_LENGTH,
    }) ||
    !isInteger(target.targetRepetitions, 1) ||
    !isOneOf(target.source, ["isolated_demo", "therapist_confirmed"] as const) ||
    !isOneOf(value.outcome, ["completed", "stopped"] as const) ||
    !isPlainRecord(actual) ||
    !hasOnlyDataProperties(actual, [
      "completedRepetitions",
      "targetAchieved",
      "detectedRepetitionWindowSeconds",
    ]) ||
    !isInteger(actual.completedRepetitions, 0) ||
    typeof actual.targetAchieved !== "boolean" ||
    !isFiniteNumber(actual.detectedRepetitionWindowSeconds, 0) ||
    !isPlainRecord(measurements) ||
    !hasOnlyDataProperties(measurements, [
      "context",
      "averageDetectedKneeRangeDeg",
      "detectedRangeDeclineDeg",
    ]) ||
    measurements.context !== "camera_2d_demo_proxy" ||
    !isFiniteNumber(measurements.averageDetectedKneeRangeDeg, 0) ||
    measurements.averageDetectedKneeRangeDeg > 180 ||
    !isFiniteNumber(measurements.detectedRangeDeclineDeg, 0) ||
    measurements.detectedRangeDeclineDeg > 180 ||
    !Array.isArray(value.qualityEventLabels) ||
    value.qualityEventLabels.length > 2 ||
    !value.qualityEventLabels.every((label) =>
      isOneOf(label, [
        "demo_depth_threshold_not_reached",
        "detected_range_decline",
      ] as const)
    ) ||
    new Set(value.qualityEventLabels).size !== value.qualityEventLabels.length ||
    !isPlainRecord(clinical) ||
    !hasOnlyDataProperties(clinical, ["clinicalAssessment", "intendedUse"]) ||
    clinical.clinicalAssessment !== false ||
    clinical.intendedUse !== "demo_coaching_support_only" ||
    !isPlainRecord(privacy) ||
    !hasOnlyDataProperties(privacy, [
      "patientIdentityIncluded",
      "cameraDetailsIncluded",
      "rawFramesIncluded",
      "rawLandmarksIncluded",
      "perRepTimeSeriesIncluded",
    ]) ||
    privacy.patientIdentityIncluded !== false ||
    privacy.cameraDetailsIncluded !== false ||
    privacy.rawFramesIncluded !== false ||
    privacy.rawLandmarksIncluded !== false ||
    privacy.perRepTimeSeriesIncluded !== false ||
    !isPlainRecord(authority) ||
    !hasOnlyDataProperties(authority, [
      "targetIsTherapistConfirmed",
      "agentCanStartCamera",
      "agentCanStopCamera",
      "agentCanControlSet",
      "agentCanChangeTarget",
    ]) ||
    typeof authority.targetIsTherapistConfirmed !== "boolean" ||
    authority.agentCanStartCamera !== false ||
    authority.agentCanStopCamera !== false ||
    authority.agentCanControlSet !== false ||
    authority.agentCanChangeTarget !== false
  ) {
    return false;
  }

  const prescribedTarget = expectedSet.prescribedTarget;
  if (!isPlainRecord(prescribedTarget)) return false;
  const prescribedRepetitions = prescribedTarget.reps;
  return (
    expectedSet.prescribedCoachingMode === "camera" &&
    expectedSet.mode === "camera" &&
    isInteger(prescribedRepetitions, 1) &&
    target.exerciseId === expectedSet.exerciseId &&
    target.exerciseName === expectedSet.exerciseName &&
    target.targetRepetitions === prescribedRepetitions &&
    target.source === "therapist_confirmed" &&
    actual.completedRepetitions <= prescribedRepetitions &&
    actual.targetAchieved ===
      (actual.completedRepetitions >= prescribedRepetitions) &&
    !(value.outcome === "stopped" && actual.targetAchieved) &&
    authority.targetIsTherapistConfirmed === true
  );
}

function validateMotionAttempt(
  value: unknown,
  expectedSet: PlainRecord,
): boolean {
  if (!isPlainRecord(value)) return false;
  if (
    !hasOnlyDataProperties(
      value,
      ["status", "stagedAt", "aggregate"],
      ["stopReason"],
    ) ||
    value.status !== "awaiting_check_in" ||
    !isTimestamp(value.stagedAt) ||
    !isOptionalString(value.stopReason)
  ) {
    return false;
  }
  if (!validateMotionAggregate(value.aggregate, expectedSet)) return false;
  const aggregate = value.aggregate as PlainRecord;
  return aggregate.outcome === "stopped"
    ? isString(value.stopReason, { nonEmpty: true, maximumLength: 240 })
    : value.stopReason === undefined;
}

function validateSetActual(value: unknown, expectedSet: PlainRecord): boolean {
  if (!isPlainRecord(value)) return false;
  if (
    !hasOnlyDataProperties(
      value,
      ["durationSeconds"],
      ["completedReps", "completedHoldSeconds", "rpe", "pain", "motion"],
    )
  ) {
    return false;
  }
  return (
    isOptionalInteger(value.completedReps, 0) &&
    isOptionalFiniteNumber(value.completedHoldSeconds, 0) &&
    isFiniteNumber(value.durationSeconds, 0) &&
    isOptionalFiniteNumber(value.rpe, 0, 10) &&
    isOptionalFiniteNumber(value.pain, 0, 10) &&
    (value.motion === undefined ||
      validateMotionAggregate(value.motion, expectedSet))
  );
}

function validateExerciseSet(value: unknown): boolean {
  if (!isPlainRecord(value)) return false;
  if (
    !hasOnlyDataProperties(
      value,
      [
        "id",
        "sequence",
        "programItemIndex",
        "exerciseId",
        "exerciseName",
        "exerciseNameZh",
        "prescribedCoachingMode",
        "prescribedTarget",
        "status",
      ],
      [
        "mode",
        "startedAt",
        "completedAt",
        "stoppedAt",
        "skippedAt",
        "completionKind",
        "actual",
        "stopReason",
        "skipReason",
        "motionAttempt",
      ],
    )
  ) {
    return false;
  }
  const baseValid = (
    isString(value.id, { nonEmpty: true, maximumLength: MAX_ID_LENGTH }) &&
    isInteger(value.sequence, 0) &&
    isInteger(value.programItemIndex, 0) &&
    isString(value.exerciseId, {
      nonEmpty: true,
      maximumLength: MAX_ID_LENGTH,
    }) &&
    isString(value.exerciseName, {
      nonEmpty: true,
      maximumLength: MAX_TEXT_LENGTH,
    }) &&
    isString(value.exerciseNameZh, { maximumLength: MAX_TEXT_LENGTH }) &&
    isOneOf(value.prescribedCoachingMode, ["camera", "timer"] as const) &&
    validatePrescribedTarget(value.prescribedTarget) &&
    isOneOf(
      value.status,
      ["planned", "active", "completed", "skipped", "stopped"] as const,
    ) &&
    (value.mode === undefined ||
      isOneOf(value.mode, ["timer", "manual", "camera"] as const)) &&
    isOptionalTimestamp(value.startedAt) &&
    isOptionalTimestamp(value.completedAt) &&
    isOptionalTimestamp(value.stoppedAt) &&
    isOptionalTimestamp(value.skippedAt) &&
    (value.completionKind === undefined ||
      isOneOf(value.completionKind, ["full", "partial"] as const)) &&
    (value.actual === undefined || validateSetActual(value.actual, value)) &&
    isOptionalString(value.stopReason) &&
    isOptionalString(value.skipReason) &&
    (value.motionAttempt === undefined ||
      validateMotionAttempt(value.motionAttempt, value))
  );
  if (!baseValid) return false;

  if (value.motionAttempt !== undefined) {
    if (
      value.status !== "active" ||
      value.mode !== "camera" ||
      value.actual !== undefined
    ) {
      return false;
    }
  }

  if (isPlainRecord(value.actual) && value.actual.motion !== undefined) {
    if (value.motionAttempt !== undefined || !isPlainRecord(value.actual.motion)) {
      return false;
    }
    const motion = value.actual.motion;
    if (
      (value.status === "completed" && motion.outcome !== "completed") ||
      (value.status === "stopped" && motion.outcome !== "stopped") ||
      (value.status !== "completed" && value.status !== "stopped") ||
      value.actual.completedReps !==
        (motion.actual as PlainRecord).completedRepetitions
    ) {
      return false;
    }
  }

  switch (value.status) {
    case "planned":
      return (
        value.mode === undefined &&
        value.startedAt === undefined &&
        value.completedAt === undefined &&
        value.stoppedAt === undefined &&
        value.skippedAt === undefined &&
        value.completionKind === undefined &&
        value.actual === undefined &&
        value.motionAttempt === undefined
      );
    case "active":
      return (
        value.mode !== undefined &&
        isTimestamp(value.startedAt) &&
        value.completedAt === undefined &&
        value.stoppedAt === undefined &&
        value.skippedAt === undefined &&
        value.completionKind === undefined &&
        value.actual === undefined
      );
    case "completed":
      return (
        value.mode !== undefined &&
        isTimestamp(value.startedAt) &&
        isTimestamp(value.completedAt) &&
        value.stoppedAt === undefined &&
        value.skippedAt === undefined &&
        value.completionKind !== undefined &&
        value.actual !== undefined &&
        value.motionAttempt === undefined
      );
    case "skipped":
      return (
        isTimestamp(value.skippedAt) &&
        isString(value.skipReason, { nonEmpty: true }) &&
        value.completedAt === undefined &&
        value.stoppedAt === undefined &&
        value.completionKind === undefined &&
        value.actual === undefined &&
        value.motionAttempt === undefined
      );
    case "stopped":
      return (
        isTimestamp(value.stoppedAt) &&
        isString(value.stopReason, { nonEmpty: true }) &&
        value.completedAt === undefined &&
        value.skippedAt === undefined &&
        value.completionKind === undefined &&
        value.motionAttempt === undefined
      );
  }

  return false;
}

function validatePainEvent(value: unknown): boolean {
  if (!isPlainRecord(value)) return false;
  if (
    !hasOnlyDataProperties(
      value,
      ["id", "value", "recordedAt"],
      ["note", "setId"],
    )
  ) {
    return false;
  }
  return (
    isString(value.id, { nonEmpty: true, maximumLength: MAX_ID_LENGTH }) &&
    isFiniteNumber(value.value, 0) &&
    value.value <= 10 &&
    isOptionalString(value.note) &&
    (value.setId === undefined ||
      isString(value.setId, { nonEmpty: true, maximumLength: MAX_ID_LENGTH })) &&
    isTimestamp(value.recordedAt)
  );
}

function validateSafetyGate(value: unknown): boolean {
  if (!isPlainRecord(value)) return false;
  if (
    !hasOnlyDataProperties(
      value,
      ["active", "threshold"],
      ["triggeredByPain", "triggeredAt", "painEventId"],
    )
  ) {
    return false;
  }
  return (
    typeof value.active === "boolean" &&
    isFiniteNumber(value.threshold, 0) &&
    value.threshold <= 10 &&
    isOptionalFiniteNumber(value.triggeredByPain, 0, 10) &&
    isOptionalTimestamp(value.triggeredAt) &&
    (value.painEventId === undefined ||
      isString(value.painEventId, {
        nonEmpty: true,
        maximumLength: MAX_ID_LENGTH,
      }))
  );
}

function validateSessionSummary(value: unknown): boolean {
  if (!isPlainRecord(value)) return false;
  if (
    !hasOnlyDataProperties(
      value,
      [
        "totalSets",
        "completedSets",
        "partialCompletedSets",
        "skippedSets",
        "stoppedSets",
        "completedReps",
        "completedHoldSeconds",
        "completedAt",
      ],
      ["averageRpe", "highestPain", "startedAt"],
    )
  ) {
    return false;
  }
  return (
    isInteger(value.totalSets, 0) &&
    isInteger(value.completedSets, 0) &&
    isInteger(value.partialCompletedSets, 0) &&
    isInteger(value.skippedSets, 0) &&
    isInteger(value.stoppedSets, 0) &&
    isInteger(value.completedReps, 0) &&
    isFiniteNumber(value.completedHoldSeconds, 0) &&
    isOptionalFiniteNumber(value.averageRpe, 0, 10) &&
    isOptionalFiniteNumber(value.highestPain, 0, 10) &&
    isOptionalTimestamp(value.startedAt) &&
    isTimestamp(value.completedAt)
  );
}

/** Runtime boundary for persisted PatientSession values. */
export function isPatientSession(
  value: unknown,
  expectedProgramCode?: string,
): value is PatientSession {
  try {
    if (!isPlainRecord(value)) return false;
    if (
      !hasOnlyDataProperties(
        value,
        ["id", "program", "status", "sets", "painEvents", "safetyGate", "createdAt"],
        [
          "startedAt",
          "pausedAt",
          "stoppedAt",
          "completedAt",
          "stopReason",
          "summary",
        ],
      ) ||
      !isString(value.id, { nonEmpty: true, maximumLength: MAX_ID_LENGTH }) ||
      !validateProgramSnapshot(value.program) ||
      !isOneOf(
        value.status,
        ["not_started", "active", "paused", "stopped", "completed"] as const,
      ) ||
      !Array.isArray(value.sets) ||
      value.sets.length === 0 ||
      value.sets.length > MAX_SETS ||
      !value.sets.every(validateExerciseSet) ||
      !Array.isArray(value.painEvents) ||
      value.painEvents.length > MAX_PAIN_EVENTS ||
      !value.painEvents.every(validatePainEvent) ||
      !validateSafetyGate(value.safetyGate) ||
      !isTimestamp(value.createdAt) ||
      !isOptionalTimestamp(value.startedAt) ||
      !isOptionalTimestamp(value.pausedAt) ||
      !isOptionalTimestamp(value.stoppedAt) ||
      !isOptionalTimestamp(value.completedAt) ||
      !isOptionalString(value.stopReason) ||
      (value.summary !== undefined && !validateSessionSummary(value.summary))
    ) {
      return false;
    }

    const program = value.program as PlainRecord;
    if (
      expectedProgramCode !== undefined &&
      (!validProgramCode(expectedProgramCode) ||
        program.code !== expectedProgramCode)
    ) {
      return false;
    }

    const setIds = new Set<string>();
    const setSequences = new Set<number>();
    let activeSetCount = 0;
    for (const setValue of value.sets) {
      const set = setValue as PlainRecord;
      if (setIds.has(set.id as string)) return false;
      setIds.add(set.id as string);
      if (setSequences.has(set.sequence as number)) return false;
      setSequences.add(set.sequence as number);
      if (set.status === "active") activeSetCount += 1;
    }
    if (activeSetCount > 1) return false;
    if (
      activeSetCount === 1 &&
      value.status !== "active" &&
      value.status !== "paused"
    ) {
      return false;
    }
    if (
      value.status === "not_started" &&
      value.sets.some((setValue) =>
        (setValue as PlainRecord).status !== "planned"
      )
    ) {
      return false;
    }

    const painIds = new Set<string>();
    for (const painValue of value.painEvents) {
      const pain = painValue as PlainRecord;
      if (painIds.has(pain.id as string)) return false;
      painIds.add(pain.id as string);
      if (pain.setId !== undefined && !setIds.has(pain.setId as string)) {
        return false;
      }
    }

    const safetyGate = value.safetyGate as PlainRecord;
    if (
      safetyGate.painEventId !== undefined &&
      !painIds.has(safetyGate.painEventId as string)
    ) {
      return false;
    }

    if (
      value.status === "completed" &&
      (!isTimestamp(value.completedAt) || value.summary === undefined)
    ) {
      return false;
    }

    if (value.summary !== undefined) {
      const summary = value.summary as PlainRecord;
      const completedSets = value.sets.filter(
        (setValue) => (setValue as PlainRecord).status === "completed",
      );
      const skippedSets = value.sets.filter(
        (setValue) => (setValue as PlainRecord).status === "skipped",
      );
      const stoppedSets = value.sets.filter(
        (setValue) => (setValue as PlainRecord).status === "stopped",
      );
      const partialSets = completedSets.filter(
        (setValue) =>
          (setValue as PlainRecord).completionKind === "partial",
      );
      if (
        summary.totalSets !== value.sets.length ||
        summary.completedSets !== completedSets.length ||
        summary.partialCompletedSets !== partialSets.length ||
        summary.skippedSets !== skippedSets.length ||
        summary.stoppedSets !== stoppedSets.length
      ) {
        return false;
      }
    }

    return true;
  } catch {
    return false;
  }
}

function isEnvelopeV2(
  value: unknown,
  expectedProgramCode: string,
): value is PatientSessionEnvelopeV2 {
  if (!isPlainRecord(value)) return false;
  return (
    hasOnlyDataProperties(value, ["version", "programCode", "session"]) &&
    value.version === V2_ENVELOPE_VERSION &&
    value.programCode === expectedProgramCode &&
    isPatientSession(value.session, expectedProgramCode)
  );
}

function getStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

function cloneSession(session: PatientSession): PatientSession | null {
  try {
    const clone = parseJson(JSON.stringify(session));
    return isPatientSession(clone, session.program.code) ? clone : null;
  } catch {
    return null;
  }
}

function writeEnvelope(
  storage: Storage,
  programCode: string,
  session: PatientSession,
): boolean {
  const clone = cloneSession(session);
  if (!clone) return false;
  const envelope: PatientSessionEnvelopeV2 = {
    version: V2_ENVELOPE_VERSION,
    programCode,
    session: clone,
  };
  try {
    storage.setItem(v2SessionKey(programCode), JSON.stringify(envelope));
    return true;
  } catch {
    return false;
  }
}

/**
 * Reads only structurally valid, route-bound PatientSession data. The generic
 * parameter is constrained for compatibility with the existing workspace call
 * site; persisted values are always validated as PatientSession first.
 */
export function readPatientSession<
  T extends PatientSession = PatientSession,
>(programCode: string): T | null {
  if (!validProgramCode(programCode)) return null;
  const storage = getStorage();
  if (!storage) return null;

  try {
    const currentRaw = storage.getItem(v2SessionKey(programCode));
    if (currentRaw !== null) {
      const current = parseJson(currentRaw);
      if (!isEnvelopeV2(current, programCode)) return null;
      return cloneSession(current.session) as T | null;
    }

    const legacyRaw = storage.getItem(v1SessionKey(programCode));
    if (legacyRaw === null) return null;
    const legacy = parseJson(legacyRaw);
    if (!isPatientSession(legacy, programCode)) return null;

    const migrated = writeEnvelope(storage, programCode, legacy);
    if (migrated) {
      try {
        storage.removeItem(v1SessionKey(programCode));
      } catch {
        // V2 is authoritative once written; stale V1 data is ignored next read.
      }
    }
    return cloneSession(legacy) as T | null;
  } catch {
    return null;
  }
}

/** Writes one validated V2 envelope and reports whether it was committed. */
export function writePatientSession<T extends PatientSession>(
  programCode: string,
  session: T,
): boolean {
  if (!validProgramCode(programCode)) return false;
  if (!isPatientSession(session, programCode)) return false;
  const storage = getStorage();
  if (!storage || !writeEnvelope(storage, programCode, session)) return false;
  try {
    storage.removeItem(v1SessionKey(programCode));
  } catch {
    // The committed V2 value is authoritative even if legacy cleanup fails.
  }
  return true;
}

/** Clears both versions so a successful migration cannot resurrect old state. */
export function clearPatientSession(programCode: string): void {
  if (!validProgramCode(programCode)) return;
  const storage = getStorage();
  if (!storage) return;
  for (const key of [v2SessionKey(programCode), v1SessionKey(programCode)]) {
    try {
      storage.removeItem(key);
    } catch {
      // Each version is cleared independently so one failure does not skip the other.
    }
  }
}
