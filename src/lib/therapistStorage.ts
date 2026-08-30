import type {
  AgentActivity,
  BodyRegion,
  CaseContext,
  ConfirmedProgram,
  ProgramDraft,
  ProgramItem,
} from "@/domain/types";

const STORAGE_KEY = "coachpoint:therapist-workspace:v1";
const PROGRAMS_KEY = "coachpoint:confirmed-programs:v1";
const CASELOAD_KEY = "coachpoint:therapist-caseload:v2";

export interface TherapistWorkspaceSnapshot {
  version: 1;
  caseContext: CaseContext;
  draft: ProgramDraft | null;
  confirmedProgram: ConfirmedProgram | null;
  activities: AgentActivity[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === "string";
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

const BODY_REGIONS = new Set<BodyRegion>([
  "neck",
  "shoulder",
  "hand",
  "back",
  "hip",
  "knee",
  "ankle",
  "balance",
]);

function isCaseContext(value: unknown): value is CaseContext {
  if (!isRecord(value)) return false;
  return (
    typeof value.patientLabel === "string" &&
    typeof value.diagnosis === "string" &&
    isStringArray(value.goals) &&
    isFiniteNumber(value.minutesPerDay) &&
    (value.bodyRegion === undefined ||
      (typeof value.bodyRegion === "string" &&
        BODY_REGIONS.has(value.bodyRegion as BodyRegion))) &&
    (value.postOpWeeks === undefined || isFiniteNumber(value.postOpWeeks)) &&
    isOptionalString(value.procedure) &&
    isOptionalString(value.protocol) &&
    isStringArray(value.equipment) &&
    isOptionalString(value.notes)
  );
}

function isProgramItem(value: unknown): value is ProgramItem {
  if (!isRecord(value)) return false;
  return (
    typeof value.exerciseId === "string" &&
    isFiniteNumber(value.sets) &&
    (value.reps === undefined || isFiniteNumber(value.reps)) &&
    (value.holdSeconds === undefined || isFiniteNumber(value.holdSeconds)) &&
    isFiniteNumber(value.frequencyPerDay) &&
    isFiniteNumber(value.restSeconds) &&
    isOptionalString(value.therapistNote)
  );
}

function isProgramDraft(value: unknown): value is ProgramDraft {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    typeof value.patientLabel === "string" &&
    isCaseContext(value.caseContext) &&
    Array.isArray(value.items) &&
    value.items.every(isProgramItem) &&
    isFiniteNumber(value.estimatedMinutes) &&
    isStringArray(value.warnings) &&
    typeof value.createdAt === "string" &&
    (value.source === "agent" || value.source === "therapist") &&
    isFiniteNumber(value.revision)
  );
}

function isConfirmedProgram(value: unknown): value is ConfirmedProgram {
  return (
    isProgramDraft(value) &&
    isRecord(value) &&
    typeof value.code === "string" &&
    typeof value.confirmedAt === "string" &&
    value.confirmedBy === "therapist"
  );
}

function isAgentActivity(value: unknown): value is AgentActivity {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    (value.actor === "agent" ||
      value.actor === "therapist" ||
      value.actor === "system") &&
    typeof value.action === "string" &&
    typeof value.detail === "string" &&
    typeof value.createdAt === "string"
  );
}

export function isTherapistWorkspaceSnapshot(
  value: unknown,
): value is TherapistWorkspaceSnapshot {
  if (!isRecord(value) || value.version !== 1) return false;
  return (
    isCaseContext(value.caseContext) &&
    (value.draft === null || isProgramDraft(value.draft)) &&
    (value.confirmedProgram === null ||
      isConfirmedProgram(value.confirmedProgram)) &&
    Array.isArray(value.activities) &&
    value.activities.every(isAgentActivity)
  );
}

export function readTherapistWorkspace(): TherapistWorkspaceSnapshot | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isTherapistWorkspaceSnapshot(parsed)) {
      window.localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function writeTherapistWorkspace(
  snapshot: TherapistWorkspaceSnapshot,
): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
    return true;
  } catch {
    return false;
  }
}

export function clearTherapistWorkspace(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
}

interface ConfirmedProgramRegistry {
  version: 1;
  programs: Record<string, ConfirmedProgram>;
}

function readProgramRegistry(): ConfirmedProgramRegistry {
  if (typeof window === "undefined") return { version: 1, programs: {} };
  try {
    const raw = window.localStorage.getItem(PROGRAMS_KEY);
    if (!raw) return { version: 1, programs: {} };
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed) || parsed.version !== 1 || !isRecord(parsed.programs)) {
      return { version: 1, programs: {} };
    }
    const programs: Record<string, ConfirmedProgram> = {};
    for (const [code, program] of Object.entries(parsed.programs)) {
      if (isConfirmedProgram(program) && program.code === code) {
        programs[code] = program;
      }
    }
    return { version: 1, programs };
  } catch {
    return { version: 1, programs: {} };
  }
}

function readCaseloadConfirmedProgram(
  code: string,
): ConfirmedProgram | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CASELOAD_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      !isRecord(parsed) ||
      parsed.version !== 2 ||
      !isRecord(parsed.programsById)
    ) {
      return null;
    }
    for (const program of Object.values(parsed.programsById)) {
      if (!isRecord(program) || !isRecord(program.confirmedVersions)) {
        continue;
      }
      const version = program.confirmedVersions[code];
      if (isConfirmedProgram(version) && version.code === code) {
        return version;
      }
    }
    return null;
  } catch {
    return null;
  }
}

export function storeConfirmedProgram(program: ConfirmedProgram): boolean {
  if (typeof window === "undefined") return false;
  try {
    const registry = readProgramRegistry();
    const existing = registry.programs[program.code];
    if (existing) {
      return JSON.stringify(existing) === JSON.stringify(program);
    }
    registry.programs[program.code] = program;
    window.localStorage.setItem(PROGRAMS_KEY, JSON.stringify(registry));
    return true;
  } catch {
    return false;
  }
}

export function readConfirmedProgram(
  code: string,
): ConfirmedProgram | null {
  const caseloadProgram = readCaseloadConfirmedProgram(code);
  if (caseloadProgram) return caseloadProgram;
  const registry = readProgramRegistry();
  return registry.programs[code] ?? null;
}
