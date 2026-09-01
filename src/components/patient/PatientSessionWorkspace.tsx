"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  completeMotionSetCheckIn,
  completeExerciseSet,
  createPatientSession,
  finishSession,
  getExerciseById,
  getSessionProgress,
  logPain,
  pauseSession,
  projectLatestPatientMotionResult,
  resumeSession,
  skipExercise,
  stageMotionSetResult,
  startExerciseSet,
  stopSession,
  switchActiveCameraSetToManualFallback,
  type PatientExerciseSet,
  type PatientSession,
} from "@/domain";
import { clearPatientSession, readPatientSession, writePatientSession } from "@/lib/patientStorage";
import { readConfirmedProgram } from "@/lib/therapistStorage";
import type { ConfirmedProgram, DomainResult } from "@/domain/types";
import {
  createPatientMotionToolDescriptors,
  useWebMcpTools,
  type WebMcpToolDescriptor,
} from "@/lib/webmcp";
import PatientCameraSetPanel, {
  type PatientCameraSetPanelHandle,
} from "./PatientCameraSetPanel";
import type { HalfSquatCameraSetTerminalResult } from "../motion/half-squat-camera-set-controller";

interface PatientSessionWorkspaceProps {
  code: string;
}

function statusLabel(status: PatientExerciseSet["status"]): string {
  return status.replace("_", " ");
}

function targetLabel(set: PatientExerciseSet): string {
  if (set.prescribedTarget.reps !== undefined) {
    return `${set.prescribedTarget.reps} reps`;
  }
  return `${set.prescribedTarget.holdSeconds ?? 0} sec hold`;
}

