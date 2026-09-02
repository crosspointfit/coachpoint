import assert from "node:assert/strict";
import test from "node:test";

import {
  acceptNextSetFocus,
  completeMotionSetCheckIn,
  completeExerciseSet,
  createPatientSession,
  dismissNextSetFocus,
  finishSession,
  getSessionProgress,
  logPain,
  pauseSession,
  resumeSession,
  skipExercise,
  stageNextSetFocus,
  stageMotionSetResult,
  startExerciseSet,
  stopSession,
  switchActiveCameraSetToManualFallback,
} from "../src/domain/session.ts";
import type { ConfirmedProgram } from "../src/domain/types.ts";
import { createMotionSetAggregate } from "../src/motion/set-aggregate.ts";
import type { MotionSetAggregate } from "../src/motion/set-aggregate.ts";

let idCounter = 0;
const factory = {
  id: (kind: "session" | "set" | "pain") => `${kind}_${++idCounter}`,
  now: () => "2026-08-28T08:00:00.000Z",
};

const PROGRAM: ConfirmedProgram = {
  id: "draft_1",
  code: "CP_TEST_PROGRAM_123",
  revision: 1,
  patientLabel: "Synthetic Patient",
  caseContext: {
    patientLabel: "Synthetic Patient",
    diagnosis: "Synthetic shoulder case",
    goals: ["mobility"],
    minutesPerDay: 15,
    bodyRegion: "shoulder",
    equipment: ["stick"],
  },
  items: [
    {
      exerciseId: "shoulder-flexion-stick",
      sets: 2,
      reps: 8,
      frequencyPerDay: 1,
      restSeconds: 30,
    },
    {
      exerciseId: "shoulder-pendulum",
      sets: 1,
      holdSeconds: 30,
      frequencyPerDay: 1,
      restSeconds: 30,
    },
  ],
  estimatedMinutes: 4.2,
  warnings: [],
  createdAt: "2026-08-28T07:00:00.000Z",
  source: "agent",
  confirmedAt: "2026-08-28T07:30:00.000Z",
  confirmedBy: "therapist",
};

const CAMERA_PROGRAM: ConfirmedProgram = {
  ...structuredClone(PROGRAM),
  id: "draft_camera",
  code: "CP_TEST_CAMERA_123",
  patientLabel: "Synthetic Knee Patient",
  caseContext: {
    patientLabel: "Synthetic Knee Patient",
    diagnosis: "Synthetic knee movement-control case",
    goals: ["movement control"],
    minutesPerDay: 12,
    bodyRegion: "knee",
    equipment: ["chair"],
  },
  items: [
    {
      exerciseId: "half-squat",
      sets: 2,
      reps: 8,
      frequencyPerDay: 1,
      restSeconds: 45,
    },
  ],
  estimatedMinutes: 3,
};

function sequenceFactory(...times: string[]) {
  let nextId = 0;
  let nextTime = 0;
  return {
    id: (kind: "session" | "set" | "pain") => `${kind}_camera_${++nextId}`,
    now: () => times[nextTime++] ?? times.at(-1) ?? "2026-08-28T08:00:00.000Z",
  };
}

function makeCameraSession(
  cameraFactory = sequenceFactory("2026-08-28T08:00:00.000Z"),
) {
  const result = createPatientSession(CAMERA_PROGRAM, cameraFactory);
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("camera fixture failed");
  return { session: result.value, factory: cameraFactory };
}

function motionAggregate(options: {
  outcome?: "completed" | "stopped";
  completedRepetitions?: number;
  targetRepetitions?: number;
  source?: "isolated_demo" | "therapist_confirmed";
  qualityFlags?: string[];
} = {}): MotionSetAggregate {
  const completedRepetitions = options.completedRepetitions ?? 8;
  return createMotionSetAggregate({
    target: {
      exerciseId: "half-squat",
      exerciseName: "Supported Half Squat",
      targetRepetitions: options.targetRepetitions ?? 8,
      source: options.source ?? "therapist_confirmed",
    },
    outcome: options.outcome ?? "completed",
    summary: {
      completedReps: completedRepetitions,
      detectedRepetitionWindowSeconds: 24.5,
      averageRangeDeg: 47.2,
      rangeDeclineDeg: 4.1,
      averageMinAngleDeg: 121.6,
      qualityFlags: options.qualityFlags ?? ["limited_depth"],
      reps: [
        {
          rep: 1,
          startedAtMs: 100,
          completedAtMs: 4_100,
          durationMs: 4_000,
          minAngleDeg: 124,
          maxAngleDeg: 171,
          rangeDeg: 47,
          limitedDepth: true,
        },
      ],
    },
  });
}

function makeCheckedInCameraSession(options: {
  aggregate?: MotionSetAggregate;
  rpe?: number;
  pain?: number;
} = {}) {
  const fixture = makeCameraSession(
    sequenceFactory(
      "2026-08-28T08:00:00.000Z",
      "2026-08-28T08:00:05.000Z",
      "2026-08-28T08:00:35.000Z",
      "2026-08-28T08:00:40.000Z",
      "2026-08-28T08:00:45.000Z",
      "2026-08-28T08:00:50.000Z",
    ),
  );
  const started = startExerciseSet(
    fixture.session,
    { setId: fixture.session.sets[0]!.id, mode: "camera" },
    fixture.factory,
  );
  assert.equal(started.ok, true);
  if (!started.ok) throw new Error("camera start fixture failed");
  const staged = stageMotionSetResult(
    started.value,
    {
      setId: started.value.sets[0]!.id,
      aggregate: options.aggregate ?? motionAggregate(),
    },
    fixture.factory,
  );
  assert.equal(staged.ok, true);
  if (!staged.ok) throw new Error("camera stage fixture failed");
  const checkedIn = completeMotionSetCheckIn(
    staged.value,
    {
      setId: staged.value.sets[0]!.id,
      rpe: options.rpe ?? 8,
      pain: options.pain ?? 1,
    },
    fixture.factory,
  );
  assert.equal(checkedIn.ok, true);
  if (!checkedIn.ok) throw new Error("camera check-in fixture failed");
  return { session: checkedIn.value, factory: fixture.factory };
}

function makeSession() {
  idCounter = 0;
  const result = createPatientSession(PROGRAM, factory);
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("fixture failed");
  return result.value;
}

