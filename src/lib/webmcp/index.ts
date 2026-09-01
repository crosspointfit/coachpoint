export {
  RecoverableToolError,
  createToolExecutor,
} from "./execution.ts";
export {
  createDashboardToolDescriptors,
  createClientToolDescriptors,
  listClientsSchema,
  getClientSummarySchema,
} from "./caseload-tools.ts";
export {
  resolveDocumentModelContext,
  startWebMcpRegistration,
  type WebMcpRegistration,
} from "./registration.ts";
export {
  createTherapistToolDescriptors,
  draftProgramSchema,
  getExerciseDetailsSchema,
  getProgramEditorStateSchema,
  searchExercisesSchema,
  type DraftProgramInput,
  type GetExerciseDetailsInput,
  type GetProgramEditorStateInput,
  type SearchExercisesInput,
  type TherapistToolHandlers,
} from "./therapist-tools.ts";
export {
  createMotionLabToolDescriptors,
  getLatestMotionLabSetResultSchema,
} from "./motion-tools.ts";
export {
  createPatientMotionToolDescriptors,
  reviewCompletedSetSchema,
  type PatientCompletedMotionSetView,
} from "./patient-motion-tools.ts";
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
