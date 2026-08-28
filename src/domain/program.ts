import { EXERCISES, getExerciseById } from "./catalog.ts";
import type {
  ActivityActor,
  CaseContext,
  ConfirmedProgram,
  DomainError,
  DomainResult,
  ExerciseDosage,
  ProgramDraft,
  ProgramItem,
} from "./types";

export interface NumericRange {
  min: number;
  max: number;
}

export interface ExerciseDosageLimits {
  sets: NumericRange;
  reps?: NumericRange;
  holdSeconds?: NumericRange;
  frequencyPerDay: NumericRange;
  restSeconds: NumericRange;
}

function dosageLimitsFor(dosage: ExerciseDosage): ExerciseDosageLimits {
  return {
    sets: { min: 1, max: Math.max(3, dosage.sets) },
    reps:
      dosage.reps === undefined
        ? undefined
        : { min: 1, max: Math.min(20, Math.max(12, dosage.reps + 4)) },
    holdSeconds:
      dosage.holdSeconds === undefined
        ? undefined
        : { min: 10, max: Math.min(90, Math.max(60, dosage.holdSeconds)) },
    frequencyPerDay: { min: 1, max: Math.max(2, dosage.frequencyPerDay) },
    restSeconds: { min: 15, max: 120 },
  };
}

/**
 * Explicit demo dosage boundaries used by both human and agent operations.
 * These ranges are product guardrails for the competition, not clinical
 * protocol recommendations.
 */
export const EXERCISE_DOSAGE_LIMITS: Readonly<Record<string, ExerciseDosageLimits>> =
  Object.fromEntries(
    EXERCISES.map((exercise) => [exercise.id, dosageLimitsFor(exercise.defaultDosage)]),
  );

export interface DraftValidationConstraints {
  minutesPerDay: number;
}

export interface DraftValidationSummary {
  estimatedMinutes: number;
  warnings: string[];
}

export interface CreateProgramDraftInput {
  caseContext: CaseContext;
  items: readonly ProgramItem[];
  source?: "agent" | "therapist";
  revision?: number;
}

export interface DomainFactories {
  id: () => string;
  code: () => string;
  now: () => Date | string;
}

export interface ConfirmProgramRequest {
  actor: ActivityActor;
}

const DEFAULT_FACTORIES: DomainFactories = {
  id: () => `draft_${secureUuid()}`,
  code: () => `CP_${secureUuid().replaceAll("-", "").toUpperCase()}`,
  now: () => new Date(),
};

function secureUuid(): string {
  if (typeof globalThis.crypto?.randomUUID !== "function") {
    throw new Error("A cryptographically secure UUID generator is required.");
  }

  return globalThis.crypto.randomUUID();
}

function success<T>(value: T): DomainResult<T> {
  return { ok: true, value };
}

function failure<T>(errors: DomainError[]): DomainResult<T> {
  return { ok: false, errors };
}

function inputError(
  code: string,
  message: string,
  field?: string,
  recoverable = true,
): DomainError {
  return { code, message, field, recoverable };
}

