import type { CoachingMode } from "./types.ts";
import type { MotionSetAggregate } from "../motion/set-aggregate.ts";

export type PatientSessionStatus =
  | "not_started"
  | "active"
  | "paused"
  | "stopped"
  | "completed";

export type PatientSetStatus = "planned" | "active" | "completed" | "skipped" | "stopped";

export type PatientSetMode = "timer" | "manual" | "camera";

export type SetCompletionKind = "full" | "partial";

export interface PatientProgramSnapshot {
  readonly id: string;
  readonly code: string;
  readonly revision: number;
  readonly patientLabel: string;
  readonly confirmedAt: string;
}

export interface PrescribedSetTarget {
  readonly reps?: number;
  readonly holdSeconds?: number;
  readonly restSeconds: number;
  readonly frequencyInstance: number;
  readonly setNumber: number;
}

export interface SetActualCompletion {
  readonly completedReps?: number;
  readonly completedHoldSeconds?: number;
  /**
   * Total wall-clock set duration derived from domain-owned ISO timestamps.
   * This is deliberately distinct from the detector's repetition window.
   */
  readonly durationSeconds: number;
  readonly rpe?: number;
  readonly pain?: number;
  readonly motion?: MotionSetAggregate;
}

export interface PatientMotionAttempt {
  readonly status: "awaiting_check_in";
  readonly stagedAt: string;
  readonly aggregate: MotionSetAggregate;
  readonly stopReason?: string;
}

export interface PatientExerciseSet {
  readonly id: string;
  readonly sequence: number;
  readonly programItemIndex: number;
  readonly exerciseId: string;
  readonly exerciseName: string;
  readonly exerciseNameZh: string;
  readonly prescribedCoachingMode: CoachingMode;
  readonly prescribedTarget: PrescribedSetTarget;
  readonly status: PatientSetStatus;
  readonly mode?: PatientSetMode;
  readonly startedAt?: string;
  readonly completedAt?: string;
  readonly stoppedAt?: string;
  readonly skippedAt?: string;
  readonly completionKind?: SetCompletionKind;
  readonly actual?: SetActualCompletion;
  readonly motionAttempt?: PatientMotionAttempt;
  readonly stopReason?: string;
  readonly skipReason?: string;
}

export interface PainEvent {
  readonly id: string;
  readonly value: number;
  readonly note?: string;
  readonly setId?: string;
  readonly recordedAt: string;
}

export interface PainSafetyGate {
  readonly active: boolean;
  readonly threshold: number;
  readonly triggeredByPain?: number;
  readonly triggeredAt?: string;
  readonly painEventId?: string;
}

export type PatientCoachingFocusStatus =
  | "pending"
  | "accepted"
  | "dismissed";

export type PatientCoachingEvidenceCode =
  | "target_completed"
  | "high_effort"
  | "range_consistent";

/**
 * An append-only agent suggestion record. It is deliberately separate from
 * both the therapist-confirmed prescription and the patient's actual result.
 */
export interface PatientCoachingFocus {
  readonly id: string;
  readonly status: PatientCoachingFocusStatus;
  readonly source: "agent";
  readonly focusText: string;
  readonly evidenceCode: PatientCoachingEvidenceCode;
  readonly basedOnSetId: string;
  readonly targetSetId: string;
  readonly stagedAt: string;
  readonly decidedAt?: string;
}

export interface PatientSessionProgress {
  readonly totalSets: number;
  readonly plannedSets: number;
  readonly activeSets: number;
  readonly completedSets: number;
  readonly partialCompletedSets: number;
  readonly skippedSets: number;
  readonly stoppedSets: number;
  readonly resolvedSets: number;
  readonly completionPercent: number;
  readonly resolvedPercent: number;
  readonly currentSetId?: string;
  readonly nextSetId?: string;
  readonly isFinishable: boolean;
}

export interface PatientSessionSummary {
  readonly totalSets: number;
  readonly completedSets: number;
  readonly partialCompletedSets: number;
  readonly skippedSets: number;
  readonly stoppedSets: number;
  readonly completedReps: number;
  readonly completedHoldSeconds: number;
  readonly averageRpe?: number;
  readonly highestPain?: number;
  readonly startedAt?: string;
  readonly completedAt: string;
}

export interface PatientSession {
  readonly id: string;
  readonly program: PatientProgramSnapshot;
  readonly transitionRevision: number;
  readonly status: PatientSessionStatus;
  readonly sets: readonly PatientExerciseSet[];
  readonly painEvents: readonly PainEvent[];
  readonly coachingFocuses: readonly PatientCoachingFocus[];
  readonly safetyGate: PainSafetyGate;
  readonly createdAt: string;
  readonly startedAt?: string;
  readonly pausedAt?: string;
  readonly stoppedAt?: string;
  readonly completedAt?: string;
  readonly stopReason?: string;
  readonly summary?: PatientSessionSummary;
}

export type SessionIdKind = "session" | "set" | "pain";

export interface SessionFactories {
  readonly id: (kind: SessionIdKind) => string;
  readonly now: () => Date | string;
}

export interface StartExerciseSetInput {
  readonly setId: string;
  readonly mode: PatientSetMode;
}

export interface CompleteExerciseSetInput {
  readonly setId: string;
  readonly completedReps?: number;
  readonly completedHoldSeconds?: number;
  readonly durationSeconds: number;
  readonly rpe?: number;
  readonly pain?: number;
}

export interface StageMotionSetResultInput {
  readonly setId: string;
  readonly aggregate: MotionSetAggregate;
  /** Required when the terminal detector outcome is `stopped`. */
  readonly stopReason?: string;
}

export interface CompleteMotionSetCheckInInput {
  readonly setId: string;
  /** Camera completion requires an explicit, validated patient check-in. */
  readonly rpe: number;
  /** Camera completion requires an explicit, validated patient check-in. */
  readonly pain: number;
}

export interface SwitchActiveCameraSetToManualFallbackInput {
  readonly setId: string;
}

export interface StageNextSetFocusInput {
  readonly expectedTransitionRevision: number;
  readonly focusText: string;
  readonly evidenceCode: PatientCoachingEvidenceCode;
}

export interface DecideNextSetFocusInput {
  readonly focusId: string;
  readonly expectedTransitionRevision: number;
}

export interface SkipExerciseInput {
  readonly exerciseId: string;
  readonly reason: string;
}

export interface LogPainInput {
  readonly pain: number;
  readonly note?: string;
}

export interface PartialSetResultInput {
  readonly completedReps?: number;
  readonly completedHoldSeconds?: number;
  readonly durationSeconds: number;
  readonly rpe?: number;
  readonly pain?: number;
}

export interface StopSessionInput {
  readonly reason: string;
  readonly actual?: PartialSetResultInput;
}
