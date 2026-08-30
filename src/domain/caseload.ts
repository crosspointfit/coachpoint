import type {
  AgentActivity,
  CaseContext,
  ConfirmedProgram,
  ProgramDraft,
} from "./types.ts";

export type ProgramStatus = "draft" | "confirmed" | "archived";

/**
 * A deliberately synthetic client fixture. CoachPoint's competition demo must
 * never require real patient identifiers to demonstrate a caseload workflow.
 */
export interface SyntheticClient {
  id: string;
  displayName: string;
  synthetic: true;
  caseContext: CaseContext;
}

/**
 * The working state nested inside one logical program record. It intentionally
 * matches the existing V1 therapist workspace shape so migration is lossless.
 */
export interface TherapistWorkspaceSnapshot {
  version: 1;
  caseContext: CaseContext;
  draft: ProgramDraft | null;
  confirmedProgram: ConfirmedProgram | null;
  activities: AgentActivity[];
}

export interface TherapistProgramRecord {
  /** Stable logical identifier; draft IDs and confirmation codes are versions. */
  programId: string;
  clientId: string;
  status: ProgramStatus;
  workspace: TherapistWorkspaceSnapshot;
  /** Append-only confirmation lineage, ordered oldest to newest. */
  confirmedCodes: string[];
  /** Immutable snapshots keyed by the corresponding confirmation code. */
  confirmedVersions: Record<string, ConfirmedProgram>;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
}

export interface TherapistCaseloadStore {
  version: 2;
  activeClientId: string;
  activeProgramId: string | null;
  clientsById: Record<string, SyntheticClient>;
  programsById: Record<string, TherapistProgramRecord>;
}

export const DEFAULT_SYNTHETIC_CLIENT_ID = "demo-shoulder";
export const CASELOAD_SEED_TIMESTAMP = "2026-08-30T00:00:00.000Z";

const CLIENTS: SyntheticClient[] = [
  {
    id: DEFAULT_SYNTHETIC_CLIENT_ID,
    displayName: "Demo Client — Shoulder",
    synthetic: true,
    caseContext: {
      patientLabel: "Demo Client — Shoulder",
      diagnosis: "Synthetic shoulder impingement case, six weeks post-op",
      goals: ["comfortable shoulder mobility", "daily activity"],
      minutesPerDay: 15,
      bodyRegion: "shoulder",
      postOpWeeks: 6,
      procedure: "Therapist-entered synthetic demo procedure",
      protocol: "Week-six synthetic demo protocol",
      equipment: ["wall", "stick", "table"],
      notes:
        "Synthetic competition case. Verify every item against the applicable therapist-approved protocol.",
    },
  },
  {
    id: "demo-knee",
    displayName: "Demo Client — Knee",
    synthetic: true,
    caseContext: {
      patientLabel: "Demo Client — Knee",
      diagnosis: "Synthetic knee mobility and stair-tolerance case",
      goals: ["comfortable knee mobility", "stair confidence"],
      minutesPerDay: 12,
      bodyRegion: "knee",
      equipment: ["chair", "step", "wall"],
      notes:
        "Synthetic competition case. The therapist must review dosage and suitability before confirmation.",
    },
  },
  {
    id: "demo-balance",
    displayName: "Demo Client — Balance",
    synthetic: true,
    caseContext: {
      patientLabel: "Demo Client — Balance",
      diagnosis: "Synthetic balance confidence and lower-limb endurance case",
      goals: ["steadier standing balance", "walking confidence"],
      minutesPerDay: 10,
      bodyRegion: "balance",
      equipment: ["chair", "wall"],
      notes:
        "Synthetic competition case. Use stable support and therapist-selected safety progressions.",
    },
  },
];

for (const client of CLIENTS) {
  Object.freeze(client.caseContext.goals);
  Object.freeze(client.caseContext.equipment);
  Object.freeze(client.caseContext);
  Object.freeze(client);
}
Object.freeze(CLIENTS);

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** Stable fixtures. Consumers receive clones through getSyntheticClient. */
export const SYNTHETIC_CLIENTS: readonly Readonly<SyntheticClient>[] = CLIENTS;

export function getSyntheticClient(clientId: string): SyntheticClient | undefined {
  const client = CLIENTS.find((item) => item.id === clientId);
  return client ? cloneJson(client) : undefined;
}

export function createSeedCaseload(): TherapistCaseloadStore {
  const clientsById = Object.fromEntries(
    CLIENTS.map((client) => [client.id, cloneJson(client)]),
  );
  return {
    version: 2,
    activeClientId: DEFAULT_SYNTHETIC_CLIENT_ID,
    activeProgramId: null,
    clientsById,
    programsById: {},
  };
}

export function cloneCaseloadStore(
  store: TherapistCaseloadStore,
): TherapistCaseloadStore {
  return cloneJson(store);
}

export function cloneProgramRecord(
  program: TherapistProgramRecord,
): TherapistProgramRecord {
  return cloneJson(program);
}

export function cloneWorkspaceSnapshot(
  workspace: TherapistWorkspaceSnapshot,
): TherapistWorkspaceSnapshot {
  return cloneJson(workspace);
}

export function programStatusFromWorkspace(
  workspace: TherapistWorkspaceSnapshot,
): Exclude<ProgramStatus, "archived"> {
  return workspace.confirmedProgram ? "confirmed" : "draft";
}
