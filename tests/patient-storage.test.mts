import assert from "node:assert/strict";
import test from "node:test";

import type { PatientSession } from "../src/domain/session-types.ts";
import {
  clearPatientSession,
  isPatientSession,
  readPatientSession,
  writePatientSession,
} from "../src/lib/patientStorage.ts";

const CODE = "CP_TEST_SESSION";
const OTHER_CODE = "CP_OTHER_SESSION";
const V1_KEY = `coachpoint:patient-session:v1:${CODE}`;
const V2_KEY = `coachpoint:patient-session:v2:${CODE}`;
const TIMESTAMP = "2026-09-01T08:00:00.000Z";

const BASE_SESSION: PatientSession = {
  id: "session_1",
  program: {
    id: "program_1",
    code: CODE,
    revision: 1,
    patientLabel: "Synthetic Test Client",
    confirmedAt: TIMESTAMP,
  },
  status: "not_started",
  sets: [
    {
      id: "set_1",
      sequence: 0,
      programItemIndex: 0,
      exerciseId: "half-squat",
      exerciseName: "Supported Half Squat",
      exerciseNameZh: "半蹲",
      prescribedCoachingMode: "camera",
      prescribedTarget: {
        reps: 6,
        restSeconds: 45,
        frequencyInstance: 1,
        setNumber: 1,
      },
      status: "planned",
    },
  ],
  painEvents: [],
  safetyGate: {
    active: false,
    threshold: 5,
  },
  createdAt: TIMESTAMP,
};

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();
  readonly removedKeys: string[] = [];
  failSetKey: string | null = null;

  get length(): number {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.removedKeys.push(key);
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    if (key === this.failSetKey) {
      throw new DOMException("Storage quota exceeded", "QuotaExceededError");
    }
    this.values.set(key, value);
  }
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

async function withStorage(
  storage: MemoryStorage,
  run: () => void | Promise<void>,
): Promise<void> {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { localStorage: storage },
  });
  try {
    await run();
  } finally {
    if (previousWindow) {
      Object.defineProperty(globalThis, "window", previousWindow);
    } else {
      Reflect.deleteProperty(globalThis, "window");
    }
  }
}

function completedSession(): PatientSession {
  return {
    ...clone(BASE_SESSION),
    status: "completed",
    startedAt: TIMESTAMP,
    completedAt: "2026-09-01T08:01:00.000Z",
    sets: [
      {
        ...clone(BASE_SESSION.sets[0]!),
        status: "completed",
        mode: "manual",
        startedAt: TIMESTAMP,
        completedAt: "2026-09-01T08:00:30.000Z",
        completionKind: "full",
        actual: {
          completedReps: 6,
          durationSeconds: 30,
          rpe: 3,
          pain: 1,
        },
      },
    ],
    painEvents: [
      {
        id: "pain_1",
        value: 1,
        setId: "set_1",
        recordedAt: "2026-09-01T08:00:30.000Z",
      },
    ],
    summary: {
      totalSets: 1,
      completedSets: 1,
      partialCompletedSets: 0,
      skippedSets: 0,
      stoppedSets: 0,
      completedReps: 6,
      completedHoldSeconds: 0,
      averageRpe: 3,
      highestPain: 1,
      startedAt: TIMESTAMP,
      completedAt: "2026-09-01T08:01:00.000Z",
    },
  };
}

function motionAggregate() {
  return {
    schemaVersion: 1,
    kind: "motion_set_aggregate",
    target: {
      exerciseId: "half-squat",
      exerciseName: "Supported Half Squat",
      targetRepetitions: 6,
      source: "therapist_confirmed",
    },
    outcome: "completed",
    actual: {
      completedRepetitions: 6,
      targetAchieved: true,
      detectedRepetitionWindowSeconds: 24.5,
    },
    measurements: {
      context: "camera_2d_demo_proxy",
      averageDetectedKneeRangeDeg: 47.2,
      detectedRangeDeclineDeg: 2.1,
    },
    qualityEventLabels: ["demo_depth_threshold_not_reached"],
    clinicalBoundary: {
      clinicalAssessment: false,
      intendedUse: "demo_coaching_support_only",
    },
    privacyBoundary: {
      patientIdentityIncluded: false,
      cameraDetailsIncluded: false,
      rawFramesIncluded: false,
      rawLandmarksIncluded: false,
      perRepTimeSeriesIncluded: false,
    },
    authorityBoundary: {
      targetIsTherapistConfirmed: true,
      agentCanStartCamera: false,
      agentCanStopCamera: false,
      agentCanControlSet: false,
      agentCanChangeTarget: false,
    },
  } as const;
}

