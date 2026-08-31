import type {
  SyntheticClient,
  TherapistCaseloadStore,
  TherapistProgramRecord,
} from "./caseload.ts";
import type { AgentActivity, ConfirmedProgram } from "./types.ts";

export type ClientStatus = "needs-review" | "draft" | "active" | "no-plan";
export type ClientStatusFilter = "all" | ClientStatus;

export const CLIENT_STATUS_FILTERS = [
  { value: "all", label: "All clients" },
  { value: "needs-review", label: "Needs review" },
  { value: "draft", label: "Draft" },
  { value: "active", label: "Active" },
  { value: "no-plan", label: "No plan" },
] as const;

export const DIRECTORY_CLIENT_LIMIT = 3;
export const CLIENT_HISTORY_LIMIT = 20;
export const CLIENT_ACTIVITY_LIMIT = 5;

export interface ConfirmedVersionSelection {
  program: TherapistProgramRecord;
  version: ConfirmedProgram;
}

export interface ClientProgramView {
  client: SyntheticClient;
  programs: TherapistProgramRecord[];
  draftProgram: TherapistProgramRecord | null;
  currentProgram: TherapistProgramRecord | null;
  activeProgram: TherapistProgramRecord | null;
  activeConfirmedProgram: ConfirmedProgram | null;
  previousConfirmedVersions: ConfirmedVersionSelection[];
  nonVersionHistoryPrograms: TherapistProgramRecord[];
  historyCount: number;
  recentActivity: Array<AgentActivity & { programId: string }>;
  status: ClientStatus;
  statusLabel: string;
  clientStatusLabel: string;
  itemCount: number;
  hasActiveProgram: boolean;
  updatedAt?: string;
  nextStep: { label: string; href: string };
}

export interface ClientDirectoryFilters {
  query: string;
  status: ClientStatusFilter;
}

export interface ClientDirectoryView {
  filters: ClientDirectoryFilters;
  clients: ClientProgramView[];
  visibleClients: ClientProgramView[];
  counts: { total: number; review: number; active: number; drafts: number };
}

export function clientHref(clientId: string): string {
  return `/therapist/clients/${encodeURIComponent(clientId)}`;
}

export function programHref(clientId: string, programId: string): string {
  return `${clientHref(clientId)}/programs/${encodeURIComponent(programId)}`;
}

/** One deterministic version order shared by the directory, hub and tools. */
export function selectConfirmedVersions(
  programs: readonly TherapistProgramRecord[],
): ConfirmedVersionSelection[] {
  return programs
    .flatMap((program) =>
      program.confirmedCodes.flatMap((code) => {
        const version = program.confirmedVersions[code];
        return version ? [{ program, version }] : [];
      }),
    )
    .sort(
      (a, b) =>
        b.version.confirmedAt.localeCompare(a.version.confirmedAt) ||
        a.program.programId.localeCompare(b.program.programId) ||
        a.version.code.localeCompare(b.version.code),
    );
}

export function selectClientProgramView(
  client: SyntheticClient,
  candidates: readonly TherapistProgramRecord[],
): ClientProgramView {
  const programs = candidates
    .filter((program) => program.clientId === client.id)
    .sort(
      (a, b) =>
        b.updatedAt.localeCompare(a.updatedAt) ||
        a.programId.localeCompare(b.programId),
    );
  const draftProgram = programs.find((program) => program.status === "draft") ?? null;
  const versions = selectConfirmedVersions(programs);
  const activeSelection =
    versions.find(({ program }) => program.status !== "archived") ?? null;
  const activeProgram = activeSelection?.program ?? null;
  const activeConfirmedProgram = activeSelection?.version ?? null;
  const previousConfirmedVersions = versions.filter(
    ({ version }) => version.code !== activeConfirmedProgram?.code,
  );
  const nonVersionHistoryPrograms = programs.filter(
    (program) =>
      program.programId !== draftProgram?.programId &&
      program.confirmedCodes.length === 0,
  );
  const draft = draftProgram?.workspace.draft;
  const status: ClientStatus = draftProgram
    ? draft?.source === "agent" && draft.items.length > 0
      ? "needs-review"
      : "draft"
    : activeProgram
      ? "active"
      : "no-plan";
  const statusLabel = {
    "needs-review": "Needs review",
    draft: "Draft",
    active: "Active",
    "no-plan": "No plan",
  }[status];
  const clientStatusLabel = {
    "needs-review": "Agent draft needs review",
    draft: "Draft in progress",
    active: "Active care plan",
    "no-plan": "Ready for a prescription",
  }[status];
  const nextStep = draftProgram
    ? {
        label: status === "needs-review" ? "Review draft" : "Continue draft",
        href: programHref(client.id, draftProgram.programId),
      }
    : {
        label: status === "active" ? "View care plan" : "Open client",
        href: clientHref(client.id),
      };

  return {
    client,
    programs,
    draftProgram,
    currentProgram: draftProgram ?? activeProgram,
    activeProgram,
    activeConfirmedProgram,
    previousConfirmedVersions,
    nonVersionHistoryPrograms,
    historyCount: previousConfirmedVersions.length + nonVersionHistoryPrograms.length,
    recentActivity: programs
      .flatMap((program) =>
        program.workspace.activities.map((activity) => ({
          ...activity,
          programId: program.programId,
        })),
      )
      .sort(
        (a, b) =>
          b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id),
      )
      .slice(0, CLIENT_ACTIVITY_LIMIT),
    status,
    statusLabel,
    clientStatusLabel,
    itemCount: draftProgram
      ? (draft?.items.length ?? 0)
      : (activeConfirmedProgram?.items.length ?? 0),
    hasActiveProgram: activeSelection !== null,
    updatedAt: draftProgram?.updatedAt ?? activeConfirmedProgram?.confirmedAt,
    nextStep,
  };
}