export default function PatientSessionWorkspace({
  code,
}: PatientSessionWorkspaceProps) {
  const [program, setProgram] = useState<ConfirmedProgram | null>(null);
  const [session, setSession] = useState<PatientSession | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "missing">(
    "loading",
  );
  const [errors, setErrors] = useState<string[]>([]);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [completedReps, setCompletedReps] = useState(0);
  const [rpe, setRpe] = useState<number | "">("");
  const [pain, setPain] = useState<number | "">("");
  const [skipReason, setSkipReason] = useState("Patient chose to skip this exercise.");
  const [patientMotionToolDescriptors, setPatientMotionToolDescriptors] =
    useState<readonly WebMcpToolDescriptor[]>([]);
  const sessionRef = useRef<PatientSession | null>(null);
  const cameraPanelRef = useRef<PatientCameraSetPanelHandle | null>(null);

  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => {
      if (!active) return;
      setPatientMotionToolDescriptors(
        loadState === "ready"
          ? createPatientMotionToolDescriptors(() => sessionRef.current)
          : [],
      );
    });
    return () => {
      active = false;
    };
  }, [loadState]);

  const patientMotionWebMcp = useWebMcpTools(patientMotionToolDescriptors);

  useEffect(() => {
    const hydrationTimer = window.setTimeout(() => {
      const confirmed = readConfirmedProgram(code);
      if (!confirmed) {
        setLoadState("missing");
        return;
      }
      const stored = readPatientSession(code);
      if (stored && stored.program.code === code) {
        const interruptedCameraSet = stored.sets.find(
          (set) =>
            set.status === "active" &&
            set.mode === "camera" &&
            !set.motionAttempt,
        );
        let restored = stored;
        if (interruptedCameraSet && stored.status === "active") {
          const fallback = switchActiveCameraSetToManualFallback(stored, {
            setId: interruptedCameraSet.id,
          });
          if (!fallback.ok || !writePatientSession(code, fallback.value)) {
            setErrors([
              "The interrupted camera set could not be recovered safely. Reload after checking browser storage access.",
            ]);
            setLoadState("missing");
            return;
          }
          restored = fallback.value;
          setErrors([
            "The previous camera attempt ended when the page closed. This set was restored in manual fallback mode.",
          ]);
        }
        setProgram(confirmed);
        sessionRef.current = restored;
        setSession(restored);
        setLoadState("ready");
        return;
      }
      const created = createPatientSession(confirmed);
      if (!created.ok) {
        setErrors(created.errors.map((item) => item.message));
        setLoadState("missing");
        return;
      }
      if (!writePatientSession(code, created.value)) {
        setErrors(["This browser could not save the patient session. Check storage access and reload."]);
        setLoadState("missing");
        return;
      }
      setProgram(confirmed);
      sessionRef.current = created.value;
      setSession(created.value);
      setLoadState("ready");
    }, 0);

    return () => window.clearTimeout(hydrationTimer);
  }, [code]);

  const progress = useMemo(
    () => (session ? getSessionProgress(session) : null),
    [session],
  );
  const activeSet = useMemo(
    () => session?.sets.find((set) => set.status === "active") ?? null,
    [session],
  );
  const nextSet = useMemo(
    () => session?.sets.find((set) => set.status === "planned") ?? null,
    [session],
  );
  const focusSet = activeSet ?? nextSet;
  const focusExercise = focusSet
    ? getExerciseById(focusSet.exerciseId)
    : undefined;
  const cameraEligible =
    focusSet?.exerciseId === "half-squat" &&
    focusSet.prescribedCoachingMode === "camera" &&
    focusSet.prescribedTarget.reps !== undefined;
  const showWideCameraArea =
    cameraEligible && (!activeSet || activeSet.mode === "camera");
  const latestMotionReview = useMemo(
    () => (session ? projectLatestPatientMotionResult(session) : null),
    [session],
  );

  useEffect(() => {
    if (
      !activeSet ||
      activeSet.mode === "camera" ||
      session?.status !== "active"
    ) return;
    const interval = window.setInterval(
      () => setElapsedSeconds((current) => current + 1),
      1000,
    );
    return () => window.clearInterval(interval);
  }, [activeSet, session?.status]);

  const apply = (result: DomainResult<PatientSession>) => {
    if (!result.ok) {
      setErrors(result.errors.map((item) => item.message));
      return false;
    }
    if (!writePatientSession(code, result.value)) {
      setErrors(["The session change could not be saved. No visible progress was changed."]);
      return false;
    }
    sessionRef.current = result.value;
    setSession(result.value);
    setErrors([]);
    return true;
  };

  const startNextSet = () => {
    if (!session || !nextSet) return;
    const mode =
      nextSet.prescribedTarget.holdSeconds !== undefined
        ? "timer"
        : "manual";
    if (apply(startExerciseSet(session, { setId: nextSet.id, mode }))) {
      setElapsedSeconds(0);
      setCompletedReps(0);
      setRpe("");
      setPain("");
    }
  };

  const completeActiveSet = () => {
    if (!session || !activeSet) return;
    if (rpe === "" || pain === "") {
      setErrors(["Enter RPE and pain before completing this set."]);
      return;
    }
    apply(
      completeExerciseSet(session, {
        setId: activeSet.id,
        completedReps:
          activeSet.prescribedTarget.reps !== undefined
            ? completedReps
            : undefined,
        completedHoldSeconds:
          activeSet.prescribedTarget.holdSeconds !== undefined
            ? elapsedSeconds
            : undefined,
        durationSeconds: elapsedSeconds,
        rpe,
        pain,
      }),
    );
  };

  const beginCameraSet = () => {
    const current = sessionRef.current;
    if (!current || !focusSet) return false;
    const currentSet = current.sets.find((set) => set.id === focusSet.id);
    if (currentSet?.status === "active" && currentSet.mode === "camera") {
      return true;
    }
    if (currentSet?.status !== "planned") return false;
    if (
      !apply(
        startExerciseSet(current, { setId: currentSet.id, mode: "camera" }),
      )
    ) {
      return false;
    }
    setRpe("");
    setPain("");
    return true;
  };

  const useManualFallback = () => {
    const current = sessionRef.current;
    if (!current || !focusSet) return;
    const currentSet = current.sets.find((set) => set.id === focusSet.id);
    const result =
      currentSet?.status === "active" && currentSet.mode === "camera"
        ? switchActiveCameraSetToManualFallback(current, {
            setId: currentSet.id,
          })
        : startExerciseSet(current, {
            setId: focusSet.id,
            mode: "manual",
          });
    if (apply(result)) {
      setElapsedSeconds(0);
      setCompletedReps(0);
      setRpe("");
      setPain("");
    }
  };

  const handleCameraStartFailed = (originatingSetId: string) => {
    const current = sessionRef.current;
    const currentSet = current?.sets.find(
      (set) => set.id === originatingSetId,
    );
    if (!current || !currentSet || currentSet.mode !== "camera") return;
    if (
      apply(
        switchActiveCameraSetToManualFallback(current, {
          setId: currentSet.id,
        }),
      )
    ) {
      setErrors([
        "Camera startup did not complete. This set is ready in manual fallback mode.",
      ]);
    }
  };

  const handleCameraTerminal = (
    result: HalfSquatCameraSetTerminalResult,
    stopReason?: string,
  ) => {
    const current = sessionRef.current;
    const currentSet = current?.sets.find((set) => set.status === "active");
    if (!current || !currentSet || currentSet.mode !== "camera") return;
    if (
      apply(
        stageMotionSetResult(current, {
          setId: currentSet.id,
          aggregate: result.aggregate,
          stopReason,
        }),
      )
    ) {
      setRpe("");
      setPain("");
    }
  };

  const completeCameraCheckIn = () => {
    const current = sessionRef.current;
    const currentSet = current?.sets.find(
      (set) => set.status === "active" && set.motionAttempt,
    );
    if (!current || !currentSet) return;
    if (rpe === "" || pain === "") {
      setErrors(["Enter RPE and pain before saving the camera result."]);
      return;
    }
    apply(
      completeMotionSetCheckIn(current, {
        setId: currentSet.id,
        rpe,
        pain,
      }),
    );
  };

  const recordPain = () => {
    if (pain === "") {
      setErrors(["Enter a pain score before recording it."]);
      return;
    }
    cameraPanelRef.current?.stop("Patient reported pain during the camera set.");
    const current = sessionRef.current;
    if (!current) return;
    apply(
      logPain(current, {
        pain,
        note:
          current.sets.find((set) => set.status === "active")?.mode === "camera"
            ? "Patient-reported during camera set."
            : "Patient-reported during timer/manual fallback.",
      }),
    );
  };

  const resetSession = () => {
    if (!program || !window.confirm("Restart this synthetic session?")) return;
    cameraPanelRef.current?.stop("Patient restarted the session.");
    clearPatientSession(code);
    const created = createPatientSession(program);
    if (created.ok) {
      if (!writePatientSession(code, created.value)) {
        setErrors(["The restarted session could not be saved."]);
        return;
      }
      sessionRef.current = created.value;
      setSession(created.value);
      setErrors([]);
      setElapsedSeconds(0);
      setCompletedReps(0);
      setRpe("");
      setPain("");
    }
  };

  const stopPatientSession = () => {
    cameraPanelRef.current?.stop("Patient stopped the demo session.");
    const current = sessionRef.current;
    if (!current) return;
    apply(stopSession(current, { reason: "Patient stopped the demo session." }));
  };

  if (loadState === "loading") {
    return (
      <main className="flex flex-1 items-center justify-center px-6 py-20">
        <p className="text-sm font-semibold text-slate-600">Loading the confirmed program…</p>
      </main>
    );
  }

  if (loadState === "missing" || !program || !session || !progress) {
    return (
      <main className="flex flex-1 items-center justify-center px-6 py-20">
        <section className="w-full max-w-xl border border-border bg-white p-8 text-center">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary-700">
            Patient program · {code}
          </p>
          <h1 className="mt-4 text-3xl font-black text-ink-900">Program not found</h1>
          <p className="mt-4 text-sm leading-6 text-slate-600">
            This local competition build can open programs confirmed in the same browser. Return to the therapist workspace and create a fresh link.
          </p>
          {errors.length > 0 && <p className="mt-3 text-sm text-danger">{errors.join(" ")}</p>}
          <Link
            href="/therapist"
            className="focus-ring mt-6 inline-flex h-12 items-center rounded-xl border border-primary-700 px-5 text-sm font-bold text-primary-700 hover:bg-primary-100"
          >
            Open therapist workspace
          </Link>
        </section>
      </main>
    );
  }

  const wideCameraArea =
    showWideCameraArea && focusSet && focusExercise ? (
      activeSet?.motionAttempt ? (
        <div className="rounded-[18px] border border-primary-200 bg-primary-100/45 p-5 sm:p-6">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-primary-700">
            Camera result ready · check-in required
          </p>
          <h3 className="mt-2 text-xl font-extrabold text-ink-900">
            Tell us how that set felt
          </h3>
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
            <div className="rounded-xl bg-white p-3">
              <dt className="text-xs text-slate-500">Detected reps</dt>
              <dd className="mt-1 font-mono text-xl font-bold text-ink-900">
                {activeSet.motionAttempt.aggregate.actual.completedRepetitions}
                <span className="text-sm text-slate-500"> / {activeSet.prescribedTarget.reps}</span>
              </dd>
            </div>
            <div className="rounded-xl bg-white p-3">
              <dt className="text-xs text-slate-500">Detected rep window</dt>
              <dd className="mt-1 font-mono text-xl font-bold text-ink-900">
                {activeSet.motionAttempt.aggregate.actual.detectedRepetitionWindowSeconds}s
              </dd>
            </div>
            <div className="rounded-xl bg-white p-3">
              <dt className="text-xs text-slate-500">Average detected range</dt>
              <dd className="mt-1 font-mono text-xl font-bold text-ink-900">
                {activeSet.motionAttempt.aggregate.measurements.averageDetectedKneeRangeDeg}°
              </dd>
            </div>
          </dl>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <label className="text-xs font-bold uppercase text-slate-600">
              RPE · 0–10
              <input
                type="number"
                min={0}
                max={10}
                value={rpe}
                onChange={(event) =>
                  setRpe(event.target.value === "" ? "" : Number(event.target.value))
                }
                className="focus-ring mt-1.5 h-11 w-full rounded-xl border border-slate-300 bg-white text-center font-mono text-lg text-ink-900"
              />
            </label>
            <label className="text-xs font-bold uppercase text-slate-600">
              Pain · 0–10
              <input
                type="number"
                min={0}
                max={10}
                value={pain}
                onChange={(event) =>
                  setPain(event.target.value === "" ? "" : Number(event.target.value))
                }
                className="focus-ring mt-1.5 h-11 w-full rounded-xl border border-slate-300 bg-white text-center font-mono text-lg text-ink-900"
              />
            </label>
          </div>
          <button
            type="button"
            onClick={completeCameraCheckIn}
            disabled={rpe === "" || pain === "" || session.safetyGate.active}
            className="focus-ring mt-4 min-h-12 rounded-xl bg-primary-700 px-6 text-sm font-extrabold text-white disabled:bg-slate-300"
          >
            Save set result
          </button>
          <p className="mt-3 text-xs leading-5 text-slate-500">
            The camera aggregate is already saved locally. RPE and pain remain explicit patient reports and are never inferred by the model.
          </p>
        </div>
      ) : (
        <div>
          <PatientCameraSetPanel
            key={focusSet.id}
            ref={cameraPanelRef}
            setId={focusSet.id}
            exerciseId={focusSet.exerciseId}
            exerciseName={focusSet.exerciseName}
            targetRepetitions={focusSet.prescribedTarget.reps ?? 1}
            setIsActive={activeSet?.id === focusSet.id}
            disabled={session.status === "paused" || session.safetyGate.active}
            onBeginCameraSet={beginCameraSet}
            onCameraStartFailed={handleCameraStartFailed}
            onTerminal={handleCameraTerminal}
            onUseManualFallback={useManualFallback}
          />
          {activeSet?.mode === "camera" && (
            <div className="mt-3 flex flex-wrap items-end gap-3 rounded-xl border border-[#E9C98F] bg-[#FFF7E8] p-4">
              <label className="text-xs font-bold uppercase text-[#765000]">
                Pain now · 0–10
                <input
                  type="number"
                  min={0}
                  max={10}
                  value={pain}
                  onChange={(event) =>
                    setPain(event.target.value === "" ? "" : Number(event.target.value))
                  }
                  className="focus-ring mt-1.5 h-10 w-28 rounded-xl border border-[#D7B77D] bg-white text-center font-mono text-lg text-ink-900"
                />
              </label>
              <button
                type="button"
                onClick={recordPain}
                disabled={pain === ""}
                className="focus-ring min-h-10 rounded-xl border border-warning bg-white px-4 text-sm font-bold text-[#765000] disabled:border-slate-300 disabled:text-slate-400"
              >
                End set and record pain
              </button>
            </div>
          )}
          {!activeSet && (
            <div className="mt-4">
              <button
                type="button"
                onClick={() => apply(skipExercise(session, { exerciseId: focusSet.exerciseId, reason: skipReason }))}
                disabled={session.status === "paused"}
                className="focus-ring h-11 rounded-xl border border-slate-300 px-4 text-sm font-bold text-slate-600 disabled:opacity-40"
              >
                Skip exercise
              </button>
              <label className="mt-3 block text-xs font-bold text-slate-600">
                Visible skip reason
                <input value={skipReason} onChange={(event) => setSkipReason(event.target.value)} className="focus-ring mt-1.5 h-10 w-full rounded-xl border border-slate-300 px-3 text-sm font-normal" />
              </label>
            </div>
          )}
        </div>
      )
    ) : null;

  return (
    <main className="flex-1 bg-bg">
      <section className="border-b border-border bg-white">
        <div className="mx-auto flex w-full max-w-[1280px] flex-wrap items-start justify-between gap-6 px-6 py-7 lg:px-8">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary-700">
              Patient session · camera with manual fallback
            </p>
            <h1 className="mt-2 text-3xl font-black tracking-[-0.03em] text-ink-900">
              {program.patientLabel}
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              Therapist-confirmed revision {program.revision} · camera sensing stays on this device.
            </p>
            <p className="mt-2 text-xs font-semibold text-slate-500">
              {patientMotionWebMcp.status === "ready"
                ? "Post-set agent review is ready"
                : patientMotionWebMcp.status === "unsupported"
                  ? "Manual browser mode"
                  : patientMotionWebMcp.status === "error"
                    ? "Post-set review tool needs attention"
                    : "Checking post-set review tool"}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="font-mono text-2xl font-bold tabular-nums text-ink-900">
                {progress.resolvedSets}/{progress.totalSets}
              </p>
              <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500">
                sets resolved
              </p>
            </div>
            <button
              type="button"
              onClick={resetSession}
              className="focus-ring h-10 rounded-xl border border-slate-300 px-3 text-xs font-bold text-slate-600 hover:bg-slate-50"
            >
              Restart demo
            </button>
          </div>
        </div>
        <div className="h-2 bg-primary-100">
          <div
            className="h-full bg-primary-700 transition-[width]"
            style={{ width: `${progress.resolvedPercent}%` }}
          />
        </div>
      </section>

      <div className="mx-auto grid w-full max-w-[1280px] gap-6 px-6 py-8 lg:grid-cols-[minmax(0,1fr)_380px] lg:px-8">
        <div className="space-y-5">
          {session.safetyGate.active && (
            <section role="alert" className="border-l-4 border-danger bg-[#FBEEEA] px-5 py-4">
              <p className="font-extrabold text-danger">Pain safety gate active</p>
              <p className="mt-1 text-sm leading-6 text-slate-700">
                A pain score of {session.safetyGate.triggeredByPain} paused this session. Do not start another set. Stop and follow the therapist’s instructions.
              </p>
            </section>
          )}

          {errors.length > 0 && (
            <section role="alert" className="border-l-4 border-warning bg-[#FFF7E8] px-5 py-4">
              <p className="font-bold text-[#765000]">Action needs attention</p>
              <ul className="mt-1 list-disc pl-5 text-sm text-slate-700">
                {errors.map((message) => <li key={message}>{message}</li>)}
              </ul>
            </section>
          )}

          {latestMotionReview && (
            <section className="rounded-[18px] border border-primary-200 bg-primary-100/45 p-5 shadow-[var(--cp-shadow-card)]">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.12em] text-primary-700">
                    Latest camera set saved · agent review ready
                  </p>
                  <h2 className="mt-2 text-xl font-extrabold text-ink-900">
                    {latestMotionReview.target.exerciseName}
                  </h2>
                </div>
                <p className="rounded-full bg-white px-3 py-1 text-xs font-bold text-primary-700">
                  {latestMotionReview.performance.completedRepetitions} / {latestMotionReview.target.targetRepetitions} reps
                </p>
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                <div>
                  <dt className="text-xs text-slate-500">Set duration</dt>
                  <dd className="mt-1 font-mono font-bold text-ink-900">{latestMotionReview.performance.setDurationSeconds}s</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Detected rep window</dt>
                  <dd className="mt-1 font-mono font-bold text-ink-900">{latestMotionReview.performance.detectedRepetitionWindowSeconds}s</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">RPE</dt>
                  <dd className="mt-1 font-mono font-bold text-ink-900">{latestMotionReview.checkIn.rpe}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Pain</dt>
                  <dd className="mt-1 font-mono font-bold text-ink-900">{latestMotionReview.checkIn.pain}</dd>
                </div>
              </dl>
              <div className="mt-4 rounded-xl border border-primary-200 bg-white px-4 py-3 text-sm font-semibold leading-6 text-ink-900">
                “How did I do in that set? Use review_completed_set and explain the persisted result in plain language.”
              </div>
              <p className="mt-3 text-xs leading-5 text-slate-500">
                The agent receives the saved aggregate and explicit check-in only—not video, landmarks, identifiers, or dosage-changing authority.
              </p>
            </section>
          )}

          {session.status === "completed" && session.summary ? (
            <section className="border-t-4 border-primary-700 bg-white p-7 shadow-[var(--cp-shadow-card)]">
              <p className="text-xs font-bold uppercase tracking-[0.13em] text-primary-700">Session complete</p>
              <h2 className="mt-2 text-3xl font-black text-ink-900">Today’s work is saved.</h2>
              <dl className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
                <div><dt className="text-xs text-slate-500">Completed</dt><dd className="mt-1 font-mono text-2xl font-bold">{session.summary.completedSets}</dd></div>
                <div><dt className="text-xs text-slate-500">Skipped</dt><dd className="mt-1 font-mono text-2xl font-bold">{session.summary.skippedSets}</dd></div>
                <div><dt className="text-xs text-slate-500">Average RPE</dt><dd className="mt-1 font-mono text-2xl font-bold">{session.summary.averageRpe ?? "—"}</dd></div>
                <div><dt className="text-xs text-slate-500">Highest pain</dt><dd className="mt-1 font-mono text-2xl font-bold">{session.summary.highestPain ?? "—"}</dd></div>
              </dl>
            </section>
          ) : focusSet && focusExercise ? (
            <section className="grid overflow-hidden border border-border bg-white shadow-[var(--cp-shadow-card)] md:grid-cols-[250px_1fr]">
              <div className="bg-[#F4F5F2] p-5">
                <Image
                  src={focusExercise.thumbnailPath}
                  alt=""
                  width={1448}
                  height={1086}
                  loading="eager"
                  sizes="250px"
                  className="mx-auto aspect-[4/3] w-full object-contain"
                />
              </div>
              <div className="p-6 lg:p-8">
                <p className="text-xs font-bold uppercase tracking-[0.13em] text-primary-700">
                  {activeSet ? "Active set" : "Up next"} · set {focusSet.prescribedTarget.setNumber}
                </p>
                <h2 className="mt-2 text-3xl font-black tracking-[-0.03em] text-ink-900">
                  {focusExercise.name}
                </h2>
                <p className="mt-1 text-sm text-slate-500">{focusExercise.position}</p>
                <p className="mt-5 text-lg font-bold text-ink-900">Target: {targetLabel(focusSet)}</p>
                {showWideCameraArea && (
                  <ol className="mt-6 list-decimal space-y-1 pl-5 text-sm leading-6 text-slate-600">
                    {focusExercise.instructions.map((instruction) => <li key={instruction}>{instruction}</li>)}
                  </ol>
                )}

                {showWideCameraArea ? null : activeSet?.motionAttempt ? (
                  <div className="mt-7 rounded-[18px] border border-primary-200 bg-primary-100/45 p-5">
                    <p className="text-xs font-bold uppercase tracking-[0.12em] text-primary-700">
                      Camera result ready · check-in required
                    </p>
                    <h3 className="mt-2 text-xl font-extrabold text-ink-900">
                      Tell us how that set felt
                    </h3>
                    <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
                      <div className="rounded-xl bg-white p-3">
                        <dt className="text-xs text-slate-500">Detected reps</dt>
                        <dd className="mt-1 font-mono text-xl font-bold text-ink-900">
                          {activeSet.motionAttempt.aggregate.actual.completedRepetitions}
                          <span className="text-sm text-slate-500"> / {activeSet.prescribedTarget.reps}</span>
                        </dd>
                      </div>
                      <div className="rounded-xl bg-white p-3">
                        <dt className="text-xs text-slate-500">Detected rep window</dt>
                        <dd className="mt-1 font-mono text-xl font-bold text-ink-900">
                          {activeSet.motionAttempt.aggregate.actual.detectedRepetitionWindowSeconds}s
                        </dd>
                      </div>
                      <div className="rounded-xl bg-white p-3">
                        <dt className="text-xs text-slate-500">Average detected range</dt>
                        <dd className="mt-1 font-mono text-xl font-bold text-ink-900">
                          {activeSet.motionAttempt.aggregate.measurements.averageDetectedKneeRangeDeg}°
                        </dd>
                      </div>
                    </dl>
                    <div className="mt-4 grid grid-cols-2 gap-3">
                      <label className="text-xs font-bold uppercase text-slate-600">
                        RPE · 0–10
                        <input
                          type="number"
                          min={0}
                          max={10}
                          value={rpe}
                          onChange={(event) =>
                            setRpe(event.target.value === "" ? "" : Number(event.target.value))
                          }
                          className="focus-ring mt-1.5 h-11 w-full rounded-xl border border-slate-300 bg-white text-center font-mono text-lg text-ink-900"
                        />
                      </label>
                      <label className="text-xs font-bold uppercase text-slate-600">
                        Pain · 0–10
                        <input
                          type="number"
                          min={0}
                          max={10}
                          value={pain}
                          onChange={(event) =>
                            setPain(event.target.value === "" ? "" : Number(event.target.value))
                          }
                          className="focus-ring mt-1.5 h-11 w-full rounded-xl border border-slate-300 bg-white text-center font-mono text-lg text-ink-900"
                        />
                      </label>
                    </div>
                    <button
                      type="button"
                      onClick={completeCameraCheckIn}
                      disabled={rpe === "" || pain === "" || session.safetyGate.active}
                      className="focus-ring mt-4 min-h-12 rounded-xl bg-primary-700 px-6 text-sm font-extrabold text-white disabled:bg-slate-300"
                    >
                      Save set result
                    </button>
                    <p className="mt-3 text-xs leading-5 text-slate-500">
                      The camera aggregate is already saved locally. RPE and pain remain explicit patient reports and are never inferred by the model.
                    </p>
                  </div>
                ) : cameraEligible && (!activeSet || activeSet.mode === "camera") ? (
                  <div>
                    <ol className="mt-6 list-decimal space-y-1 pl-5 text-sm leading-6 text-slate-600">
                      {focusExercise.instructions.map((instruction) => <li key={instruction}>{instruction}</li>)}
                    </ol>
                    <PatientCameraSetPanel
                      key={focusSet.id}
                      ref={cameraPanelRef}
                      setId={focusSet.id}
                      exerciseId={focusSet.exerciseId}
                      exerciseName={focusSet.exerciseName}
                      targetRepetitions={focusSet.prescribedTarget.reps ?? 1}
                      setIsActive={activeSet?.id === focusSet.id}
                      disabled={session.status === "paused" || session.safetyGate.active}
                      onBeginCameraSet={beginCameraSet}
                      onCameraStartFailed={handleCameraStartFailed}
                      onTerminal={handleCameraTerminal}
                      onUseManualFallback={useManualFallback}
                    />
                    {activeSet?.mode === "camera" && (
                      <div className="mt-3 flex flex-wrap items-end gap-3 rounded-xl border border-[#E9C98F] bg-[#FFF7E8] p-4">
                        <label className="text-xs font-bold uppercase text-[#765000]">
                          Pain now · 0–10
                          <input
                            type="number"
                            min={0}
                            max={10}
                            value={pain}
                            onChange={(event) =>
                              setPain(event.target.value === "" ? "" : Number(event.target.value))
                            }
                            className="focus-ring mt-1.5 h-10 w-28 rounded-xl border border-[#D7B77D] bg-white text-center font-mono text-lg text-ink-900"
                          />
                        </label>
                        <button
                          type="button"
                          onClick={recordPain}
                          disabled={pain === ""}
                          className="focus-ring min-h-10 rounded-xl border border-warning bg-white px-4 text-sm font-bold text-[#765000] disabled:border-slate-300 disabled:text-slate-400"
                        >
                          End set and record pain
                        </button>
                      </div>
                    )}
                    {!activeSet && (
                      <div className="mt-4">
                        <button
                          type="button"
                          onClick={() => apply(skipExercise(session, { exerciseId: focusSet.exerciseId, reason: skipReason }))}
                          disabled={session.status === "paused"}
                          className="focus-ring h-11 rounded-xl border border-slate-300 px-4 text-sm font-bold text-slate-600 disabled:opacity-40"
                        >
                          Skip exercise
                        </button>
                        <label className="mt-3 block text-xs font-bold text-slate-600">
                          Visible skip reason
                          <input value={skipReason} onChange={(event) => setSkipReason(event.target.value)} className="focus-ring mt-1.5 h-10 w-full rounded-xl border border-slate-300 px-3 text-sm font-normal" />
                        </label>
                      </div>
                    )}
                  </div>
                ) : activeSet ? (
                  <div className="mt-7">
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      <div className="border border-border p-3 text-center">
                        <p className="font-mono text-3xl font-bold tabular-nums text-ink-900">{elapsedSeconds}</p>
                        <p className="mt-1 text-[10px] font-bold uppercase text-slate-500">seconds</p>
                      </div>
                      {activeSet.prescribedTarget.reps !== undefined && (
                        <div className="col-span-1 flex items-center justify-center gap-2 border border-border p-2">
                          <button type="button" onClick={() => setCompletedReps((value) => Math.max(0, value - 1))} className="focus-ring h-10 w-10 rounded-xl border border-slate-300 text-lg">−</button>
                          <span className="min-w-8 text-center font-mono text-2xl font-bold">{completedReps}</span>
                          <button type="button" onClick={() => setCompletedReps((value) => value + 1)} className="focus-ring h-10 w-10 rounded-xl border border-primary-700 text-lg text-primary-700">+</button>
                        </div>
                      )}
                      <label className="border border-border p-2 text-center text-[10px] font-bold uppercase text-slate-500">
                        RPE
                        <input type="number" min={0} max={10} value={rpe} onChange={(event) => setRpe(event.target.value === "" ? "" : Number(event.target.value))} className="focus-ring mt-1 h-9 w-full rounded-lg border border-slate-300 text-center font-mono text-lg text-ink-900" />
                      </label>
                      <label className="border border-border p-2 text-center text-[10px] font-bold uppercase text-slate-500">
                        Pain
                        <input type="number" min={0} max={10} value={pain} onChange={(event) => setPain(event.target.value === "" ? "" : Number(event.target.value))} className="focus-ring mt-1 h-9 w-full rounded-lg border border-slate-300 text-center font-mono text-lg text-ink-900" />
                      </label>
                    </div>

                    <div className="mt-5 flex flex-wrap gap-2">
                      {session.status === "active" ? (
                        <button type="button" onClick={() => apply(pauseSession(session))} className="focus-ring h-12 rounded-xl border border-primary-700 px-5 text-sm font-bold text-primary-700">Pause</button>
                      ) : !session.safetyGate.active ? (
                        <button type="button" onClick={() => apply(resumeSession(session))} className="focus-ring h-12 rounded-xl border border-primary-700 px-5 text-sm font-bold text-primary-700">Resume</button>
                      ) : null}
                      <button type="button" onClick={recordPain} className="focus-ring h-12 rounded-xl border border-warning px-5 text-sm font-bold text-[#7C5200]">Record pain now</button>
                      <button type="button" onClick={completeActiveSet} disabled={session.status !== "active" || session.safetyGate.active || rpe === "" || pain === ""} className="focus-ring h-12 rounded-xl bg-primary-700 px-6 text-sm font-extrabold text-white disabled:bg-slate-300">Complete set</button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-7">
                    <ol className="list-decimal space-y-1 pl-5 text-sm leading-6 text-slate-600">
                      {focusExercise.instructions.map((instruction) => <li key={instruction}>{instruction}</li>)}
                    </ol>
                    <div className="mt-6 flex flex-wrap gap-2">
                      <button type="button" onClick={startNextSet} disabled={session.status === "paused" || session.safetyGate.active} className="focus-ring h-14 rounded-xl bg-coral-500 px-7 text-base font-extrabold text-white hover:bg-coral-600 disabled:bg-slate-300">Start this set</button>
                      <button type="button" onClick={() => apply(skipExercise(session, { exerciseId: focusSet.exerciseId, reason: skipReason }))} disabled={session.status === "paused"} className="focus-ring h-14 rounded-xl border border-slate-300 px-5 text-sm font-bold text-slate-600 disabled:opacity-40">Skip exercise</button>
                    </div>
                    <label className="mt-3 block text-xs font-bold text-slate-600">
                      Visible skip reason
                      <input value={skipReason} onChange={(event) => setSkipReason(event.target.value)} className="focus-ring mt-1.5 h-10 w-full rounded-xl border border-slate-300 px-3 text-sm font-normal" />
                    </label>
                  </div>
                )}
              </div>
              {showWideCameraArea && (
                <div className="min-w-0 border-t border-border p-6 md:col-span-2 lg:p-8">
                  {wideCameraArea}
                </div>
              )}
            </section>
          ) : (
            <section className="border border-border bg-white p-8 text-center">
              <h2 className="text-2xl font-black text-ink-900">All sets are resolved.</h2>
              <p className="mt-2 text-sm text-slate-600">Finish the session to save the summary.</p>
            </section>
          )}

          {session.status !== "completed" && session.status !== "stopped" && (
            <section className="flex flex-wrap items-center justify-between gap-4 border border-border bg-white p-5">
              <p className="max-w-2xl text-sm leading-6 text-slate-600">
                Stop is always available. Finishing becomes available only after every prescribed set is completed, skipped, or stopped.
              </p>
              <div className="flex gap-2">
                <button type="button" onClick={stopPatientSession} className="focus-ring h-11 rounded-xl border border-danger px-4 text-sm font-bold text-danger">Stop session</button>
                <button type="button" onClick={() => apply(finishSession(session))} disabled={!progress.isFinishable} className="focus-ring h-11 rounded-xl bg-primary-700 px-5 text-sm font-bold text-white disabled:bg-slate-300">Finish session</button>
              </div>
            </section>
          )}
        </div>

        <aside className="h-fit border border-border bg-white">
          <div className="border-b border-border px-5 py-4">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-primary-700">Today’s sets</p>
            <h2 className="mt-1 text-lg font-extrabold text-ink-900">Prescription queue</h2>
          </div>
          <ol className="divide-y divide-border">
            {session.sets.map((set) => (
              <li key={set.id} className="grid grid-cols-[28px_1fr_auto] items-start gap-3 px-4 py-3">
                <span className={`mt-0.5 flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold ${set.status === "completed" ? "bg-primary-700 text-white" : set.status === "active" ? "bg-coral-500 text-white" : "bg-slate-100 text-slate-600"}`}>{set.sequence + 1}</span>
                <div>
                  <p className="text-sm font-bold text-ink-900">{set.exerciseName}</p>
                  <p className="mt-0.5 text-[11px] text-slate-500">Set {set.prescribedTarget.setNumber} · {targetLabel(set)}</p>
                  {(set.skipReason || set.stopReason) && <p className="mt-1 text-[11px] leading-4 text-slate-500">{set.skipReason ?? set.stopReason}</p>}
                </div>
                <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-bold capitalize text-slate-600">{statusLabel(set.status)}</span>
              </li>
            ))}
          </ol>
        </aside>
      </div>
    </main>
  );
}
