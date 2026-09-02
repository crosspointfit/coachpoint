import type { JsonSchemaForInference } from "@mcp-b/webmcp-types";

import {
  stageNextSetFocus,
  type PatientCoachingEvidenceCode,
  type PatientSession,
  type StageNextSetFocusInput,
} from "../../domain/index.ts";
import { createToolExecutor, RecoverableToolError } from "./execution.ts";
import type { WebMcpToolDescriptor } from "./types.ts";

const MAX_FOCUS_TEXT_LENGTH = 240;

export const stageNextSetFocusSchema = {
  type: "object",
  description:
    "Stage one evidence-linked coaching focus for human review before the next therapist-confirmed set.",
  properties: {
    expectedTransitionRevision: {
      type: "integer",
      minimum: 0,
      description:
        "Exact sessionRevision returned by the latest review_completed_set call.",
    },
    focusText: {
      type: "string",
      minLength: 1,
      maxLength: MAX_FOCUS_TEXT_LENGTH,
      description:
        "One short non-clinical movement focus. It must not change repetitions, rest, range, exercise, or any prescribed dosage.",
    },
    evidenceCode: {
      type: "string",
      enum: ["target_completed", "high_effort", "range_consistent"],
      description:
        "Allowlisted fact from the latest checked-in result that supports the focus.",
    },
  },
  required: ["expectedTransitionRevision", "focusText", "evidenceCode"],
  additionalProperties: false,
} as const satisfies JsonSchemaForInference;

export type StageNextSetFocusToolInput = StageNextSetFocusInput;

export interface PatientFocusToolBindings {
  readVisibleSession: () => PatientSession | null;
  commitVisibleSession: (session: PatientSession) => boolean;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function validateInput(input: unknown): StageNextSetFocusToolInput {
  if (!isPlainRecord(input)) {
    throw new RecoverableToolError([{
      code: "invalid_input",
      message: "The focus input must be a plain object.",
      field: "input",
      recoverable: true,
    }]);
  }
  const keys = Reflect.ownKeys(input);
  const expected = [
    "expectedTransitionRevision",
    "focusText",
    "evidenceCode",
  ];
  if (
    keys.length !== expected.length ||
    keys.some(
      (key) => typeof key !== "string" || !expected.includes(key),
    )
  ) {
    throw new RecoverableToolError([{
      code: "invalid_input",
      message:
        "Provide exactly expectedTransitionRevision, focusText, and evidenceCode.",
      field: "input",
      recoverable: true,
    }]);
  }

  const revision = input.expectedTransitionRevision;
  const focusText = typeof input.focusText === "string"
    ? input.focusText.trim()
    : "";
  const evidence = input.evidenceCode;
  const evidenceAllowed =
    evidence === "target_completed" ||
    evidence === "high_effort" ||
    evidence === "range_consistent";
  if (!Number.isSafeInteger(revision) || (revision as number) < 0) {
    throw new RecoverableToolError([{
      code: "invalid_transition_revision",
      message: "expectedTransitionRevision must be a non-negative integer.",
      field: "expectedTransitionRevision",
      recoverable: true,
    }]);
  }
  if (!focusText || focusText.length > MAX_FOCUS_TEXT_LENGTH) {
    throw new RecoverableToolError([{
      code: "invalid_focus_text",
      message: `focusText must contain 1 to ${MAX_FOCUS_TEXT_LENGTH} characters.`,
      field: "focusText",
      recoverable: true,
    }]);
  }
  if (!evidenceAllowed) {
    throw new RecoverableToolError([{
      code: "invalid_evidence_code",
      message: "evidenceCode is not allowlisted for next-set coaching.",
      field: "evidenceCode",
      recoverable: true,
    }]);
  }
  return {
    expectedTransitionRevision: revision as number,
    focusText,
    evidenceCode: evidence as PatientCoachingEvidenceCode,
  };
}

function unavailableContext(): never {
  throw new RecoverableToolError([{
    code: "context_unavailable",
    message:
      "The visible patient session is not ready or no longer belongs to this route.",
    field: "patientSession",
    recoverable: true,
  }]);
}

function persistenceFailure(): never {
  throw new RecoverableToolError([{
    code: "persistence_failed",
    message:
      "The visible coaching focus could not be saved. No session change was applied.",
    field: "patientSession",
    recoverable: true,
  }]);
}

export function createPatientFocusToolDescriptors(
  bindings: PatientFocusToolBindings,
): readonly WebMcpToolDescriptor[] {
  return [{
    name: "stage_next_set_focus",
    title: "Stage next-set coaching focus",
    description:
      "Stage one short, evidence-linked coaching focus in the visible patient UI after a persisted checked-in camera set. The suggestion remains pending until the human patient explicitly accepts or dismisses it. It cannot start a set, control the camera, diagnose, change exercise, repetitions, rest, range, order, or any therapist-confirmed dosage. Use the exact sessionRevision from review_completed_set and one supported evidenceCode. Never use the demo depth-threshold label to tell the patient to move deeper. The focus text is visible untrusted agent-authored content.",
    inputSchema: stageNextSetFocusSchema,
    annotations: { readOnlyHint: false, untrustedContentHint: true },
    execute: createToolExecutor((input: unknown, { signal }) => {
      const validated = validateInput(input);
      const current = bindings.readVisibleSession() ?? unavailableContext();
      const result = stageNextSetFocus(current, validated);
      if (!result.ok) return result;
      if (signal.aborted) {
        throw new DOMException("Focus staging was cancelled.", "AbortError");
      }
      const latest = bindings.readVisibleSession() ?? unavailableContext();
      if (latest.transitionRevision !== validated.expectedTransitionRevision) {
        throw new RecoverableToolError([{
          code: "transition_revision_conflict",
          message:
            "The patient session changed before the focus could be saved. Read the latest result before retrying.",
          field: "expectedTransitionRevision",
          recoverable: true,
        }]);
      }
      if (!bindings.commitVisibleSession(result.value)) {
        return persistenceFailure();
      }
      const pending = result.value.coachingFocuses.at(-1)!;
      return {
        status: "staged_for_human_review",
        sessionRevision: result.value.transitionRevision,
        focus: {
          status: "pending",
          text: pending.focusText,
          evidenceCode: pending.evidenceCode,
        },
        humanDecisionRequired: true,
        prescriptionChanged: false,
      };
    }),
  }];
}