test("writes a versioned V2 envelope and returns independent read clones", async () => {
  const storage = new MemoryStorage();
  await withStorage(storage, () => {
    const source = completedSession();
    assert.equal(writePatientSession(CODE, source), true);
    assert.equal(storage.getItem(V1_KEY), null);
    const raw = storage.getItem(V2_KEY);
    assert.ok(raw);
    const envelope = JSON.parse(raw) as Record<string, unknown>;
    assert.equal(envelope.version, 2);
    assert.equal(envelope.programCode, CODE);

    const first = readPatientSession<PatientSession>(CODE);
    const second = readPatientSession(CODE);
    assert.deepEqual(first, source);
    assert.deepEqual(second, source);
    assert.notEqual(first, second);
    assert.notEqual(first?.program, second?.program);
    assert.notEqual(first?.sets, second?.sets);

    if (first) {
      (first.sets[0] as { exerciseName: string }).exerciseName = "MUTATED";
    }
    assert.equal(readPatientSession(CODE)?.sets[0]?.exerciseName, "Supported Half Squat");
  });
});

test("migrates a valid V1 raw session and deletes V1 only after V2 commits", async () => {
  const storage = new MemoryStorage();
  storage.setItem(V1_KEY, JSON.stringify(BASE_SESSION));

  await withStorage(storage, () => {
    assert.deepEqual(readPatientSession(CODE), BASE_SESSION);
    assert.ok(storage.getItem(V2_KEY));
    assert.equal(storage.getItem(V1_KEY), null);
    assert.equal(storage.removedKeys.includes(V1_KEY), true);
  });
});

test("keeps valid V1 data readable and intact when its V2 migration write fails", async () => {
  const storage = new MemoryStorage();
  storage.setItem(V1_KEY, JSON.stringify(BASE_SESSION));
  storage.failSetKey = V2_KEY;

  await withStorage(storage, () => {
    assert.deepEqual(readPatientSession(CODE), BASE_SESSION);
    assert.equal(storage.getItem(V2_KEY), null);
    assert.ok(storage.getItem(V1_KEY));
    assert.equal(storage.removedKeys.includes(V1_KEY), false);
  });
});

test("rejects cross-code writes and cross-code V2 envelopes", async () => {
  const storage = new MemoryStorage();
  await withStorage(storage, () => {
    const foreign = {
      ...clone(BASE_SESSION),
      program: { ...BASE_SESSION.program, code: OTHER_CODE },
    } as PatientSession;
    assert.equal(writePatientSession(CODE, foreign), false);
    assert.equal(storage.getItem(V2_KEY), null);

    storage.setItem(V2_KEY, JSON.stringify({
      version: 2,
      programCode: OTHER_CODE,
      session: BASE_SESSION,
    }));
    assert.equal(readPatientSession(CODE), null);
  });
});

test("a corrupt V2 value is rejected without rolling back to a valid V1 session", async () => {
  const storage = new MemoryStorage();
  storage.setItem(V1_KEY, JSON.stringify(BASE_SESSION));
  storage.setItem(V2_KEY, JSON.stringify({
    version: 2,
    programCode: CODE,
    session: { ...BASE_SESSION, status: "forged" },
  }));

  await withStorage(storage, () => {
    assert.equal(readPatientSession(CODE), null);
    assert.ok(storage.getItem(V1_KEY));
    assert.ok(storage.getItem(V2_KEY));
  });
});

test("rejects malformed, non-finite and prototype-polluted persisted values", async () => {
  const storage = new MemoryStorage();
  await withStorage(storage, () => {
    storage.setItem(V2_KEY, "{not-json");
    assert.equal(readPatientSession(CODE), null);

    const nonFinite = JSON.stringify({
      version: 2,
      programCode: CODE,
      session: BASE_SESSION,
    }).replace('"restSeconds":45', '"restSeconds":1e999');
    storage.setItem(V2_KEY, nonFinite);
    assert.equal(readPatientSession(CODE), null);

    const polluted = clone(BASE_SESSION) as PatientSession & Record<string, unknown>;
    Object.defineProperty(polluted, "__proto__", {
      enumerable: true,
      value: { status: "completed" },
    });
    storage.setItem(V2_KEY, JSON.stringify({
      version: 2,
      programCode: CODE,
      session: polluted,
    }));
    assert.equal(readPatientSession(CODE), null);
  });
});