test("creates a serializable planned session from a confirmed program", () => {
  const session = makeSession();
  assert.equal(session.status, "not_started");
  assert.equal(session.transitionRevision, 0);
  assert.deepEqual(session.coachingFocuses, []);
  assert.equal(session.sets.length, 3);
  const roundTrip = JSON.parse(JSON.stringify(session));
  assert.equal(JSON.stringify(roundTrip), JSON.stringify(session));
  assert.deepEqual(getSessionProgress(session), {
    totalSets: 3,
    plannedSets: 3,
    activeSets: 0,
    completedSets: 0,
    partialCompletedSets: 0,
    skippedSets: 0,
    stoppedSets: 0,
    resolvedSets: 0,
    completionPercent: 0,
    resolvedPercent: 0,
    currentSetId: undefined,
    nextSetId: "set_2",
    isFinishable: false,
  });
});

test("every successful state-changing session operation advances one transition revision", () => {
  const session = makeSession();
  assert.equal(session.transitionRevision, 0);

  const started = startExerciseSet(
    session,
    { setId: session.sets[0]!.id, mode: "manual" },
    factory,
  );
  assert.equal(started.ok, true);
  if (!started.ok) return;
  assert.equal(started.value.transitionRevision, 1);

  const paused = pauseSession(started.value, factory);
  assert.equal(paused.ok, true);
  if (!paused.ok) return;
  assert.equal(paused.value.transitionRevision, 2);

  const resumed = resumeSession(paused.value);
  assert.equal(resumed.ok, true);
  if (!resumed.ok) return;
  assert.equal(resumed.value.transitionRevision, 3);

  const completed = completeExerciseSet(
    resumed.value,
    {
      setId: resumed.value.sets[0]!.id,
      completedReps: 8,
      durationSeconds: 30,
      rpe: 3,
      pain: 1,
    },
    factory,
  );
  assert.equal(completed.ok, true);
  if (!completed.ok) return;
  assert.equal(completed.value.transitionRevision, 4);

  const skipped = skipExercise(
    completed.value,
    {
      exerciseId: "shoulder-flexion-stick",
      reason: "Resolve the remaining synthetic set.",
    },
    factory,
  );
  assert.equal(skipped.ok, true);
  if (!skipped.ok) return;
  assert.equal(skipped.value.transitionRevision, 5);

  const hold = skipped.value.sets.find((set) => set.status === "planned");
  assert.ok(hold);
  if (!hold) return;
  const holdStarted = startExerciseSet(
    skipped.value,
    { setId: hold.id, mode: "timer" },
    factory,
  );
  assert.equal(holdStarted.ok, true);
  if (!holdStarted.ok) return;
  assert.equal(holdStarted.value.transitionRevision, 6);

  const pain = logPain(
    holdStarted.value,
    { pain: 1, note: "Low synthetic pain report." },
    factory,
  );
  assert.equal(pain.ok, true);
  if (!pain.ok) return;
  assert.equal(pain.value.transitionRevision, 7);

  const stopped = stopSession(
    pain.value,
    { reason: "Patient stopped the synthetic session." },
    factory,
  );
  assert.equal(stopped.ok, true);
  if (!stopped.ok) return;
  assert.equal(stopped.value.transitionRevision, 8);

  const failed = startExerciseSet(
    stopped.value,
    { setId: hold.id, mode: "manual" },
    factory,
  );
  assert.equal(failed.ok, false);
  assert.equal(stopped.value.transitionRevision, 8);
});

test("starts and completes a set without mutating the prior session", () => {
  const original = makeSession();
  const start = startExerciseSet(
    original,
    { setId: original.sets[0]!.id, mode: "manual" },
    factory,
  );
  assert.equal(start.ok, true);
  assert.equal(original.status, "not_started");
  if (!start.ok) return;
  assert.equal(start.value.sets[0]!.status, "active");

  const complete = completeExerciseSet(
    start.value,
    {
      setId: start.value.sets[0]!.id,
      completedReps: 8,
      durationSeconds: 34,
      rpe: 4,
      pain: 2,
    },
    factory,
  );
  assert.equal(complete.ok, true);
  if (!complete.ok) return;
  assert.equal(complete.value.sets[0]!.status, "completed");
  assert.equal(complete.value.sets[0]!.completionKind, "full");
  assert.equal(complete.value.painEvents.length, 1);
});

test("blocks overlapping active sets and invalid transitions", () => {
  const session = makeSession();
  const start = startExerciseSet(
    session,
    { setId: session.sets[0]!.id, mode: "manual" },
    factory,
  );
  assert.equal(start.ok, true);
  if (!start.ok) return;
  const overlap = startExerciseSet(
    start.value,
    { setId: start.value.sets[1]!.id, mode: "manual" },
    factory,
  );
  assert.equal(overlap.ok, false);
  if (!overlap.ok) assert.equal(overlap.errors[0]?.code, "set_already_active");
  assert.equal(resumeSession(session).ok, false);
});

test("pauses and resumes only when the pain gate is clear", () => {
  const session = makeSession();
  const started = startExerciseSet(
    session,
    { setId: session.sets[0]!.id, mode: "manual" },
    factory,
  );
  assert.equal(started.ok, true);
  if (!started.ok) return;
  const paused = pauseSession(started.value, factory);
  assert.equal(paused.ok, true);
  if (!paused.ok) return;
  assert.equal(resumeSession(paused.value).ok, true);
});

test("pain at or above five stops the active set and blocks restart", () => {
  const session = makeSession();
  const started = startExerciseSet(
    session,
    { setId: session.sets[0]!.id, mode: "manual" },
    factory,
  );
  assert.equal(started.ok, true);
  if (!started.ok) return;
  const pain = logPain(started.value, { pain: 5, note: "Synthetic report" }, factory);
  assert.equal(pain.ok, true);
  if (!pain.ok) return;
  assert.equal(pain.value.safetyGate.active, true);
  assert.equal(pain.value.status, "paused");
  assert.equal(pain.value.sets[0]!.status, "stopped");
  const restart = startExerciseSet(
    pain.value,
    { setId: pain.value.sets[1]!.id, mode: "manual" },
    factory,
  );
  assert.equal(restart.ok, false);
  if (!restart.ok) assert.ok(["session_paused", "pain_safety_gate"].includes(restart.errors[0]!.code));
  assert.equal(resumeSession(pain.value).ok, false);
});

