import assert from "node:assert/strict";
import test from "node:test";

import {
  createSeedCaseload,
  type SyntheticClient,
  type TherapistProgramRecord,
} from "../src/domain/caseload.ts";
import {
  CLIENT_ACTIVITY_LIMIT,
  CLIENT_HISTORY_LIMIT,
  DIRECTORY_CLIENT_LIMIT,
  clientHref,
  programHref,
  projectClientDirectory,
  projectClientSummary,
  selectClientDirectory,
  selectClientProgramView,
  selectClientView,
  selectConfirmedVersions,
} from "../src/domain/caseload-views.ts";
import type {
  AgentActivity,
  ConfirmedProgram,
  ProgramDraft,
} from "../src/domain/types.ts";

const CREATED_AT = "2026-08-30T08:00:00.000Z";
const CONFIRMED_AT = "2026-08-30T09:00:00.000Z";
const UPDATED_AT = "2026-08-30T10:00:00.000Z";

function program(
  client: SyntheticClient,
  programId: string,
  options: {
    status?: TherapistProgramRecord["status"];
    source?: ProgramDraft["source"];
    itemCount?: number;
    revision?: number;
    updatedAt?: string;
    versions?: Array<{ code: string; confirmedAt: string; revision?: number }>;
    activities?: AgentActivity[];
  } = {},
): TherapistProgramRecord {
  const currentDraft: ProgramDraft = {
    id: `draft-${programId}`,
    patientLabel: "HIDDEN_DRAFT_PATIENT_LABEL",
    caseContext: {
      ...structuredClone(client.caseContext),
      notes: "HIDDEN_DRAFT_CONTEXT_NOTE",
    },
    items: Array.from({ length: options.itemCount ?? 1 }, (_, index) => ({
      exerciseId: `private-exercise-${index}`,
      sets: 2,
      reps: 8,
      restSeconds: 30,
      frequencyPerDay: 1,
      therapistNote: "HIDDEN_ITEM_NOTE",
    })),
    estimatedMinutes: 4.5,
    warnings: ["HIDDEN_PROGRAM_WARNING"],
    createdAt: CREATED_AT,
    source: options.source ?? "therapist",
    revision: options.revision ?? 1,
  };
  const versions = (options.versions ?? []).map(
    (version): ConfirmedProgram => ({
      ...structuredClone(currentDraft),
      revision: version.revision ?? 1,
      code: version.code,
      confirmedAt: version.confirmedAt,
      confirmedBy: "therapist",
    }),
  );
  const status = options.status ?? (versions.length > 0 ? "confirmed" : "draft");
  return {
    programId,
    clientId: client.id,
    status,
    workspace: {
      version: 1,
      caseContext: structuredClone(client.caseContext),
      draft: currentDraft,
      confirmedProgram: status === "draft" ? null : versions.at(-1) ?? null,
      activities: options.activities ?? [],
    },
    confirmedCodes: versions.map((version) => version.code),
    confirmedVersions: Object.fromEntries(versions.map((version) => [version.code, version])),
    createdAt: CREATED_AT,
    updatedAt: options.updatedAt ?? UPDATED_AT,
    ...(status === "archived" ? { archivedAt: UPDATED_AT } : {}),
  };
}

function assertNoKeys(value: unknown, forbiddenKeys: readonly string[]): void {
  if (value === null || typeof value !== "object") return;
  for (const [key, nested] of Object.entries(value)) {
    assert.equal(forbiddenKeys.includes(key), false, `Unexpected raw field: ${key}`);
    assertNoKeys(nested, forbiddenKeys);
  }
}

