export {
  DEFAULT_SIDE_HYSTERESIS_MARGIN,
  calculateAngleDeg,
  selectKneeSide,
} from "./angle.ts";
export {
  completedRepFeedback,
  createAudioCoach,
  type AudioCoach,
  type AudioContextFactory,
  type CompletedRepFeedback,
  type MotionEarcon,
  type RepFeedbackMilestone,
} from "./audio-coach.ts";
export {
  HALF_SQUAT_CONFIG,
  analyzeHalfSquatLandmarks,
  processHalfSquatFrame,
  type HalfSquatConfig,
} from "./half-squat.ts";
export {
  DEFAULT_HALF_SQUAT_MISSING_FRAME_THRESHOLD,
  createHalfSquatSetRunner,
  type HalfSquatSetRunner,
  type HalfSquatSetRunnerCoarseEvent,
  type HalfSquatSetRunnerInput,
  type HalfSquatSetRunnerOptions,
  type HalfSquatSetRunnerSnapshot,
  type HalfSquatSetRunnerStep,
  type HalfSquatSetRunnerTrackingState,
} from "./half-squat-runner.ts";
export {
  DEFAULT_HALF_SQUAT_CONFIG,
  createRepCounterState,
  didReachRepTarget,
  resetIncompleteRep,
  summarizeRepCounter,
  updateRepCounter,
} from "./rep-counter.ts";
export {
  createMotionSetAggregate,
  type MotionAggregateQualityEvent,
  type MotionSetAggregate,
  type MotionSetAggregateInput,
  type MotionSetAggregateTargetInput,
  type MotionSetOutcome,
  type MotionTargetSource,
} from "./set-aggregate.ts";
export { HALF_SQUAT_REPLAY, type ReplayFrame } from "./replay.ts";
export {
  VOICE_COACH_DEFAULT_PITCH,
  VOICE_COACH_DEFAULT_RATE,
  VOICE_COACH_DEFAULT_VOLUME,
  VOICE_COACH_LANGUAGE,
  listEnglishVoices,
  selectEnglishVoice,
  type EnglishVoiceOption,
} from "./voice-coach.ts";
export {
  projectMotionLabSetResult,
  type MotionLabSetResultInput,
  type MotionLabSetResultProjection,
  type MotionLabSetResultToolView,
  type MotionLabToolPhase,
} from "./webmcp-view.ts";
export type {
  BodySide,
  HalfSquatSetSummary,
  KneeFrameAnalysis,
  NormalizedLandmarkLike,
  RepCounterConfig,
  RepCounterEvent,
  RepCounterState,
  RepCounterUpdate,
  RepPhase,
  RepRecord,
} from "./types.ts";
