import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_ADHERENCE_DEVIATION_ROWS,
  projectAdherenceSummary,
  type AdherenceSummaryView,
} from "../src/domain/adherence-view.ts";
import { projectLatestPatientMotionResult } from "../src/domain/patient-motion-view.ts";
import {
  completeExerciseSet,
  completeMotionSetCheckIn,
  createPatientSession,
  finishSession,
  skipExercise,
  stageMotionSetResult,
  startExerciseSet,
} from "../src/domain/session.ts";
import type { PatientSession } from "../src/domain/session-types.ts";
import type { ConfirmedProgram, DomainResult } from "../src/domain/types.ts";
import {
  createAdherenceToolDescriptors,
  getAdherenceSummarySchema,
} from "../src/lib/webmcp/adherence-tools.ts";
import type { ToolResult } from "../src/lib/webmcp/types.ts";
import { createMotionSetAggregate } from "../src/motion/set-aggregate.ts";

const PROGRAM: ConfirmedProgram = {
  id: "draft_adherence_private",
  code: "CP_PRIVATE_ADHERENCE_CODE",
  revision: 4,
  patientLabel: "PRIVATE_PATIENT_LABEL",
  caseContext: {
    patientLabel: "PRIVATE_PATIENT_LABEL",
    diagnosis: "Synthetic adherence case",
    goals: ["movement control"],
    minutesPerDay: 15,
    bodyRegion: "knee",
    equipment: ["chair", "table"],
  },
  items: [
    {
      exerciseId: "half-squat",
      sets: 3,
      reps: 6,
      frequencyPerDay: 1,
      restSeconds: 45,
    },
    {
      exerciseId: "shoulder-pendulum",
      sets: 1,
      holdSeconds: 30,
      frequencyPerDay: 1,
      restSeconds: 30,
    },
  ],
  estimatedMinutes: 5,
  warnings: [],
  createdAt: "2026-09-01T07:00:00.000Z",
  source: "therapist",
  confirmedAt: "2026-09-01T07:30:00.000Z",
  confirmedBy: "therapist",
};

function factories() {
  let id = 0;
  let tick = 0;
  const origin = Date.parse("2026-09-01T08:00:00.000Z");
  return {
    id: (kind: "session" | "set" | "pain") => `${kind}_${++id}`,
    now: () => new Date(origin + tick++ * 10_000).toISOString(),
  };
}

function requireSession(result: DomainResult<PatientSession>): PatientSession {
  if (!result.ok) {
    assert.fail(result.errors[0]?.message ?? "fixture failed");
  }
  return result.value;
}

function motionAggregate(
  outcome: "completed" | "stopped",
  completedRepetitions: number,
) {
  return createMotionSetAggregate({
    target: {
      exerciseId: "half-squat",
      exerciseName: "Supported Half Squat",
      targetRepetitions: 6,
      source: "therapist_confirmed",
    },
    outcome,
    summary: {
      completedReps: completedRepetitions,
      detectedRepetitionWindowSeconds: 18.4,
      averageRangeDeg: 48.2,
      rangeDeclineDeg: 4.1,
      averageMinAngleDeg: 121,
      qualityFlags: ["limited_depth"],
      reps: [],
    },
  });
}

function cameraSet(
  session: PatientSession,
  setIndex: number,
  outcome: "completed" | "stopped",
  completedRepetitions: number,
  rpe: number,
  pain: number,
  factory: ReturnType<typeof factories>,
): PatientSession {
  const set = session.sets[setIndex]!;
  const started = requireSession(
    startExerciseSet(session, { setId: set.id, mode: "camera" }, factory),
  );
  const staged = requireSession(
    stageMotionSetResult(
      started,
      {
        setId: set.id,
        aggregate: motionAggregate(outcome, completedRepetitions),
        stopReason:
          outcome === "stopped"
            ? "Patient requested <b>a shorter set</b>."
            : undefined,
      },
      factory,
    ),
  );
  return requireSession(
    completeMotionSetCheckIn(
      staged,
      { setId: set.id, rpe, pain },
      factory,
    ),
  );
}