test("seed directory and tool projection share the same three clients, counts and next steps", () => {
  const store = createSeedCaseload();
  const original = structuredClone(store);
  const view = selectClientDirectory(store);
  const result = projectClientDirectory(view);

  assert.equal(DIRECTORY_CLIENT_LIMIT, 3);
  assert.deepEqual(view.counts, { total: 3, review: 0, active: 0, drafts: 0 });
  assert.deepEqual(result.totals, { clients: 3, needsReview: 0, activePrograms: 0 });
  assert.deepEqual(result.clients.map((client) => client.clientId), [
    "demo-balance", "demo-knee", "demo-shoulder",
  ]);
  assert.equal(result.shown, 3);
  assert.equal(result.truncated, false);
  for (const [index, client] of result.clients.entries()) {
    assert.equal(client.displayName, view.visibleClients[index].client.displayName);
    assert.equal(client.status, view.visibleClients[index].status);
    assert.deepEqual(client.nextStep, view.visibleClients[index].nextStep);
    assert.equal(client.nextStep.label, "Open client");
    assert.equal(client.hasActiveProgram, false);
    assert.equal(client.updatedAt, null);
  }
  assert.deepEqual(store, original);
});

test("a pending agent draft remains needs-review while an independent confirmed plan stays active", () => {
  const store = createSeedCaseload();
  const client = store.clientsById["demo-shoulder"];
  const oldRecord = program(client, "old-record-with-newest-edit", {
    updatedAt: "2026-08-30T12:00:00.000Z",
    versions: [{ code: "CP_OLD", confirmedAt: CONFIRMED_AT }],
  });
  const activeRecord = program(client, "active-record", {
    updatedAt: UPDATED_AT,
    versions: [{ code: "CP_ACTIVE", confirmedAt: UPDATED_AT, revision: 2 }],
  });
  const draft = program(client, "pending-agent", {
    source: "agent", itemCount: 3, revision: 4,
    updatedAt: "2026-08-30T11:00:00.000Z",
  });
  store.programsById = Object.fromEntries(
    [oldRecord, activeRecord, draft].map((record) => [record.programId, record]),
  );

  const view = selectClientView(store, client.id);
  assert.ok(view);
  assert.equal(view.status, "needs-review");
  assert.equal(view.statusLabel, "Needs review");
  assert.equal(view.clientStatusLabel, "Agent draft needs review");
  assert.equal(view.currentProgram?.programId, draft.programId);
  assert.equal(view.activeProgram?.programId, activeRecord.programId);
  assert.equal(view.activeConfirmedProgram?.code, "CP_ACTIVE");
  assert.equal(view.itemCount, 3);
  assert.equal(view.hasActiveProgram, true);
  assert.equal(view.updatedAt, draft.updatedAt);
  assert.deepEqual(view.nextStep, {
    label: "Review draft", href: programHref(client.id, draft.programId),
  });
  assert.deepEqual(selectClientDirectory(store).counts, {
    total: 3, review: 1, active: 1, drafts: 1,
  });
  const summary = projectClientSummary(view);
  assert.equal(summary.currentDraft?.revision, 4);
  assert.equal(summary.activeConfirmedVersion?.code, "CP_ACTIVE");
  assert.equal(summary.history.total, 1);
});

test("revising a program preserves its active confirmed lineage and earlier immutable versions", () => {
  const store = createSeedCaseload();
  const client = store.clientsById["demo-knee"];
  const record = program(client, "revision-in-progress", {
    status: "draft", source: "agent", revision: 3,
    versions: [
      { code: "CP_FIRST", confirmedAt: CONFIRMED_AT },
      { code: "CP_SECOND", confirmedAt: UPDATED_AT, revision: 2 },
    ],
  });
  const original = structuredClone(record);
  const view = selectClientProgramView(client, [record]);

  assert.equal(record.workspace.confirmedProgram, null);
  assert.equal(view.draftProgram?.programId, record.programId);
  assert.equal(view.activeProgram?.programId, record.programId);
  assert.equal(view.activeConfirmedProgram?.code, "CP_SECOND");
  assert.deepEqual(view.previousConfirmedVersions.map(({ version }) => version.code), ["CP_FIRST"]);
  assert.equal(view.historyCount, 1);
  assert.equal(projectClientSummary(view).history.entries[0].kind, "confirmed_version");
  assert.deepEqual(record, original);
});

