import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_SYNTHETIC_CLIENT_ID,
  SYNTHETIC_CLIENTS,
  createSeedCaseload,
  getSyntheticClient,
  type TherapistWorkspaceSnapshot,
} from "../src/domain/caseload.ts";
import type {
  CaseContext,
  ConfirmedProgram,
  ProgramDraft,
} from "../src/domain/types.ts";
import {
  CASELOAD_STORAGE_KEY,
  LEGACY_PROGRAMS_STORAGE_KEY,
  LEGACY_WORKSPACE_STORAGE_KEY,
  createProgramForClient,
  getClient,
  getProgram,
  isTherapistCaseloadStore,
  listClients,
  listProgramsForClient,
  migrateLegacyWorkspace,
  readCaseload,
  readProgramWorkspace,
  readProgramWorkspaceForClient,
  setProgramStatus,
  updateClientCaseContext,
  writeClientProgramWorkspace,
  writeProgramWorkspace,
  writeProgramWorkspaceForClient,
  type CaseloadStorageLike,
} from "../src/lib/caseloadStorage.ts";

class MemoryStorage implements CaseloadStorageLike {
  readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

class FailingMemoryStorage extends MemoryStorage {
  failWrites = false;

  override setItem(key: string, value: string): void {
    if (this.failWrites) throw new Error("Synthetic quota failure");
    super.setItem(key, value);
  }
}

const NOW = "2026-08-30T08:00:00.000Z";
const LATER = "2026-08-30T09:00:00.000Z";

function shoulderContext(): CaseContext {
  return {
    patientLabel: "Synthetic Migration Case",
    diagnosis: "Therapist-entered synthetic shoulder mobility case",
    goals: ["comfortable shoulder mobility"],
    minutesPerDay: 15,
    bodyRegion: "shoulder",
    equipment: ["wall", "stick"],
  };
}

function draft(context: CaseContext, id = "draft_legacy"): ProgramDraft {
  return {
    id,
    patientLabel: context.patientLabel,
    caseContext: structuredClone(context),
    items: [
      {
        exerciseId: "wall-slide-flexion",
        sets: 2,
        reps: 8,
        frequencyPerDay: 1,
        restSeconds: 30,
      },
    ],
    estimatedMinutes: 1.5,
    warnings: ["Therapist review required."],
    createdAt: NOW,
    source: "therapist",
    revision: 1,
  };
}

function confirmedProgram(
  source: ProgramDraft,
  code: string,
  confirmedAt = LATER,
): ConfirmedProgram {
  return {
    ...structuredClone(source),
    code,
    confirmedAt,
    confirmedBy: "therapist",
  };
}

function workspace(
  context: CaseContext,
  currentDraft: ProgramDraft | null,
  confirmed: ConfirmedProgram | null = null,
): TherapistWorkspaceSnapshot {
  return {
    version: 1,
    caseContext: structuredClone(context),
    draft: currentDraft ? structuredClone(currentDraft) : null,
    confirmedProgram: confirmed ? structuredClone(confirmed) : null,
    activities: [],
  };
}

test("synthetic caseload seed has exactly three deterministic, non-PII clients", () => {
  assert.deepEqual(
    SYNTHETIC_CLIENTS.map((client) => client.id),
    ["demo-shoulder", "demo-knee", "demo-balance"],
  );
  assert.equal(SYNTHETIC_CLIENTS.every((client) => client.synthetic), true);
  assert.equal(createSeedCaseload().activeClientId, DEFAULT_SYNTHETIC_CLIENT_ID);
  assert.equal(isTherapistCaseloadStore(createSeedCaseload()), true);

  const first = getSyntheticClient(DEFAULT_SYNTHETIC_CLIENT_ID);
  assert.ok(first);
  first.caseContext.goals.push("mutation that must not reach fixtures");
  assert.equal(
    getSyntheticClient(DEFAULT_SYNTHETIC_CLIENT_ID)?.caseContext.goals.includes(
      "mutation that must not reach fixtures",
    ),
    false,
  );
});

test("full V2 guard rejects corrupt nested workspace and lineage state", () => {
  const valid = createSeedCaseload();
  const client = valid.clientsById[DEFAULT_SYNTHETIC_CLIENT_ID];
  assert.ok(client);
  const currentDraft = draft(client.caseContext, "draft_guard");
  valid.programsById.program_guard = {
    programId: "program_guard",
    clientId: client.id,
    status: "draft",
    workspace: workspace(client.caseContext, currentDraft),
    confirmedCodes: [],
    confirmedVersions: {},
    createdAt: NOW,
    updatedAt: NOW,
  };
  valid.activeProgramId = "program_guard";
  assert.equal(isTherapistCaseloadStore(valid), true);

  const badDose = structuredClone(valid) as unknown as {
    programsById: Record<string, { workspace: { draft: { items: unknown[] } } }>;
  };
  badDose.programsById.program_guard.workspace.draft.items = [
    { exerciseId: "wall-slide-flexion", sets: "two" },
  ];
  assert.equal(isTherapistCaseloadStore(badDose), false);

  const duplicateLineage = structuredClone(valid);
  duplicateLineage.programsById.program_guard.confirmedCodes = ["CP_ONE", "CP_ONE"];
  assert.equal(isTherapistCaseloadStore(duplicateLineage), false);

  const mismatchedKey = structuredClone(valid);
  mismatchedKey.programsById.program_guard.programId = "different";
  assert.equal(isTherapistCaseloadStore(mismatchedKey), false);

  const duplicateDraft = structuredClone(valid);
  duplicateDraft.programsById.program_guard_duplicate = {
    ...structuredClone(duplicateDraft.programsById.program_guard),
    programId: "program_guard_duplicate",
  };
  assert.equal(isTherapistCaseloadStore(duplicateDraft), false);

  const invalidConfirmationTime = structuredClone(valid);
  const invalidVersion = confirmedProgram(
    currentDraft,
    "CP_INVALID_TIME",
  );
  invalidVersion.confirmedAt = "not-an-iso-timestamp";
  invalidConfirmationTime.programsById.program_guard = {
    ...invalidConfirmationTime.programsById.program_guard,
    status: "confirmed",
    workspace: workspace(client.caseContext, currentDraft, invalidVersion),
    confirmedCodes: [invalidVersion.code],
    confirmedVersions: { [invalidVersion.code]: invalidVersion },
  };
  assert.equal(isTherapistCaseloadStore(invalidConfirmationTime), false);
});

test("V1 singleton migration is deterministic, persisted once, and never deletes V1", () => {
  const storage = new MemoryStorage();
  const context = shoulderContext();
  const currentDraft = draft(context);
  const confirmed = confirmedProgram(currentDraft, "CP_LEGACY1234");
  const legacy = {
    version: 1,
    caseContext: context,
    draft: currentDraft,
    confirmedProgram: confirmed,
    activities: [
      {
        id: "activity_legacy",
        actor: "therapist",
        action: "Confirmed prescription.",
        detail: "Synthetic migration fixture.",
        createdAt: LATER,
      },
    ],
  };
  storage.setItem(LEGACY_WORKSPACE_STORAGE_KEY, JSON.stringify(legacy));

  const first = readCaseload({ storage });
  assert.equal(Object.keys(first.clientsById).length, 3);
  assert.equal(
    first.clientsById[DEFAULT_SYNTHETIC_CLIENT_ID]?.caseContext.patientLabel,
    context.patientLabel,
  );
  assert.ok(first.activeProgramId);
  const migrated = first.programsById[first.activeProgramId];
  assert.equal(migrated?.status, "confirmed");
  assert.deepEqual(migrated?.confirmedCodes, [confirmed.code]);
  assert.equal(storage.getItem(LEGACY_WORKSPACE_STORAGE_KEY), JSON.stringify(legacy));
  assert.ok(storage.getItem(CASELOAD_STORAGE_KEY));

  const second = readCaseload({ storage });
  assert.deepEqual(second, first);
  assert.equal(Object.keys(second.programsById).length, 1);
  assert.deepEqual(migrateLegacyWorkspace(legacy), first);
});

test("migration imports live legacy registry versions while a workspace is being revised", () => {
  const storage = new MemoryStorage();
  const context = shoulderContext();
  const currentDraft = { ...draft(context), revision: 2 };
  const priorConfirmed = confirmedProgram(
    draft(context, "draft_confirmed_before_revision"),
    "CP_STILL_ACTIVE",
  );
  storage.setItem(
    LEGACY_WORKSPACE_STORAGE_KEY,
    JSON.stringify(workspace(context, currentDraft, null)),
  );
  storage.setItem(
    LEGACY_PROGRAMS_STORAGE_KEY,
    JSON.stringify({
      version: 1,
      programs: { [priorConfirmed.code]: priorConfirmed },
    }),
  );

  const migrated = readCaseload({ storage });
  assert.ok(migrated.activeProgramId);
  const record = migrated.programsById[migrated.activeProgramId];
  assert.equal(record?.status, "draft");
  assert.deepEqual(record?.confirmedCodes, [priorConfirmed.code]);
  assert.deepEqual(
    record?.confirmedVersions[priorConfirmed.code],
    priorConfirmed,
  );
});

test("migration normalizes clock-skewed timestamps into a durable V2 record", () => {
  const storage = new MemoryStorage();
  const context = shoulderContext();
  const skewedDraft = {
    ...draft(context, "draft_clock_skew"),
    createdAt: LATER,
  };
  const skewedConfirmed = confirmedProgram(
    skewedDraft,
    "CP_CLOCK_SKEW",
    NOW,
  );
  storage.setItem(
    LEGACY_WORKSPACE_STORAGE_KEY,
    JSON.stringify(workspace(context, skewedDraft, skewedConfirmed)),
  );
  const migrated = readCaseload({ storage });
  assert.equal(isTherapistCaseloadStore(migrated), true);
  assert.ok(migrated.activeProgramId);
  const record = migrated.programsById[migrated.activeProgramId];
  assert.equal(record?.createdAt, LATER);
  assert.equal(record?.updatedAt, LATER);
  assert.ok(storage.getItem(CASELOAD_STORAGE_KEY));
});

test("migration selects the newest registry version when legacy workspace confirmation is older", () => {
  const context = shoulderContext();
  const sourceDraft = draft(context, "draft_version_order");
  const oldVersion = confirmedProgram(
    sourceDraft,
    "CP_OLDER_VERSION",
    "2026-08-30T09:00:00.000Z",
  );
  const newestContext = {
    ...context,
    diagnosis: "Updated synthetic migration diagnosis",
  };
  const newVersion = confirmedProgram(
    {
      ...sourceDraft,
      caseContext: newestContext,
      revision: 2,
    },
    "CP_NEWER_VERSION",
    "2026-08-30T10:00:00.000Z",
  );
  const migrated = migrateLegacyWorkspace(
    workspace(context, sourceDraft, oldVersion),
    {
      version: 1,
      programs: {
        [oldVersion.code]: oldVersion,
        [newVersion.code]: newVersion,
      },
    },
  );
  assert.equal(isTherapistCaseloadStore(migrated), true);
  assert.ok(migrated.activeProgramId);
  const record = migrated.programsById[migrated.activeProgramId];
  assert.equal(record?.workspace.confirmedProgram?.code, newVersion.code);
  assert.equal(record?.workspace.draft?.revision, newVersion.revision);
  assert.deepEqual(record?.workspace.draft?.items, newVersion.items);
  assert.deepEqual(record?.workspace.caseContext, newestContext);
  assert.deepEqual(
    migrated.clientsById[DEFAULT_SYNTHETIC_CLIENT_ID]?.caseContext,
    newestContext,
  );
  assert.deepEqual(record?.confirmedCodes, [oldVersion.code, newVersion.code]);
});

test("an empty valid V1 workspace migrates to a usable deterministic draft", () => {
  const context = shoulderContext();
  const migrated = migrateLegacyWorkspace({
    version: 1,
    caseContext: context,
    draft: null,
    confirmedProgram: null,
    activities: [],
  });
  assert.equal(isTherapistCaseloadStore(migrated), true);
  assert.ok(migrated.activeProgramId);
  assert.equal(
    migrated.programsById[migrated.activeProgramId]?.workspace.draft?.id,
    "draft_legacy_workspace",
  );
});

test("create/list/get/read APIs persist stable program IDs and return clones", () => {
  const storage = new MemoryStorage();
  const created = createProgramForClient(DEFAULT_SYNTHETIC_CLIENT_ID, {
    storage,
    now: NOW,
    programId: "program_stable",
    draftId: "draft_initial",
  });
  assert.ok(created);
  assert.equal(created.programId, "program_stable");
  assert.equal(created.workspace.draft?.id, "draft_initial");
  assert.equal(created.status, "draft");

  assert.equal(listClients({ storage }).length, 3);
  assert.equal(getClient(DEFAULT_SYNTHETIC_CLIENT_ID, { storage })?.synthetic, true);
  assert.deepEqual(
    listProgramsForClient(DEFAULT_SYNTHETIC_CLIENT_ID, { storage }).map(
      (program) => program.programId,
    ),
    ["program_stable"],
  );
  assert.equal(
    readProgramWorkspace("program_stable", { storage })?.draft?.id,
    "draft_initial",
  );

  created.confirmedCodes.push("MUTATION");
  const reread = getProgram("program_stable", { storage });
  assert.deepEqual(reread?.confirmedCodes, []);
  assert.equal(
    createProgramForClient(DEFAULT_SYNTHETIC_CLIENT_ID, {
      storage,
      now: NOW,
      programId: "program_stable",
      draftId: "draft_duplicate",
    }),
    null,
  );
  assert.equal(
    createProgramForClient(DEFAULT_SYNTHETIC_CLIENT_ID, {
      storage,
      now: LATER,
      programId: "program_second_live_draft",
      draftId: "draft_second_live_draft",
    }),
    null,
  );
});

test("a human new-prescription action atomically replaces only an empty disposable draft", () => {
  const storage = new MemoryStorage();
  const first = createProgramForClient(DEFAULT_SYNTHETIC_CLIENT_ID, {
    storage,
    now: NOW,
    programId: "program_empty_old",
    draftId: "draft_empty_old",
  });
  assert.ok(first);

  const fresh = createProgramForClient(DEFAULT_SYNTHETIC_CLIENT_ID, {
    storage,
    now: LATER,
    programId: "program_empty_fresh",
    draftId: "draft_empty_fresh",
    replaceEmptyDraft: true,
  });
  assert.ok(fresh);
  assert.equal(fresh.status, "draft");
  assert.equal(fresh.workspace.draft?.source, "therapist");
  assert.equal(fresh.workspace.draft?.items.length, 0);

  const stored = readCaseload({ storage });
  assert.equal(stored.programsById.program_empty_old?.status, "archived");
  assert.equal(stored.programsById.program_empty_old?.archivedAt, LATER);
  assert.equal(stored.programsById.program_empty_fresh?.status, "draft");
  assert.equal(stored.activeProgramId, "program_empty_fresh");
  assert.equal(
    Object.values(stored.programsById).filter(
      (program) => program.clientId === DEFAULT_SYNTHETIC_CLIENT_ID && program.status === "draft",
    ).length,
    1,
  );
});

test("new prescription never replaces a non-empty draft", () => {
  const storage = new MemoryStorage();
  const created = createProgramForClient(DEFAULT_SYNTHETIC_CLIENT_ID, {
    storage,
    now: NOW,
    programId: "program_nonempty",
    draftId: "draft_nonempty",
  });
  assert.ok(created?.workspace.draft);
  const nonEmptyWorkspace: TherapistWorkspaceSnapshot = {
    ...structuredClone(created.workspace),
    draft: {
      ...structuredClone(created.workspace.draft),
      items: [
        {
          exerciseId: "wall-slide-flexion",
          sets: 2,
          reps: 8,
          frequencyPerDay: 1,
          restSeconds: 30,
        },
      ],
      estimatedMinutes: 1.5,
    },
  };
  assert.equal(
    writeProgramWorkspace(created.programId, nonEmptyWorkspace, {
      storage,
      now: LATER,
    }),
    true,
  );

  assert.equal(
    createProgramForClient(DEFAULT_SYNTHETIC_CLIENT_ID, {
      storage,
      now: "2026-08-30T10:00:00.000Z",
      programId: "program_must_not_replace",
      draftId: "draft_must_not_replace",
      replaceEmptyDraft: true,
    }),
    null,
  );
  assert.equal(getProgram("program_nonempty", { storage })?.status, "draft");
  assert.equal(getProgram("program_must_not_replace", { storage }), null);
});

test("client-scoped workspace APIs reject cross-client deep links and writes", () => {
  const storage = new MemoryStorage();
  const created = createProgramForClient(DEFAULT_SYNTHETIC_CLIENT_ID, {
    storage,
    now: NOW,
    programId: "program_owned_by_shoulder",
    draftId: "draft_owned_by_shoulder",
  });
  assert.ok(created);
  assert.equal(
    readProgramWorkspaceForClient(
      "demo-knee",
      created.programId,
      { storage },
    ),
    null,
  );
  assert.equal(
    writeProgramWorkspaceForClient(
      "demo-knee",
      created.programId,
      created.workspace,
      { storage, now: LATER },
    ),
    false,
  );
  assert.deepEqual(
    readProgramWorkspaceForClient(
      DEFAULT_SYNTHETIC_CLIENT_ID,
      created.programId,
      { storage },
    ),
    created.workspace,
  );
});

test("client case context updates persist and seed future program drafts", () => {
  const storage = new MemoryStorage();
  const client = getClient(DEFAULT_SYNTHETIC_CLIENT_ID, { storage });
  assert.ok(client);
  const updatedContext = {
    ...client.caseContext,
    minutesPerDay: 22,
    goals: [...client.caseContext.goals, "updated synthetic goal"],
  };
  assert.equal(
    updateClientCaseContext(client.id, updatedContext, { storage }),
    true,
  );
  assert.equal(
    getClient(client.id, { storage })?.caseContext.minutesPerDay,
    22,
  );
  const created = createProgramForClient(client.id, {
    storage,
    now: NOW,
    programId: "program_updated_context",
    draftId: "draft_updated_context",
  });
  assert.equal(created?.workspace.caseContext.minutesPerDay, 22);
  assert.deepEqual(created?.workspace.caseContext.goals.at(-1), "updated synthetic goal");
});

test("workspace writes derive status and retain append-only immutable confirmation lineage", () => {
  const storage = new MemoryStorage();
  const created = createProgramForClient(DEFAULT_SYNTHETIC_CLIENT_ID, {
    storage,
    now: NOW,
    programId: "program_lineage",
    draftId: "draft_lineage",
  });
  assert.ok(created?.workspace.draft);

  const firstConfirmed = confirmedProgram(
    created.workspace.draft,
    "CP_FIRST12345",
  );
  const confirmedWorkspace: TherapistWorkspaceSnapshot = {
    ...structuredClone(created.workspace),
    confirmedProgram: firstConfirmed,
  };
  assert.equal(
    writeProgramWorkspace("program_lineage", confirmedWorkspace, {
      storage,
      now: LATER,
    }),
    true,
  );
  let stored = getProgram("program_lineage", { storage });
  assert.equal(stored?.status, "confirmed");
  assert.deepEqual(stored?.confirmedCodes, ["CP_FIRST12345"]);
  assert.deepEqual(
    stored?.confirmedVersions.CP_FIRST12345,
    firstConfirmed,
  );

  const revisedWorkspace: TherapistWorkspaceSnapshot = {
    ...structuredClone(confirmedWorkspace),
    confirmedProgram: null,
    draft: {
      ...structuredClone(created.workspace.draft),
      revision: 2,
    },
  };
  assert.equal(
    writeProgramWorkspace("program_lineage", revisedWorkspace, {
      storage,
      now: "2026-08-30T10:00:00.000Z",
    }),
    true,
  );
  stored = getProgram("program_lineage", { storage });
  assert.equal(stored?.status, "draft");
  assert.deepEqual(stored?.confirmedCodes, ["CP_FIRST12345"]);

  const secondConfirmed = confirmedProgram(
    revisedWorkspace.draft!,
    "CP_SECOND1234",
    "2026-08-30T11:00:00.000Z",
  );
  assert.equal(
    writeProgramWorkspace(
      "program_lineage",
      { ...structuredClone(revisedWorkspace), confirmedProgram: secondConfirmed },
      { storage, now: "2026-08-30T11:00:00.000Z" },
    ),
    true,
  );
  stored = getProgram("program_lineage", { storage });
  assert.deepEqual(stored?.confirmedCodes, ["CP_FIRST12345", "CP_SECOND1234"]);
  assert.deepEqual(
    stored?.confirmedVersions.CP_FIRST12345,
    firstConfirmed,
  );
  assert.deepEqual(
    stored?.confirmedVersions.CP_SECOND1234,
    secondConfirmed,
  );

  const alteredOldVersion = {
    ...firstConfirmed,
    estimatedMinutes: 99,
  };
  assert.equal(
    writeProgramWorkspace(
      "program_lineage",
      { ...structuredClone(revisedWorkspace), confirmedProgram: alteredOldVersion },
      { storage, now: "2026-08-30T12:00:00.000Z" },
    ),
    false,
  );
  assert.deepEqual(
    getProgram("program_lineage", { storage })?.confirmedCodes,
    ["CP_FIRST12345", "CP_SECOND1234"],
  );
});

test("a confirmed program cannot be reopened while another client draft is live", () => {
  const storage = new MemoryStorage();
  const first = createProgramForClient(DEFAULT_SYNTHETIC_CLIENT_ID, {
    storage,
    now: NOW,
    programId: "program_confirmed_before_second_draft",
    draftId: "draft_confirmed_before_second_draft",
  });
  assert.ok(first?.workspace.draft);
  const confirmed = confirmedProgram(
    first.workspace.draft,
    "CP_CONFIRMED_BEFORE_SECOND_DRAFT",
  );
  assert.equal(
    writeProgramWorkspace(
      first.programId,
      { ...first.workspace, confirmedProgram: confirmed },
      { storage, now: LATER },
    ),
    true,
  );
  const second = createProgramForClient(DEFAULT_SYNTHETIC_CLIENT_ID, {
    storage,
    now: "2026-08-30T10:00:00.000Z",
    programId: "program_second_draft",
    draftId: "draft_second_draft",
  });
  assert.ok(second);

  const reopened = {
    ...first.workspace,
    confirmedProgram: null,
    draft: { ...first.workspace.draft, revision: 2 },
  };
  assert.equal(
    writeProgramWorkspace(first.programId, reopened, {
      storage,
      now: "2026-08-30T11:00:00.000Z",
    }),
    false,
  );
});

test("client context and program draft commit together or not at all", () => {
  const storage = new FailingMemoryStorage();
  const created = createProgramForClient(DEFAULT_SYNTHETIC_CLIENT_ID, {
    storage,
    now: NOW,
    programId: "program_atomic_draft",
    draftId: "draft_atomic_draft",
  });
  assert.ok(created?.workspace.draft);

  const nextContext = {
    ...created.workspace.caseContext,
    minutesPerDay: 18,
  };
  const nextWorkspace: TherapistWorkspaceSnapshot = {
    ...structuredClone(created.workspace),
    caseContext: nextContext,
    draft: {
      ...structuredClone(created.workspace.draft),
      caseContext: nextContext,
      revision: 2,
    },
  };
  assert.equal(
    writeClientProgramWorkspace(
      DEFAULT_SYNTHETIC_CLIENT_ID,
      created.programId,
      nextWorkspace,
      { storage, now: LATER },
    ),
    true,
  );
  assert.equal(
    getClient(DEFAULT_SYNTHETIC_CLIENT_ID, { storage })?.caseContext
      .minutesPerDay,
    18,
  );
  assert.equal(
    getProgram(created.programId, { storage })?.workspace.draft?.revision,
    2,
  );

  storage.failWrites = true;
  const failedContext = { ...nextContext, minutesPerDay: 22 };
  const failedWorkspace: TherapistWorkspaceSnapshot = {
    ...structuredClone(nextWorkspace),
    caseContext: failedContext,
    draft: {
      ...structuredClone(nextWorkspace.draft!),
      caseContext: failedContext,
      revision: 3,
    },
  };
  assert.equal(
    writeClientProgramWorkspace(
      DEFAULT_SYNTHETIC_CLIENT_ID,
      created.programId,
      failedWorkspace,
      { storage, now: "2026-08-30T10:00:00.000Z" },
    ),
    false,
  );
  assert.equal(
    getClient(DEFAULT_SYNTHETIC_CLIENT_ID, { storage })?.caseContext
      .minutesPerDay,
    18,
  );
  assert.equal(
    getProgram(created.programId, { storage })?.workspace.draft?.revision,
    2,
  );
});

test("archiving retains working state and lineage but removes the active selection", () => {
  const storage = new MemoryStorage();
  assert.ok(
    createProgramForClient(DEFAULT_SYNTHETIC_CLIENT_ID, {
      storage,
      now: NOW,
      programId: "program_archive",
      draftId: "draft_archive",
    }),
  );
  assert.equal(
    setProgramStatus("program_archive", "archived", {
      storage,
      now: LATER,
    }),
    true,
  );
  const store = readCaseload({ storage });
  assert.equal(store.activeProgramId, null);
  assert.equal(store.programsById.program_archive?.status, "archived");
  assert.equal(store.programsById.program_archive?.archivedAt, LATER);
  assert.ok(store.programsById.program_archive?.workspace.draft);
  assert.equal(
    writeProgramWorkspace(
      "program_archive",
      store.programsById.program_archive!.workspace,
      { storage, now: "2026-08-30T10:00:00.000Z" },
    ),
    false,
  );
  assert.equal(
    readProgramWorkspaceForClient(
      DEFAULT_SYNTHETIC_CLIENT_ID,
      "program_archive",
      { storage },
    ),
    null,
  );
});

test("an archived draft cannot be reactivated beside another live draft", () => {
  const storage = new MemoryStorage();
  const archived = createProgramForClient(DEFAULT_SYNTHETIC_CLIENT_ID, {
    storage,
    now: NOW,
    programId: "program_archived_draft",
    draftId: "draft_archived_draft",
  });
  assert.ok(archived);
  assert.equal(
    setProgramStatus(archived.programId, "archived", {
      storage,
      now: LATER,
    }),
    true,
  );
  assert.ok(
    createProgramForClient(DEFAULT_SYNTHETIC_CLIENT_ID, {
      storage,
      now: "2026-08-30T10:00:00.000Z",
      programId: "program_live_sibling",
      draftId: "draft_live_sibling",
    }),
  );
  assert.equal(
    setProgramStatus(archived.programId, "draft", {
      storage,
      now: "2026-08-30T11:00:00.000Z",
    }),
    false,
  );
});

test("browser-optional reads are safe when localStorage is unavailable", () => {
  const store = readCaseload();
  assert.equal(Object.keys(store.clientsById).length, 3);
  assert.equal(store.activeProgramId, null);
  assert.equal(
    createProgramForClient(DEFAULT_SYNTHETIC_CLIENT_ID, {
      now: NOW,
      programId: "program_no_storage",
      draftId: "draft_no_storage",
    }),
    null,
  );
});