test("rejects inherited, accessor and unknown nested fields before writing", async () => {
  const storage = new MemoryStorage();
  await withStorage(storage, () => {
    const inherited = Object.assign(
      Object.create({ status: "completed" }),
      clone(BASE_SESSION),
    ) as PatientSession;
    assert.equal(writePatientSession(CODE, inherited), false);

    const accessor = clone(BASE_SESSION) as PatientSession & Record<string, unknown>;
    Object.defineProperty(accessor, "status", {
      enumerable: true,
      get: () => "completed",
    });
    assert.equal(writePatientSession(CODE, accessor), false);

    const unknownNested = clone(BASE_SESSION) as PatientSession;
    Object.assign(unknownNested.sets[0]!, {
      rawLandmarks: [{ x: 0.5, y: 0.5 }],
    });
    assert.equal(writePatientSession(CODE, unknownNested), false);
    assert.equal(storage.getItem(V2_KEY), null);
  });
});

test("accepts only the allowlisted aggregate in motionAttempt and actual.motion", async () => {
  const storage = new MemoryStorage();
  await withStorage(storage, () => {
    const pending = clone(BASE_SESSION) as PatientSession;
    Object.assign(pending, { status: "active", startedAt: TIMESTAMP });
    Object.assign(pending.sets[0]!, {
      status: "active",
      mode: "camera",
      startedAt: TIMESTAMP,
      motionAttempt: {
        status: "awaiting_check_in",
        stagedAt: TIMESTAMP,
        aggregate: motionAggregate(),
      },
    });
    assert.equal(writePatientSession(CODE, pending), true);

    const resolved = completedSession();
    Object.assign(resolved.sets[0]!, { mode: "camera" });
    Object.assign(resolved.sets[0]!.actual!, { motion: motionAggregate() });
    assert.equal(writePatientSession(CODE, resolved), true);

    const unsafe = clone(pending);
    const attempt = (unsafe.sets[0] as unknown as {
      motionAttempt: { aggregate: Record<string, unknown> };
    }).motionAttempt;
    attempt.aggregate.rawFrames = ["SECRET_FRAME"];
    assert.equal(writePatientSession(CODE, unsafe), false);

    const wrongTarget = clone(pending);
    const target = (wrongTarget.sets[0] as unknown as {
      motionAttempt: { aggregate: { target: { exerciseId: string } } };
    }).motionAttempt.aggregate.target;
    target.exerciseId = "foreign-exercise";
    assert.equal(writePatientSession(CODE, wrongTarget), false);
  });
});

test("write failures are explicit and clearing removes both storage versions", async () => {
  const storage = new MemoryStorage();
  await withStorage(storage, () => {
    storage.failSetKey = V2_KEY;
    assert.equal(writePatientSession(CODE, BASE_SESSION), false);
    storage.failSetKey = null;
    storage.setItem(V1_KEY, JSON.stringify(BASE_SESSION));
    storage.setItem(V2_KEY, JSON.stringify({
      version: 2,
      programCode: CODE,
      session: BASE_SESSION,
    }));
    clearPatientSession(CODE);
    assert.equal(storage.getItem(V1_KEY), null);
    assert.equal(storage.getItem(V2_KEY), null);
  });
});

test("server-side and invalid-code calls fail closed", () => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  Reflect.deleteProperty(globalThis, "window");
  try {
    assert.equal(readPatientSession(CODE), null);
    assert.equal(writePatientSession(CODE, BASE_SESSION), false);
    assert.equal(readPatientSession(""), null);
    assert.equal(writePatientSession("", BASE_SESSION), false);
    assert.doesNotThrow(() => clearPatientSession(CODE));
  } finally {
    if (previousWindow) {
      Object.defineProperty(globalThis, "window", previousWindow);
    }
  }
});

test("the exported guard accepts domain sessions and rejects duplicate or foreign references", () => {
  assert.equal(isPatientSession(BASE_SESSION, CODE), true);
  assert.equal(isPatientSession(BASE_SESSION, OTHER_CODE), false);

  const duplicateSets = clone(BASE_SESSION) as PatientSession;
  (duplicateSets.sets as Array<PatientSession["sets"][number]>).push(
    clone(duplicateSets.sets[0]!),
  );
  assert.equal(isPatientSession(duplicateSets, CODE), false);

  const danglingPain = clone(BASE_SESSION) as PatientSession;
  (danglingPain.painEvents as Array<PatientSession["painEvents"][number]>).push({
    id: "pain_foreign",
    value: 2,
    setId: "missing_set",
    recordedAt: TIMESTAMP,
  });
  assert.equal(isPatientSession(danglingPain, CODE), false);
});
