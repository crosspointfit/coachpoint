"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  ArrowTopRightOnSquareIcon,
  CalendarDaysIcon,
  CheckCircleIcon,
  ClipboardDocumentIcon,
  ClockIcon,
  PlusIcon,
  ShieldCheckIcon,
  UserCircleIcon,
} from "@heroicons/react/24/outline";
import type {
  SyntheticClient,
  TherapistProgramRecord,
} from "@/domain/caseload";
import {
  getSessionProgress,
  projectLatestPatientMotionResult,
  type PatientSession,
} from "@/domain";
import {
  selectClientView,
  selectClientProgramView,
  type ClientProgramView,
} from "@/domain/caseload-views";
import { createProgramForClient } from "@/lib/caseloadStorage";
import { readPatientSession } from "@/lib/patientStorage";
import { useCaseloadSnapshot } from "@/lib/use-caseload-snapshot";
import {
  createClientToolDescriptors,
  useWebMcpTools,
  type WebMcpToolDescriptor,
} from "@/lib/webmcp";
import WebMcpStatusBadge from "./WebMcpStatusBadge";

interface ClientProgramHubProps {
  initialClient: SyntheticClient;
}

function stableDate(value?: string): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recently";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function stableTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recently";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function programItemCount(program: TherapistProgramRecord): number {
  return (
    program.workspace.draft?.items.length ??
    program.workspace.confirmedProgram?.items.length ??
    0
  );
}

function programMinutes(program: TherapistProgramRecord): number {
  return (
    program.workspace.draft?.estimatedMinutes ??
    program.workspace.confirmedProgram?.estimatedMinutes ??
    0
  );
}

function displayCode(code: string): string {
  return code.length > 22
    ? `${code.slice(0, 10)}…${code.slice(-7)}`
    : code;
}

function HubSkeleton() {
  return (
    <div className="space-y-5" aria-label="Loading client program hub">
      <div className="animate-pulse rounded-2xl border border-border bg-white p-6">
        <div className="h-5 w-52 rounded bg-slate-100" />
        <div className="mt-3 h-3 w-96 max-w-full rounded bg-slate-100" />
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          {[0, 1, 2].map((item) => (
            <div key={item} className="h-16 rounded-xl bg-slate-50" />
          ))}
        </div>
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="h-72 animate-pulse rounded-2xl border border-border bg-white" />
        <div className="h-72 animate-pulse rounded-2xl border border-border bg-white" />
      </div>
    </div>
  );
}

function EmptyProgramCard({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="flex min-h-56 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-[#FCFCF9] px-6 text-center">
      <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary-100 text-primary-700">
        <ClipboardDocumentIcon className="h-5 w-5" aria-hidden="true" />
      </span>
      <p className="mt-3 text-sm font-extrabold text-ink-900">{title}</p>
      <p className="mt-1.5 max-w-sm text-xs leading-5 text-slate-500">
        {description}
      </p>
    </div>
  );
}

