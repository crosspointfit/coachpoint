import assert from "node:assert/strict";
import test from "node:test";

import {
  completeMotionSetCheckIn,
  createPatientSession,
  stageMotionSetResult,
  startExerciseSet,
} from "../src/domain/session.ts";
import {
  projectLatestPatientMotionResult,
  type PatientCompletedMotionSetView,
} from "../src/domain/patient-motion-view.ts";
import type { PatientSession } from "../src/domain/session-types.ts";
import type { ConfirmedProgram } from "../src/domain/types.ts";
import {
  createPatientMotionToolDescriptors,
  reviewCompletedSetSchema,
} from "../src/lib/webmcp/patient-motion-tools.ts";
import { createMotionSetAggregate } from "../src/motion/set-aggregate.ts";

const PROGRAM: ConfirmedProgram = {
  id: "draft_patient_motion",
  code: "CP_PATIENT_MOTION",
  revision: 3,
  patientLabel: "PRIVATE_PATIENT_LABEL",
  caseContext: {
    patientLabel: "PRIVATE_PATIENT_LABEL",
    diagnosis: "Synthetic knee movement-control case",
    goals: ["movement control"],
    minutesPerDay: 12,
    bodyRegion: "knee",
    equipment: ["chair"],
  },
  items: [{
    exerciseId: "half-squat",
    sets: 3,
    reps: 6,
    frequencyPerDay: 1,
    restSeconds: 45,
  }],
  estimatedMinutes: 3,
  warnings: [],
  createdAt: "2026-09-01T07:00:00.000Z",
  source: "therapist",
  confirmedAt: "2026-09-01T07:30:00.000Z",
  confirmedBy: "therapist",
};

function sequenceFactory(...times: string[]) {
  let id = 0;
  let time = 0;
  return {
    id: (kind: "session" | "set" | "pain") => `${kind}_${++id}`,
    now: () => times[time++] ?? times.at(-1) ?? "2026-09-01T08:00:00.000Z",
  };
}

function aggregate(options: {
  outcome?: "completed" | "stopped";
  completedRepetitions?: number;
  detectedWindow?: number;
  averageRange?: number;
  rangeDecline?: number;
} = {}) {
  const completedRepetitions = options.completedRepetitions ?? 6;
  return createMotionSetAggregate({
    target: {
      exerciseId: "half-squat",
      exerciseName: "Supported Half Squat",
      targetRepetitions: 6,
      source: "therapist_confirmed",
    },
    outcome: options.outcome ?? "completed",
    summary: {
      completedReps: completedRepetitions,
      detectedRepetitionWindowSeconds: options.detectedWindow ?? 18.4,
      averageRangeDeg: options.averageRange ?? 51.2,
      rangeDeclineDeg: options.rangeDecline ?? 3.4,
      averageMinAngleDeg: 120,
      qualityFlags: ["limited_depth"],
      reps: [],
    },
  });
}

function initialSession(setCount = 3): {
  session: PatientSession;
  factory: ReturnType<typeof sequenceFactory>;
} {
  const factory = sequenceFactory("2026-09-01T08:00:00.000Z");
  const created = createPatientSession({
    ...PROGRAM,
    items: [{ ...PROGRAM.items[0]!, sets: setCount }],
  }, factory);
  assert.equal(created.ok, true);
  if (!created.ok) throw new Error("Patient motion fixture failed.");
  return { session: created.value, factory };
}