function isNonEmpty(value: string | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function describesPostOp(context: CaseContext): boolean {
  const text = `${context.diagnosis} ${context.notes ?? ""}`.toLocaleLowerCase("en");
  return (
    context.postOpWeeks !== undefined ||
    /\bpost[ -]?op(?:erative)?\b/.test(text) ||
    text.includes("術後")
  );
}

/**
 * Validate only the information boundary needed to create a demo draft. A
 * post-operative case deliberately requires both the procedure and a named,
 * therapist-approved protocol; the catalog never infers either one.
 */
export function validateCaseContext(context: CaseContext): DomainResult<CaseContext> {
  const errors: DomainError[] = [];

  if (!isNonEmpty(context.patientLabel)) {
    errors.push(
      inputError(
        "missing_patient_label",
        "Use a synthetic or anonymous patient label for this competition demo.",
        "patientLabel",
      ),
    );
  }

  if (!isNonEmpty(context.diagnosis)) {
    errors.push(
      inputError("missing_diagnosis", "A therapist-provided case description is required.", "diagnosis"),
    );
  }

  if (!Array.isArray(context.goals) || context.goals.every((goal) => !isNonEmpty(goal))) {
    errors.push(inputError("missing_goals", "At least one treatment goal is required.", "goals"));
  }

  if (
    !Number.isFinite(context.minutesPerDay) ||
    context.minutesPerDay <= 0 ||
    context.minutesPerDay > 120
  ) {
    errors.push(
      inputError(
        "invalid_minutes_per_day",
        "Daily available time must be greater than 0 and no more than 120 minutes.",
        "minutesPerDay",
      ),
    );
  }

  if (
    context.postOpWeeks !== undefined &&
    (!Number.isFinite(context.postOpWeeks) || context.postOpWeeks < 0 || context.postOpWeeks > 520)
  ) {
    errors.push(
      inputError(
        "invalid_post_op_weeks",
        "Post-operative weeks must be between 0 and 520.",
        "postOpWeeks",
      ),
    );
  }

  if (describesPostOp(context)) {
    const missingFields = [
      !isNonEmpty(context.procedure) ? "procedure" : undefined,
      !isNonEmpty(context.protocol) ? "protocol" : undefined,
    ].filter((field): field is string => field !== undefined);

    if (missingFields.length > 0) {
      errors.push(
        inputError(
          "needs_clarification",
          `Post-operative drafting needs therapist-provided ${missingFields.join(
            " and ",
          )}; CoachPoint will not infer this clinical context.`,
          missingFields.join(","),
        ),
      );
    }
  }

  return errors.length > 0 ? failure(errors) : success(cloneCaseContext(context));
}

function cloneCaseContext(context: CaseContext): CaseContext {
  return {
    ...context,
    patientLabel: context.patientLabel.trim(),
    diagnosis: context.diagnosis.trim(),
    goals: context.goals.map((goal) => goal.trim()).filter(Boolean),
    equipment: [...context.equipment],
    procedure: context.procedure?.trim(),
    protocol: context.protocol?.trim(),
    notes: context.notes?.trim(),
  };
}

function cloneItems(items: readonly ProgramItem[]): ProgramItem[] {
  return items.map((item) => ({ ...item }));
}

function isIntegerWithin(value: number, range: NumericRange): boolean {
  return Number.isInteger(value) && value >= range.min && value <= range.max;
}

function rangeMessage(field: string, exerciseName: string, range: NumericRange): string {
  return `${field} for ${exerciseName} must be a whole number from ${range.min} to ${range.max}.`;
}

function collectItemErrors(items: readonly ProgramItem[], includeDuplicates: boolean): DomainError[] {
  const errors: DomainError[] = [];
  const seen = new Set<string>();

  if (items.length === 0) {
    return [inputError("empty_program", "Add at least one catalog exercise.", "items")];
  }

  items.forEach((item, index) => {
    const fieldRoot = `items.${index}`;
    const exercise = getExerciseById(item.exerciseId);

    if (!exercise) {
      errors.push(
        inputError(
          "invalid_exercise_id",
          `Exercise '${item.exerciseId}' is not in the curated demo catalog.`,
          `${fieldRoot}.exerciseId`,
        ),
      );
      return;
    }

    if (includeDuplicates && seen.has(exercise.id)) {
      errors.push(
        inputError(
          "duplicate_exercise",
          `${exercise.name} appears more than once; edit its dosage instead of duplicating it.`,
          `${fieldRoot}.exerciseId`,
        ),
      );
    }
    seen.add(exercise.id);

    const limits = EXERCISE_DOSAGE_LIMITS[exercise.id];
    if (!limits) {
      errors.push(
        inputError(
          "catalog_configuration_error",
          `No dosage boundary is configured for ${exercise.name}.`,
          `${fieldRoot}.exerciseId`,
          false,
        ),
      );
      return;
    }

    const numericChecks: Array<[keyof ProgramItem, number, NumericRange]> = [
      ["sets", item.sets, limits.sets],
      ["frequencyPerDay", item.frequencyPerDay, limits.frequencyPerDay],
      ["restSeconds", item.restSeconds, limits.restSeconds],
    ];

    for (const [field, value, range] of numericChecks) {
      if (!isIntegerWithin(value, range)) {
        errors.push(
          inputError(
            "invalid_dosage",
            rangeMessage(String(field), exercise.name, range),
            `${fieldRoot}.${String(field)}`,
          ),
        );
      }
    }

    if (limits.reps) {
      if (item.reps === undefined || !isIntegerWithin(item.reps, limits.reps)) {
        errors.push(
          inputError(
            "invalid_dosage",
            rangeMessage("reps", exercise.name, limits.reps),
            `${fieldRoot}.reps`,
          ),
        );
      }
      if (item.holdSeconds !== undefined) {
        errors.push(
          inputError(
            "invalid_dosage",
            `${exercise.name} uses repetitions in this demo catalog; holdSeconds is not supported.`,
            `${fieldRoot}.holdSeconds`,
          ),
        );
      }
    }

    if (limits.holdSeconds) {
      if (
        item.holdSeconds === undefined ||
        !isIntegerWithin(item.holdSeconds, limits.holdSeconds)
      ) {
        errors.push(
          inputError(
            "invalid_dosage",
            rangeMessage("holdSeconds", exercise.name, limits.holdSeconds),
            `${fieldRoot}.holdSeconds`,
          ),
        );
      }
      if (item.reps !== undefined) {
        errors.push(
          inputError(
            "invalid_dosage",
            `${exercise.name} uses a timed hold in this demo catalog; reps is not supported.`,
            `${fieldRoot}.reps`,
          ),
        );
      }
    }
  });

  return errors;
}

function calculateDurationMinutes(items: readonly ProgramItem[]): number {
  const totalSeconds = items.reduce((programSeconds, item) => {
    const workSecondsPerSet = item.reps !== undefined ? item.reps * 4 : item.holdSeconds ?? 0;
    const workSeconds = item.sets * workSecondsPerSet;
    const restSeconds = Math.max(0, item.sets - 1) * item.restSeconds;
    const setupSeconds = 15;
    return programSeconds + (workSeconds + restSeconds + setupSeconds) * item.frequencyPerDay;
  }, 0);

  return Math.ceil((totalSeconds / 60) * 10) / 10;
}

export function estimateProgramDuration(
  items: readonly ProgramItem[],
): DomainResult<number> {
  const errors = collectItemErrors(items, false);
  return errors.length > 0 ? failure(errors) : success(calculateDurationMinutes(items));
}

function collectWarnings(items: readonly ProgramItem[]): string[] {
  const warnings = new Set<string>([
    "Competition demo catalog only — therapist review is required before confirmation.",
  ]);

  for (const item of items) {
    const exercise = getExerciseById(item.exerciseId);
    if (!exercise) {
      continue;
    }

    exercise.precautions.slice(1).forEach((message) => warnings.add(`${exercise.name}: ${message}`));
    exercise.contraindications.forEach((message) =>
      warnings.add(`${exercise.name}: ${message}`),
    );
  }

  return [...warnings];
}

export function validateDraft(
  items: readonly ProgramItem[],
  constraints: DraftValidationConstraints,
): DomainResult<DraftValidationSummary> {
  const errors = collectItemErrors(items, true);

  if (
    !Number.isFinite(constraints.minutesPerDay) ||
    constraints.minutesPerDay <= 0 ||
    constraints.minutesPerDay > 120
  ) {
    errors.push(
      inputError(
        "invalid_minutes_per_day",
        "Daily available time must be greater than 0 and no more than 120 minutes.",
        "minutesPerDay",
      ),
    );
  }

  if (errors.length > 0) {
    return failure(errors);
  }

  const estimatedMinutes = calculateDurationMinutes(items);
  if (estimatedMinutes > constraints.minutesPerDay) {
    return failure([
      inputError(
        "duration_exceeded",
        `The estimated ${estimatedMinutes}-minute daily program exceeds the ${constraints.minutesPerDay}-minute limit.`,
        "items",
      ),
    ]);
  }

  return success({
    estimatedMinutes,
    warnings: collectWarnings(items),
  });
}

function resolveFactories(overrides: Partial<DomainFactories> | undefined): DomainFactories {
  return { ...DEFAULT_FACTORIES, ...overrides };
}

function timestamp(factory: DomainFactories["now"]): DomainResult<string> {
  try {
    const value = factory();
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
      return failure([
        inputError(
          "invalid_factory_output",
          "The injected time factory returned an invalid date.",
          undefined,
          false,
        ),
      ]);
    }
    return success(date.toISOString());
  } catch {
    return failure([
      inputError(
        "factory_failure",
        "The injected time factory failed.",
        undefined,
        false,
      ),
    ]);
  }
}

