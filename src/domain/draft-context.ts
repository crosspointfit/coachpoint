import { searchExercises } from "./catalog.ts";
import { validateCaseContext } from "./program.ts";
import type {
  BodyRegion,
  CaseContext,
  Difficulty,
  DomainError,
  DomainResult,
  Exercise,
  ProgramDraft,
} from "./types.ts";

const MAX_SEARCHES = 3;
const MAX_RESULTS_PER_SEARCH = 2;
const MAX_TOTAL_MOVEMENTS = 4;
const MAX_QUERY_LENGTH = 120;

const BODY_REGIONS = new Set<BodyRegion>([
  "neck",
  "shoulder",
  "back",
  "hip",
  "knee",
  "ankle",
  "hand",
  "balance",
]);

export interface DraftContextSearchRequest {
  readonly query: string;
  readonly bodyRegion?: BodyRegion;
  readonly goal?: string;
  readonly equipment?: string;
  readonly phaseTag?: string;
  readonly difficulty?: Difficulty;
  readonly maxResults?: number;
}

export interface PrepareProgramDraftContextInput {
  readonly caseContext: CaseContext;
  readonly currentDraft: ProgramDraft | null;
  readonly searches: readonly DraftContextSearchRequest[];
}

export interface PreparedDraftMovement {
  readonly id: string;
  readonly name: string;
  readonly bodyRegion: BodyRegion;
  readonly equipment: readonly string[];
  readonly estimatedMinutes: number;
  readonly defaultDosage: Exercise["defaultDosage"];
  readonly coachingMode: Exercise["coachingMode"];
  readonly precautions: readonly string[];
  readonly contraindications: readonly string[];
}

export interface PreparedProgramDraftContext {
  readonly expectedDraftRevision: number;
  readonly caseContext: CaseContext;
  readonly caseIssues: readonly Pick<
    DomainError,
    "code" | "message" | "field" | "recoverable"
  >[];
  readonly currentDraft: {
    readonly revision: number;
    readonly itemCount: number;
    readonly estimatedMinutes: number;
  } | null;
  readonly searchSummary: {
    readonly requestCount: number;
    readonly unmatchedQueries: readonly string[];
  };
  readonly movements: readonly PreparedDraftMovement[];
}

function failure(message: string, field: string): DomainResult<never> {
  return {
    ok: false,
    errors: [
      {
        code: "invalid_draft_context_search",
        message,
        field,
        recoverable: true,
      },
    ],
  };
}

function trimmedOptional(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized || undefined;
}

function cloneCaseContext(context: CaseContext): CaseContext {
  return {
    ...context,
    goals: [...context.goals],
    equipment: [...context.equipment],
  };
}

function movementProjection(
  exercise: Exercise,
): PreparedDraftMovement {
  return {
    id: exercise.id,
    name: exercise.name,
    bodyRegion: exercise.bodyRegion,
    equipment: [...exercise.equipment],
    estimatedMinutes: exercise.estimatedMinutes,
    defaultDosage: { ...exercise.defaultDosage },
    coachingMode: exercise.coachingMode,
    precautions: [...exercise.precautions],
    contraindications: [...exercise.contraindications],
  };
}

/**
 * Route adapters supply the current validated workspace snapshot. This pure
 * operation batches the same catalog search used by the human UI and returns
 * only the compact context an agent needs before proposing a visible draft.
 * It never creates, confirms, or persists a program.
 */
export function prepareProgramDraftContext(
  input: PrepareProgramDraftContextInput,
): DomainResult<PreparedProgramDraftContext> {
  if (
    !Array.isArray(input.searches) ||
    input.searches.length < 1 ||
    input.searches.length > MAX_SEARCHES
  ) {
    return failure(
      `Provide between 1 and ${MAX_SEARCHES} movement searches.`,
      "searches",
    );
  }

  const normalizedSearches: DraftContextSearchRequest[] = [];
  for (const [index, request] of input.searches.entries()) {
    const query = request?.query?.trim();
    if (!query || query.length > MAX_QUERY_LENGTH) {
      return failure(
        `Search ${index + 1} needs a query from 1 to ${MAX_QUERY_LENGTH} characters.`,
        `searches.${index}.query`,
      );
    }
    if (
      request.bodyRegion !== undefined &&
      !BODY_REGIONS.has(request.bodyRegion)
    ) {
      return failure(
        `Search ${index + 1} has an unsupported body region.`,
        `searches.${index}.bodyRegion`,
      );
    }
    if (
      request.difficulty !== undefined &&
      ![1, 2, 3].includes(request.difficulty)
    ) {
      return failure(
        `Search ${index + 1} has an unsupported difficulty.`,
        `searches.${index}.difficulty`,
      );
    }
    for (const field of ["goal", "equipment", "phaseTag"] as const) {
      const value = request[field];
      if (
        value !== undefined &&
        (typeof value !== "string" ||
          value.trim().length < 1 ||
          value.trim().length > MAX_QUERY_LENGTH)
      ) {
        return failure(
          `Search ${index + 1} has an invalid ${field}.`,
          `searches.${index}.${field}`,
        );
      }
    }
    const maxResults = request.maxResults ?? 1;
    if (
      !Number.isInteger(maxResults) ||
      maxResults < 1 ||
      maxResults > MAX_RESULTS_PER_SEARCH
    ) {
      return failure(
        `Search ${index + 1} may return 1 or ${MAX_RESULTS_PER_SEARCH} candidates.`,
        `searches.${index}.maxResults`,
      );
    }
    normalizedSearches.push({
      query,
      bodyRegion: request.bodyRegion,
      goal: trimmedOptional(request.goal),
      equipment: trimmedOptional(request.equipment),
      phaseTag: trimmedOptional(request.phaseTag),
      difficulty: request.difficulty,
      maxResults,
    });
  }

  const exercises = new Map<string, Exercise>();
  const unmatchedQueries: string[] = [];
  for (const request of normalizedSearches) {
    const matches = searchExercises({
      query: request.query,
      bodyRegion: request.bodyRegion,
      difficulty: request.difficulty,
      goals: request.goal,
      equipment: request.equipment,
      phaseTags: request.phaseTag,
      limit: request.maxResults,
    });
    for (const exercise of matches) {
      if (!exercises.has(exercise.id) && exercises.size >= MAX_TOTAL_MOVEMENTS) {
        continue;
      }
      exercises.set(exercise.id, exercise);
    }
    if (matches.length === 0) unmatchedQueries.push(request.query);
  }

  const caseValidation = validateCaseContext(input.caseContext);
  return {
    ok: true,
    value: {
      expectedDraftRevision: input.currentDraft?.revision ?? 0,
      caseContext: cloneCaseContext(input.caseContext),
      caseIssues: caseValidation.ok
        ? []
        : caseValidation.errors.map((error) => ({ ...error })),
      currentDraft: input.currentDraft
        ? {
            revision: input.currentDraft.revision,
            itemCount: input.currentDraft.items.length,
            estimatedMinutes: input.currentDraft.estimatedMinutes,
          }
        : null,
      searchSummary: {
        requestCount: normalizedSearches.length,
        unmatchedQueries,
      },
      movements: [...exercises.values()].map(movementProjection),
    },
  };
}