test("history summaries expose only the historical row fields, not active-card-only facts", () => {
  const client = createSeedCaseload().clientsById["demo-shoulder"];
  const record = program(client, "program-with-history", {
    versions: [
      { code: "CP_HISTORY", confirmedAt: CONFIRMED_AT },
      { code: "CP_ACTIVE", confirmedAt: UPDATED_AT, revision: 2 },
    ],
  });
  const summary = projectClientSummary(selectClientProgramView(client, [record]));
  assert.deepEqual(Object.keys(summary.history.entries[0]).sort(), [
    "kind", "programId", "code", "revision", "itemCount", "confirmedAt", "editorHref", "patientHref",
  ].sort());
  assert.equal(summary.activeConfirmedVersion?.estimatedMinutes, 4.5);
  assert.equal(summary.activeConfirmedVersion?.confirmedBy, "therapist");
});

test("only a nonempty agent draft gets a needs-review follow-up flag", () => {
  const client = createSeedCaseload().clientsById["demo-knee"];
  for (const record of [
    program(client, "therapist-draft", { source: "therapist", itemCount: 2 }),
    program(client, "empty-agent-draft", { source: "agent", itemCount: 0 }),
  ]) {
    const view = selectClientProgramView(client, [record]);
    assert.equal(view.status, "draft");
    assert.equal(view.nextStep.label, "Continue draft");
    assert.equal(projectClientSummary(view).currentDraft?.needsReview, false);
  }
});

test("archived versions never become active, remain in history, and cannot leak another client's programs", () => {
  const store = createSeedCaseload();
  const client = store.clientsById["demo-shoulder"];
  const active = program(client, "active", {
    versions: [{ code: "CP_VISIBLE_ACTIVE", confirmedAt: CONFIRMED_AT }],
  });
  const archived = program(client, "archived-confirmed", {
    status: "archived",
    versions: [{ code: "CP_ARCHIVED_NEWER", confirmedAt: UPDATED_AT }],
  });
  const abandoned = program(client, "archived-draft", { status: "archived" });
  const otherClient = program(store.clientsById["demo-knee"], "foreign-record", {
    source: "agent",
    versions: [{ code: "CP_FOREIGN", confirmedAt: "2026-08-30T20:00:00.000Z" }],
  });
  const view = selectClientProgramView(client, [otherClient, archived, abandoned, active]);
  const summary = projectClientSummary(view);

  assert.equal(view.status, "active");
  assert.equal(view.activeConfirmedProgram?.code, "CP_VISIBLE_ACTIVE");
  assert.equal(view.historyCount, 2);
  assert.equal(view.programs.length, 3);
  assert.deepEqual(view.previousConfirmedVersions.map(({ version }) => version.code), ["CP_ARCHIVED_NEWER"]);
  assert.deepEqual(view.nonVersionHistoryPrograms.map((record) => record.programId), ["archived-draft"]);
  assert.equal(summary.history.entries[1].kind, "program");
  assert.equal(JSON.stringify(summary).includes("CP_FOREIGN"), false);

  const archivedOnly = selectClientProgramView(client, [archived, abandoned]);
  assert.equal(archivedOnly.status, "no-plan");
  assert.equal(archivedOnly.activeConfirmedProgram, null);
  assert.equal(archivedOnly.currentProgram, null);
  assert.equal(archivedOnly.nextStep.label, "Open client");
});

test("equal confirmation and activity timestamps use deterministic tie ordering without mutating inputs", () => {
  const client = createSeedCaseload().clientsById["demo-knee"];
  const makeActivity = (id: string): AgentActivity => ({
    id, actor: "therapist", action: id, detail: "Visible synthetic activity", createdAt: UPDATED_AT,
  });
  const a = program(client, "program-a", {
    versions: [
      { code: "CP_A2", confirmedAt: CONFIRMED_AT },
      { code: "CP_A1", confirmedAt: CONFIRMED_AT },
    ],
    activities: [makeActivity("activity-c"), makeActivity("activity-a")],
  });
  const b = program(client, "program-b", {
    updatedAt: "2026-08-30T23:00:00.000Z",
    versions: [{ code: "CP_B", confirmedAt: CONFIRMED_AT }],
    activities: [makeActivity("activity-b")],
  });
  const candidates = [b, a];
  const before = structuredClone(candidates);
  const forward = selectClientProgramView(client, candidates);
  const reverse = selectClientProgramView(client, [...candidates].reverse());

  assert.equal(forward.activeConfirmedProgram?.code, "CP_A1");
  assert.equal(reverse.activeConfirmedProgram?.code, "CP_A1");
  assert.deepEqual(selectConfirmedVersions(candidates).map(({ version }) => version.code), [
    "CP_A1", "CP_A2", "CP_B",
  ]);
  assert.deepEqual(forward.recentActivity.map((activity) => activity.id), [
    "activity-a", "activity-b", "activity-c",
  ]);
  assert.deepEqual(projectClientSummary(forward), projectClientSummary(reverse));
  assert.deepEqual(candidates, before);
});

