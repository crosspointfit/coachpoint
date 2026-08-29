import assert from "node:assert/strict";
import test from "node:test";

import { isTherapistWorkspaceSnapshot } from "../src/lib/therapistStorage.ts";

const caseContext = {
  patientLabel: "Synthetic shoulder case",
  diagnosis: "Shoulder mobility demo",
  goals: ["mobility"],
  minutesPerDay: 15,
  bodyRegion: "shoulder",
  postOpWeeks: 6,
  procedure: "Synthetic procedure",
  protocol: "Synthetic protocol",
  equipment: ["wall"],
};

test("workspace snapshot guard accepts a complete persisted draft", () => {
  assert.equal(
    isTherapistWorkspaceSnapshot({
      version: 1,
      caseContext,
      draft: {
        id: "draft_test",
        patientLabel: caseContext.patientLabel,
        caseContext,
        items: [
          {
            exerciseId: "wall-slide-flexion",
            sets: 2,
            reps: 8,
            frequencyPerDay: 1,
            restSeconds: 30,
          },
        ],
        estimatedMinutes: 3,
        warnings: ["Therapist review required."],
        createdAt: "2026-08-29T00:00:00.000Z",
        source: "agent",
        revision: 1,
      },
      confirmedProgram: null,
      activities: [
        {
          id: "activity_test",
          actor: "agent",
          action: "Created a draft.",
          detail: "One movement.",
          createdAt: "2026-08-29T00:00:00.000Z",
        },
      ],
    }),
    true,
  );
});

test("workspace snapshot guard rejects corrupted nested state", () => {
  assert.equal(
    isTherapistWorkspaceSnapshot({
      version: 1,
      caseContext,
      draft: {
        id: "draft_broken",
        patientLabel: caseContext.patientLabel,
        caseContext,
        items: [{}],
        estimatedMinutes: "3",
        warnings: [],
        createdAt: "2026-08-29T00:00:00.000Z",
        source: "agent",
        revision: 1,
      },
      confirmedProgram: null,
      activities: [],
    }),
    false,
  );
});
