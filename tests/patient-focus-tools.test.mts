import assert from "node:assert/strict";
import test from "node:test";

import type { PatientSession } from "../src/domain/session-types.ts";
import {
  createPatientFocusToolDescriptors,
  stageNextSetFocusSchema,
} from "../src/lib/webmcp/patient-focus-tools.ts";

const FIRST_COMPLETED_AT = "2026-09-02T01:01:00.000Z";

function motionAggregate() {
  return {
    schemaVersion: 1 as const,
    kind: "motion_set_aggregate" as const,
    target: {
      exerciseId: "half-squat",
      exerciseName: "Supported Half Squat",
      targetRepetitions: 8,
      source: "therapist_confirmed" as const,
    },
    outcome: "completed" as const,
    actual: {
      completedRepetitions: 8,
      targetAchieved: true,
      detectedRepetitionWindowSeconds: 26.1,
    },
    measurements: {
      context: "camera_2d_demo_proxy" as const,
      averageDetectedKneeRangeDeg: 57.8,
      detectedRangeDeclineDeg: 1.1,
    },
    qualityEventLabels: ["demo_depth_threshold_not_reached"] as const,
    clinicalBoundary: {
      clinicalAssessment: false as const,
      intendedUse: "demo_coaching_support_only" as const,
    },
    privacyBoundary: {
      patientIdentityIncluded: false as const,
      cameraDetailsIncluded: false as const,
      rawFramesIncluded: false as const,
      rawLandmarksIncluded: false as const,
      perRepTimeSeriesIncluded: false as const,
    },
    authorityBoundary: {
      targetIsTherapistConfirmed: true,
      agentCanStartCamera: false as const,
      agentCanStopCamera: false as const,
      agentCanControlSet: false as const,
      agentCanChangeTarget: false as const,
    },
  };
}

function sessionFixture(): PatientSession {
  const baseSet = {
    programItemIndex: 0,
    exerciseId: "half-squat",
    exerciseName: "Supported Half Squat",
    exerciseNameZh: "半蹲",
    prescribedCoachingMode: "camera" as const,
    prescribedTarget: {
      reps: 8,
      restSeconds: 45,
      frequencyInstance: 1,
      setNumber: 1,
    },
  };
  return {
    id: "session_private",
    program: {
      id: "program_private",
      code: "CODE_PRIVATE",
      revision: 2,
      patientLabel: "Synthetic client",
      confirmedAt: "2026-09-02T01:00:00.000Z",
    },
    transitionRevision: 3,
    status: "active",
    sets: [
      {
        ...baseSet,
        id: "set_1",
        sequence: 0,
        status: "completed",
        mode: "camera",
        startedAt: "2026-09-02T01:00:20.000Z",
        completedAt: FIRST_COMPLETED_AT,
        completionKind: "full",
        actual: {
          completedReps: 8,
          durationSeconds: 40,
          rpe: 8,
          pain: 0,
          motion: motionAggregate(),
        },
      },
      {
        ...baseSet,
        id: "set_2",
        sequence: 1,
        status: "planned",
        prescribedTarget: {
          ...baseSet.prescribedTarget,
          setNumber: 2,
        },
      },
    ],
    painEvents: [],
    coachingFocuses: [],
    safetyGate: { active: false, threshold: 5 },
    createdAt: "2026-09-02T01:00:00.000Z",
    startedAt: "2026-09-02T01:00:20.000Z",
  };
}

test("stage focus descriptor is one conflict-safe human-review write", () => {
  const descriptor = createPatientFocusToolDescriptors({
    readVisibleSession: sessionFixture,
    commitVisibleSession: () => true,
  })[0]!;

  assert.equal(descriptor.name, "stage_next_set_focus");
  assert.equal(descriptor.annotations.readOnlyHint, false);
  assert.equal(descriptor.annotations.untrustedContentHint, true);
  assert.deepEqual(descriptor.inputSchema, stageNextSetFocusSchema);
  assert.equal(stageNextSetFocusSchema.additionalProperties, false);
  assert.match(descriptor.description, /human/i);
  assert.match(descriptor.description, /cannot start/i);
  assert.match(descriptor.description, /dosage/i);
});

