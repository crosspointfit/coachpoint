import assert from "node:assert/strict";
import test from "node:test";

import {
  completeExerciseSet,
  createPatientSession,
  finishSession,
  getSessionProgress,
  logPain,
  pauseSession,
  resumeSession,
  skipExercise,
  startExerciseSet,
  stopSession,
} from "../src/domain/session.ts";
import type { ConfirmedProgram } from "../src/domain/types.ts";

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
    const start = startExerciseSet(session, { setId: set.id, mode: "manual" }, factory);
    assert.equal(start.ok, true);
    if (!start.ok) return;
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
    session = complete.value;
  }
  assert.equal(getSessionProgress(session).isFinishable, true);
  const finished = finishSession(session, factory);
  assert.equal(finished.ok, true);
  if (!finished.ok) return;
  assert.equal(finished.value.status, "completed");
  assert.equal(finished.value.summary?.completedSets, 3);
  assert.equal(finished.value.summary?.averageRpe, 3);
});
