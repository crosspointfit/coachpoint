"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  completeExerciseSet,
  createPatientSession,
  finishSession,
  getExerciseById,
  getSessionProgress,
  logPain,
  pauseSession,
  resumeSession,
  skipExercise,
  startExerciseSet,
  stopSession,
  type PatientExerciseSet,
  type PatientSession,
} from "@/domain";
import { clearPatientSession, readPatientSession, writePatientSession } from "@/lib/patientStorage";
import { readConfirmedProgram } from "@/lib/therapistStorage";
import type { ConfirmedProgram, DomainResult } from "@/domain/types";

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
  const [rpe, setRpe] = useState(3);
  const [pain, setPain] = useState(0);
  const [skipReason, setSkipReason] = useState("Patient chose to skip this exercise.");

  useEffect(() => {
    const hydrationTimer = window.setTimeout(() => {
      const confirmed = readConfirmedProgram(code);
      if (!confirmed) {
        setLoadState("missing");
        return;
      }
      const stored = readPatientSession<PatientSession>(code);
      if (stored && stored.program.code === code) {
        setProgram(confirmed);
        setSession(stored);
        setLoadState("ready");
        return;
      }
      const created = createPatientSession(confirmed);
      if (!created.ok) {
        setErrors(created.errors.map((item) => item.message));
        setLoadState("missing");
        return;
      }
      setProgram(confirmed);
      setSession(created.value);
      writePatientSession(code, created.value);
      setLoadState("ready");
    }, 0);

    return () => window.clearTimeout(hydrationTimer);
  }, [code]);

  useEffect(() => {
    if (!session) return;
    writePatientSession(code, session);
  }, [code, session]);

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

  useEffect(() => {
    if (!activeSet || session?.status !== "active") return;
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
    setSession(result.value);
    setErrors([]);
    return true;
  };

  const startNextSet = () => {
    if (!session || !nextSet) return;
    const mode =
      nextSet.prescribedCoachingMode === "camera"
        ? "manual"
        : nextSet.prescribedTarget.holdSeconds !== undefined
          ? "timer"
          : "manual";
    if (apply(startExerciseSet(session, { setId: nextSet.id, mode }))) {
      setElapsedSeconds(0);
      setCompletedReps(0);
      setRpe(3);
      setPain(0);
    }
  };

  const completeActiveSet = () => {
    if (!session || !activeSet) return;
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

  const recordPain = () => {
    if (!session) return;
    apply(
      logPain(session, {
        pain,
        note: "Patient-reported during timer/manual fallback.",
      }),
    );
  };

  const resetSession = () => {
    if (!program || !window.confirm("Restart this synthetic session?")) return;
    clearPatientSession(code);
    const created = createPatientSession(program);
    if (created.ok) {
      setSession(created.value);
      setErrors([]);
      setElapsedSeconds(0);
      setCompletedReps(0);
      setRpe(3);
      setPain(0);
    }
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

  const focusSet = activeSet ?? nextSet;
  const focusExercise = focusSet ? getExerciseById(focusSet.exerciseId) : undefined;

  return (
    <main className="flex-1 bg-bg">
      <section className="border-b border-border bg-white">
        <div className="mx-auto flex w-full max-w-[1280px] flex-wrap items-start justify-between gap-6 px-6 py-7 lg:px-8">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary-700">
              Patient session · timer/manual fallback
            </p>
            <h1 className="mt-2 text-3xl font-black tracking-[-0.03em] text-ink-900">
              {program.patientLabel}
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              Therapist-confirmed revision {program.revision} · camera coaching begins in the next phase.
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

                {activeSet ? (
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
                        <input type="number" min={0} max={10} value={rpe} onChange={(event) => setRpe(Number(event.target.value))} className="focus-ring mt-1 h-9 w-full rounded-lg border border-slate-300 text-center font-mono text-lg text-ink-900" />
                      </label>
                      <label className="border border-border p-2 text-center text-[10px] font-bold uppercase text-slate-500">
                        Pain
                        <input type="number" min={0} max={10} value={pain} onChange={(event) => setPain(Number(event.target.value))} className="focus-ring mt-1 h-9 w-full rounded-lg border border-slate-300 text-center font-mono text-lg text-ink-900" />
                      </label>
                    </div>

                    <div className="mt-5 flex flex-wrap gap-2">
                      {session.status === "active" ? (
                        <button type="button" onClick={() => apply(pauseSession(session))} className="focus-ring h-12 rounded-xl border border-primary-700 px-5 text-sm font-bold text-primary-700">Pause</button>
                      ) : !session.safetyGate.active ? (
                        <button type="button" onClick={() => apply(resumeSession(session))} className="focus-ring h-12 rounded-xl border border-primary-700 px-5 text-sm font-bold text-primary-700">Resume</button>
                      ) : null}
                      <button type="button" onClick={recordPain} className="focus-ring h-12 rounded-xl border border-warning px-5 text-sm font-bold text-[#7C5200]">Record pain now</button>
                      <button type="button" onClick={completeActiveSet} disabled={session.status !== "active" || session.safetyGate.active} className="focus-ring h-12 rounded-xl bg-primary-700 px-6 text-sm font-extrabold text-white disabled:bg-slate-300">Complete set</button>
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
                <button type="button" onClick={() => apply(stopSession(session, { reason: "Patient stopped the demo session." }))} className="focus-ring h-11 rounded-xl border border-danger px-4 text-sm font-bold text-danger">Stop session</button>
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