function mixedResolvedSession(): PatientSession {
  const factory = factories();
  let session = requireSession(createPatientSession(PROGRAM, factory));
  session = cameraSet(session, 0, "completed", 6, 4, 2, factory);

  const manual = session.sets[1]!;
  session = requireSession(
    startExerciseSet(session, { setId: manual.id, mode: "manual" }, factory),
  );
  session = requireSession(
    completeExerciseSet(
      session,
      {
        setId: manual.id,
        completedReps: 3,
        durationSeconds: 20,
        rpe: 6,
        pain: 4,
      },
      factory,
    ),
  );

  session = cameraSet(session, 2, "stopped", 2, 5, 3, factory);
  session = requireSession(
    skipExercise(
      session,
      {
        exerciseId: "shoulder-pendulum",
        reason: "Patient chose <script>rest</script> today.",
      },
      factory,
    ),
  );
  return requireSession(finishSession(session, factory));
}

function requireView(session: PatientSession): AdherenceSummaryView {
  const view = projectAdherenceSummary(session);
  assert.ok(view);
  return view;
}

function collectKeys(value: unknown, keys = new Set<string>()): Set<string> {
  if (!value || typeof value !== "object") return keys;
  if (Array.isArray(value)) {
    value.forEach((item) => collectKeys(item, keys));
    return keys;
  }
  for (const [key, item] of Object.entries(value)) {
    keys.add(key);
    collectKeys(item, keys);
  }
  return keys;
}

function assertRecoverable(
  result: ToolResult,
  code: string,
  field: string,
): void {
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.deepEqual(result.errors.map((error) => ({
    code: error.code,
    field: error.field,
    recoverable: error.recoverable,
  })), [{ code, field, recoverable: true }]);
}

test("projects strict adherence counts, performance and the existing safe motion review", () => {
  const session = mixedResolvedSession();
  const view = requireView(session);

  assert.equal(view.sessionStatus, "completed");
  assert.deepEqual(view.progress, {
    totalSets: 4,
    resolvedSets: 4,
    completedSets: 2,
    partialCompletedSets: 1,
    skippedSets: 1,
    stoppedSets: 1,
    completionPercent: 50,
  });
  assert.deepEqual(view.performance, {
    completedRepetitions: 11,
    completedHoldSeconds: 0,
    averageRpe: 5,
    highestPain: 4,
  });
  assert.deepEqual(
    view.latestPersistedMotionReview,
    projectLatestPatientMotionResult(session),
  );
  assert.equal(view.latestPersistedMotionReview?.outcome, "stopped");
  assert.equal(
    view.latestPersistedMotionReview?.performance.completedRepetitions,
    2,
  );
  assert.deepEqual(view.deviations.rows.map((row) => row.status), [
    "skipped",
    "stopped",
    "partial",
  ]);
  assert.match(view.deviations.rows[0]?.reason ?? "", /<script>/);
  assert.match(view.deviations.rows[1]?.reason ?? "", /<b>/);
  assert.equal(view.deviations.rows[2]?.reason, null);
  assert.equal(view.deviations.truncated, false);
});

