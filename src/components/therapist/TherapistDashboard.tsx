"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowRightIcon,
  CheckCircleIcon,
  ClipboardDocumentCheckIcon,
  ClockIcon,
  MagnifyingGlassIcon,
  ShieldCheckIcon,
  UserCircleIcon,
  UsersIcon,
} from "@heroicons/react/24/outline";
import type {
  SyntheticClient,
  TherapistProgramRecord,
} from "@/domain/caseload";
import type { ConfirmedProgram } from "@/domain/types";
import {
  listClients,
  listProgramsForClient,
  readCaseload,
} from "@/lib/caseloadStorage";

type ClientStatus = "needs-review" | "draft" | "active" | "no-plan";
type StatusFilter = "all" | ClientStatus;

interface ClientSummary {
  client: SyntheticClient;
  currentProgram: TherapistProgramRecord | null;
  activeConfirmedProgram: ConfirmedProgram | null;
  status: ClientStatus;
  statusLabel: string;
  itemCount: number;
  hasActiveProgram: boolean;
  updatedAt?: string;
}

const STATUS_FILTERS: Array<{ value: StatusFilter; label: string }> = [
  { value: "all", label: "All clients" },
  { value: "needs-review", label: "Needs review" },
  { value: "draft", label: "Draft" },
  { value: "active", label: "Active" },
  { value: "no-plan", label: "No plan" },
];

const STATUS_STYLES: Record<ClientStatus, string> = {
  "needs-review": "bg-[#FFF0EC] text-coral-600",
  draft: "bg-[#FFF7E8] text-[#875000]",
  active: "bg-primary-100 text-primary-700",
  "no-plan": "bg-slate-100 text-slate-600",
};

function summarizeClient(
  client: SyntheticClient,
  programs: TherapistProgramRecord[],
): ClientSummary {
  const draft = programs.find((program) => program.status === "draft") ?? null;
  const activeSelection =
    programs
      .filter((program) => program.status !== "archived")
      .flatMap((program) =>
        program.confirmedCodes.flatMap((code) => {
          const version = program.confirmedVersions[code];
          return version ? [{ program, version }] : [];
        }),
      )
      .sort((a, b) =>
        b.version.confirmedAt.localeCompare(a.version.confirmedAt),
      )[0] ?? null;
  const active = activeSelection?.program ?? null;
  const activeConfirmedProgram = activeSelection?.version ?? null;
  const currentProgram = draft ?? active ?? programs[0] ?? null;
  const draftSource = draft?.workspace.draft?.source;
  const draftItemCount = draft?.workspace.draft?.items.length ?? 0;

  const status: ClientStatus = draft
    ? draftSource === "agent" && draftItemCount > 0
      ? "needs-review"
      : "draft"
    : active
      ? "active"
      : "no-plan";

  const statusLabel =
    status === "needs-review"
      ? "Needs review"
      : status === "draft"
        ? "Draft"
        : status === "active"
          ? "Active"
          : "No plan";

  const itemCount = draft
    ? (draft.workspace.draft?.items.length ?? 0)
    : (activeConfirmedProgram?.items.length ?? 0);

  return {
    client,
    currentProgram,
    activeConfirmedProgram,
    status,
    statusLabel,
    itemCount,
    hasActiveProgram: Boolean(active),
    updatedAt: draft?.updatedAt ?? activeConfirmedProgram?.confirmedAt,
  };
}

function stableDate(value?: string): string {
  if (!value) return "Not started";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recently updated";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(date);
}

function clientNextStep(summary: ClientSummary) {
  if (
    (summary.status === "needs-review" || summary.status === "draft") &&
    summary.currentProgram
  ) {
    return {
      href: `/therapist/clients/${summary.client.id}/programs/${summary.currentProgram.programId}`,
      label: summary.status === "needs-review" ? "Review draft" : "Continue draft",
    };
  }
  return {
    href: `/therapist/clients/${summary.client.id}`,
    label: summary.status === "active" ? "View care plan" : "Open client",
  };
}

function DashboardSkeleton() {
  return (
    <div className="space-y-3" aria-label="Loading synthetic caseload">
      {[0, 1, 2].map((item) => (
        <div
          key={item}
          className="grid min-h-32 animate-pulse gap-4 border-b border-border bg-white px-5 py-5 last:border-b-0 sm:grid-cols-[minmax(0,1.35fr)_minmax(210px,0.65fr)_auto] lg:px-6"
        >
          <div className="flex items-start gap-3">
            <span className="h-11 w-11 rounded-full bg-slate-100" />
            <span className="flex-1 space-y-2 pt-1">
              <span className="block h-4 w-40 rounded bg-slate-100" />
              <span className="block h-3 w-64 max-w-full rounded bg-slate-100" />
            </span>
          </div>
          <div className="space-y-2">
            <span className="block h-3 w-24 rounded bg-slate-100" />
            <span className="block h-3 w-32 rounded bg-slate-100" />
          </div>
          <span className="h-10 w-28 rounded-xl bg-slate-100" />
        </div>
      ))}
    </div>
  );
}