test("history and recent activity are bounded at twenty and five, with accurate totals and ordering", () => {
  const client = createSeedCaseload().clientsById["demo-balance"];
  const versions = Array.from({ length: 25 }, (_, index) => ({
    code: `CP_VERSION_${String(index).padStart(2, "0")}`,
    confirmedAt: new Date(Date.parse(CONFIRMED_AT) + index * 60_000).toISOString(),
    revision: index + 1,
  }));
  const activities: AgentActivity[] = Array.from({ length: 9 }, (_, index) => ({
    id: `activity-${index}`, actor: "therapist", action: `Activity ${index}`,
    detail: `Visible synthetic detail ${index}`,
    createdAt: new Date(Date.parse(CONFIRMED_AT) + index * 60_000).toISOString(),
  }));
  const view = selectClientProgramView(client, [program(client, "many-versions", { versions, activities })]);
  const summary = projectClientSummary(view);

  assert.equal(CLIENT_HISTORY_LIMIT, 20);
  assert.equal(CLIENT_ACTIVITY_LIMIT, 5);
  assert.equal(view.historyCount, 24);
  assert.equal(summary.history.total, 24);
  assert.equal(summary.history.entries.length, 20);
  assert.equal(summary.history.truncated, true);
  assert.equal(summary.activeConfirmedVersion?.code, "CP_VERSION_24");
  assert.deepEqual(
    summary.history.entries.map((entry) => entry.kind === "confirmed_version" ? entry.code : entry.programId),
    Array.from({ length: 20 }, (_, index) => `CP_VERSION_${String(23 - index).padStart(2, "0")}`),
  );
  assert.deepEqual(summary.recentActivity.map((activity) => activity.action), [
    "Activity 8", "Activity 7", "Activity 6", "Activity 5", "Activity 4",
  ]);
  assert.deepEqual(summary.recentActivity, view.recentActivity.map(({ actor, action, detail, createdAt }) => ({
    actor, action, detail, createdAt,
  })));
});

test("directory filters share UI matching while aggregate counts stay global", () => {
  const store = createSeedCaseload();
  const knee = store.clientsById["demo-knee"];
  store.programsById.knee = program(knee, "knee", { source: "agent" });
  for (const query of ["  DEMO CLIENT — KNEE  ", "stair-tolerance", "knee", "stair confidence"]) {
    const filters = { query, status: "needs-review" as const };
    const view = selectClientDirectory(store, filters);
    assert.deepEqual(view.visibleClients.map(({ client }) => client.id), [knee.id]);
    assert.deepEqual(projectClientDirectory(view).filters, filters);
    assert.deepEqual(projectClientDirectory(view).totals, {
      clients: 3, needsReview: 1, activePrograms: 0,
    });
    assert.equal(projectClientDirectory(view).shown, 1);
  }
  assert.equal(selectClientDirectory(store, { query: "knee", status: "active" }).visibleClients.length, 0);
  assert.equal(selectClientDirectory(store, { query: "unmatched synthetic case", status: "all" }).visibleClients.length, 0);
});