function finishCameraSet(options: {
  session?: PatientSession;
  setIndex?: number;
  outcome?: "completed" | "stopped";
  completedRepetitions?: number;
  rpe?: number;
  pain?: number;
  stopReason?: string;
  times?: string[];
} = {}): PatientSession {
  const factory = sequenceFactory(...(options.times ?? [
    "2026-09-01T08:00:05.000Z",
    "2026-09-01T08:00:25.000Z",
    "2026-09-01T08:00:35.000Z",
  ]));
  const base = options.session ?? initialSession().session;
  const set = base.sets[options.setIndex ?? 0]!;
  const started = startExerciseSet(
    base,
    { setId: set.id, mode: "camera" },
    factory,
  );
  assert.equal(started.ok, true);
  if (!started.ok) throw new Error("Camera start fixture failed.");
  const outcome = options.outcome ?? "completed";
  const motion = aggregate({
    outcome,
    completedRepetitions:
      options.completedRepetitions ?? (outcome === "completed" ? 6 : 2),
  });
  const staged = stageMotionSetResult(
    started.value,
    {
      setId: set.id,
      aggregate: motion,
      stopReason:
        outcome === "stopped"
          ? options.stopReason ?? "Patient requested a short break."
          : undefined,
    },
    factory,
  );
  assert.equal(staged.ok, true);
  if (!staged.ok) throw new Error("Camera stage fixture failed.");
  const checkedIn = completeMotionSetCheckIn(
    staged.value,
    {
      setId: set.id,
      rpe: options.rpe ?? 4,
      pain: options.pain ?? 2,
    },
    factory,
  );
  assert.equal(checkedIn.ok, true);
  if (!checkedIn.ok) throw new Error("Camera check-in fixture failed.");
  return checkedIn.value;
}

