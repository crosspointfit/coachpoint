import {
  CASELOAD_SEED_TIMESTAMP,
  DEFAULT_SYNTHETIC_CLIENT_ID,
  SYNTHETIC_CLIENTS,
  cloneCaseloadStore,
  cloneProgramRecord,
  cloneWorkspaceSnapshot,
  createSeedCaseload,
  programStatusFromWorkspace,
  type ProgramStatus,
  type SyntheticClient,
  type TherapistCaseloadStore,
  type TherapistProgramRecord,
  type TherapistWorkspaceSnapshot,
} from "../domain/caseload.ts";
import type { ConfirmedProgram, ProgramDraft } from "../domain/types.ts";
import {
  isTherapistWorkspaceSnapshot as isLegacyWorkspaceSnapshot,
  type TherapistWorkspaceSnapshot as LegacyWorkspaceSnapshot,
} from "./therapistStorage.ts";

export const CASELOAD_STORAGE_KEY = "coachpoint:therapist-caseload:v2";
export const LEGACY_WORKSPACE_STORAGE_KEY =
  "coachpoint:therapist-workspace:v1";
export const LEGACY_PROGRAMS_STORAGE_KEY =
  "coachpoint:confirmed-programs:v1";

export interface CaseloadStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

export interface CaseloadAccessOptions {
  storage?: CaseloadStorageLike;
}

export interface CaseloadMutationOptions extends CaseloadAccessOptions {
  now?: Date | string;
}

export interface CreateProgramForClientOptions
  extends CaseloadMutationOptions {
  programId?: string;
  draftId?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isIsoTimestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date.toISOString() === value;
}

function isUniqueStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.every(isNonEmptyString) &&
    new Set(value).size === value.length
  );
}

function isCaseContext(value: unknown): boolean {
  return isLegacyWorkspaceSnapshot({
    version: 1,
    caseContext: value,
    draft: null,
    confirmedProgram: null,
    activities: [],
  });
}

export function isSyntheticClient(value: unknown): value is SyntheticClient {
  if (!isRecord(value)) return false;
  return (
    isNonEmptyString(value.id) &&
    isNonEmptyString(value.displayName) &&
    value.synthetic === true &&
    isCaseContext(value.caseContext)
  );
}

function isLegacyConfirmedProgramSnapshot(
  value: unknown,
): value is ConfirmedProgram {
  if (!isRecord(value) || !isRecord(value.caseContext)) return false;
  return isLegacyWorkspaceSnapshot({
      version: 1,
      caseContext: value.caseContext,
      draft: value,
      confirmedProgram: value,
      activities: [],
    });
}

function normalizeLegacyConfirmedProgram(
  program: ConfirmedProgram,
): ConfirmedProgram {
  const createdAt = validTimestampOr(
    program.createdAt,
    CASELOAD_SEED_TIMESTAMP,
  );
  const candidateConfirmedAt = validTimestampOr(
    program.confirmedAt,
    createdAt,
  );
  return {
    ...cloneWorkspaceValue(program),
    createdAt,
    confirmedAt:
      candidateConfirmedAt < createdAt ? createdAt : candidateConfirmedAt,
  };
}

function draftFromConfirmedProgram(
  program: ConfirmedProgram,
): ProgramDraft {
  const draft = cloneWorkspaceValue(program) as ProgramDraft &
    Partial<Pick<ConfirmedProgram, "code" | "confirmedAt" | "confirmedBy">>;
  delete draft.code;
  delete draft.confirmedAt;
  delete draft.confirmedBy;
  return draft;
}

function isConfirmedProgramSnapshot(value: unknown): value is ConfirmedProgram {
  return (
    isLegacyConfirmedProgramSnapshot(value) &&
    isIsoTimestamp(value.createdAt) &&
    isIsoTimestamp(value.confirmedAt) &&
    value.confirmedAt >= value.createdAt
  );
}