export default function ClientProgramHub({
  initialClient,
}: ClientProgramHubProps) {
  const router = useRouter();
  const snapshot = useCaseloadSnapshot();
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const view = useMemo(
    () => snapshot ? selectClientView(snapshot, initialClient.id) : null,
    [snapshot, initialClient.id],
  );
  const hydrated = view !== null;
  const visibleView = useRef<ClientProgramView | null>(null);
  useEffect(() => {
    visibleView.current = view;
    return () => { visibleView.current = null; };
  }, [view]);
  const [descriptors, setDescriptors] = useState<readonly WebMcpToolDescriptor[]>([]);
  useEffect(() => {
    if (!hydrated) return;
    let active = true;
    const tools = createClientToolDescriptors(initialClient.id, () => visibleView.current);
    void Promise.resolve().then(() => { if (active) setDescriptors(tools); });
    return () => { active = false; };
  }, [hydrated, initialClient.id]);
  const webMcp = useWebMcpTools(descriptors);
  const {
    client,
    programs,
    draftProgram,
    activeProgram,
    activeConfirmedProgram,
    previousConfirmedVersions,
    nonVersionHistoryPrograms,
    historyCount,
    recentActivity,
    clientStatusLabel: clientStatus,
  } = view ?? selectClientProgramView(initialClient, []);
  const activePatientCode = activeConfirmedProgram?.code ?? null;
  const [patientSession, setPatientSession] = useState<PatientSession | null>(null);

  useEffect(() => {
    let active = true;
    const refresh = () => {
      if (!active) return;
      setPatientSession(
        activePatientCode ? readPatientSession(activePatientCode) : null,
      );
    };
    const hydrationTimer = window.setTimeout(refresh, 0);
    window.addEventListener("focus", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      active = false;
      window.clearTimeout(hydrationTimer);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [activePatientCode]);

  const patientProgress = useMemo(
    () => (patientSession ? getSessionProgress(patientSession) : null),
    [patientSession],
  );
  const latestPatientMotion = useMemo(
    () =>
      patientSession
        ? projectLatestPatientMotionResult(patientSession)
        : null,
    [patientSession],
  );

  const startPrescription = () => {
    if (draftProgram) {
      router.push(
        `/therapist/clients/${client.id}/programs/${draftProgram.programId}`,
      );
      return;
    }
    setCreating(true);
    setCreateError("");
    const created = createProgramForClient(client.id);
    if (!created) {
      setCreating(false);
      setCreateError(
        "The new prescription could not be saved in this browser. Check storage access and try again.",
      );
      return;
    }
    router.push(
      `/therapist/clients/${client.id}/programs/${created.programId}`,
    );
  };

  const context = client.caseContext;

  return (
    <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="mx-auto w-full max-w-[1280px]">
        <nav aria-label="Breadcrumb" className="mb-5">
          <ol className="flex flex-wrap items-center gap-2 text-xs font-bold text-slate-500">
            <li>
              <Link
                href="/therapist"
                className="focus-ring inline-flex items-center gap-1.5 rounded-md hover:text-primary-700"
              >
                <ArrowLeftIcon className="h-3.5 w-3.5" aria-hidden="true" />
                Clients
              </Link>
            </li>
            <li aria-hidden="true" className="text-slate-300">
              /
            </li>
            <li className="text-ink-900" aria-current="page">
              {client.displayName}
            </li>
          </ol>
        </nav>

        <section
          aria-labelledby="client-heading"
          className="rounded-2xl border border-border bg-white p-5 shadow-[var(--cp-shadow-card)] sm:p-6"
        >
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div className="flex min-w-0 items-start gap-4">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary-100 text-primary-700">
                <UserCircleIcon className="h-7 w-7" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1
                    id="client-heading"
                    className="text-2xl font-black tracking-[-0.025em] text-ink-900"
                  >
                    {client.displayName}
                  </h1>
                  <span className="rounded-full border border-primary-100 bg-[#F3FAFD] px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.07em] text-primary-700">
                    Synthetic demo
                  </span>
                  <WebMcpStatusBadge state={webMcp} />
                </div>
                <p className="mt-1.5 max-w-2xl text-sm leading-6 text-slate-500">
                  {context.diagnosis}
                </p>
                <p className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-bold text-primary-700">
                  <ShieldCheckIcon className="h-4 w-4" aria-hidden="true" />
                  {clientStatus}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={startPrescription}
              disabled={!hydrated || creating}
              className="focus-ring inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-coral-500 px-5 text-sm font-extrabold text-white shadow-[0_4px_12px_rgba(239,91,62,0.18)] hover:bg-coral-600 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none sm:w-auto"
            >
              <PlusIcon className="h-5 w-5" aria-hidden="true" />
              {creating
                ? "Creating draft…"
                : draftProgram
                  ? "Continue draft"
                  : "New prescription"}
            </button>
          </div>

          {createError && (
            <div
              role="alert"
              className="mt-4 rounded-xl border border-[#E9D7B6] bg-[#FFF9ED] px-4 py-3 text-xs leading-5 text-[#74501D]"
            >
              <p className="font-bold">Could not create a prescription</p>
              <p className="mt-0.5">{createError}</p>
            </div>
          )}

          <dl className="mt-6 grid overflow-hidden rounded-xl border border-border bg-[#FCFCF9] sm:grid-cols-3">
            <div className="border-b border-border px-4 py-3.5 sm:border-b-0 sm:border-r">
              <dt className="text-[9px] font-bold uppercase tracking-[0.1em] text-slate-400">
                Recovery
              </dt>
              <dd className="mt-1 text-sm font-extrabold text-ink-900">
                {context.postOpWeeks === undefined
                  ? "Not post-operative"
                  : `Post-op week ${context.postOpWeeks}`}
              </dd>
            </div>
            <div className="border-b border-border px-4 py-3.5 sm:border-b-0 sm:border-r">
              <dt className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-[0.1em] text-slate-400">
                <ClockIcon className="h-3.5 w-3.5" aria-hidden="true" />
                Daily target
              </dt>
              <dd className="mt-1 text-sm font-extrabold text-ink-900">
                {context.minutesPerDay} minutes
              </dd>
            </div>
            <div className="px-4 py-3.5">
              <dt className="text-[9px] font-bold uppercase tracking-[0.1em] text-slate-400">
                Body region
              </dt>
              <dd className="mt-1 text-sm font-extrabold capitalize text-ink-900">
                {context.bodyRegion ?? "Not specified"}
              </dd>
            </div>
          </dl>
        </section>

        {!hydrated ? (
          <div className="mt-5">
            <HubSkeleton />
          </div>
        ) : (
          <>
            <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
              <section
                aria-labelledby="context-heading"
                className="rounded-2xl border border-border bg-white p-5 shadow-[var(--cp-shadow-card)] sm:p-6"
              >
                <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-primary-700">
                  Clinical context
                </p>
                <h2
                  id="context-heading"
                  className="mt-1 text-lg font-black tracking-[-0.015em] text-ink-900"
                >
                  Therapist-defined boundary
                </h2>

                <dl className="mt-5 grid gap-5 sm:grid-cols-2">
                  <div>
                    <dt className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400">
                      Goals
                    </dt>
                    <dd className="mt-2 flex flex-wrap gap-1.5">
                      {context.goals.map((goal) => (
                        <span
                          key={goal}
                          className="rounded-full bg-primary-100 px-2.5 py-1 text-[10px] font-bold text-primary-700"
                        >
                          {goal}
                        </span>
                      ))}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400">
                      Available equipment
                    </dt>
                    <dd className="mt-2 flex flex-wrap gap-1.5">
                      {context.equipment.length > 0 ? (
                        context.equipment.map((item) => (
                          <span
                            key={item}
                            className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold capitalize text-slate-600"
                          >
                            {item}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-slate-500">No equipment listed</span>
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400">
                      Procedure
                    </dt>
                    <dd className="mt-1.5 text-xs leading-5 text-slate-600">
                      {context.procedure ?? "No procedure documented"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400">
                      Protocol
                    </dt>
                    <dd className="mt-1.5 text-xs leading-5 text-slate-600">
                      {context.protocol ?? "No protocol documented"}
                    </dd>
                  </div>
                </dl>

                {context.notes && (
                  <div className="mt-5 border-t border-border pt-4">
                    <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400">
                      Therapist notes
                    </p>
                    <p className="mt-1.5 text-xs leading-5 text-slate-600">
                      {context.notes}
                    </p>
                  </div>
                )}
              </section>

              <section
                aria-labelledby="activity-heading"
                className="rounded-2xl border border-border bg-white p-5 shadow-[var(--cp-shadow-card)] sm:p-6"
              >
                <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-primary-700">
                  Audit trail
                </p>
                <h2
                  id="activity-heading"
                  className="mt-1 text-lg font-black tracking-[-0.015em] text-ink-900"
                >
                  Recent program activity
                </h2>

                {recentActivity.length === 0 ? (
                  <div className="flex min-h-44 flex-col items-center justify-center text-center">
                    <CalendarDaysIcon className="h-8 w-8 text-slate-300" aria-hidden="true" />
                    <p className="mt-3 text-sm font-extrabold text-ink-900">
                      No activity yet
                    </p>
                    <p className="mt-1 max-w-xs text-xs leading-5 text-slate-500">
                      Agent and therapist actions will appear after a prescription
                      is started.
                    </p>
                  </div>
                ) : (
                  <ol className="mt-4 space-y-3">
                    {recentActivity.map((activity) => (
                      <li key={activity.id} className="flex items-start gap-3">
                        <span
                          className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${
                            activity.actor === "agent"
                              ? "bg-primary-700"
                              : activity.actor === "therapist"
                                ? "bg-coral-500"
                                : "bg-slate-400"
                          }`}
                          aria-hidden="true"
                        />
                        <div className="min-w-0 flex-1 border-b border-border pb-3 last:border-b-0">
                          <div className="flex items-start justify-between gap-3">
                            <p className="text-xs font-bold text-ink-900">
                              {activity.action}
                            </p>
                            <time
                              dateTime={activity.createdAt}
                              className="shrink-0 font-mono text-[9px] text-slate-400"
                            >
                              {stableTime(activity.createdAt)}
                            </time>
                          </div>
                          <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-slate-500">
                            {activity.detail}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </section>
            </div>

            <section className="mt-5" aria-labelledby="programs-heading">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-primary-700">
                    Care plans
                  </p>
                  <h2
                    id="programs-heading"
                    className="mt-1 text-xl font-black tracking-[-0.02em] text-ink-900"
                  >
                    Prescription workspace
                  </h2>
                </div>
                <p className="font-mono text-[11px] text-slate-400">
                  {programs.length} total
                </p>
              </div>

              <div className="mt-4 grid gap-5 lg:grid-cols-2">
                <article className="rounded-2xl border border-border bg-white p-5 shadow-[var(--cp-shadow-card)] sm:p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.11em] text-primary-700">
                        Current draft
                      </p>
                      <h3 className="mt-1 text-base font-extrabold text-ink-900">
                        Review and refine
                      </h3>
                    </div>
                    {draftProgram && (
                      <span
                        className={`rounded-full px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.07em] ${
                          draftProgram.workspace.draft?.source === "agent" &&
                          programItemCount(draftProgram) > 0
                            ? "bg-[#FFF0EC] text-coral-600"
                            : "bg-[#FFF7E8] text-[#875000]"
                        }`}
                      >
                        {draftProgram.workspace.draft?.source === "agent" &&
                        programItemCount(draftProgram) > 0
                          ? "Needs review"
                          : "Draft"}
                      </span>
                    )}
                  </div>

                  {draftProgram ? (
                    <>
                      <dl className="mt-5 grid grid-cols-3 overflow-hidden rounded-xl border border-border bg-[#FCFCF9]">
                        <div className="border-r border-border px-3 py-3">
                          <dt className="text-[9px] font-bold uppercase text-slate-400">Movements</dt>
                          <dd className="mt-1 font-mono text-lg font-bold text-ink-900">
                            {programItemCount(draftProgram)}
                          </dd>
                        </div>
                        <div className="border-r border-border px-3 py-3">
                          <dt className="text-[9px] font-bold uppercase text-slate-400">Estimate</dt>
                          <dd className="mt-1 font-mono text-lg font-bold text-ink-900">
                            {programMinutes(draftProgram).toFixed(1)}m
                          </dd>
                        </div>
                        <div className="px-3 py-3">
                          <dt className="text-[9px] font-bold uppercase text-slate-400">Revision</dt>
                          <dd className="mt-1 font-mono text-lg font-bold text-ink-900">
                            {draftProgram.workspace.draft?.revision ?? 1}
                          </dd>
                        </div>
                      </dl>
                      <p className="mt-4 text-[11px] text-slate-500">
                        Updated {stableDate(draftProgram.updatedAt)} · {draftProgram.workspace.draft?.source === "agent" ? "Agent-created" : "Therapist-created"}
                      </p>
                      <Link
                        href={`/therapist/clients/${client.id}/programs/${draftProgram.programId}`}
                        className={`focus-ring mt-5 inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-xl px-4 text-xs font-extrabold ${
                          draftProgram.workspace.draft?.source === "agent" &&
                          programItemCount(draftProgram) > 0
                            ? "bg-coral-500 text-white hover:bg-coral-600"
                            : "border border-primary-700 text-primary-700 hover:bg-primary-100"
                        }`}
                      >
                        {draftProgram.workspace.draft?.source === "agent" &&
                        programItemCount(draftProgram) > 0
                          ? "Review agent draft"
                          : "Continue editing"}
                        <ArrowRightIcon className="h-4 w-4" aria-hidden="true" />
                      </Link>
                    </>
                  ) : (
                    <div className="mt-4">
                      <EmptyProgramCard
                        title="No draft in progress"
                        description="Create a prescription to open the movement gallery and begin a therapist-controlled draft."
                      />
                    </div>
                  )}
                </article>

                <article className="rounded-2xl border border-border bg-white p-5 shadow-[var(--cp-shadow-card)] sm:p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.11em] text-primary-700">
                        Active prescription
                      </p>
                      <h3 className="mt-1 text-base font-extrabold text-ink-900">
                        Patient-ready plan
                      </h3>
                    </div>
                    {activeProgram && (
                      <span className="rounded-full bg-primary-100 px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.07em] text-primary-700">
                        Confirmed
                      </span>
                    )}
                  </div>

                  {activeProgram && activeConfirmedProgram ? (
                    <>
                      <div className="mt-5 flex items-start gap-3 rounded-xl border border-primary-100 bg-[#F3FAFD] p-4">
                        <CheckCircleIcon
                          className="h-7 w-7 shrink-0 text-primary-700"
                          aria-hidden="true"
                        />
                        <div className="min-w-0">
                          <p className="text-sm font-extrabold text-ink-900">
                            Prescription confirmed
                          </p>
                          <p
                            className="mt-1 truncate font-mono text-[10px] text-slate-500"
                            title={activeConfirmedProgram.code}
                          >
                            {displayCode(activeConfirmedProgram.code)}
                          </p>
                        </div>
                      </div>
                      <p className="mt-4 text-xs text-slate-500">
                        {activeConfirmedProgram.items.length} movements · {activeConfirmedProgram.estimatedMinutes.toFixed(1)} minutes · revision {activeConfirmedProgram.revision}
                      </p>
                      <p className="mt-2 text-[11px] text-slate-500">
                        Confirmed by therapist · {" "}
                        <time dateTime={activeConfirmedProgram.confirmedAt}>
                          {stableTime(activeConfirmedProgram.confirmedAt)}
                        </time>
                      </p>
                      <div className="mt-5 flex flex-wrap gap-2">
                        <Link
                          href={`/therapist/clients/${client.id}/programs/${activeProgram.programId}`}
                          className="focus-ring inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl border border-primary-700 px-4 text-xs font-extrabold text-primary-700 hover:bg-primary-100"
                        >
                          View plan
                          <ArrowRightIcon className="h-4 w-4" aria-hidden="true" />
                        </Link>
                        <Link
                          href={`/patient/${activeConfirmedProgram.code}`}
                          className="focus-ring inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl bg-primary-700 px-4 text-xs font-extrabold text-white hover:bg-primary-800"
                        >
                          Open patient
                          <ArrowTopRightOnSquareIcon className="h-4 w-4" aria-hidden="true" />
                        </Link>
                      </div>
                    </>
                  ) : (
                    <div className="mt-4">
                      <EmptyProgramCard
                        title="No active prescription"
                        description="The patient link appears here only after the treating therapist confirms a reviewed draft."
                      />
                    </div>
                  )}
                </article>
              </div>
            </section>

            {activeConfirmedProgram && (
              <section
                aria-labelledby="patient-progress-heading"
                className="mt-5 rounded-2xl border border-border bg-white p-5 shadow-[var(--cp-shadow-card)] sm:p-6"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-primary-700">
                      Patient activity
                    </p>
                    <h2
                      id="patient-progress-heading"
                      className="mt-1 text-lg font-black tracking-[-0.015em] text-ink-900"
                    >
                      Adherence and latest camera result
                    </h2>
                  </div>
                  <Link
                    href={`/patient/${activeConfirmedProgram.code}`}
                    className="focus-ring inline-flex h-10 items-center gap-1.5 rounded-xl border border-primary-700 px-4 text-xs font-extrabold text-primary-700 hover:bg-primary-100"
                  >
                    Open patient view
                    <ArrowTopRightOnSquareIcon className="h-4 w-4" aria-hidden="true" />
                  </Link>
                </div>

                {patientSession && patientProgress ? (
                  <>
                    <dl className="mt-5 grid grid-cols-2 overflow-hidden rounded-xl border border-border bg-[#FCFCF9] sm:grid-cols-4">
                      <div className="border-b border-r border-border px-4 py-3 sm:border-b-0">
                        <dt className="text-[9px] font-bold uppercase text-slate-400">Resolved sets</dt>
                        <dd className="mt-1 font-mono text-xl font-bold text-ink-900">
                          {patientProgress.resolvedSets}/{patientProgress.totalSets}
                        </dd>
                      </div>
                      <div className="border-b border-border px-4 py-3 sm:border-b-0 sm:border-r">
                        <dt className="text-[9px] font-bold uppercase text-slate-400">Completed</dt>
                        <dd className="mt-1 font-mono text-xl font-bold text-ink-900">
                          {patientProgress.completedSets}
                        </dd>
                      </div>
                      <div className="border-r border-border px-4 py-3">
                        <dt className="text-[9px] font-bold uppercase text-slate-400">Skipped / stopped</dt>
                        <dd className="mt-1 font-mono text-xl font-bold text-ink-900">
                          {patientProgress.skippedSets + patientProgress.stoppedSets}
                        </dd>
                      </div>
                      <div className="px-4 py-3">
                        <dt className="text-[9px] font-bold uppercase text-slate-400">Session status</dt>
                        <dd className="mt-1 text-sm font-extrabold capitalize text-ink-900">
                          {patientSession.status.replaceAll("_", " ")}
                        </dd>
                      </div>
                    </dl>

                    {latestPatientMotion ? (
                      <div className="mt-4 grid gap-4 rounded-xl border border-primary-100 bg-[#F3FAFD] p-4 sm:grid-cols-[minmax(0,1fr)_auto]">
                        <div>
                          <p className="text-xs font-extrabold text-ink-900">
                            Latest: {latestPatientMotion.target.exerciseName}
                          </p>
                          <p className="mt-1 text-[11px] leading-5 text-slate-600">
                            {latestPatientMotion.performance.completedRepetitions}/{latestPatientMotion.target.targetRepetitions} reps · {latestPatientMotion.performance.setDurationSeconds}s set · {latestPatientMotion.measurements.averageDetectedKneeRangeDeg}° average detected range
                          </p>
                          {latestPatientMotion.quality.eventLabels.length > 0 && (
                            <p className="mt-1 text-[11px] leading-5 text-slate-500">
                              Detector notes: {latestPatientMotion.quality.eventLabels.join(" · ").replaceAll("_", " ")}
                            </p>
                          )}
                        </div>
                        <dl className="grid grid-cols-2 gap-3 text-center">
                          <div className="rounded-lg bg-white px-4 py-2">
                            <dt className="text-[9px] font-bold uppercase text-slate-400">RPE</dt>
                            <dd className="mt-1 font-mono text-lg font-bold text-ink-900">{latestPatientMotion.checkIn.rpe}</dd>
                          </div>
                          <div className="rounded-lg bg-white px-4 py-2">
                            <dt className="text-[9px] font-bold uppercase text-slate-400">Pain</dt>
                            <dd className="mt-1 font-mono text-lg font-bold text-ink-900">{latestPatientMotion.checkIn.pain}</dd>
                          </div>
                        </dl>
                      </div>
                    ) : (
                      <p className="mt-4 text-xs leading-5 text-slate-500">
                        No checked-in camera set has been saved for this active prescription yet.
                      </p>
                    )}
                  </>
                ) : (
                  <div className="mt-5 rounded-xl border border-dashed border-slate-300 bg-[#FCFCF9] px-5 py-6 text-center">
                    <p className="text-sm font-extrabold text-ink-900">No patient session recorded yet</p>
                    <p className="mt-1 text-xs text-slate-500">
                      Progress appears after the patient opens this confirmed program in the same browser.
                    </p>
                  </div>
                )}
              </section>
            )}

            <section
              aria-labelledby="history-heading"
              className="mt-5 overflow-hidden rounded-2xl border border-border bg-white shadow-[var(--cp-shadow-card)]"
            >
              <div className="flex items-end justify-between gap-4 border-b border-border px-5 py-4 sm:px-6">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-primary-700">
                    Program history
                  </p>
                  <h2 id="history-heading" className="mt-1 text-base font-extrabold text-ink-900">
                    Previous care plans
                  </h2>
                </div>
                <p className="font-mono text-[10px] text-slate-400">
                  {historyCount} previous
                </p>
              </div>

              {historyCount === 0 ? (
                <div className="px-6 py-8 text-center">
                  <p className="text-sm font-extrabold text-ink-900">No previous plans</p>
                  <p className="mt-1 text-xs text-slate-500">
                    Superseded and archived synthetic programs will be listed here.
                  </p>
                </div>
              ) : (
                <ul>
                  {previousConfirmedVersions.map(({ program, version }) => (
                    <li
                      key={version.code}
                      className="flex flex-wrap items-center gap-4 border-b border-border px-5 py-4 last:border-b-0 sm:px-6"
                    >
                      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-100 text-primary-700">
                        <CheckCircleIcon className="h-4 w-4" aria-hidden="true" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-extrabold text-ink-900">
                          Confirmed revision {version.revision}
                        </p>
                        <p className="mt-0.5 text-[10px] text-slate-500">
                          {version.items.length} movements · confirmed {stableDate(version.confirmedAt)}
                        </p>
                      </div>
                      <Link
                        href={`/patient/${version.code}`}
                        className="focus-ring inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-[11px] font-bold text-primary-700 hover:bg-primary-100"
                      >
                        Patient view
                        <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5" aria-hidden="true" />
                      </Link>
                      <Link
                        href={`/therapist/clients/${client.id}/programs/${program.programId}`}
                        className="focus-ring inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-[11px] font-bold text-primary-700 hover:bg-primary-100"
                      >
                        Workspace
                        <ArrowRightIcon className="h-3.5 w-3.5" aria-hidden="true" />
                      </Link>
                    </li>
                  ))}
                  {nonVersionHistoryPrograms.map((program) => (
                    <li
                      key={program.programId}
                      className="flex flex-wrap items-center gap-4 border-b border-border px-5 py-4 last:border-b-0 sm:px-6"
                    >
                      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
                        <ClipboardDocumentIcon className="h-4 w-4" aria-hidden="true" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-extrabold capitalize text-ink-900">
                          {program.status} program
                        </p>
                        <p className="mt-0.5 text-[10px] text-slate-500">
                          {programItemCount(program)} movements · updated {stableDate(program.updatedAt)}
                        </p>
                      </div>
                      <Link
                        href={`/therapist/clients/${client.id}/programs/${program.programId}`}
                        className="focus-ring inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-[11px] font-bold text-primary-700 hover:bg-primary-100"
                      >
                        View
                        <ArrowRightIcon className="h-3.5 w-3.5" aria-hidden="true" />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}