test("skips every remaining planned set for one exercise with attribution", () => {
  const session = makeSession();
  const skipped = skipExercise(
    session,
    { exerciseId: "shoulder-flexion-stick", reason: "Therapist-directed demo skip" },
    factory,
  );
  assert.equal(skipped.ok, true);
  if (!skipped.ok) return;
  assert.equal(
    skipped.value.sets.filter((set) => set.status === "skipped").length,
    2,
  );
});

test("stopping the session resolves the active set as stopped", () => {
  const session = makeSession();
  const started = startExerciseSet(
    session,
    { setId: session.sets[0]!.id, mode: "manual" },
    factory,
  );
  assert.equal(started.ok, true);
  if (!started.ok) return;
  const stopped = stopSession(
    started.value,
    { reason: "Patient chose to stop" },
    factory,
  );
  assert.equal(stopped.ok, true);
  if (!stopped.ok) return;
  assert.equal(stopped.value.status, "stopped");
  assert.equal(stopped.value.sets[0]!.status, "stopped");
});

test("finishes only after every set is resolved and produces a summary", () => {
  let session = makeSession();
  for (const set of session.sets) {
    const beforeStartRevision = session.transitionRevision;
    const start = startExerciseSet(session, { setId: set.id, mode: "manual" }, factory);
    assert.equal(start.ok, true);
    if (!start.ok) return;
    assert.equal(start.value.transitionRevision, beforeStartRevision + 1);
    const complete = completeExerciseSet(
      start.value,
      {
        setId: set.id,
        completedReps: set.prescribedTarget.reps,
        completedHoldSeconds: set.prescribedTarget.holdSeconds,
        durationSeconds: 30,
        rpe: 3,
        pain: 1,
      },
      factory,
    );
    assert.equal(complete.ok, true);
    if (!complete.ok) return;
    assert.equal(
      complete.value.transitionRevision,
      start.value.transitionRevision + 1,
    );
    session = complete.value;
  }
  assert.equal(getSessionProgress(session).isFinishable, true);
  const finished = finishSession(session, factory);
  assert.equal(finished.ok, true);
  if (!finished.ok) return;
  assert.equal(finished.value.transitionRevision, session.transitionRevision + 1);
  assert.equal(finished.value.status, "completed");
  assert.equal(finished.value.summary?.completedSets, 3);
  assert.equal(finished.value.summary?.averageRpe, 3);
});

test("camera mode is restricted to prescribed camera sets while manual fallback remains available", () => {
  const ordinary = makeSession();
  const unavailable = startExerciseSet(
    ordinary,
    { setId: ordinary.sets[0]!.id, mode: "camera" },
    factory,
  );
  assert.equal(unavailable.ok, false);
  if (!unavailable.ok) {
    assert.equal(unavailable.errors[0]?.code, "camera_mode_unavailable");
  }

  const camera = makeCameraSession();
  const cameraStart = startExerciseSet(
    camera.session,
    { setId: camera.session.sets[0]!.id, mode: "camera" },
    camera.factory,
  );
  assert.equal(cameraStart.ok, true);
  if (cameraStart.ok) assert.equal(cameraStart.value.sets[0]!.mode, "camera");

  const fallback = makeCameraSession();
  const manualStart = startExerciseSet(
    fallback.session,
    { setId: fallback.session.sets[0]!.id, mode: "manual" },
    fallback.factory,
  );
  assert.equal(manualStart.ok, true);
  if (!manualStart.ok) return;
  const manualComplete = completeExerciseSet(
    manualStart.value,
    {
      setId: manualStart.value.sets[0]!.id,
      completedReps: 8,
      durationSeconds: 32,
      rpe: 3,
      pain: 1,
    },
    fallback.factory,
  );
  assert.equal(manualComplete.ok, true);
  if (manualComplete.ok) {
    assert.equal(manualComplete.value.sets[0]!.actual?.motion, undefined);
  }
});

test("switches one active camera set to manual fallback without changing its prescription or start", () => {
  const camera = makeCameraSession(
    sequenceFactory(
      "2026-08-28T08:00:00.000Z",
      "2026-08-28T08:00:05.000Z",
    ),
  );
  const started = startExerciseSet(
    camera.session,
    { setId: camera.session.sets[0]!.id, mode: "camera" },
    camera.factory,
  );
  assert.equal(started.ok, true);
  if (!started.ok) return;
  assert.equal(started.value.transitionRevision, 1);
  const before = structuredClone(started.value.sets[0]!);

  const fallback = switchActiveCameraSetToManualFallback(started.value, {
    setId: started.value.sets[0]!.id,
  });
  assert.equal(fallback.ok, true);
  if (!fallback.ok) return;
  assert.equal(fallback.value.status, "active");
  assert.equal(fallback.value.transitionRevision, 2);
  assert.equal(fallback.value.sets[0]!.status, "active");
  assert.equal(fallback.value.sets[0]!.mode, "manual");
  assert.equal(fallback.value.sets[0]!.startedAt, before.startedAt);
  assert.deepEqual(
    fallback.value.sets[0]!.prescribedTarget,
    before.prescribedTarget,
  );
  assert.equal(fallback.value.sets[0]!.prescribedCoachingMode, "camera");
  assert.equal(started.value.sets[0]!.mode, "camera");
  assert.notEqual(
    fallback.value.sets[0]!.prescribedTarget,
    started.value.sets[0]!.prescribedTarget,
  );

  const completed = completeExerciseSet(
    fallback.value,
    {
      setId: fallback.value.sets[0]!.id,
      completedReps: 8,
      durationSeconds: 30,
      rpe: 3,
      pain: 1,
    },
    camera.factory,
  );
  assert.equal(completed.ok, true);
  if (completed.ok) {
    assert.equal(completed.value.transitionRevision, 3);
    assert.equal(completed.value.sets[0]!.actual?.motion, undefined);
  }
});