export function isTherapistProgramRecord(
  value: unknown,
): value is TherapistProgramRecord {
  if (!isRecord(value)) return false;
  if (
    !isNonEmptyString(value.programId) ||
    !isNonEmptyString(value.clientId) ||
    (value.status !== "draft" &&
      value.status !== "confirmed" &&
      value.status !== "archived") ||
    !isLegacyWorkspaceSnapshot(value.workspace) ||
    !isUniqueStringArray(value.confirmedCodes) ||
    !isRecord(value.confirmedVersions) ||
    !isIsoTimestamp(value.createdAt) ||
    !isIsoTimestamp(value.updatedAt) ||
    (value.archivedAt !== undefined && !isIsoTimestamp(value.archivedAt))
  ) {
    return false;
  }

  if (value.updatedAt < value.createdAt) return false;

  const workspace = value.workspace;
  const confirmedVersions = value.confirmedVersions as Record<string, unknown>;
  const versionCodes = Object.keys(confirmedVersions);
  if (
    versionCodes.length !== value.confirmedCodes.length ||
    !value.confirmedCodes.every((code) => {
      const version = confirmedVersions[code];
      return isConfirmedProgramSnapshot(version) && version.code === code;
    })
  ) {
    return false;
  }
  const confirmedCode = workspace.confirmedProgram?.code;
  if (confirmedCode && !value.confirmedCodes.includes(confirmedCode)) {
    return false;
  }

  if (
    value.status === "confirmed" &&
    (!confirmedCode || value.confirmedCodes.at(-1) !== confirmedCode)
  ) {
    return false;
  }
  if (value.status === "draft" && workspace.confirmedProgram !== null) {
    return false;
  }
  if (value.status === "draft" && workspace.draft === null) {
    return false;
  }
  if (value.status === "archived" && value.archivedAt === undefined) {
    return false;
  }
  if (
    value.status === "archived" &&
    value.archivedAt !== undefined &&
    value.archivedAt < value.createdAt
  ) {
    return false;
  }
  if (value.status !== "archived" && value.archivedAt !== undefined) {
    return false;
  }

  return true;
}

export function isTherapistCaseloadStore(
  value: unknown,
): value is TherapistCaseloadStore {
  if (
    !isRecord(value) ||
    value.version !== 2 ||
    !isNonEmptyString(value.activeClientId) ||
    (value.activeProgramId !== null &&
      !isNonEmptyString(value.activeProgramId)) ||
    !isRecord(value.clientsById) ||
    !isRecord(value.programsById)
  ) {
    return false;
  }

  const requiredClientIds = new Set(
    SYNTHETIC_CLIENTS.map((client) => client.id),
  );
  const clientEntries = Object.entries(value.clientsById);
  if (
    clientEntries.length !== requiredClientIds.size ||
    !clientEntries.every(
      ([key, client]) =>
        requiredClientIds.has(key) &&
        isSyntheticClient(client) &&
        client.id === key,
    ) ||
    !isRecord(value.clientsById[value.activeClientId])
  ) {
    return false;
  }

  const seenCodes = new Set<string>();
  const clientsWithDrafts = new Set<string>();
  for (const [key, candidate] of Object.entries(value.programsById)) {
    if (
      !isTherapistProgramRecord(candidate) ||
      candidate.programId !== key ||
      !isRecord(value.clientsById[candidate.clientId])
    ) {
      return false;
    }
    if (candidate.status === "draft") {
      if (clientsWithDrafts.has(candidate.clientId)) return false;
      clientsWithDrafts.add(candidate.clientId);
    }
    for (const code of candidate.confirmedCodes) {
      if (seenCodes.has(code)) return false;
      seenCodes.add(code);
    }
  }

  if (value.activeProgramId !== null) {
    const active = value.programsById[value.activeProgramId];
    if (
      !isTherapistProgramRecord(active) ||
      active.clientId !== value.activeClientId ||
      active.status === "archived"
    ) {
      return false;
    }
  }

  return true;
}

