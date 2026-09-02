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
  transitionRevision: 0,
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
  coachingFocuses: [],
  safetyGate: {
    active: false,
    threshold: 5,
  },
  createdAt: TIMESTAMP,
};

function legacySessionWithoutTransitionFields(): Record<string, unknown> {
  const legacy = clone(BASE_SESSION) as unknown as Record<string, unknown>;
  delete legacy.transitionRevision;
  delete legacy.coachingFocuses;
  return legacy;
}

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

function focusReadySession(): PatientSession {
  const completed = completedSession();
  const basedOn = {
    ...completed.sets[0]!,
    mode: "camera" as const,
    actual: {
      ...completed.sets[0]!.actual!,
      motion: motionAggregate(),
    },
  };
  const target = {
    ...clone(BASE_SESSION.sets[0]!),
    id: "set_2",
    sequence: 1,
    prescribedTarget: { ...BASE_SESSION.sets[0]!.prescribedTarget },
  };
  return {
    ...clone(BASE_SESSION),
    transitionRevision: 5,
    status: "active",
    startedAt: TIMESTAMP,
    sets: [basedOn, target],
    painEvents: completed.painEvents.map((event) => ({ ...event })),
    coachingFocuses: [],
  };
}

function pendingFocus() {
  return {
    id: "focus_1",
    status: "pending" as const,
    source: "agent" as const,
    focusText: "Keep the next set smooth and controlled.",
    evidenceCode: "range_consistent" as const,
    basedOnSetId: "set_1",
    targetSetId: "set_2",
    stagedAt: "2026-09-01T08:00:40.000Z",
  };
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
  storage.setItem(V1_KEY, JSON.stringify(legacySessionWithoutTransitionFields()));

  await withStorage(storage, () => {
    assert.deepEqual(readPatientSession(CODE), BASE_SESSION);
    assert.ok(storage.getItem(V2_KEY));
    assert.equal(storage.getItem(V1_KEY), null);
    assert.equal(storage.removedKeys.includes(V1_KEY), true);
  });
});

test("normalizes legacy V2 transition fields and rewrites only the validated envelope", async () => {
  const storage = new MemoryStorage();
  storage.setItem(V2_KEY, JSON.stringify({
    version: 2,
    programCode: CODE,
    session: legacySessionWithoutTransitionFields(),
  }));

  await withStorage(storage, () => {
    const restored = readPatientSession(CODE);
    assert.deepEqual(restored, BASE_SESSION);
    const rewritten = JSON.parse(storage.getItem(V2_KEY) ?? "null") as {
      session?: Record<string, unknown>;
    };
    assert.equal(rewritten.session?.transitionRevision, 0);
    assert.deepEqual(rewritten.session?.coachingFocuses, []);
  });
});

test("a failed legacy V2 normalization rewrite leaves the old envelope intact", async () => {
  const storage = new MemoryStorage();
  const legacyEnvelope = JSON.stringify({
    version: 2,
    programCode: CODE,
    session: legacySessionWithoutTransitionFields(),
  });
  storage.setItem(V2_KEY, legacyEnvelope);
  storage.failSetKey = V2_KEY;

  await withStorage(storage, () => {
    assert.deepEqual(readPatientSession(CODE), BASE_SESSION);
    assert.equal(storage.getItem(V2_KEY), legacyEnvelope);
  });
});

test("keeps valid V1 data readable and intact when its V2 migration write fails", async () => {
  const storage = new MemoryStorage();
  storage.setItem(V1_KEY, JSON.stringify(legacySessionWithoutTransitionFields()));
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
  storage.setItem(V1_KEY, JSON.stringify(legacySessionWithoutTransitionFields()));
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
    Object.assign(resolved, { transitionRevision: 1 });
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

test("enforces monotonic revisions and append-only focus decisions", async () => {
  const storage = new MemoryStorage();
  await withStorage(storage, () => {
    const base = focusReadySession();
    assert.equal(writePatientSession(CODE, base), true);
    assert.equal(writePatientSession(CODE, clone(base)), true);

    const staged: PatientSession = {
      ...clone(base),
      transitionRevision: 6,
      coachingFocuses: [pendingFocus()],
    };
    assert.equal(writePatientSession(CODE, staged), true);

    const accepted: PatientSession = {
      ...clone(staged),
      transitionRevision: 7,
      coachingFocuses: [{
        ...pendingFocus(),
        status: "accepted",
        decidedAt: "2026-09-01T08:00:50.000Z",
      }],
    };
    assert.equal(writePatientSession(CODE, accepted), true);

    assert.equal(writePatientSession(CODE, { ...clone(accepted), transitionRevision: 6 }), false);
    assert.equal(writePatientSession(CODE, {
      ...clone(accepted),
      transitionRevision: 8,
      coachingFocuses: [],
    }), false);
    assert.equal(writePatientSession(CODE, {
      ...clone(accepted),
      transitionRevision: 8,
      coachingFocuses: [{
        ...accepted.coachingFocuses[0]!,
        focusText: "Changed after staging",
      }],
    }), false);
    assert.equal(writePatientSession(CODE, {
      ...clone(accepted),
      transitionRevision: 8,
      coachingFocuses: [pendingFocus()],
    }), false);
  });
});

test("validates focus revision, status timestamps, unique IDs and set references", async () => {
  const storage = new MemoryStorage();
  await withStorage(storage, () => {
    const base = focusReadySession();
    assert.equal(writePatientSession(CODE, { ...clone(base), transitionRevision: -1 }), false);

    const valid = {
      ...clone(base),
      transitionRevision: 6,
      coachingFocuses: [pendingFocus()],
    } as PatientSession;
    assert.equal(isPatientSession(valid, CODE), true);

    const pendingWithDecision = clone(valid);
    Object.assign(pendingWithDecision.coachingFocuses[0]!, {
      decidedAt: "2026-09-01T08:00:50.000Z",
    });
    assert.equal(isPatientSession(pendingWithDecision, CODE), false);

    const acceptedWithoutDecision = clone(valid);
    Object.assign(acceptedWithoutDecision.coachingFocuses[0]!, {
      status: "accepted",
    });
    assert.equal(isPatientSession(acceptedWithoutDecision, CODE), false);

    const duplicate = {
      ...clone(valid),
      coachingFocuses: [pendingFocus(), pendingFocus()],
    } as PatientSession;
    assert.equal(isPatientSession(duplicate, CODE), false);

    const dangling = clone(valid);
    Object.assign(dangling.coachingFocuses[0]!, {
      targetSetId: "missing_set",
    });
    assert.equal(isPatientSession(dangling, CODE), false);

    const wrongBasedOn = clone(valid);
    Object.assign(wrongBasedOn.coachingFocuses[0]!, {
      basedOnSetId: "set_2",
      targetSetId: "set_1",
    });
    assert.equal(isPatientSession(wrongBasedOn, CODE), false);
  });
});

test("coaching focus values remain deeply cloned after V2 reads", async () => {
  const storage = new MemoryStorage();
  await withStorage(storage, () => {
    const session: PatientSession = {
      ...focusReadySession(),
      transitionRevision: 6,
      coachingFocuses: [pendingFocus()],
    };
    assert.equal(writePatientSession(CODE, session), true);
    const first = readPatientSession(CODE);
    assert.ok(first);
    if (!first) return;
    (first.coachingFocuses[0] as { focusText: string }).focusText = "MUTATED";
    const second = readPatientSession(CODE);
    assert.equal(
      second?.coachingFocuses[0]?.focusText,
      pendingFocus().focusText,
    );
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