test("manual fallback refuses paused, gated, non-camera, and staged camera sets", () => {
  const ordinary = makeSession();
  const ordinaryStart = startExerciseSet(
    ordinary,
    { setId: ordinary.sets[0]!.id, mode: "manual" },
    factory,
  );
  assert.equal(ordinaryStart.ok, true);
  if (!ordinaryStart.ok) return;
  const nonCamera = switchActiveCameraSetToManualFallback(ordinaryStart.value, {
    setId: ordinaryStart.value.sets[0]!.id,
  });
  assert.equal(nonCamera.ok, false);
  if (!nonCamera.ok) {
    assert.equal(nonCamera.errors[0]?.code, "camera_set_not_active");
  }

  const pausedFixture = makeCameraSession();
  const pausedStart = startExerciseSet(
    pausedFixture.session,
    { setId: pausedFixture.session.sets[0]!.id, mode: "camera" },
    pausedFixture.factory,
  );
  assert.equal(pausedStart.ok, true);
  if (!pausedStart.ok) return;
  const paused = pauseSession(pausedStart.value, pausedFixture.factory);
  assert.equal(paused.ok, true);
  if (!paused.ok) return;
  const pausedFallback = switchActiveCameraSetToManualFallback(paused.value, {
    setId: paused.value.sets[0]!.id,
  });
  assert.equal(pausedFallback.ok, false);
  if (!pausedFallback.ok) {
    assert.equal(pausedFallback.errors[0]?.code, "session_not_active");
  }

  const stagedFixture = makeCameraSession();
  const stagedStart = startExerciseSet(
    stagedFixture.session,
    { setId: stagedFixture.session.sets[0]!.id, mode: "camera" },
    stagedFixture.factory,
  );
  assert.equal(stagedStart.ok, true);
  if (!stagedStart.ok) return;
  const staged = stageMotionSetResult(
    stagedStart.value,
    { setId: stagedStart.value.sets[0]!.id, aggregate: motionAggregate() },
    stagedFixture.factory,
  );
  assert.equal(staged.ok, true);
  if (!staged.ok) return;
  assert.equal(staged.value.transitionRevision, 2);
  const stagedFallback = switchActiveCameraSetToManualFallback(staged.value, {
    setId: staged.value.sets[0]!.id,
  });
  assert.equal(stagedFallback.ok, false);
  if (!stagedFallback.ok) {
    assert.equal(stagedFallback.errors[0]?.code, "motion_result_already_staged");
  }

  const gated = {
    ...stagedStart.value,
    safetyGate: {
      active: true,
      threshold: 5,
      triggeredByPain: 5,
    },
  };
  const gatedFallback = switchActiveCameraSetToManualFallback(gated, {
    setId: gated.sets[0]!.id,
  });
  assert.equal(gatedFallback.ok, false);
  if (!gatedFallback.ok) {
    assert.equal(gatedFallback.errors[0]?.code, "pain_safety_gate");
  }
});

test("stages one sanitized terminal camera aggregate without mutating its source", () => {
  const camera = makeCameraSession();
  const started = startExerciseSet(
    camera.session,
    { setId: camera.session.sets[0]!.id, mode: "camera" },
    camera.factory,
  );
  assert.equal(started.ok, true);
  if (!started.ok) return;
  const aggregate = motionAggregate();
  const staged = stageMotionSetResult(
    started.value,
    { setId: started.value.sets[0]!.id, aggregate },
    camera.factory,
  );
  assert.equal(staged.ok, true);
  if (!staged.ok) return;

  const attempt = staged.value.sets[0]!.motionAttempt;
  assert.equal(attempt?.status, "awaiting_check_in");
  assert.equal(attempt?.aggregate.target.source, "therapist_confirmed");
  assert.equal(attempt?.aggregate.target.targetRepetitions, 8);
  assert.equal(attempt?.aggregate.actual.completedRepetitions, 8);
  assert.equal(started.value.sets[0]!.motionAttempt, undefined);
  assert.notEqual(attempt?.aggregate, aggregate);
  assert.notEqual(attempt?.aggregate.actual, aggregate.actual);

  (aggregate.actual as { completedRepetitions: number }).completedRepetitions = 1;
  assert.equal(attempt?.aggregate.actual.completedRepetitions, 8);
  const serialized = JSON.stringify(attempt);
  for (const forbidden of [
    "reps",
    "frames",
    "landmarks",
    "startedAtMs",
    "completedAtMs",
  ]) {
    assert.equal(serialized.includes(`\"${forbidden}\"`), false, forbidden);
  }

  const duplicate = stageMotionSetResult(
    staged.value,
    { setId: staged.value.sets[0]!.id, aggregate: motionAggregate() },
    camera.factory,
  );
  assert.equal(duplicate.ok, false);
  if (!duplicate.ok) {
    assert.equal(duplicate.errors[0]?.code, "motion_result_already_staged");
  }
});

test("rejects mismatched, unconfirmed, polluted, and inconsistent camera aggregates", () => {
  const camera = makeCameraSession();
  const started = startExerciseSet(
    camera.session,
    { setId: camera.session.sets[0]!.id, mode: "camera" },
    camera.factory,
  );
  assert.equal(started.ok, true);
  if (!started.ok) return;

  const wrongSource = motionAggregate({ source: "isolated_demo" });
  const wrongTarget = motionAggregate({ targetRepetitions: 7 });
  const wrongExercise = structuredClone(motionAggregate());
  (wrongExercise.target as { exerciseId: string }).exerciseId = "heel-raise";
  const wrongExerciseName = structuredClone(motionAggregate());
  (wrongExerciseName.target as { exerciseName: string }).exerciseName =
    "Unconfirmed label";
  const polluted = Object.assign(structuredClone(motionAggregate()), {
    frames: ["SECRET_FRAME"],
    landmarks: ["SECRET_LANDMARK"],
    reps: [{ minAngleDeg: 120 }],
  });
  const inconsistent = structuredClone(motionAggregate());
  (inconsistent.actual as { targetAchieved: boolean }).targetAchieved = false;
  const stoppedAfterTarget = motionAggregate({ outcome: "stopped" });

  for (const aggregate of [
    wrongSource,
    wrongTarget,
    wrongExercise,
    wrongExerciseName,
    polluted,
    inconsistent,
    stoppedAfterTarget,
  ]) {
    const result = stageMotionSetResult(
      started.value,
      { setId: started.value.sets[0]!.id, aggregate },
      camera.factory,
    );
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.errors[0]?.code, "invalid_motion_result");
      assert.doesNotMatch(JSON.stringify(result), /SECRET_/);
    }
  }
});

