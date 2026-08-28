export {
  RecoverableToolError,
  createToolExecutor,
} from "./execution.ts";
export {
  resolveDocumentModelContext,
  startWebMcpRegistration,
  type WebMcpRegistration,
} from "./registration.ts";
export {
  createTherapistToolDescriptors,
  draftProgramSchema,
  getExerciseDetailsSchema,
  searchExercisesSchema,
  type DraftProgramInput,
  type GetExerciseDetailsInput,
  type SearchExercisesInput,
  type TherapistToolHandlers,
} from "./therapist-tools.ts";
export {
  useWebMcpTools,
  type WebMcpRegistrationState,
  type WebMcpRegistrationStatus,
} from "./use-webmcp-tools.ts";
export type {
  JsonObject,
  JsonPrimitive,
  JsonValue,
  ToolError,
  ToolHandler,
  ToolHandlerContext,
  ToolResult,
  WebMcpExecuteContext,
  WebMcpModelContext,
  WebMcpRegistrationOptions,
  WebMcpToolDescriptor,
} from "./types.ts";
