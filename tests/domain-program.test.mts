import assert from "node:assert/strict";
import test from "node:test";

import { getExerciseById } from "../src/domain/catalog.ts";
import {
  confirmProgram,
  createProgramDraft,
  estimateProgramDuration,
  validateCaseContext,
  validateDraft,
} from "../src/domain/program.ts";
import type { CaseContext, ProgramItem } from "../src/domain/types.ts";

const BASE_CONTEXT: CaseContext = {
  patientLabel: "Demo Patient A",
  diagnosis: "Therapist-entered shoulder mobility limitation",
  goals: ["comfortable shoulder mobility"],
  minutesPerDay: 15,
  bodyRegion: "shoulder",
  equipment: ["stick", "wall"],
};

function defaultItem(exerciseId: string): ProgramItem {
  const exercise = getExerciseById(exerciseId);
  assert.ok(exercise, `missing test exercise ${exerciseId}`);
  return { exerciseId, ...exercise.defaultDosage };
}

test("validateCaseContext returns a recoverable clarification for incomplete post-op context", () => {
  const result = validateCaseContext({
    ...BASE_CONTEXT,
    diagnosis: "Six weeks post-op shoulder case",
    postOpWeeks: 6,
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    const clarification = result.errors.find((error) => error.code === "needs_clarification");
    assert.ok(clarification);
    assert.equal(clarification.recoverable, true);
    assert.match(clarification.message, /procedure and protocol/i);
  }

  const completeResult = validateCaseContext({
    ...BASE_CONTEXT,
    diagnosis: "Six weeks post-op shoulder case",
    postOpWeeks: 6,
    procedure: "Synthetic demo procedure supplied by therapist",
    protocol: "Therapist-approved synthetic demo protocol",
  });
  assert.equal(completeResult.ok, true);
});

test("estimateProgramDuration uses dosage, rest, setup, and daily frequency", () => {
  const result = estimateProgramDuration([defaultItem("shoulder-flexion-stick")]);
  assert.deepEqual(result, { ok: true, value: 1.9 });

  const twiceDaily = {
    ...defaultItem("shoulder-flexion-stick"),
    frequencyPerDay: 2,
  };
  assert.deepEqual(estimateProgramDuration([twiceDaily]), { ok: true, value: 3.7 });
});

test("draft validation rejects unknown catalog IDs and invalid dosage", () => {
  const unknown = validateDraft(
    [
      {
        exerciseId: "invented-by-agent",
        sets: 2,
        reps: 8,
        frequencyPerDay: 1,
        restSeconds: 30,
      },
    ],
    { minutesPerDay: 15 },
  );
  assert.equal(unknown.ok, false);
  if (!unknown.ok) {
    assert.ok(unknown.errors.some((error) => error.code === "invalid_exercise_id"));
  }

  const invalidDose = validateDraft(
    [{ ...defaultItem("half-squat"), sets: 0, reps: 99 }],
    { minutesPerDay: 15 },
  );
  assert.equal(invalidDose.ok, false);
  if (!invalidDose.ok) {
    assert.ok(invalidDose.errors.filter((error) => error.code === "invalid_dosage").length >= 2);
  }
});

test("draft validation rejects a program that exceeds the daily time constraint", () => {
  const result = validateDraft(
    [
      {
        ...defaultItem("plantar-fascia-roll"),
        sets: 3,
        holdSeconds: 60,
        frequencyPerDay: 2,
        restSeconds: 120,
      },
    ],
    { minutesPerDay: 5 },
  );

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(result.errors.some((error) => error.code === "duration_exceeded"));
  }
});

test("createProgramDraft is deterministic with injected factories and labels agent drafts", () => {
  const result = createProgramDraft(
    {
      caseContext: BASE_CONTEXT,
      items: [defaultItem("shoulder-flexion-stick"), defaultItem("shoulder-pendulum")],
      source: "agent",
    },
    {
      id: () => "draft_demo_001",
      now: () => "2026-08-28T08:00:00.000Z",
    },
  );

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.id, "draft_demo_001");
    assert.equal(result.value.createdAt, "2026-08-28T08:00:00.000Z");
    assert.equal(result.value.source, "agent");
    assert.equal(result.value.estimatedMinutes, 3.6);
    assert.match(result.value.warnings[0], /agent draft.*therapist review required/i);
  }
});

test("only a human therapist can confirm and the confirmation code is URL-safe", () => {
  const draftResult = createProgramDraft(
    {
      caseContext: BASE_CONTEXT,
      items: [defaultItem("wall-slide-flexion")],
    },
    {
      id: () => "draft_demo_002",
      now: () => "2026-08-28T08:00:00.000Z",
    },
  );
  assert.equal(draftResult.ok, true);
  if (!draftResult.ok) {
    return;
  }

  const agentAttempt = confirmProgram(draftResult.value, { actor: "agent" });
  assert.equal(agentAttempt.ok, false);
  if (!agentAttempt.ok) {
    assert.deepEqual(agentAttempt.errors.map((error) => error.code), [
      "human_confirmation_required",
    ]);
  }

  const confirmation = confirmProgram(
    draftResult.value,
    { actor: "therapist" },
    {
      code: () => "CP_DEMO_CODE_123456",
      now: () => "2026-08-28T09:00:00.000Z",
    },
  );
  assert.equal(confirmation.ok, true);
  if (confirmation.ok) {
    assert.equal(confirmation.value.code, "CP_DEMO_CODE_123456");
    assert.equal(confirmation.value.confirmedBy, "therapist");
    assert.equal(confirmation.value.confirmedAt, "2026-08-28T09:00:00.000Z");
  }
});

test("the default confirmation code carries a full UUID of entropy", () => {
  const draftResult = createProgramDraft(
    {
      caseContext: BASE_CONTEXT,
      items: [defaultItem("wall-slide-flexion")],
    },
    { id: () => "draft_demo_003", now: () => "2026-08-28T08:00:00.000Z" },
  );
  assert.equal(draftResult.ok, true);
  if (!draftResult.ok) {
    return;
  }

  const confirmation = confirmProgram(draftResult.value, { actor: "therapist" }, {
    now: () => "2026-08-28T09:00:00.000Z",
  });
  assert.equal(confirmation.ok, true);
  if (confirmation.ok) {
    assert.match(confirmation.value.code, /^CP_[A-F0-9]{32}$/);
    assert.ok(confirmation.value.code.length >= 10);
  }
});