test("camera check-in derives wall-clock duration and keeps detector time distinct", () => {
  const camera = makeCameraSession(
    sequenceFactory(
      "2026-08-28T08:00:00.000Z",
      "2026-08-28T08:00:05.000Z",
      "2026-08-28T08:00:35.000Z",
      "2026-08-28T08:00:50.000Z",
    ),
  );
  const started = startExerciseSet(
    camera.session,
    { setId: camera.session.sets[0]!.id, mode: "camera" },
    camera.factory,
  );
  assert.equal(started.ok, true);
  if (!started.ok) return;
  const staged = stageMotionSetResult(
    started.value,
    { setId: started.value.sets[0]!.id, aggregate: motionAggregate() },
    camera.factory,
  );
  assert.equal(staged.ok, true);
  if (!staged.ok) return;

  const completed = completeMotionSetCheckIn(
    staged.value,
    { setId: staged.value.sets[0]!.id, rpe: 4, pain: 2 },
    camera.factory,
  );
  assert.equal(completed.ok, true);
  if (!completed.ok) return;
  assert.equal(completed.value.transitionRevision, 3);
  const resolved = completed.value.sets[0]!;
  assert.equal(resolved.status, "completed");
  assert.equal(resolved.completionKind, "full");
  assert.equal(resolved.actual?.completedReps, 8);
  assert.equal(resolved.actual?.durationSeconds, 30);
  assert.equal(
    resolved.actual?.motion?.actual.detectedRepetitionWindowSeconds,
    24.5,
  );
  assert.equal(resolved.actual?.rpe, 4);
  assert.equal(resolved.actual?.pain, 2);
  assert.equal(resolved.motionAttempt, undefined);
  assert.equal(completed.value.painEvents.length, 1);
  assert.equal(staged.value.sets[0]!.motionAttempt?.status, "awaiting_check_in");

  const genericCompletion = completeExerciseSet(
    staged.value,
    {
      setId: staged.value.sets[0]!.id,
      completedReps: 8,
      durationSeconds: 1,
      rpe: 4,
      pain: 2,
    },
    camera.factory,
  );
  assert.equal(genericCompletion.ok, false);
  if (!genericCompletion.ok) {
    assert.equal(genericCompletion.errors[0]?.code, "camera_check_in_required");
  }
});

test("camera check-in requires explicit RPE and pain", () => {
  const camera = makeCameraSession();
  const started = startExerciseSet(
    camera.session,
    { setId: camera.session.sets[0]!.id, mode: "camera" },
    camera.factory,
  );
  assert.equal(started.ok, true);
  if (!started.ok) return;
  const staged = stageMotionSetResult(
    started.value,
    { setId: started.value.sets[0]!.id, aggregate: motionAggregate() },
    camera.factory,
  );
  assert.equal(staged.ok, true);
  if (!staged.ok) return;

  for (const input of [
    { setId: staged.value.sets[0]!.id, rpe: undefined, pain: 0 },
    { setId: staged.value.sets[0]!.id, rpe: 3, pain: undefined },
    { setId: staged.value.sets[0]!.id, rpe: 11, pain: 0 },
    { setId: staged.value.sets[0]!.id, rpe: 3, pain: Number.NaN },
  ]) {
    const result = completeMotionSetCheckIn(
      staged.value,
      input as { setId: string; rpe: number; pain: number },
      camera.factory,
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.errors[0]?.code, "invalid_score");
  }
  assert.equal(staged.value.sets[0]!.status, "active");
  assert.equal(staged.value.sets[0]!.actual, undefined);
});

test("camera check-in fails closed when domain timestamps are out of order", () => {
  const camera = makeCameraSession(
    sequenceFactory(
      "2026-08-28T08:00:00.000Z",
      "2026-08-28T08:00:10.000Z",
      "2026-08-28T08:00:20.000Z",
      "2026-08-28T08:00:15.000Z",
    ),
  );
  const started = startExerciseSet(
    camera.session,
    { setId: camera.session.sets[0]!.id, mode: "camera" },
    camera.factory,
  );
  assert.equal(started.ok, true);
  if (!started.ok) return;
  const staged = stageMotionSetResult(
    started.value,
    { setId: started.value.sets[0]!.id, aggregate: motionAggregate() },
    camera.factory,
  );
  assert.equal(staged.ok, true);
  if (!staged.ok) return;
  const result = completeMotionSetCheckIn(
    staged.value,
    { setId: staged.value.sets[0]!.id, rpe: 3, pain: 1 },
    camera.factory,
  );
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.errors[0]?.code, "invalid_session_timing");
    assert.equal(result.errors[0]?.recoverable, false);
  }
  assert.equal(staged.value.sets[0]!.status, "active");
  assert.equal(staged.value.sets[0]!.actual, undefined);
});

test("camera check-in preserves completed partial and stopped outcomes", () => {
  const partial = makeCameraSession();
  const partialStart = startExerciseSet(
    partial.session,
    { setId: partial.session.sets[0]!.id, mode: "camera" },
    partial.factory,
  );
  assert.equal(partialStart.ok, true);
  if (!partialStart.ok) return;
  const partialStage = stageMotionSetResult(
    partialStart.value,
    {
      setId: partialStart.value.sets[0]!.id,
      aggregate: motionAggregate({ completedRepetitions: 3 }),
    },
    partial.factory,
  );
  assert.equal(partialStage.ok, true);
  if (!partialStage.ok) return;
  const partialComplete = completeMotionSetCheckIn(
    partialStage.value,
    { setId: partialStage.value.sets[0]!.id, rpe: 5, pain: 1 },
    partial.factory,
  );
  assert.equal(partialComplete.ok, true);
  if (!partialComplete.ok) return;
  assert.equal(partialComplete.value.sets[0]!.status, "completed");
  assert.equal(partialComplete.value.sets[0]!.completionKind, "partial");
  assert.equal(partialComplete.value.sets[0]!.actual?.completedReps, 3);

  const stopped = makeCameraSession();
  const stoppedStart = startExerciseSet(
    stopped.session,
    { setId: stopped.session.sets[0]!.id, mode: "camera" },
    stopped.factory,
  );
  assert.equal(stoppedStart.ok, true);
  if (!stoppedStart.ok) return;
  const missingReason = stageMotionSetResult(
    stoppedStart.value,
    {
      setId: stoppedStart.value.sets[0]!.id,
      aggregate: motionAggregate({ outcome: "stopped", completedRepetitions: 2 }),
    },
    stopped.factory,
  );
  assert.equal(missingReason.ok, false);
  if (!missingReason.ok) {
    assert.equal(missingReason.errors[0]?.code, "stop_reason_required");
  }
  const stoppedStage = stageMotionSetResult(
    stoppedStart.value,
    {
      setId: stoppedStart.value.sets[0]!.id,
      aggregate: motionAggregate({ outcome: "stopped", completedRepetitions: 2 }),
      stopReason: "Patient ended the camera set early.",
    },
    stopped.factory,
  );
  assert.equal(stoppedStage.ok, true);
  if (!stoppedStage.ok) return;
  const stoppedComplete = completeMotionSetCheckIn(
    stoppedStage.value,
    { setId: stoppedStage.value.sets[0]!.id, rpe: 4, pain: 2 },
    stopped.factory,
  );
  assert.equal(stoppedComplete.ok, true);
  if (!stoppedComplete.ok) return;
  assert.equal(stoppedComplete.value.sets[0]!.status, "stopped");
  assert.equal(stoppedComplete.value.sets[0]!.completionKind, undefined);
  assert.equal(stoppedComplete.value.sets[0]!.actual?.completedReps, 2);
  assert.equal(
    stoppedComplete.value.sets[0]!.stopReason,
    "Patient ended the camera set early.",
  );
});

