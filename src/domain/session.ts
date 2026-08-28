import type { ConfirmedProgram, DomainError, DomainResult } from "./types.ts";
import { getExerciseById } from "./catalog.ts";
import type {
  CompleteExerciseSetInput,
  LogPainInput,
  PainEvent,
  PatientExerciseSet,
  PatientSession,
  PatientSessionProgress,
  PatientSessionSummary,
  SessionFactories,
  SessionIdKind,
  SkipExerciseInput,
  StartExerciseSetInput,
  StopSessionInput,
} from "./session-types.ts";

export const PAIN_SAFETY_THRESHOLD = 5;

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

function cloneSession(
  session: PatientSession,
  updates: Partial<PatientSession>,
): PatientSession {
  return {
    ...session,
    ...updates,
    program: { ...session.program },
    sets: updates.sets ?? session.sets.map((set) => ({ ...set })),
    painEvents:
      updates.painEvents ?? session.painEvents.map((event) => ({ ...event })),
    safetyGate: updates.safetyGate ?? { ...session.safetyGate },
  };
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
    status: "not_started",
    sets,
    painEvents: [],
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

  const now = timestamp(factories(factoryOverrides).now);
  if (!now.ok) return now;

  return success(
    cloneSession(session, {
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
    cloneSession(session, {
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

export function pauseSession(
  session: PatientSession,
  factoryOverrides?: Partial<SessionFactories>,
): DomainResult<PatientSession> {
  if (session.status !== "active") {
    return failure(error("invalid_transition", "Only an active session can be paused.", "status"));
  }
  const now = timestamp(factories(factoryOverrides).now);
  if (!now.ok) return now;
  return success(cloneSession(session, { status: "paused", pausedAt: now.value }));
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
  return success(cloneSession(session, { status: "active", pausedAt: undefined }));
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
    cloneSession(session, {
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
    cloneSession(session, {
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
    cloneSession(session, {
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
  const completed = cloneSession(session, {
    status: "completed",
    completedAt: now.value,
  });
  return success(
    cloneSession(completed, {
      summary: makeSummary(completed, now.value),
    }),
  );
}