test("projection is an exact identity-free allowlist and ignores polluted source data", () => {
  const source = mixedResolvedSession();
  const polluted = structuredClone(source) as PatientSession &
    Record<string, unknown>;
  polluted.frames = ["SECRET_FRAME"];
  polluted.landmarks = ["SECRET_LANDMARK"];
  polluted.patientLabel = "SECRET_PATIENT";
  const firstSet = polluted.sets[0] as PatientSession["sets"][number] &
    Record<string, unknown>;
  firstSet.rawTimeSeries = ["SECRET_SERIES"];

  const view = requireView(polluted);
  const serialized = JSON.stringify(view);
  for (const sentinel of [
    PROGRAM.code,
    PROGRAM.patientLabel,
    source.id,
    ...source.sets.map((set) => set.id),
    "SECRET_FRAME",
    "SECRET_LANDMARK",
    "SECRET_PATIENT",
    "SECRET_SERIES",
  ]) {
    assert.equal(serialized.includes(sentinel), false, sentinel);
  }

  assert.deepEqual(Object.keys(view).sort(), [
    "authority",
    "deviations",
    "latestPersistedMotionReview",
    "performance",
    "privacy",
    "progress",
    "schemaVersion",
    "sessionStatus",
  ]);
  const keys = collectKeys(view);
  for (const forbidden of [
    "id",
    "code",
    "patientLabel",
    "exerciseId",
    "sets",
    "painEvents",
    "actual",
    "motion",
    "frames",
    "landmarks",
    "reps",
  ]) {
    assert.equal(keys.has(forbidden), false, forbidden);
  }
  assert.deepEqual(view.privacy, {
    patientIdentityIncluded: false,
    programCodeIncluded: false,
    sessionOrSetIdsIncluded: false,
    rawSessionIncluded: false,
    rawMotionIncluded: false,
  });
  assert.equal(view.authority.agentMayDiagnose, false);
  assert.equal(view.authority.agentMayChangePrescription, false);
  assert.equal(view.authority.agentMayModifySession, false);
});

test("deviation rows are bounded, latest-first and report truncation", () => {
  const factory = factories();
  const program: ConfirmedProgram = {
    ...PROGRAM,
    items: [{
      exerciseId: "half-squat",
      sets: MAX_ADHERENCE_DEVIATION_ROWS + 3,
      reps: 6,
      frequencyPerDay: 1,
      restSeconds: 45,
    }],
  };
  let session = requireSession(createPatientSession(program, factory));
  session = requireSession(
    skipExercise(
      session,
      { exerciseId: "half-squat", reason: "Bounded deviation reason." },
      factory,
    ),
  );
  session = requireSession(finishSession(session, factory));

  const view = requireView(session);
  assert.equal(view.deviations.rows.length, MAX_ADHERENCE_DEVIATION_ROWS);
  assert.equal(view.deviations.truncated, true);
  assert.ok(view.deviations.rows.every((row) => row.status === "skipped"));
  assert.equal(view.progress.skippedSets, MAX_ADHERENCE_DEVIATION_ROWS + 3);
});

test("projection fails closed on invalid status, set values, pain and overflow", () => {
  const source = mixedResolvedSession();

  const badStatus = structuredClone(source);
  (badStatus as { status: string }).status = "diagnosed";
  assert.equal(projectAdherenceSummary(badStatus), null);

  const badActual = structuredClone(source);
  (badActual.sets[0]!.actual as { completedReps?: number }).completedReps =
    Number.POSITIVE_INFINITY;
  assert.equal(projectAdherenceSummary(badActual), null);

  const badPain = structuredClone(source);
  (badPain.painEvents[0] as { value: number }).value = 99;
  assert.equal(projectAdherenceSummary(badPain), null);

  const overflow = structuredClone(source);
  (overflow.sets[0]!.actual as { completedReps?: number }).completedReps =
    Number.MAX_SAFE_INTEGER;
  (overflow.sets[1]!.actual as { completedReps?: number }).completedReps = 1;
  assert.equal(projectAdherenceSummary(overflow), null);
});

test("descriptor is one route-owned read with untrusted-content annotation", () => {
  const descriptor = createAdherenceToolDescriptors(() => null)[0]!;
  assert.equal(descriptor.name, "get_adherence_summary");
  assert.equal(descriptor.annotations.readOnlyHint, true);
  assert.equal(descriptor.annotations.untrustedContentHint, true);
  assert.deepEqual(descriptor.inputSchema, getAdherenceSummarySchema);
  assert.equal(getAdherenceSummarySchema.additionalProperties, false);
  assert.match(descriptor.description, /untrusted patient text/i);
  assert.match(descriptor.description, /no patient label/i);
  assert.match(descriptor.description, /cannot diagnose/i);
  assert.doesNotMatch(
    descriptor.name,
    /create|update|delete|confirm|diagnose|navigate/,
  );
});