test("directory projection uses an explicit allowlist and cannot return more than three rows", () => {
  const store = createSeedCaseload();
  const client = store.clientsById["demo-shoulder"];
  client.caseContext.patientLabel = "HIDDEN_CLIENT_PATIENT_LABEL";
  client.caseContext.notes = "HIDDEN_DIRECTORY_CONTEXT_NOTE";
  store.programsById.record = program(client, "record", {
    versions: [{ code: "CP_NOT_VISIBLE_ON_DIRECTORY", confirmedAt: CONFIRMED_AT }],
  });
  const view = selectClientDirectory(store);
  const projected = projectClientDirectory(view);
  assertNoKeys(projected, [
    "caseContext", "diagnosis", "notes", "patientLabel", "items", "workspace",
    "confirmedVersions", "confirmedProgram", "code", "therapistNote", "warnings",
  ]);
  assert.deepEqual(Object.keys(projected.clients[0]).sort(), [
    "clientHref", "clientId", "displayName", "hasActiveProgram", "itemCount",
    "nextStep", "status", "statusLabel", "synthetic", "updatedAt",
  ].sort());
  assert.doesNotMatch(JSON.stringify(projected), /HIDDEN_|CP_NOT_VISIBLE_ON_DIRECTORY/);

  const oversizedVisibleView = {
    ...view, visibleClients: [...view.visibleClients, ...view.visibleClients],
  };
  const bounded = projectClientDirectory(oversizedVisibleView);
  assert.equal(bounded.clients.length, 3);
  assert.equal(bounded.shown, 6);
  assert.equal(bounded.truncated, true);
  assert.equal(bounded.limit, 3);
});

test("client summary exposes visible context only, omits raw prescriptions and preserves source data", () => {
  const client = createSeedCaseload().clientsById["demo-shoulder"];
  client.caseContext.patientLabel = "HIDDEN_CLIENT_PATIENT_LABEL";
  client.caseContext.notes = "Visible therapist-supplied constraint, not an instruction to the agent.";
  const record = program(client, "visible-program", {
    status: "draft", source: "agent", revision: 2,
    versions: [{ code: "CP_PRIOR", confirmedAt: CONFIRMED_AT }],
  });
  const view = selectClientProgramView(client, [record]);
  const summary = projectClientSummary(view);
  const before = structuredClone({ client, record });

  assert.equal(summary.caseContext.notes, client.caseContext.notes);
  assert.equal(summary.caseContext.procedure, client.caseContext.procedure);
  assert.equal(summary.caseContext.protocol, client.caseContext.protocol);
  assert.equal(summary.currentDraft?.needsReview, true);
  assertNoKeys(summary, [
    "patientLabel", "items", "workspace", "therapistNote", "warnings",
    "confirmedVersions", "activities", "session", "sessions", "adherence",
    "activeClientId", "activeProgramId",
  ]);
  assert.doesNotMatch(JSON.stringify(summary), /HIDDEN_|private-exercise/);
  assert.equal(summary.activeConfirmedVersion?.confirmedBy, "therapist");

  summary.caseContext.goals.push("projection-only mutation");
  summary.caseContext.equipment.push("projection-only equipment");
  assert.deepEqual({ client, record }, before);
});

test("client selection returns null for missing and inherited-property route identifiers", () => {
  const store = createSeedCaseload();
  for (const clientId of ["missing-client", "", "__proto__", "constructor", "toString"]) {
    assert.equal(selectClientView(store, clientId), null, clientId);
  }
});

test("all projected client, editor and patient route identifiers are encoded as path segments", () => {
  const client = createSeedCaseload().clientsById["demo-shoulder"];
  client.id = "synthetic/route?client#part";
  const record = program(client, "program/route?draft#part", {
    versions: [{ code: "CP/route?patient#part", confirmedAt: CONFIRMED_AT }],
  });
  const summary = projectClientSummary(selectClientProgramView(client, [record]));
  assert.equal(clientHref(client.id), "/therapist/clients/synthetic%2Froute%3Fclient%23part");
  assert.equal(summary.activeConfirmedVersion?.editorHref,
    "/therapist/clients/synthetic%2Froute%3Fclient%23part/programs/program%2Froute%3Fdraft%23part");
  assert.equal(summary.activeConfirmedVersion?.patientHref, "/patient/CP%2Froute%3Fpatient%23part");
});