function requireView(session: PatientSession): PatientCompletedMotionSetView {
  const view = projectLatestPatientMotionResult(session);
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

test("projects the latest persisted checked-in camera set with true and detector durations", () => {
  const session = finishCameraSet();
  const view = requireView(session);

  assert.equal(view.target.source, "therapist_confirmed");
  assert.equal(view.target.targetRepetitions, 6);
  assert.equal(view.outcome, "completed");
  assert.equal(view.performance.completedRepetitions, 6);
  assert.equal(view.performance.targetAchieved, true);
  assert.equal(view.performance.setDurationSeconds, 20);
  assert.equal(view.performance.detectedRepetitionWindowSeconds, 18.4);
  assert.equal(view.measurements.averageDetectedKneeRangeDeg, 51.2);
  assert.equal(view.measurements.detectedRangeDeclineDeg, 3.4);
  assert.deepEqual(view.quality.eventLabels, [
    "demo_depth_threshold_not_reached",
  ]);
  assert.deepEqual(view.checkIn, { rpe: 4, pain: 2 });
  assert.equal(view.stopReason, null);
  assert.deepEqual(view.continuation, {
    allowed: true,
    blockedBy: null,
    painGateActive: false,
    painThreshold: 5,
  });
});

test("uses resolved timestamps and sequence as deterministic latest-result ordering", () => {
  const first = finishCameraSet({
    times: [
      "2026-09-01T08:00:05.000Z",
      "2026-09-01T08:00:20.000Z",
      "2026-09-01T08:00:30.000Z",
    ],
    rpe: 3,
  });
  const second = finishCameraSet({
    session: first,
    setIndex: 1,
    times: [
      "2026-09-01T08:01:00.000Z",
      "2026-09-01T08:01:15.000Z",
      "2026-09-01T08:01:30.000Z",
    ],
    rpe: 6,
  });

  assert.equal(requireView(second).checkIn.rpe, 6);
  const tied = structuredClone(second);
  const firstSet = tied.sets[0] as { completedAt?: string };
  firstSet.completedAt = tied.sets[1]!.completedAt;
  assert.equal(requireView(tied).checkIn.rpe, 6);
});

test("stopped patient text is bounded while continuation follows session safety", () => {
  const session = finishCameraSet({
    outcome: "stopped",
    stopReason: "Patient requested a short break.",
  });
  const polluted = structuredClone(session);
  const stopped = polluted.sets[0] as { stopReason?: string };
  stopped.stopReason = `  ${"x".repeat(300)}  `;
  const view = requireView(polluted);

  assert.equal(view.outcome, "stopped");
  assert.equal(view.performance.completedRepetitions, 2);
  assert.equal(view.stopReason?.length, 240);
  assert.equal(view.continuation.allowed, true);
  assert.equal(view.continuation.blockedBy, null);
});

test("pain gate wins continuation and derives safely from explicit check-in pain", () => {
  const session = finishCameraSet({ pain: 6 });
  const view = requireView(session);
  assert.equal(view.checkIn.pain, 6);
  assert.equal(view.continuation.painGateActive, true);
  assert.equal(view.continuation.allowed, false);
  assert.equal(view.continuation.blockedBy, "pain_safety_gate");

  const inconsistent = structuredClone(session);
  (inconsistent.safetyGate as { active: boolean }).active = false;
  assert.equal(requireView(inconsistent).continuation.painGateActive, true);
});

test("a terminal final set reports that no next set can continue", () => {
  const session = finishCameraSet({ session: initialSession(1).session });
  const view = requireView(session);
  assert.equal(view.continuation.allowed, false);
  assert.equal(view.continuation.blockedBy, "no_next_set");
});

test("active and staged sets suppress every older persisted result", () => {
  const completed = finishCameraSet();
  const factory = sequenceFactory(
    "2026-09-01T08:01:00.000Z",
    "2026-09-01T08:01:20.000Z",
  );
  const next = completed.sets[1]!;
  const active = startExerciseSet(
    completed,
    { setId: next.id, mode: "camera" },
    factory,
  );
  assert.equal(active.ok, true);
  if (!active.ok) return;
  assert.equal(projectLatestPatientMotionResult(active.value), null);

  const staged = stageMotionSetResult(
    active.value,
    { setId: next.id, aggregate: aggregate() },
    factory,
  );
  assert.equal(staged.ok, true);
  if (!staged.ok) return;
  assert.equal(projectLatestPatientMotionResult(staged.value), null);
});

test("projection fails closed for missing check-in and mismatched or non-finite aggregates", () => {
  const session = finishCameraSet();
  const missingRpe = structuredClone(session);
  delete (missingRpe.sets[0]!.actual as { rpe?: number }).rpe;
  assert.equal(projectLatestPatientMotionResult(missingRpe), null);

  const mismatch = structuredClone(session);
  const motion = mismatch.sets[0]!.actual!.motion!;
  (motion.target as { exerciseId: string }).exerciseId = "foreign-exercise";
  assert.equal(projectLatestPatientMotionResult(mismatch), null);

  const nonFinite = structuredClone(session);
  const measurements = nonFinite.sets[0]!.actual!.motion!.measurements as {
    averageDetectedKneeRangeDeg: number;
  };
  measurements.averageDetectedKneeRangeDeg = Number.NaN;
  assert.equal(projectLatestPatientMotionResult(nonFinite), null);

  const older = finishCameraSet({
    times: [
      "2026-09-01T08:00:05.000Z",
      "2026-09-01T08:00:20.000Z",
      "2026-09-01T08:00:30.000Z",
    ],
  });
  const newer = finishCameraSet({
    session: older,
    setIndex: 1,
    times: [
      "2026-09-01T08:01:00.000Z",
      "2026-09-01T08:01:20.000Z",
      "2026-09-01T08:01:30.000Z",
    ],
  });
  const corruptNewest = structuredClone(newer);
  const newestMotion = corruptNewest.sets[1]!.actual!.motion!;
  (newestMotion.target as { exerciseName: string }).exerciseName = "Forged";
  assert.equal(projectLatestPatientMotionResult(corruptNewest), null);
});

test("projection is a strict allowlist with no identity, IDs, code or raw motion data", () => {
  const session = finishCameraSet();
  const polluted = structuredClone(session) as PatientSession &
    Record<string, unknown>;
  polluted.rawFrames = ["SECRET_FRAME"];
  Object.assign(polluted.sets[0]!.actual!.motion!, {
    landmarks: ["SECRET_LANDMARK"],
    patientLabel: "SECRET_PATIENT",
  });
  const view = requireView(polluted);
  const serialized = JSON.stringify(view);

  for (const sentinel of [
    PROGRAM.code,
    PROGRAM.patientLabel,
    session.id,
    session.sets[0]!.id,
    "SECRET_FRAME",
    "SECRET_LANDMARK",
    "SECRET_PATIENT",
  ]) {
    assert.equal(serialized.includes(sentinel), false, sentinel);
  }
  const keys = collectKeys(view);
  for (const forbidden of [
    "id",
    "exerciseId",
    "code",
    "patientLabel",
    "reps",
    "frames",
    "landmarks",
    "startedAtMs",
    "completedAtMs",
    "durationMs",
    "minAngleDeg",
    "maxAngleDeg",
  ]) {
    assert.equal(keys.has(forbidden), false, forbidden);
  }
});

test("descriptor is one strict route-owned read with untrusted-content annotation", () => {
  const descriptor = createPatientMotionToolDescriptors(() => null)[0]!;
  assert.equal(descriptor.name, "review_completed_set");
  assert.equal(descriptor.annotations.readOnlyHint, true);
  assert.equal(descriptor.annotations.untrustedContentHint, true);
  assert.deepEqual(descriptor.inputSchema, reviewCompletedSetSchema);
  assert.equal(reviewCompletedSetSchema.additionalProperties, false);
  assert.match(descriptor.description, /never poll/i);
  assert.match(descriptor.description, /untrusted patient text/i);
  assert.match(descriptor.description, /true wall-clock set duration/i);
  assert.match(descriptor.description, /no patient identity/i);
});

test("tool uses a live getter and one uniform unavailable error before persistence", async () => {
  let session = initialSession().session;
  const descriptor = createPatientMotionToolDescriptors(() => session)[0]!;
  const first = await descriptor.execute({});
  assert.equal(first.ok, false);
  if (first.ok) return;
  assert.equal(first.errors[0]?.code, "result_unavailable");
  const message = first.errors[0]?.message;

  const factory = sequenceFactory("2026-09-01T08:00:05.000Z");
  const active = startExerciseSet(
    session,
    { setId: session.sets[0]!.id, mode: "camera" },
    factory,
  );
  assert.equal(active.ok, true);
  if (!active.ok) return;
  session = active.value;
  const running = await descriptor.execute({});
  assert.equal(running.ok, false);
  if (!running.ok) assert.equal(running.errors[0]?.message, message);

  session = finishCameraSet();
  const reviewed = await descriptor.execute({});
  assert.equal(reviewed.ok, true);
});

test("tool rejects caller scope, returns context errors, honors abort and clones output", async () => {
  const source = finishCameraSet({ outcome: "stopped" });
  let getterCalls = 0;
  const descriptor = createPatientMotionToolDescriptors(() => {
    getterCalls += 1;
    return source;
  })[0]!;
  const hidden = Object.defineProperty({}, "setId", {
    enumerable: false,
    value: "foreign",
  });
  for (const input of [null, [], { setId: "foreign" }, hidden]) {
    const result = await descriptor.execute(input);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.errors[0]?.code, "invalid_input");
  }
  assert.equal(getterCalls, 0);

  const controller = new AbortController();
  controller.abort();
  const cancelled = await descriptor.execute({}, { signal: controller.signal });
  assert.equal(cancelled.ok, false);
  if (!cancelled.ok) assert.equal(cancelled.errors[0]?.code, "cancelled");
  assert.equal(getterCalls, 0);

  const first = await descriptor.execute({});
  assert.equal(first.ok, true);
  if (!first.ok) return;
  const firstValue = first.value as unknown as PatientCompletedMotionSetView;
  firstValue.performance.completedRepetitions = 99;
  const second = await descriptor.execute({});
  assert.equal(second.ok, true);
  if (!second.ok) return;
  const secondValue = second.value as unknown as PatientCompletedMotionSetView;
  assert.equal(secondValue.performance.completedRepetitions, 2);

  const unavailable = createPatientMotionToolDescriptors(() => null)[0]!;
  const context = await unavailable.execute({});
  assert.equal(context.ok, false);
  if (!context.ok) assert.equal(context.errors[0]?.code, "context_unavailable");
});