export function createProgramDraft(
  input: CreateProgramDraftInput,
  factoryOverrides?: Partial<DomainFactories>,
): DomainResult<ProgramDraft> {
  const contextResult = validateCaseContext(input.caseContext);
  if (!contextResult.ok) {
    return failure(contextResult.errors);
  }

  const draftResult = validateDraft(input.items, {
    minutesPerDay: contextResult.value.minutesPerDay,
  });
  if (!draftResult.ok) {
    return failure(draftResult.errors);
  }

  const revision = input.revision ?? 1;
  if (!Number.isInteger(revision) || revision < 1) {
    return failure([
      inputError("invalid_revision", "Draft revision must be a positive whole number.", "revision"),
    ]);
  }

  const factories = resolveFactories(factoryOverrides);
  const createdAtResult = timestamp(factories.now);
  if (!createdAtResult.ok) {
    return failure(createdAtResult.errors);
  }

  let id: string;
  try {
    id = factories.id().trim();
  } catch {
    return failure([
      inputError("factory_failure", "The injected ID factory failed.", undefined, false),
    ]);
  }

  if (!id) {
    return failure([
      inputError(
        "invalid_factory_output",
        "The injected ID factory returned an empty ID.",
        undefined,
        false,
      ),
    ]);
  }

  const warnings = [...draftResult.value.warnings];
  if ((input.source ?? "agent") === "agent") {
    warnings.unshift("Agent draft — therapist review required.");
  }

  return success({
    id,
    patientLabel: contextResult.value.patientLabel,
    caseContext: contextResult.value,
    items: cloneItems(input.items),
    estimatedMinutes: draftResult.value.estimatedMinutes,
    warnings,
    createdAt: createdAtResult.value,
    source: input.source ?? "agent",
    revision,
  });
}