test("stage focus commits one pending suggestion without returning private session data", async () => {
  let visible = sessionFixture();
  const descriptor = createPatientFocusToolDescriptors({
    readVisibleSession: () => visible,
    commitVisibleSession: (next) => {
      visible = next;
      return true;
    },
  })[0]!;

  const result = await descriptor.execute({
    expectedTransitionRevision: 3,
    focusText: "Keep the return to standing smooth and controlled.",
    evidenceCode: "high_effort",
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(visible.transitionRevision, 4);
  assert.equal(visible.coachingFocuses.length, 1);
  assert.equal(visible.coachingFocuses[0]?.status, "pending");
  const serialized = JSON.stringify(result.value);
  for (const privateValue of [
    "session_private",
    "program_private",
    "CODE_PRIVATE",
    "Synthetic client",
    "set_1",
    "set_2",
  ]) {
    assert.equal(serialized.includes(privateValue), false, privateValue);
  }
  assert.deepEqual(Object.keys(result.value as Record<string, unknown>).sort(), [
    "focus",
    "humanDecisionRequired",
    "prescriptionChanged",
    "sessionRevision",
    "status",
  ]);
});

test("stage focus rejects stale revision and unsupported evidence without committing", async () => {
  const visible = sessionFixture();
  let commits = 0;
  const descriptor = createPatientFocusToolDescriptors({
    readVisibleSession: () => visible,
    commitVisibleSession: () => {
      commits += 1;
      return true;
    },
  })[0]!;

  const stale = await descriptor.execute({
    expectedTransitionRevision: 2,
    focusText: "Stale focus.",
    evidenceCode: "target_completed",
  });
  assert.equal(stale.ok, false);
  if (!stale.ok) {
    assert.equal(stale.errors[0]?.code, "transition_revision_conflict");
  }

  (visible.sets[0]!.actual as { rpe: number }).rpe = 6;
  const unsupported = await descriptor.execute({
    expectedTransitionRevision: 3,
    focusText: "Unsupported evidence.",
    evidenceCode: "high_effort",
  });
  assert.equal(unsupported.ok, false);
  if (!unsupported.ok) {
    assert.equal(unsupported.errors[0]?.code, "unsupported_focus_evidence");
  }
  assert.equal(commits, 0);
});

test("stage focus validates exact plain input including hidden and inherited keys", async () => {
  const descriptor = createPatientFocusToolDescriptors({
    readVisibleSession: sessionFixture,
    commitVisibleSession: () => true,
  })[0]!;
  const valid = {
    expectedTransitionRevision: 3,
    focusText: "Keep a controlled pace.",
    evidenceCode: "target_completed",
  };
  const hidden = Object.defineProperty({ ...valid }, "setId", {
    value: "foreign",
    enumerable: false,
  });
  const inherited = Object.assign(Object.create({ setId: "foreign" }), valid);
  for (const input of [
    null,
    [],
    { ...valid, setId: "foreign" },
    { ...valid, expectedTransitionRevision: 1.5 },
    { ...valid, focusText: "" },
    { ...valid, evidenceCode: "limited_depth" },
    hidden,
    inherited,
  ]) {
    const result = await descriptor.execute(input);
    assert.equal(result.ok, false);
  }
});

test("stage focus fails visibly when persistence fails and honors early abort", async () => {
  const visible = sessionFixture();
  let getterCalls = 0;
  let commits = 0;
  const descriptor = createPatientFocusToolDescriptors({
    readVisibleSession: () => {
      getterCalls += 1;
      return visible;
    },
    commitVisibleSession: () => {
      commits += 1;
      return false;
    },
  })[0]!;
  const input = {
    expectedTransitionRevision: 3,
    focusText: "Keep the movement smooth.",
    evidenceCode: "target_completed",
  };
  const failed = await descriptor.execute(input);
  assert.equal(failed.ok, false);
  if (!failed.ok) assert.equal(failed.errors[0]?.code, "persistence_failed");
  assert.equal(commits, 1);
  assert.equal(visible.coachingFocuses.length, 0);

  const controller = new AbortController();
  controller.abort();
  const cancelled = await descriptor.execute(input, { signal: controller.signal });
  assert.equal(cancelled.ok, false);
  if (!cancelled.ok) assert.equal(cancelled.errors[0]?.code, "cancelled");
  assert.equal(getterCalls, 2);
  assert.equal(commits, 1);
});