test("pain gate wins camera completion races and blocks the next set", () => {
  const gated = makeCameraSession();
  const gatedStart = startExerciseSet(
    gated.session,
    { setId: gated.session.sets[0]!.id, mode: "camera" },
    gated.factory,
  );
  assert.equal(gatedStart.ok, true);
  if (!gatedStart.ok) return;
  const gatedStage = stageMotionSetResult(
    gatedStart.value,
    { setId: gatedStart.value.sets[0]!.id, aggregate: motionAggregate() },
    gated.factory,
  );
  assert.equal(gatedStage.ok, true);
  if (!gatedStage.ok) return;
  const gatedCheckIn = completeMotionSetCheckIn(
    gatedStage.value,
    { setId: gatedStage.value.sets[0]!.id, rpe: 6, pain: 5 },
    gated.factory,
  );
  assert.equal(gatedCheckIn.ok, true);
  if (!gatedCheckIn.ok) return;
  assert.equal(gatedCheckIn.value.status, "paused");
  assert.equal(gatedCheckIn.value.safetyGate.active, true);
  assert.equal(gatedCheckIn.value.sets[0]!.status, "completed");
  const next = startExerciseSet(
    gatedCheckIn.value,
    { setId: gatedCheckIn.value.sets[1]!.id, mode: "manual" },
    gated.factory,
  );
  assert.equal(next.ok, false);

  const raced = makeCameraSession();
  const racedStart = startExerciseSet(
    raced.session,
    { setId: raced.session.sets[0]!.id, mode: "camera" },
    raced.factory,
  );
  assert.equal(racedStart.ok, true);
  if (!racedStart.ok) return;
  const racedStage = stageMotionSetResult(
    racedStart.value,
    { setId: racedStart.value.sets[0]!.id, aggregate: motionAggregate() },
    raced.factory,
  );
  assert.equal(racedStage.ok, true);
  if (!racedStage.ok) return;
  const painFirst = logPain(
    racedStage.value,
    { pain: 5, note: "Pain reported before camera check-in committed." },
    raced.factory,
  );
  assert.equal(painFirst.ok, true);
  if (!painFirst.ok) return;
  assert.equal(painFirst.value.sets[0]!.status, "stopped");
  assert.equal(painFirst.value.sets[0]!.motionAttempt, undefined);
  const staleCompletion = completeMotionSetCheckIn(
    painFirst.value,
    { setId: painFirst.value.sets[0]!.id, rpe: 4, pain: 1 },
    raced.factory,
  );
  assert.equal(staleCompletion.ok, false);
  if (!staleCompletion.ok) {
    assert.equal(staleCompletion.errors[0]?.code, "pain_safety_gate");
  }
  assert.equal(painFirst.value.sets[0]!.actual?.motion, undefined);
});

test("global Stop clears an unconsumed camera attempt instead of bypassing check-in", () => {
  const camera = makeCameraSession();
  const started = startExerciseSet(
    camera.session,
    { setId: camera.session.sets[0]!.id, mode: "camera" },
    camera.factory,
  );
  assert.equal(started.ok, true);
  if (!started.ok) return;
  const staged = stageMotionSetResult(
    started.value,
    { setId: started.value.sets[0]!.id, aggregate: motionAggregate() },
    camera.factory,
  );
  assert.equal(staged.ok, true);
  if (!staged.ok) return;

  const stopped = stopSession(
    staged.value,
    { reason: "Patient stopped before check-in." },
    camera.factory,
  );
  assert.equal(stopped.ok, true);
  if (!stopped.ok) return;
  assert.equal(stopped.value.sets[0]!.status, "stopped");
  assert.equal(stopped.value.sets[0]!.motionAttempt, undefined);
  assert.equal(stopped.value.sets[0]!.actual?.motion, undefined);
  const staleCompletion = completeMotionSetCheckIn(
    stopped.value,
    { setId: stopped.value.sets[0]!.id, rpe: 3, pain: 1 },
    camera.factory,
  );
  assert.equal(staleCompletion.ok, false);
  if (!staleCompletion.ok) {
    assert.equal(staleCompletion.errors[0]?.code, "session_closed");
  }
});

