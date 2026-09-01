import type { JsonSchemaForInference } from "@mcp-b/webmcp-types";

import type { MotionLabSetResultProjection } from "../../motion/webmcp-view.ts";
import { createToolExecutor, RecoverableToolError } from "./execution.ts";
import type { WebMcpToolDescriptor } from "./types.ts";

export const getLatestMotionLabSetResultSchema = {
  type: "object",
  description:
    "Get the latest finished browser-local Motion Lab set result from the visible page; takes no route, patient, camera, or set identifiers.",
  properties: {},
  required: [],
  additionalProperties: false,
} as const satisfies JsonSchemaForInference;

function requireEmptyInput(input: unknown): void {
  if (
    typeof input !== "object" ||
    input === null ||
    Array.isArray(input) ||
    (Object.getPrototypeOf(input) !== Object.prototype &&
      Object.getPrototypeOf(input) !== null) ||
    Reflect.ownKeys(input).length !== 0
  ) {
    throw new RecoverableToolError([{
      code: "invalid_input",
      message:
        "This read-only tool accepts an empty object only. Its scope is the visible Motion Lab page.",
      field: "input",
      recoverable: true,
    }]);
  }
}

function unavailableContext(): never {
  throw new RecoverableToolError([{
    code: "context_unavailable",
    message:
      "The visible Motion Lab result is not ready or no longer belongs to this route. Reopen the page before retrying.",
    field: "motionLab",
    recoverable: true,
  }]);
}

function unavailableResult(): never {
  throw new RecoverableToolError([{
    code: "result_unavailable",
    message:
      "No reviewable finished set result is available. After the user says the set has ended, call this tool once if they request a review. Do not poll during movement.",
    field: "motionResult",
    recoverable: true,
  }]);
}

export function createMotionLabToolDescriptors(
  readVisibleProjection: () => MotionLabSetResultProjection | null,
): readonly WebMcpToolDescriptor[] {
  return [{
    name: "get_latest_motion_lab_set_result",
    title: "Get latest Motion Lab set result",
    description:
      "Get the latest completed or stopped isolated Motion Lab set only when the user asks for a post-set review. Never call this tool to monitor movement and never poll it while a set is running. Explain target completion and camera-derived aggregate patterns in plain language, but treat them as observations rather than a clinical assessment. Because this demo has no therapist-confirmed range target, do not advise deeper movement or change exercise dosage. Returns no patient identity, camera details, frames, landmarks, raw angles, per-repetition records, or motion time series.",
    inputSchema: getLatestMotionLabSetResultSchema,
    annotations: { readOnlyHint: true },
    execute: createToolExecutor((input: unknown) => {
      requireEmptyInput(input);
      const projection = readVisibleProjection() ?? unavailableContext();
      return projection.result ?? unavailableResult();
    }),
  }];
}
