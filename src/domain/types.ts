export type BodyRegion =
  | "neck"
  | "shoulder"
  | "hand"
  | "back"
  | "hip"
  | "knee"
  | "ankle"
  | "balance";

export type Difficulty = 1 | 2 | 3;
export type CoachingMode = "camera" | "timer";
export type ReviewStatus = "therapist-reviewed" | "demo-only";

export interface ExerciseDosage {
  sets: number;
  reps?: number;
  holdSeconds?: number;
  frequencyPerDay: number;
  restSeconds: number;
}

export interface Exercise {
  id: string;
  sourceFile: string;
  imagePath: string;
  thumbnailPath: string;
  name: string;
  nameZh: string;
  bodyRegion: BodyRegion;
  goals: string[];
  difficulty: Difficulty;
  position: string;
  equipment: string[];
  estimatedMinutes: number;
  instructions: string[];
  precautions: string[];
  contraindications: string[];
  phaseTags: string[];
  defaultDosage: ExerciseDosage;
  coachingMode: CoachingMode;
  reviewStatus: ReviewStatus;
}

export interface CaseContext {
  patientLabel: string;
  diagnosis: string;
  goals: string[];
  minutesPerDay: number;
  bodyRegion?: BodyRegion;
  postOpWeeks?: number;
  procedure?: string;
  protocol?: string;
  equipment: string[];
  notes?: string;
}

export interface ProgramItem {
  exerciseId: string;
  sets: number;
  reps?: number;
  holdSeconds?: number;
  frequencyPerDay: number;
  restSeconds: number;
  therapistNote?: string;
}

export interface ProgramDraft {
  id: string;
  patientLabel: string;
  caseContext: CaseContext;
  items: ProgramItem[];
  estimatedMinutes: number;
  warnings: string[];
  createdAt: string;
  source: "agent" | "therapist";
  revision: number;
}

export interface ConfirmedProgram extends ProgramDraft {
  code: string;
  confirmedAt: string;
  confirmedBy: "therapist";
}

export type ActivityActor = "agent" | "therapist" | "system";

export interface AgentActivity {
  id: string;
  actor: ActivityActor;
  action: string;
  detail: string;
  createdAt: string;
}

export interface DomainError {
  code: string;
  message: string;
  field?: string;
  recoverable: boolean;
}

export type DomainResult<T> =
  | { ok: true; value: T }
  | { ok: false; errors: DomainError[] };