test("stages one evidence-linked next-set focus and requires a human decision before start", () => {
  const checkedIn = makeCheckedInCameraSession();
  assert.equal(checkedIn.session.transitionRevision, 3);
  const targetBefore = structuredClone(checkedIn.session.sets[1]!);

  const staged = stageNextSetFocus(
    checkedIn.session,
    {
      expectedTransitionRevision: 3,
      focusText: "  Keep the next set smooth and controlled.  ",
      evidenceCode: "target_completed",
    },
    checkedIn.factory,
  );
  assert.equal(staged.ok, true);
  if (!staged.ok) return;
  assert.equal(staged.value.transitionRevision, 4);
  assert.equal(checkedIn.session.coachingFocuses.length, 0);
  assert.equal(staged.value.coachingFocuses.length, 1);
  const focus = staged.value.coachingFocuses[0]!;
  assert.equal(focus.status, "pending");
  assert.equal(focus.source, "agent");
  assert.equal(focus.focusText, "Keep the next set smooth and controlled.");
  assert.equal(focus.evidenceCode, "target_completed");
  assert.equal(focus.basedOnSetId, staged.value.sets[0]!.id);
  assert.equal(focus.targetSetId, staged.value.sets[1]!.id);
  assert.equal(focus.decidedAt, undefined);

  const blockedStart = startExerciseSet(
    staged.value,
    { setId: staged.value.sets[1]!.id, mode: "manual" },
    checkedIn.factory,
  );
  assert.equal(blockedStart.ok, false);
  if (!blockedStart.ok) {
    assert.equal(blockedStart.errors[0]?.code, "focus_decision_required");
  }
  assert.equal(staged.value.transitionRevision, 4);

  const accepted = acceptNextSetFocus(
    staged.value,
    { focusId: focus.id, expectedTransitionRevision: 4 },
    checkedIn.factory,
  );
  assert.equal(accepted.ok, true);
  if (!accepted.ok) return;
  assert.equal(accepted.value.transitionRevision, 5);
  assert.equal(accepted.value.coachingFocuses.length, 1);
  assert.equal(accepted.value.coachingFocuses[0]!.status, "accepted");
  assert.ok(accepted.value.coachingFocuses[0]!.decidedAt);
  assert.equal(staged.value.coachingFocuses[0]!.status, "pending");
  assert.deepEqual(accepted.value.sets[1], targetBefore);

  const allowedStart = startExerciseSet(
    accepted.value,
    { setId: accepted.value.sets[1]!.id, mode: "manual" },
    checkedIn.factory,
  );
  assert.equal(allowedStart.ok, true);
  if (!allowedStart.ok) return;
  assert.equal(allowedStart.value.transitionRevision, 6);
  assert.deepEqual(
    allowedStart.value.sets[1]!.prescribedTarget,
    targetBefore.prescribedTarget,
  );
});

test("human dismissal preserves append-only focus history and permits the target set", () => {
  const checkedIn = makeCheckedInCameraSession();
  const staged = stageNextSetFocus(
    checkedIn.session,
    {
      expectedTransitionRevision: checkedIn.session.transitionRevision,
      focusText: "Keep the detected range consistent.",
      evidenceCode: "range_consistent",
    },
    checkedIn.factory,
  );
  assert.equal(staged.ok, true);
  if (!staged.ok) return;
  const focus = staged.value.coachingFocuses[0]!;
  const dismissed = dismissNextSetFocus(
    staged.value,
    {
      focusId: focus.id,
      expectedTransitionRevision: staged.value.transitionRevision,
    },
    checkedIn.factory,
  );
  assert.equal(dismissed.ok, true);
  if (!dismissed.ok) return;
  assert.equal(
    dismissed.value.transitionRevision,
    staged.value.transitionRevision + 1,
  );
  assert.equal(dismissed.value.coachingFocuses.length, 1);
  assert.equal(dismissed.value.coachingFocuses[0]!.id, focus.id);
  assert.equal(dismissed.value.coachingFocuses[0]!.status, "dismissed");
  assert.ok(dismissed.value.coachingFocuses[0]!.decidedAt);

  const duplicate = stageNextSetFocus(
    dismissed.value,
    {
      expectedTransitionRevision: dismissed.value.transitionRevision,
      focusText: "A second suggestion for the same result.",
      evidenceCode: "target_completed",
    },
    checkedIn.factory,
  );
  assert.equal(duplicate.ok, false);
  if (!duplicate.ok) {
    assert.equal(duplicate.errors[0]?.code, "focus_already_staged");
  }
  const allowedStart = startExerciseSet(
    dismissed.value,
    { setId: dismissed.value.sets[1]!.id, mode: "manual" },
    checkedIn.factory,
  );
  assert.equal(allowedStart.ok, true);
});

test("focus evidence is limited to facts supported by the latest checked-in camera result", () => {
  const highEffort = makeCheckedInCameraSession({ rpe: 8 });
  const highEffortFocus = stageNextSetFocus(
    highEffort.session,
    {
      expectedTransitionRevision: highEffort.session.transitionRevision,
      focusText: "Use a calm pace after the reported effort.",
      evidenceCode: "high_effort",
    },
    highEffort.factory,
  );
  assert.equal(highEffortFocus.ok, true);

  const lowEffort = makeCheckedInCameraSession({ rpe: 6 });
  const unsupportedEffort = stageNextSetFocus(
    lowEffort.session,
    {
      expectedTransitionRevision: lowEffort.session.transitionRevision,
      focusText: "Unsupported high-effort focus.",
      evidenceCode: "high_effort",
    },
    lowEffort.factory,
  );
  assert.equal(unsupportedEffort.ok, false);
  if (!unsupportedEffort.ok) {
    assert.equal(unsupportedEffort.errors[0]?.code, "unsupported_focus_evidence");
  }

  const decliningRange = makeCheckedInCameraSession({
    aggregate: motionAggregate({ qualityFlags: ["range_decline"] }),
  });
  const unsupportedConsistency = stageNextSetFocus(
    decliningRange.session,
    {
      expectedTransitionRevision: decliningRange.session.transitionRevision,
      focusText: "Unsupported range-consistency focus.",
      evidenceCode: "range_consistent",
    },
    decliningRange.factory,
  );
  assert.equal(unsupportedConsistency.ok, false);
  if (!unsupportedConsistency.ok) {
    assert.equal(
      unsupportedConsistency.errors[0]?.code,
      "unsupported_focus_evidence",
    );
  }

  const partial = makeCheckedInCameraSession({
    aggregate: motionAggregate({ completedRepetitions: 3 }),
  });
  const unsupportedTarget = stageNextSetFocus(
    partial.session,
    {
      expectedTransitionRevision: partial.session.transitionRevision,
      focusText: "Unsupported target-completion focus.",
      evidenceCode: "target_completed",
    },
    partial.factory,
  );
  assert.equal(unsupportedTarget.ok, false);
  if (!unsupportedTarget.ok) {
    assert.equal(unsupportedTarget.errors[0]?.code, "unsupported_focus_evidence");
  }

  const invalidDepthCode = stageNextSetFocus(
    lowEffort.session,
    {
      expectedTransitionRevision: lowEffort.session.transitionRevision,
      focusText: "Do not create depth-as-go-deeper evidence.",
      evidenceCode: "limited_depth" as "target_completed",
    },
    lowEffort.factory,
  );
  assert.equal(invalidDepthCode.ok, false);
  if (!invalidDepthCode.ok) {
    assert.equal(invalidDepthCode.errors[0]?.code, "invalid_evidence_code");
  }
});

