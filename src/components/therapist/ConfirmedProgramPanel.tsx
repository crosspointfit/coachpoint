"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ArrowTopRightOnSquareIcon,
  CheckCircleIcon,
  ClipboardDocumentIcon,
} from "@heroicons/react/24/outline";
import type { ConfirmedProgram } from "@/domain/types";

interface ConfirmedProgramPanelProps {
  program: ConfirmedProgram;
}

export default function ConfirmedProgramPanel({
  program,
}: ConfirmedProgramPanelProps) {
  const href = `/patient/${program.code}`;
  const displayCode =
    program.code.length > 20
      ? `${program.code.slice(0, 10)}…${program.code.slice(-6)}`
      : program.code;
  const [copied, setCopied] = useState(false);

  const copyLink = async () => {
    const absolute = new URL(href, window.location.href).toString();
    await navigator.clipboard.writeText(absolute);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  return (
    <section className="border-t border-primary-100 bg-[#F3FAFD] px-5 py-3 lg:px-7" aria-label="Confirmed prescription">
      <div className="flex flex-wrap items-center gap-4">
        <CheckCircleIcon className="h-7 w-7 shrink-0 text-primary-700" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-extrabold text-ink-900" title={program.code}>
            Prescription confirmed · {displayCode}
          </p>
          <p className="mt-0.5 text-[11px] text-slate-500">
            {program.items.length} movements · {program.estimatedMinutes.toFixed(1)} minutes · revision {program.revision}
          </p>
        </div>
        <p className="hidden max-w-xs truncate rounded-lg bg-white px-3 py-2 font-mono text-[10px] text-slate-500 xl:block">
          {href}
        </p>
        <button
          type="button"
          onClick={() => void copyLink()}
          className="focus-ring inline-flex h-9 items-center gap-1.5 rounded-lg border border-primary-100 bg-white px-3 text-xs font-bold text-primary-700 hover:border-primary-700"
        >
          <ClipboardDocumentIcon className="h-4 w-4" aria-hidden="true" />
          {copied ? "Copied" : "Copy link"}
        </button>
        <Link
          href={href}
          className="focus-ring inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary-700 px-3 text-xs font-bold text-white hover:bg-primary-800"
        >
          Open patient view
          <ArrowTopRightOnSquareIcon className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}
