"use client";

import {
  ArrowPathIcon,
  ClockIcon,
  CpuChipIcon,
  PencilSquareIcon,
  ShieldCheckIcon,
  UserCircleIcon,
} from "@heroicons/react/24/outline";
import type { CaseContext, ProgramDraft } from "@/domain/types";

interface CaseSummaryBarProps {
  caseContext: CaseContext;
  draft: ProgramDraft | null;
  webMcpStatus: "checking" | "registering" | "ready" | "unsupported" | "error";
  webMcpToolCount: number;
  webMcpError?: string;
  onEditCase: () => void;
  onReset: () => void;
}

export default function CaseSummaryBar({
  caseContext,
  draft,
  webMcpStatus,
  webMcpToolCount,
  webMcpError,
  onEditCase,
  onReset,
}: CaseSummaryBarProps) {
  const toolsReady = webMcpStatus === "ready" && webMcpToolCount > 0;
  const toolsLabel = toolsReady
    ? `${webMcpToolCount} site tools ready`
    : webMcpStatus === "unsupported"
      ? "Manual mode"
      : webMcpStatus === "error"
        ? "Tools need attention"
        : "Checking site tools";

  return (
    <section
      aria-label="Current case summary"
      className="border-b border-border bg-white px-5 py-4 lg:px-7"
    >
      <div className="flex flex-wrap items-center gap-x-7 gap-y-4">
        <div className="flex min-w-0 flex-[1_1_380px] items-center gap-3.5">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary-100 text-primary-700">
            <UserCircleIcon className="h-6 w-6" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="truncate text-sm font-extrabold text-ink-900">
                {caseContext.patientLabel}
              </p>
              <span className="rounded-full border border-primary-100 bg-[#F3FAFD] px-2 py-0.5 text-[10px] font-bold text-primary-700">
                Synthetic demo
              </span>
            </div>
            <p className="mt-0.5 truncate text-xs text-slate-500">
              {caseContext.diagnosis}
            </p>
          </div>
        </div>

        <dl className="flex shrink-0 items-center gap-6">
          <div>
            <dt className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400">
              Recovery
            </dt>
            <dd className="mt-1 text-sm font-extrabold text-ink-900">
              {caseContext.postOpWeeks === undefined
                ? "Not post-op"
                : `Post-op week ${caseContext.postOpWeeks}`}
            </dd>
          </div>
          <div className="border-l border-border pl-6">
            <dt className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400">
              <ClockIcon className="h-3.5 w-3.5" aria-hidden="true" />
              Daily target
            </dt>
            <dd className="mt-1 text-sm font-extrabold text-ink-900">
              {caseContext.minutesPerDay} minutes
            </dd>
          </div>
        </dl>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {draft?.source === "agent" && (
            <span className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[#FFF0EC] px-3 text-[11px] font-bold text-coral-600">
              <ShieldCheckIcon className="h-4 w-4" aria-hidden="true" />
              Agent draft
            </span>
          )}
          <span
            className={`inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-[11px] font-bold ${
              toolsReady
                ? "bg-primary-100 text-primary-700"
                : "bg-[#FFF7E8] text-[#875000]"
            }`}
            title={webMcpError}
            role="status"
          >
            <CpuChipIcon className="h-4 w-4" aria-hidden="true" />
            {toolsLabel}
          </span>
          <button
            type="button"
            onClick={onEditCase}
            className="focus-ring inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-xs font-bold text-slate-700 hover:border-primary-700 hover:text-primary-700"
          >
            <PencilSquareIcon className="h-4 w-4" aria-hidden="true" />
            Edit case
          </button>
          <button
            type="button"
            onClick={onReset}
            className="focus-ring inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-50 hover:text-slate-700"
            aria-label="Reset synthetic demo"
            title="Reset synthetic demo"
          >
            <ArrowPathIcon className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </section>
  );
}