test("focus staging is revision-guarded, bounded, camera-only, and pain-safe", () => {
  const checkedIn = makeCheckedInCameraSession();
  const stale = stageNextSetFocus(
    checkedIn.session,
    {
      expectedTransitionRevision: checkedIn.session.transitionRevision - 1,
      focusText: "Stale suggestion.",
      evidenceCode: "target_completed",
    },
    checkedIn.factory,
  );
  assert.equal(stale.ok, false);
  if (!stale.ok) {
    assert.equal(stale.errors[0]?.code, "transition_revision_conflict");
  }
  assert.deepEqual(checkedIn.session.coachingFocuses, []);

  for (const focusText of ["   ", "x".repeat(241)]) {
    const invalid = stageNextSetFocus(
      checkedIn.session,
      {
        expectedTransitionRevision: checkedIn.session.transitionRevision,
        focusText,
        evidenceCode: "target_completed",
      },
      checkedIn.factory,
    );
    assert.equal(invalid.ok, false);
    if (!invalid.ok) {
      assert.equal(invalid.errors[0]?.code, "invalid_focus_text");
    }
  }

  const staged = stageNextSetFocus(
    checkedIn.session,
    {
      expectedTransitionRevision: checkedIn.session.transitionRevision,
      focusText: "A pending focus before a pain report.",
      evidenceCode: "target_completed",
    },
    checkedIn.factory,
  );
  assert.equal(staged.ok, true);
  if (!staged.ok) return;
  const pain = logPain(
    staged.value,
    { pain: 5, note: "Pain takes priority over the pending focus." },
    checkedIn.factory,
  );
  assert.equal(pain.ok, true);
  if (!pain.ok) return;

  const staleAccept = acceptNextSetFocus(
    pain.value,
    {
      focusId: pain.value.coachingFocuses[0]!.id,
      expectedTransitionRevision: staged.value.transitionRevision,
    },
    checkedIn.factory,
  );
  assert.equal(staleAccept.ok, false);
  if (!staleAccept.ok) {
    assert.equal(staleAccept.errors[0]?.code, "transition_revision_conflict");
  }
  const gatedAccept = acceptNextSetFocus(
    pain.value,
    {
      focusId: pain.value.coachingFocuses[0]!.id,
      expectedTransitionRevision: pain.value.transitionRevision,
    },
    checkedIn.factory,
  );
  assert.equal(gatedAccept.ok, false);
  if (!gatedAccept.ok) {
    assert.equal(gatedAccept.errors[0]?.code, "pain_safety_gate");
  }
  const safeDismiss = dismissNextSetFocus(
    pain.value,
    {
      focusId: pain.value.coachingFocuses[0]!.id,
      expectedTransitionRevision: pain.value.transitionRevision,
    },
    checkedIn.factory,
  );
  assert.equal(safeDismiss.ok, true);
  if (safeDismiss.ok) {
    assert.equal(safeDismiss.value.safetyGate.active, true);
    assert.equal(safeDismiss.value.status, "paused");
    assert.equal(safeDismiss.value.coachingFocuses[0]!.status, "dismissed");
  }

  const manual = makeSession();
  const manualStart = startExerciseSet(
    manual,
    { setId: manual.sets[0]!.id, mode: "manual" },
    factory,
  );
  assert.equal(manualStart.ok, true);
  if (!manualStart.ok) return;
  const manualComplete = completeExerciseSet(
    manualStart.value,
    {
      setId: manualStart.value.sets[0]!.id,
      completedReps: 8,
      durationSeconds: 30,
      rpe: 8,
      pain: 1,
    },
    factory,
  );
  assert.equal(manualComplete.ok, true);
  if (!manualComplete.ok) return;
  const cameraRequired = stageNextSetFocus(
    manualComplete.value,
    {
      expectedTransitionRevision: manualComplete.value.transitionRevision,
      focusText: "Manual results cannot back a camera focus.",
      evidenceCode: "high_effort",
    },
    factory,
  );
  assert.equal(cameraRequired.ok, false);
  if (!cameraRequired.ok) {
    assert.equal(
      cameraRequired.errors[0]?.code,
      "completed_camera_result_required",
    );
  }

  const wrongNext = makeCheckedInCameraSession();
  const mismatchedNext = {
    ...wrongNext.session,
    sets: wrongNext.session.sets.map((set, index) =>
      index === 1
        ? { ...set, exerciseId: "heel-raise", exerciseName: "Supported Heel Raise" }
        : set,
    ),
  };
  const sameExerciseRequired = stageNextSetFocus(
    mismatchedNext,
    {
      expectedTransitionRevision: mismatchedNext.transitionRevision,
      focusText: "This target belongs to a different exercise.",
      evidenceCode: "target_completed",
    },
    wrongNext.factory,
  );
  assert.equal(sameExerciseRequired.ok, false);
  if (!sameExerciseRequired.ok) {
    assert.equal(
      sameExerciseRequired.errors[0]?.code,
      "same_exercise_next_set_required",
    );
  }
});

test("motion aggregates are deeply cloned across later session transitions", () => {
  const camera = makeCameraSession();
  const started = startExerciseSet(
    camera.session,
    { setId: camera.session.sets[0]!.id, mode: "camera" },
    camera.factory,
  );
  assert.equal(started.ok, true);
  if (!started.ok) return;
  const staged = stageMotionSetResult(
    started.value,
    { setId: started.value.sets[0]!.id, aggregate: motionAggregate() },
    camera.factory,
  );
  assert.equal(staged.ok, true);
  if (!staged.ok) return;
  const paused = pauseSession(staged.value, camera.factory);
  assert.equal(paused.ok, true);
  if (!paused.ok) return;

  const pausedAggregate = paused.value.sets[0]!.motionAttempt!.aggregate;
  assert.notEqual(
    pausedAggregate,
    staged.value.sets[0]!.motionAttempt!.aggregate,
  );
  (
    pausedAggregate.measurements as {
      averageDetectedKneeRangeDeg: number;
    }
  ).averageDetectedKneeRangeDeg = 1;
  assert.equal(
    staged.value.sets[0]!.motionAttempt!.aggregate.measurements
      .averageDetectedKneeRangeDeg,
    47.2,
  );
});