function resolveStorage(
  override?: CaseloadStorageLike,
): CaseloadStorageLike | null {
  if (override) return override;
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function safeParse(raw: string | null): unknown {
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

function parseStoredCaseload(
  storage: CaseloadStorageLike,
): TherapistCaseloadStore | null {
  try {
    const parsed = safeParse(storage.getItem(CASELOAD_STORAGE_KEY));
    return isTherapistCaseloadStore(parsed) ? cloneCaseloadStore(parsed) : null;
  } catch {
    return null;
  }
}

function persistCaseload(
  storage: CaseloadStorageLike,
  store: TherapistCaseloadStore,
): boolean {
  if (!isTherapistCaseloadStore(store)) return false;
  try {
    storage.setItem(CASELOAD_STORAGE_KEY, JSON.stringify(store));
    return true;
  } catch {
    return false;
  }
}

function validTimestampOr(
  candidate: string | undefined,
  fallback: string,
): string {
  return isIsoTimestamp(candidate) ? candidate : fallback;
}

function legacyProgramId(workspace: LegacyWorkspaceSnapshot): string {
  const source =
    workspace.confirmedProgram?.id ?? workspace.draft?.id ?? "workspace";
  const safe = source.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 96);
  return `program-legacy-${safe || "workspace"}`;
}

function extractLegacyConfirmedPrograms(value: unknown): ConfirmedProgram[] {
  if (
    !isRecord(value) ||
    value.version !== 1 ||
    !isRecord(value.programs)
  ) {
    return [];
  }
  return Object.entries(value.programs)
    .filter(
      (entry): entry is [string, ConfirmedProgram] =>
        isLegacyConfirmedProgramSnapshot(entry[1]) &&
        entry[1].code === entry[0],
    )
    .map(([, program]) => normalizeLegacyConfirmedProgram(program))
    .sort((a, b) => a.confirmedAt.localeCompare(b.confirmedAt));
}

/** Pure, deterministic V1 migration. Input objects are never mutated. */
export function migrateLegacyWorkspace(
  value: unknown,
  legacyProgramsValue: unknown = null,
): TherapistCaseloadStore {
  const store = createSeedCaseload();
  const hasWorkspace = isLegacyWorkspaceSnapshot(value);
  const importedVersions = extractLegacyConfirmedPrograms(legacyProgramsValue);
  if (!hasWorkspace && importedVersions.length === 0) return store;

  const client = store.clientsById[DEFAULT_SYNTHETIC_CLIENT_ID];
  if (!client) return store;
  const legacy = hasWorkspace ? value : null;
  if (legacy) client.caseContext = cloneWorkspaceSnapshot(legacy).caseContext;

  const latestImported = importedVersions.at(-1) ?? null;
  const fallbackWorkspace: TherapistWorkspaceSnapshot = {
    version: 1,
    caseContext: cloneWorkspaceValue(client.caseContext),
    draft: null,
    confirmedProgram: latestImported,
    activities: [],
  };
  const workspace = legacy
    ? cloneWorkspaceSnapshot(legacy as TherapistWorkspaceSnapshot)
    : fallbackWorkspace;
  const currentConfirmed = workspace.confirmedProgram
    ? normalizeLegacyConfirmedProgram(workspace.confirmedProgram)
    : null;
  if (currentConfirmed) workspace.confirmedProgram = currentConfirmed;
  const allVersions = [...importedVersions];
  if (
    currentConfirmed &&
    !allVersions.some((program) => program.code === currentConfirmed.code)
  ) {
    allVersions.push(cloneWorkspaceValue(currentConfirmed));
    allVersions.sort((a, b) => a.confirmedAt.localeCompare(b.confirmedAt));
  }
  const confirmedCodes = allVersions.map((program) => program.code);
  const confirmedVersions = Object.fromEntries(
    allVersions.map((program) => [program.code, cloneWorkspaceValue(program)]),
  );
  if (workspace.confirmedProgram && allVersions.length > 0) {
    const latestConfirmed = cloneWorkspaceValue(allVersions.at(-1)!);
    const latestContext = cloneWorkspaceValue(latestConfirmed.caseContext);
    workspace.confirmedProgram = latestConfirmed;
    workspace.draft = draftFromConfirmedProgram(latestConfirmed);
    workspace.caseContext = latestContext;
    client.caseContext = cloneWorkspaceValue(latestContext);
  }
  const programId = legacy
    ? legacyProgramId(legacy)
    : `program-legacy-${latestImported?.id ?? "registry"}`;
  const createdAt = validTimestampOr(
    workspace.draft?.createdAt ??
      workspace.confirmedProgram?.createdAt ??
      latestImported?.createdAt,
    CASELOAD_SEED_TIMESTAMP,
  );
  const newestActivityAt = workspace.activities
    .map((activity) => activity.createdAt)
    .filter(isIsoTimestamp)
    .sort()
    .at(-1);
  const candidateUpdatedAt = validTimestampOr(
    allVersions.at(-1)?.confirmedAt ?? newestActivityAt,
    createdAt,
  );
  const updatedAt =
    candidateUpdatedAt < createdAt ? createdAt : candidateUpdatedAt;
  if (!workspace.draft && !workspace.confirmedProgram) {
    if (latestImported) workspace.confirmedProgram = latestImported;
    else workspace.draft = emptyDraft(client, "draft_legacy_workspace", createdAt);
  }
  const record: TherapistProgramRecord = {
    programId,
    clientId: DEFAULT_SYNTHETIC_CLIENT_ID,
    status: programStatusFromWorkspace(workspace),
    workspace,
    confirmedCodes,
    confirmedVersions,
    createdAt,
    updatedAt,
  };

  store.programsById[programId] = record;
  store.activeClientId = DEFAULT_SYNTHETIC_CLIENT_ID;
  store.activeProgramId = programId;
  return store;
}

function readLegacyWorkspace(storage: CaseloadStorageLike): unknown {
  try {
    return safeParse(storage.getItem(LEGACY_WORKSPACE_STORAGE_KEY));
  } catch {
    return null;
  }
}

function readLegacyPrograms(storage: CaseloadStorageLike): unknown {
  try {
    return safeParse(storage.getItem(LEGACY_PROGRAMS_STORAGE_KEY));
  } catch {
    return null;
  }
}

/**
 * Reads V2, or performs an idempotent migration/seed when V2 is absent. V1 is
 * intentionally never removed, so the existing singleton and patient routes
 * remain independently recoverable during rollout.
 */
export function readCaseload(
  options: CaseloadAccessOptions = {},
): TherapistCaseloadStore {
  const storage = resolveStorage(options.storage);
  if (!storage) return createSeedCaseload();

  const stored = parseStoredCaseload(storage);
  if (stored) return stored;

  const migrated = migrateLegacyWorkspace(
    readLegacyWorkspace(storage),
    readLegacyPrograms(storage),
  );
  persistCaseload(storage, migrated);
  return cloneCaseloadStore(migrated);
}

export function listClients(
  options: CaseloadAccessOptions = {},
): SyntheticClient[] {
  return Object.values(readCaseload(options).clientsById)
    .sort((a, b) => a.displayName.localeCompare(b.displayName))
    .map((client) => cloneWorkspaceValue(client));
}

export function getClient(
  clientId: string,
  options: CaseloadAccessOptions = {},
): SyntheticClient | null {
  const clients = readCaseload(options).clientsById;
  if (!Object.hasOwn(clients, clientId)) return null;
  const client = clients[clientId];
  return client ? cloneWorkspaceValue(client) : null;
}

export function updateClientCaseContext(
  clientId: string,
  caseContext: SyntheticClient["caseContext"],
  options: CaseloadAccessOptions = {},
): boolean {
  if (!isCaseContext(caseContext)) return false;
  const storage = resolveStorage(options.storage);
  if (!storage) return false;
  const store = readCaseload({ storage });
  const client = store.clientsById[clientId];
  if (!client) return false;
  client.caseContext = cloneWorkspaceValue(caseContext);
  return persistCaseload(storage, store);
}

export function listProgramsForClient(
  clientId: string,
  options: CaseloadAccessOptions = {},
): TherapistProgramRecord[] {
  return Object.values(readCaseload(options).programsById)
    .filter((program) => program.clientId === clientId)
    .sort(
      (a, b) =>
        b.updatedAt.localeCompare(a.updatedAt) ||
        a.programId.localeCompare(b.programId),
    )
    .map(cloneProgramRecord);
}

export function getProgram(
  programId: string,
  options: CaseloadAccessOptions = {},
): TherapistProgramRecord | null {
  const programs = readCaseload(options).programsById;
  if (!Object.hasOwn(programs, programId)) return null;
  const program = programs[programId];
  return program ? cloneProgramRecord(program) : null;
}

export function readProgramWorkspace(
  programId: string,
  options: CaseloadAccessOptions = {},
): TherapistWorkspaceSnapshot | null {
  const programs = readCaseload(options).programsById;
  if (!Object.hasOwn(programs, programId)) return null;
  const program = programs[programId];
  return program ? cloneWorkspaceSnapshot(program.workspace) : null;
}

export function readProgramWorkspaceForClient(
  clientId: string,
  programId: string,
  options: CaseloadAccessOptions = {},
): TherapistWorkspaceSnapshot | null {
  const programs = readCaseload(options).programsById;
  if (!Object.hasOwn(programs, programId)) return null;
  const program = programs[programId];
  return program?.clientId === clientId && program.status !== "archived"
    ? cloneWorkspaceSnapshot(program.workspace)
    : null;
}

function cloneWorkspaceValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function timestamp(value: Date | string | undefined): string | null {
  const candidate = value ?? new Date();
  const date = candidate instanceof Date ? candidate : new Date(candidate);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function secureId(prefix: string): string | null {
  try {
    if (typeof globalThis.crypto?.randomUUID !== "function") return null;
    return `${prefix}_${globalThis.crypto.randomUUID()}`;
  } catch {
    return null;
  }
}

function emptyDraft(
  client: SyntheticClient,
  draftId: string,
  createdAt: string,
): ProgramDraft {
  return {
    id: draftId,
    patientLabel: client.caseContext.patientLabel,
    caseContext: cloneWorkspaceValue(client.caseContext),
    items: [],
    estimatedMinutes: 0,
    warnings: [
      "Competition demo catalog only — therapist review is required before confirmation.",
    ],
    createdAt,
    source: "therapist",
    revision: 1,
  };
}

export function createProgramForClient(
  clientId: string,
  options: CreateProgramForClientOptions = {},
): TherapistProgramRecord | null {
  const storage = resolveStorage(options.storage);
  if (!storage) return null;
  const store = readCaseload({ storage });
  const client = store.clientsById[clientId];
  const createdAt = timestamp(options.now);
  const programId = options.programId ?? secureId("program");
  const draftId = options.draftId ?? secureId("draft");
  if (
    !client ||
    !createdAt ||
    !isNonEmptyString(programId) ||
    !isNonEmptyString(draftId) ||
    store.programsById[programId] ||
    Object.values(store.programsById).some(
      (program) =>
        program.clientId === clientId && program.status === "draft",
    )
  ) {
    return null;
  }

  const workspace: TherapistWorkspaceSnapshot = {
    version: 1,
    caseContext: cloneWorkspaceValue(client.caseContext),
    draft: emptyDraft(client, draftId, createdAt),
    confirmedProgram: null,
    activities: [],
  };
  const record: TherapistProgramRecord = {
    programId,
    clientId,
    status: "draft",
    workspace,
    confirmedCodes: [],
    confirmedVersions: {},
    createdAt,
    updatedAt: createdAt,
  };
  store.programsById[programId] = record;
  store.activeClientId = clientId;
  store.activeProgramId = programId;
  return persistCaseload(storage, store) ? cloneProgramRecord(record) : null;
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function persistProgramWorkspaceMutation(
  storage: CaseloadStorageLike,
  store: TherapistCaseloadStore,
  programId: string,
  snapshot: TherapistWorkspaceSnapshot,
  updatedAt: string,
  expectedClientId?: string,
  syncClientContext = false,
): boolean {
  const current = store.programsById[programId];
  if (
    !current ||
    current.status === "archived" ||
    (expectedClientId !== undefined && current.clientId !== expectedClientId)
  ) {
    return false;
  }

  const client = store.clientsById[current.clientId];
  if (!client) return false;

  const workspaceChanged = !sameJson(current.workspace, snapshot);
  const clientContextChanged =
    syncClientContext && !sameJson(client.caseContext, snapshot.caseContext);
  if (!workspaceChanged && !clientContextChanged) return true;

  if (workspaceChanged) {
    const nextStatus = programStatusFromWorkspace(snapshot);
    if (
      nextStatus === "draft" &&
      current.status !== "draft" &&
      Object.values(store.programsById).some(
        (program) =>
          program.programId !== programId &&
          program.clientId === current.clientId &&
          program.status === "draft",
      )
    ) {
      return false;
    }

    const nextConfirmed = snapshot.confirmedProgram;
    const confirmedCodes = [...current.confirmedCodes];
    const confirmedVersions = cloneWorkspaceValue(current.confirmedVersions);
    if (nextConfirmed) {
      const existingVersion = confirmedVersions[nextConfirmed.code];
      if (existingVersion && !sameJson(existingVersion, nextConfirmed)) {
        return false;
      }
      if (!existingVersion) {
        confirmedCodes.push(nextConfirmed.code);
        confirmedVersions[nextConfirmed.code] =
          cloneWorkspaceValue(nextConfirmed);
      }
    }

    const next: TherapistProgramRecord = {
      ...current,
      status: nextStatus,
      workspace: cloneWorkspaceSnapshot(snapshot),
      confirmedCodes,
      confirmedVersions,
      updatedAt,
    };
    delete next.archivedAt;
    store.programsById[programId] = next;
    store.activeClientId = current.clientId;
    store.activeProgramId = programId;
  }

  if (clientContextChanged) {
    client.caseContext = cloneWorkspaceValue(snapshot.caseContext);
  }

  return persistCaseload(storage, store);
}

export function writeProgramWorkspace(
  programId: string,
  snapshot: TherapistWorkspaceSnapshot,
  options: CaseloadMutationOptions = {},
): boolean {
  if (!isLegacyWorkspaceSnapshot(snapshot)) return false;
  const storage = resolveStorage(options.storage);
  const updatedAt = timestamp(options.now);
  if (!storage || !updatedAt) return false;

  const store = readCaseload({ storage });
  return persistProgramWorkspaceMutation(
    storage,
    store,
    programId,
    snapshot,
    updatedAt,
  );
}

export function writeProgramWorkspaceForClient(
  clientId: string,
  programId: string,
  snapshot: TherapistWorkspaceSnapshot,
  options: CaseloadMutationOptions = {},
): boolean {
  if (!isLegacyWorkspaceSnapshot(snapshot)) return false;
  const storage = resolveStorage(options.storage);
  const updatedAt = timestamp(options.now);
  if (!storage || !updatedAt) return false;
  return persistProgramWorkspaceMutation(
    storage,
    readCaseload({ storage }),
    programId,
    snapshot,
    updatedAt,
    clientId,
  );
}

/**
 * Atomically updates the route-bound program and its synthetic client context
 * inside the single V2 caseload record. This is the commit path for agent
 * drafts and case edits, so a failed write cannot leave the two out of sync.
 */
export function writeClientProgramWorkspace(
  clientId: string,
  programId: string,
  snapshot: TherapistWorkspaceSnapshot,
  options: CaseloadMutationOptions = {},
): boolean {
  if (!isLegacyWorkspaceSnapshot(snapshot)) return false;
  const storage = resolveStorage(options.storage);
  const updatedAt = timestamp(options.now);
  if (!storage || !updatedAt) return false;
  return persistProgramWorkspaceMutation(
    storage,
    readCaseload({ storage }),
    programId,
    snapshot,
    updatedAt,
    clientId,
    true,
  );
}

export function setProgramStatus(
  programId: string,
  status: ProgramStatus,
  options: CaseloadMutationOptions = {},
): boolean {
  const storage = resolveStorage(options.storage);
  const updatedAt = timestamp(options.now);
  if (!storage || !updatedAt) return false;
  const store = readCaseload({ storage });
  const current = store.programsById[programId];
  if (!current) return false;

  if (status === "confirmed" && !current.workspace.confirmedProgram) {
    return false;
  }
  if (
    status === "draft" &&
    (!current.workspace.draft || current.workspace.confirmedProgram)
  ) {
    return false;
  }
  if (
    status === "draft" &&
    current.status !== "draft" &&
    Object.values(store.programsById).some(
      (program) =>
        program.programId !== programId &&
        program.clientId === current.clientId &&
        program.status === "draft",
    )
  ) {
    return false;
  }

  const next: TherapistProgramRecord = {
    ...current,
    status,
    updatedAt,
  };
  if (status === "archived") next.archivedAt = updatedAt;
  else delete next.archivedAt;

  store.programsById[programId] = next;
  if (status === "archived" && store.activeProgramId === programId) {
    const replacement = Object.values(store.programsById)
      .filter(
        (program) =>
          program.clientId === current.clientId &&
          program.programId !== programId &&
          program.status !== "archived",
      )
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
    store.activeProgramId = replacement?.programId ?? null;
  }
  return persistCaseload(storage, store);
}