export default function TherapistDashboard() {
  const [clients, setClients] = useState<SyntheticClient[]>([]);
  const [programsByClient, setProgramsByClient] = useState<
    Record<string, TherapistProgramRecord[]>
  >({});
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const hydrationTimer = window.setTimeout(() => {
      readCaseload();
      const nextClients = listClients();
      setClients(nextClients);
      setProgramsByClient(
        Object.fromEntries(
          nextClients.map((client) => [
            client.id,
            listProgramsForClient(client.id),
          ]),
        ),
      );
      setHydrated(true);
    }, 0);

    return () => window.clearTimeout(hydrationTimer);
  }, []);

  const summaries = useMemo(
    () =>
      clients.map((client) =>
        summarizeClient(client, programsByClient[client.id] ?? []),
      ),
    [clients, programsByClient],
  );

  const counts = useMemo(
    () => ({
      total: summaries.length,
      review: summaries.filter((summary) => summary.status === "needs-review")
        .length,
      active: summaries.filter((summary) => summary.hasActiveProgram).length,
      drafts: summaries.filter(
        (summary) =>
          summary.status === "draft" || summary.status === "needs-review",
      ).length,
    }),
    [summaries],
  );

  const visibleSummaries = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("en-US");
    return summaries.filter((summary) => {
      if (statusFilter !== "all" && summary.status !== statusFilter) return false;
      if (!normalizedQuery) return true;
      const searchable = [
        summary.client.displayName,
        summary.client.caseContext.diagnosis,
        summary.client.caseContext.bodyRegion,
        ...summary.client.caseContext.goals,
      ]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("en-US");
      return searchable.includes(normalizedQuery);
    });
  }, [query, statusFilter, summaries]);

  return (
    <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="mx-auto w-full max-w-[1280px]">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-primary-700">
              Therapist caseload
            </p>
            <h1 className="mt-1.5 text-3xl font-black tracking-[-0.03em] text-ink-900">
              Clients and care plans
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
              Review agent drafts, continue therapist work, and manage active
              programs from one synthetic competition workspace.
            </p>
          </div>
          <span className="inline-flex h-9 items-center gap-2 rounded-full border border-primary-100 bg-white px-3 text-[11px] font-bold text-primary-700">
            <ShieldCheckIcon className="h-4 w-4" aria-hidden="true" />
            Synthetic demo data only
          </span>
        </div>

        <dl className="mt-7 grid overflow-hidden rounded-2xl border border-border bg-white shadow-[var(--cp-shadow-card)] sm:grid-cols-3">
          <div className="flex items-center gap-3 border-b border-border px-5 py-4 sm:border-b-0 sm:border-r">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-100 text-primary-700">
              <UsersIcon className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <dt className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400">
                Synthetic clients
              </dt>
              <dd className="mt-0.5 font-mono text-xl font-bold tabular-nums text-ink-900">
                {hydrated ? counts.total : "—"}
              </dd>
            </div>
          </div>
          <div className="flex items-center gap-3 border-b border-border px-5 py-4 sm:border-b-0 sm:border-r">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#FFF0EC] text-coral-600">
              <ClipboardDocumentCheckIcon className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <dt className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400">
                Needs review
              </dt>
              <dd className="mt-0.5 font-mono text-xl font-bold tabular-nums text-ink-900">
                {hydrated ? counts.review : "—"}
              </dd>
            </div>
          </div>
          <div className="flex items-center gap-3 px-5 py-4">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-100 text-primary-700">
              <CheckCircleIcon className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <dt className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400">
                Active programs
              </dt>
              <dd className="mt-0.5 font-mono text-xl font-bold tabular-nums text-ink-900">
                {hydrated ? counts.active : "—"}
              </dd>
            </div>
          </div>
        </dl>

        <section
          className="mt-6 overflow-hidden rounded-2xl border border-border bg-white shadow-[var(--cp-shadow-card)]"
          aria-labelledby="client-directory-heading"
        >
          <div className="border-b border-border px-5 pb-4 pt-5 lg:px-6">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-primary-700">
                  Care queue
                </p>
                <h2
                  id="client-directory-heading"
                  className="mt-1 text-xl font-black tracking-[-0.02em] text-ink-900"
                >
                  Client directory
                </h2>
              </div>
              <p className="font-mono text-[11px] text-slate-400" aria-live="polite">
                {hydrated ? `${visibleSummaries.length} shown` : "Loading"}
              </p>
            </div>

            <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center">
              <label className="relative min-w-0 flex-1">
                <span className="sr-only">Search synthetic clients</span>
                <MagnifyingGlassIcon
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                  aria-hidden="true"
                />
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search client, diagnosis, goal, or body region"
                  className="focus-ring h-10 w-full rounded-xl border border-slate-300 bg-white pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400"
                />
              </label>
              <div
                className="flex gap-1.5 overflow-x-auto pb-0.5"
                aria-label="Filter clients by program status"
              >
                {STATUS_FILTERS.map((filter) => {
                  const active = statusFilter === filter.value;
                  return (
                    <button
                      key={filter.value}
                      type="button"
                      onClick={() => setStatusFilter(filter.value)}
                      aria-pressed={active}
                      className={`focus-ring shrink-0 rounded-full px-3 py-2 text-[11px] font-bold transition-colors ${
                        active
                          ? "bg-ink-900 text-white"
                          : "border border-slate-200 bg-white text-slate-600 hover:border-primary-700 hover:text-primary-700"
                      }`}
                    >
                      {filter.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {!hydrated ? (
            <DashboardSkeleton />
          ) : visibleSummaries.length === 0 ? (
            <div className="flex min-h-64 flex-col items-center justify-center px-6 py-12 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-100 text-primary-700">
                <MagnifyingGlassIcon className="h-5 w-5" aria-hidden="true" />
              </span>
              <p className="mt-4 text-base font-extrabold text-ink-900">
                No clients match these filters
              </p>
              <p className="mt-1.5 max-w-sm text-sm leading-6 text-slate-500">
                Try a broader search or return to the complete synthetic
                caseload.
              </p>
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setStatusFilter("all");
                }}
                className="focus-ring mt-4 h-10 rounded-xl border border-primary-700 px-4 text-xs font-bold text-primary-700 hover:bg-primary-100"
              >
                Clear filters
              </button>
            </div>
          ) : (
            <ul>
              {visibleSummaries.map((summary) => {
                const nextStep = clientNextStep(summary);
                const context = summary.client.caseContext;
                return (
                  <li
                    key={summary.client.id}
                    className="grid gap-5 border-b border-border px-5 py-5 last:border-b-0 sm:grid-cols-[minmax(0,1.35fr)_minmax(210px,0.65fr)_auto] sm:items-center lg:px-6"
                  >
                    <div className="flex min-w-0 items-start gap-3.5">
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary-100 text-primary-700">
                        <UserCircleIcon className="h-6 w-6" aria-hidden="true" />
                      </span>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link
                            href={`/therapist/clients/${summary.client.id}`}
                            className="focus-ring rounded-md text-sm font-extrabold text-ink-900 hover:text-primary-700"
                          >
                            {summary.client.displayName}
                          </Link>
                          <span className="rounded-full border border-primary-100 bg-[#F3FAFD] px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.06em] text-primary-700">
                            Synthetic
                          </span>
                        </div>
                        <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">
                          {context.diagnosis}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] font-bold text-slate-500">
                          {context.bodyRegion && (
                            <span className="rounded-full bg-slate-50 px-2 py-1 capitalize">
                              {context.bodyRegion}
                            </span>
                          )}
                          <span className="rounded-full bg-slate-50 px-2 py-1">
                            {context.minutesPerDay} min daily
                          </span>
                          {context.postOpWeeks !== undefined && (
                            <span className="rounded-full bg-slate-50 px-2 py-1">
                              Post-op week {context.postOpWeeks}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="min-w-0 sm:border-l sm:border-border sm:pl-5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-full px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.08em] ${STATUS_STYLES[summary.status]}`}
                        >
                          {summary.statusLabel}
                        </span>
                        {summary.itemCount > 0 && (
                          <span className="text-[11px] text-slate-500">
                            {summary.itemCount} movement
                            {summary.itemCount === 1 ? "" : "s"}
                          </span>
                        )}
                      </div>
                      <p className="mt-2 flex items-center gap-1.5 text-[10px] text-slate-400">
                        <ClockIcon className="h-3.5 w-3.5" aria-hidden="true" />
                        {summary.updatedAt
                          ? `Updated ${stableDate(summary.updatedAt)}`
                          : "Ready for a care plan"}
                      </p>
                    </div>

                    <Link
                      href={nextStep.href}
                      className={`focus-ring inline-flex h-10 items-center justify-center gap-1.5 rounded-xl px-4 text-xs font-extrabold sm:justify-start ${
                        summary.status === "needs-review"
                          ? "bg-coral-500 text-white hover:bg-coral-600"
                          : "border border-primary-700 bg-white text-primary-700 hover:bg-primary-100"
                      }`}
                    >
                      {nextStep.label}
                      <ArrowRightIcon className="h-4 w-4" aria-hidden="true" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {hydrated && counts.drafts === 0 && counts.review === 0 && (
          <p className="mt-4 text-center text-xs text-slate-400">
            No open prescription drafts. Select a client to begin a synthetic
            care plan.
          </p>
        )}
      </div>
    </main>
  );
}