test("tool rejects caller scope before its getter and accepts only plain empty objects", async () => {
  let getterCalls = 0;
  const descriptor = createAdherenceToolDescriptors(() => {
    getterCalls += 1;
    return mixedResolvedSession();
  })[0]!;
  const hidden = Object.defineProperty({}, "sessionId", {
    value: "foreign",
    enumerable: false,
  });
  const inherited = Object.create({ patientId: "foreign" });

  for (const input of [
    undefined,
    null,
    [],
    { sessionId: "foreign" },
    { patientId: "foreign" },
    hidden,
    inherited,
    { [Symbol("hidden")]: "foreign" },
  ]) {
    assertRecoverable(
      await descriptor.execute(input),
      "invalid_input",
      "input",
    );
  }
  assert.equal(getterCalls, 0);
  assert.equal((await descriptor.execute({})).ok, true);
  assert.equal((await descriptor.execute(Object.create(null))).ok, true);
  assert.equal(getterCalls, 2);
});

test("tool returns uniform context/result errors and honors early abort", async () => {
  const contextTool = createAdherenceToolDescriptors(() => null)[0]!;
  assertRecoverable(
    await contextTool.execute({}),
    "context_unavailable",
    "patientSession",
  );

  let corrupt: PatientSession = mixedResolvedSession();
  const resultTool = createAdherenceToolDescriptors(() => corrupt)[0]!;
  const firstCorrupt = structuredClone(corrupt);
  (firstCorrupt as { status: string }).status = "invalid";
  corrupt = firstCorrupt;
  const first = await resultTool.execute({});
  assertRecoverable(first, "result_unavailable", "adherenceSummary");
  const firstMessage = first.ok ? "" : first.errors[0]?.message;

  const secondCorrupt = mixedResolvedSession();
  (secondCorrupt.painEvents[0] as { value: number }).value = Number.NaN;
  corrupt = secondCorrupt;
  const second = await resultTool.execute({});
  assertRecoverable(second, "result_unavailable", "adherenceSummary");
  assert.equal(second.ok ? "" : second.errors[0]?.message, firstMessage);

  let getterCalls = 0;
  const abortTool = createAdherenceToolDescriptors(() => {
    getterCalls += 1;
    return mixedResolvedSession();
  })[0]!;
  const controller = new AbortController();
  controller.abort();
  const cancelled = await abortTool.execute({}, { signal: controller.signal });
  assert.equal(cancelled.ok, false);
  if (!cancelled.ok) assert.equal(cancelled.errors[0]?.code, "cancelled");
  assert.equal(getterCalls, 0);
});

test("tool clones its result and never mutates the source session", async () => {
  const source = mixedResolvedSession();
  const before = JSON.stringify(source);
  const descriptor = createAdherenceToolDescriptors(() => source)[0]!;
  const first = await descriptor.execute({});
  assert.equal(first.ok, true);
  if (!first.ok) return;
  const firstValue = first.value as unknown as AdherenceSummaryView;
  (firstValue.progress as { completedSets: number }).completedSets = 99;
  (firstValue.deviations.rows[0] as { reason: string | null }).reason =
    "MUTATED";
  if (firstValue.latestPersistedMotionReview) {
    firstValue.latestPersistedMotionReview.performance.completedRepetitions =
      99;
  }

  const second = await descriptor.execute({});
  assert.equal(second.ok, true);
  if (!second.ok) return;
  const secondValue = second.value as unknown as AdherenceSummaryView;
  assert.equal(secondValue.progress.completedSets, 2);
  assert.notEqual(secondValue.deviations.rows[0]?.reason, "MUTATED");
  assert.equal(
    secondValue.latestPersistedMotionReview?.performance.completedRepetitions,
    2,
  );
  assert.equal(JSON.stringify(source), before);
});