export function selectClientView(
  store: TherapistCaseloadStore,
  clientId: string,
): ClientProgramView | null {
  if (!Object.hasOwn(store.clientsById, clientId)) return null;
  const client = store.clientsById[clientId];
  return client
    ? selectClientProgramView(client, Object.values(store.programsById))
    : null;
}

export function selectClientDirectory(
  store: TherapistCaseloadStore,
  filters: ClientDirectoryFilters = { query: "", status: "all" },
): ClientDirectoryView {
  const clients = Object.values(store.clientsById)
    .sort((a, b) => a.displayName.localeCompare(b.displayName, "en-US"))
    .map((client) => selectClientProgramView(client, Object.values(store.programsById)));
  const query = filters.query.trim().toLocaleLowerCase("en-US");
  const visibleClients = clients.filter((view) => {
    if (filters.status !== "all" && view.status !== filters.status) return false;
    const context = view.client.caseContext;
    return !query || [
      view.client.displayName,
      context.diagnosis,
      context.bodyRegion,
      ...context.goals,
    ].filter(Boolean).join(" ").toLocaleLowerCase("en-US").includes(query);
  });
  return {
    filters: { ...filters },
    clients,
    visibleClients,
    counts: {
      total: clients.length,
      review: clients.filter((view) => view.status === "needs-review").length,
      active: clients.filter((view) => view.hasActiveProgram).length,
      drafts: clients.filter((view) => view.draftProgram !== null).length,
    },
  };
}

/** Allowlisted tool output: no case notes, dosages, codes or raw workspaces. */
export function projectClientDirectory(view: ClientDirectoryView) {
  return {
    synthetic: true,
    filters: { ...view.filters },
    totals: {
      clients: view.counts.total,
      needsReview: view.counts.review,
      activePrograms: view.counts.active,
    },
    shown: view.visibleClients.length,
    limit: DIRECTORY_CLIENT_LIMIT,
    truncated: view.visibleClients.length > DIRECTORY_CLIENT_LIMIT,
    clients: view.visibleClients.slice(0, DIRECTORY_CLIENT_LIMIT).map((summary) => ({
      clientId: summary.client.id,
      displayName: summary.client.displayName,
      synthetic: true,
      status: summary.status,
      statusLabel: summary.statusLabel,
      itemCount: summary.itemCount,
      hasActiveProgram: summary.hasActiveProgram,
      updatedAt: summary.updatedAt ?? null,
      clientHref: clientHref(summary.client.id),
      nextStep: { ...summary.nextStep },
    })),
  };
}

function confirmedVersionSummary({ program, version }: ConfirmedVersionSelection) {
  return {
    programId: program.programId,
    code: version.code,
    revision: version.revision,
    itemCount: version.items.length,
    estimatedMinutes: version.estimatedMinutes,
    confirmedAt: version.confirmedAt,
    confirmedBy: version.confirmedBy,
    editorHref: programHref(program.clientId, program.programId),
    patientHref: `/patient/${encodeURIComponent(version.code)}`,
  };
}

/** Only fields rendered by the client hub; never raw prescription/session data. */
export function projectClientSummary(view: ClientProgramView) {
  const context = view.client.caseContext;
  const draftRecord = view.draftProgram;
  const draft = draftRecord?.workspace.draft;
  const history = [
    ...view.previousConfirmedVersions.map(({ program, version }) => ({
      kind: "confirmed_version" as const,
      programId: program.programId,
      code: version.code,
      revision: version.revision,
      itemCount: version.items.length,
      confirmedAt: version.confirmedAt,
      editorHref: programHref(program.clientId, program.programId),
      patientHref: `/patient/${encodeURIComponent(version.code)}`,
    })),
    ...view.nonVersionHistoryPrograms.map((program) => ({
      kind: "program" as const,
      programId: program.programId,
      status: program.status,
      itemCount: program.workspace.draft?.items.length ?? 0,
      updatedAt: program.updatedAt,
      editorHref: programHref(program.clientId, program.programId),
    })),
  ];
  return {
    synthetic: true,
    clientId: view.client.id,
    displayName: view.client.displayName,
    status: view.status,
    statusLabel: view.clientStatusLabel,
    caseContext: {
      diagnosis: context.diagnosis,
      goals: [...context.goals],
      minutesPerDay: context.minutesPerDay,
      bodyRegion: context.bodyRegion,
      postOpWeeks: context.postOpWeeks,
      procedure: context.procedure,
      protocol: context.protocol,
      equipment: [...context.equipment],
      notes: context.notes,
    },
    currentDraft: draftRecord && draft ? {
      programId: draftRecord.programId,
      revision: draft.revision,
      source: draft.source,
      itemCount: draft.items.length,
      estimatedMinutes: draft.estimatedMinutes,
      updatedAt: draftRecord.updatedAt,
      needsReview: view.status === "needs-review",
      editorHref: programHref(view.client.id, draftRecord.programId),
    } : null,
    activeConfirmedVersion: view.activeProgram && view.activeConfirmedProgram
      ? confirmedVersionSummary({ program: view.activeProgram, version: view.activeConfirmedProgram })
      : null,
    history: {
      total: view.historyCount,
      limit: CLIENT_HISTORY_LIMIT,
      truncated: history.length > CLIENT_HISTORY_LIMIT,
      entries: history.slice(0, CLIENT_HISTORY_LIMIT),
    },
    recentActivity: view.recentActivity.slice(0, CLIENT_ACTIVITY_LIMIT).map((activity) => ({
      actor: activity.actor,
      action: activity.action,
      detail: activity.detail,
      createdAt: activity.createdAt,
    })),
    totalPrograms: view.programs.length,
  };
}