export function confirmProgram(
  draft: ProgramDraft,
  request: ConfirmProgramRequest,
  factoryOverrides?: Partial<DomainFactories>,
): DomainResult<ConfirmedProgram> {
  if (request.actor !== "therapist") {
    return failure([
      inputError(
        "human_confirmation_required",
        "Only a human therapist using the therapist UI may confirm a prescription.",
        "actor",
        false,
      ),
    ]);
  }

  const contextResult = validateCaseContext(draft.caseContext);
  if (!contextResult.ok) {
    return failure(contextResult.errors);
  }

  const draftResult = validateDraft(draft.items, {
    minutesPerDay: contextResult.value.minutesPerDay,
  });
  if (!draftResult.ok) {
    return failure(draftResult.errors);
  }

  const factories = resolveFactories(factoryOverrides);
  const confirmedAtResult = timestamp(factories.now);
  if (!confirmedAtResult.ok) {
    return failure(confirmedAtResult.errors);
  }

  let code: string;
  try {
    code = factories.code().trim();
  } catch {
    return failure([
      inputError("factory_failure", "The injected code factory failed.", undefined, false),
    ]);
  }

  if (!/^[A-Za-z0-9_-]{10,}$/.test(code)) {
    return failure([
      inputError(
        "invalid_factory_output",
        "The confirmation code must contain at least 10 URL-safe characters.",
        "code",
        false,
      ),
    ]);
  }

  return success({
    ...draft,
    patientLabel: contextResult.value.patientLabel,
    caseContext: contextResult.value,
    items: cloneItems(draft.items),
    estimatedMinutes: draftResult.value.estimatedMinutes,
    warnings:
      draft.source === "agent"
        ? ["Agent draft — therapist review required.", ...draftResult.value.warnings]
        : [...draftResult.value.warnings],
    code,
    confirmedAt: confirmedAtResult.value,
    confirmedBy: "therapist",
  });
}
