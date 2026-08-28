import type {
  AgentActivity,
  CaseContext,
  ConfirmedProgram,
  ProgramDraft,
} from "@/domain/types";

const STORAGE_KEY = "coachpoint:therapist-workspace:v1";
const PROGRAMS_KEY = "coachpoint:confirmed-programs:v1";

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

export function readTherapistWorkspace(): TherapistWorkspaceSnapshot | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed) || parsed.version !== 1) return null;
    if (!isRecord(parsed.caseContext) || !Array.isArray(parsed.activities)) {
      return null;
    }
    return parsed as unknown as TherapistWorkspaceSnapshot;
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
    if (
      !isRecord(parsed) ||
      parsed.version !== 1 ||
      !isRecord(parsed.programs)
    ) {
      return { version: 1, programs: {} };
    }
    return parsed as unknown as ConfirmedProgramRegistry;
  } catch {
    return { version: 1, programs: {} };
  }
}

export function storeConfirmedProgram(program: ConfirmedProgram): boolean {
  if (typeof window === "undefined") return false;
  try {
    const registry = readProgramRegistry();
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
  const registry = readProgramRegistry();
  return registry.programs[code] ?? null;
}

