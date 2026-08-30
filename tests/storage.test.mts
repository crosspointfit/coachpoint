import assert from "node:assert/strict";
import test from "node:test";

import {
  isTherapistWorkspaceSnapshot,
  readConfirmedProgram,
} from "../src/lib/therapistStorage.ts";

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

test("patient lookup resolves route-scoped confirmations from the V2 caseload", () => {
  const code = "CP_V2PATIENT1";
  const confirmedProgram = {
    id: "draft_v2_patient",
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
    source: "therapist",
    revision: 2,
    code,
    confirmedAt: "2026-08-30T00:00:00.000Z",
    confirmedBy: "therapist",
  } as const;
  const values = new Map<string, string>([
    [
      "coachpoint:therapist-caseload:v2",
      JSON.stringify({
        version: 2,
        programsById: {
          program_v2_patient: {
            confirmedVersions: { [code]: confirmedProgram },
          },
        },
      }),
    ],
  ]);
  const previousWindow = globalThis.window;
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
      },
    },
  });
  try {
    assert.deepEqual(readConfirmedProgram(code), confirmedProgram);
  } finally {
    if (previousWindow === undefined) {
      Reflect.deleteProperty(globalThis, "window");
    } else {
      Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: previousWindow,
      });
    }
  }
});
