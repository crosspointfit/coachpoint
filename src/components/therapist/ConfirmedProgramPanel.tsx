"use client";

import Link from "next/link";
import { useState } from "react";
import type { ConfirmedProgram } from "@/domain/types";

interface ConfirmedProgramPanelProps {
  program: ConfirmedProgram;
}

export default function ConfirmedProgramPanel({
  program,
}: ConfirmedProgramPanelProps) {
  const href = `/patient/${program.code}`;
  const [copied, setCopied] = useState(false);

  const copyLink = async () => {
    const absolute = new URL(href, window.location.href).toString();
    await navigator.clipboard.writeText(absolute);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  return (
    <section className="border-t-2 border-primary-700 bg-[#F3FAFD] px-5 py-5 lg:px-6">
      <div className="flex flex-wrap items-center justify-between gap-5">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-primary-700">
            Confirmed by therapist
          </p>
          <h2 className="mt-1.5 text-xl font-extrabold text-ink-900">
            Patient program {program.code}
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            {program.items.length} exercises · {program.estimatedMinutes.toFixed(1)} minutes · revision {program.revision}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={href}
            className="focus-ring inline-flex h-11 items-center rounded-xl bg-primary-700 px-4 text-sm font-bold text-white hover:bg-primary-800"
          >
            Open patient link
          </Link>
          <button
            type="button"
            onClick={() => void copyLink()}
            className="focus-ring inline-flex h-11 items-center rounded-xl border border-primary-700 bg-white px-4 text-sm font-bold text-primary-700 hover:bg-primary-100"
          >
            {copied ? "Copied" : "Copy link"}
          </button>
        </div>
      </div>
      <p className="mt-4 break-all rounded-lg border border-primary-100 bg-white px-3 py-2 font-mono text-xs text-slate-600">
        {href}
      </p>
    </section>
  );
}
