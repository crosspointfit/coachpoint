"use client";

import type { FormEvent } from "react";
import type { BodyRegion, CaseContext, DomainError } from "@/domain/types";

const REGIONS: Array<{ value: BodyRegion; label: string }> = [
  { value: "neck", label: "Neck" },
  { value: "shoulder", label: "Shoulder" },
  { value: "hand", label: "Hand / wrist" },
  { value: "back", label: "Back" },
  { value: "hip", label: "Hip" },
  { value: "knee", label: "Knee" },
  { value: "ankle", label: "Ankle / foot" },
  { value: "balance", label: "Balance" },
];

interface CaseContextFormProps {
  value: CaseContext;
  onChange: (value: CaseContext) => void;
  onSubmit: () => void;
  errors?: DomainError[];
  disabled?: boolean;
}

const FIELD_CLASS =
  "focus-ring mt-1.5 h-11 w-full overflow-x-auto rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 disabled:bg-slate-50 disabled:text-slate-500";

function splitList(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export default function CaseContextForm({
  value,
  onChange,
  onSubmit,
  errors = [],
  disabled = false,
}: CaseContextFormProps) {
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit();
  };

  const update = <K extends keyof CaseContext>(
    key: K,
    next: CaseContext[K],
  ) => onChange({ ...value, [key]: next });

  return (
    <form
      onSubmit={submit}
      autoComplete="off"
      className="border-b border-border bg-white px-5 pb-8 pt-20 lg:px-7"
    >
      <div className="flex items-start justify-between gap-6">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.13em] text-primary-700">
            Case context
          </p>
          <h2 className="mt-1.5 text-lg font-extrabold text-ink-900">
            Define the clinical boundary
          </h2>
        </div>
        <span className="rounded-full bg-primary-100 px-3 py-1 text-[11px] font-bold text-primary-700">
          Synthetic demo data only
        </span>
      </div>

      {errors.length > 0 && (
        <div
          role="alert"
          className="mt-4 border-l-2 border-danger bg-[#FBEEEA] px-4 py-3 text-sm text-danger"
        >
          <p className="font-bold">More context is needed</p>
          <ul className="mt-1 list-disc space-y-1 pl-4">
            {errors.map((error) => (
              <li key={`${error.code}-${error.field ?? "case"}`}>{error.message}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <label className="text-xs font-bold text-slate-700">
          Demo patient label
          <input
            className={FIELD_CLASS}
            value={value.patientLabel}
            onChange={(event) => update("patientLabel", event.target.value)}
            placeholder="Demo patient"
            maxLength={60}
            required
            disabled={disabled}
          />
        </label>

        <label className="text-xs font-bold text-slate-700 md:col-span-2">
          Diagnosis or working problem
          <input
            className={FIELD_CLASS}
            value={value.diagnosis}
            onChange={(event) => update("diagnosis", event.target.value)}
            placeholder="Shoulder impingement"
            maxLength={160}
            required
            disabled={disabled}
          />
        </label>

        <label className="text-xs font-bold text-slate-700">
          Body region
          <select
            className={FIELD_CLASS}
            value={value.bodyRegion ?? ""}
            onChange={(event) =>
              update(
                "bodyRegion",
                (event.target.value || undefined) as BodyRegion | undefined,
              )
            }
            disabled={disabled}
          >
            <option value="">Select region</option>
            {REGIONS.map((region) => (
              <option key={region.value} value={region.value}>
                {region.label}
              </option>
            ))}
          </select>
        </label>

        <label className="text-xs font-bold text-slate-700 md:col-span-2">
          Goals, comma separated
          <input
            className={FIELD_CLASS}
            value={value.goals.join(", ")}
            onChange={(event) => update("goals", splitList(event.target.value))}
            placeholder="mobility, pain-free daily activity"
            disabled={disabled}
          />
        </label>

        <label className="text-xs font-bold text-slate-700">
          Minutes per day
          <input
            className={FIELD_CLASS}
            type="number"
            min={5}
            max={60}
            value={value.minutesPerDay}
            onChange={(event) =>
              update("minutesPerDay", Number(event.target.value) || 0)
            }
            required
            disabled={disabled}
          />
        </label>

        <label className="text-xs font-bold text-slate-700">
          Post-op week
          <input
            className={FIELD_CLASS}
            type="number"
            min={0}
            max={104}
            value={value.postOpWeeks ?? ""}
            onChange={(event) =>
              update(
                "postOpWeeks",
                event.target.value === "" ? undefined : Number(event.target.value),
              )
            }
            placeholder="Not post-op"
            disabled={disabled}
          />
        </label>

        <label className="text-xs font-bold text-slate-700">
          Procedure
          <input
            className={FIELD_CLASS}
            value={value.procedure ?? ""}
            onChange={(event) => update("procedure", event.target.value || undefined)}
            placeholder="Required for post-op cases"
            maxLength={120}
            disabled={disabled}
          />
        </label>

        <label className="text-xs font-bold text-slate-700">
          Approved protocol
          <input
            className={FIELD_CLASS}
            value={value.protocol ?? ""}
            onChange={(event) => update("protocol", event.target.value || undefined)}
            placeholder="Therapist-approved protocol"
            maxLength={120}
            disabled={disabled}
          />
        </label>

        <label className="text-xs font-bold text-slate-700 md:col-span-2">
          Available equipment, comma separated
          <input
            className={FIELD_CLASS}
            value={value.equipment.join(", ")}
            onChange={(event) => update("equipment", splitList(event.target.value))}
            placeholder="wall, chair, stick"
            disabled={disabled}
          />
        </label>

        <label className="text-xs font-bold text-slate-700 md:col-span-2">
          Therapist notes
          <input
            className={FIELD_CLASS}
            value={value.notes ?? ""}
            onChange={(event) => update("notes", event.target.value || undefined)}
            placeholder="Constraints the agent should respect"
            maxLength={240}
            disabled={disabled}
          />
        </label>
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-3xl text-xs leading-5 text-slate-500">
          Post-operative timing alone is not enough to determine a safe plan. Add the procedure or therapist-approved protocol before asking the agent to draft.
        </p>
        <button
          type="submit"
          disabled={disabled}
          className="focus-ring inline-flex h-11 items-center rounded-xl border border-primary-700 px-4 text-sm font-bold text-primary-700 hover:bg-primary-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Apply case to workspace
        </button>
      </div>
    </form>
  );
}
