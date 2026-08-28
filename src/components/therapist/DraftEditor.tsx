"use client";

import type { DragEvent } from "react";
import type {
  DomainError,
  Exercise,
  ProgramDraft,
  ProgramItem,
} from "@/domain/types";

interface DraftEditorProps {
  draft: ProgramDraft | null;
  resolveExercise: (id: string) => Exercise | undefined;
  onAddStarterDraft: () => void;
  onUpdateItem: (index: number, update: Partial<ProgramItem>) => void;
  onRemoveItem: (index: number) => void;
  onMoveItem: (from: number, to: number) => void;
  onConfirm: () => void;
  validationErrors?: DomainError[];
  confirmDisabled?: boolean;
}

const NUMBER_CLASS =
  "focus-ring h-9 w-full rounded-lg border border-slate-300 bg-white px-2 text-center font-mono text-xs tabular-nums";

export default function DraftEditor({
  draft,
  resolveExercise,
  onAddStarterDraft,
  onUpdateItem,
  onRemoveItem,
  onMoveItem,
  onConfirm,
  validationErrors = [],
  confirmDisabled = false,
}: DraftEditorProps) {
  const drop = (event: DragEvent<HTMLLIElement>, target: number) => {
    event.preventDefault();
    const from = Number(event.dataTransfer.getData("text/plain"));
    if (Number.isInteger(from)) onMoveItem(from, target);
  };

  return (
    <section aria-labelledby="draft-heading" className="min-w-0 border-l border-border bg-[#FCFCF9]">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border bg-white px-5 py-4 lg:px-6">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.13em] text-primary-700">
            Prescription draft
          </p>
          <h2 id="draft-heading" className="mt-1 text-lg font-extrabold text-ink-900">
            Human review required
          </h2>
        </div>
        {draft && (
          <div className="text-right">
            <p className="font-mono text-lg font-bold tabular-nums text-ink-900">
              {draft.estimatedMinutes.toFixed(1)} min
            </p>
            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500">
              estimated daily time
            </p>
          </div>
        )}
      </div>

      {!draft ? (
        <div className="m-5 border border-dashed border-slate-300 bg-white px-6 py-14 text-center lg:m-6">
          <p className="text-lg font-extrabold text-ink-900">No draft yet</p>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-slate-500">
            Add exercises manually, or ask your agent to search the catalog and create a time-bounded draft.
          </p>
          <button
            type="button"
            onClick={onAddStarterDraft}
            className="focus-ring mt-5 inline-flex h-10 items-center rounded-xl border border-primary-700 px-4 text-xs font-bold text-primary-700 hover:bg-primary-100"
          >
            Start an empty draft
          </button>
        </div>
      ) : (
        <div className="p-4 lg:p-5">
          <div className="mb-3 flex items-center justify-between gap-4 border-l-2 border-primary-700 bg-white px-4 py-3">
            <div>
              <p className="text-sm font-extrabold text-ink-900">{draft.patientLabel}</p>
              <p className="mt-0.5 text-xs text-slate-500">
                Revision {draft.revision} · {draft.source === "agent" ? "Agent draft" : "Therapist draft"}
              </p>
            </div>
            <span className="rounded-full bg-[#FFF0EC] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-coral-600">
              Not prescribed
            </span>
          </div>

          {(draft.warnings.length > 0 || validationErrors.length > 0) && (
            <div role="alert" className="mb-3 bg-[#FFF7E8] px-4 py-3 text-xs leading-5 text-[#875000]">
              <p className="font-bold">Review before confirmation</p>
              <ul className="mt-1 list-disc pl-4">
                {[...draft.warnings, ...validationErrors.map((error) => error.message)].map(
                  (warning, index) => (
                    <li key={`${warning}-${index}`}>{warning}</li>
                  ),
                )}
              </ul>
            </div>
          )}

          {draft.items.length === 0 ? (
            <div className="border border-dashed border-slate-300 bg-white px-5 py-10 text-center text-sm text-slate-500">
              Add an exercise from the catalog to build this draft.
            </div>
          ) : (
            <ol className="space-y-2">
              {draft.items.map((item, index) => {
                const exercise = resolveExercise(item.exerciseId);
                if (!exercise) return null;
                return (
                  <li
                    key={`${item.exerciseId}-${index}`}
                    draggable
                    onDragStart={(event) => {
                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData("text/plain", String(index));
                    }}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => drop(event, index)}
                    className="border border-border bg-white p-3 shadow-[var(--cp-shadow-card)]"
                  >
                    <div className="flex items-start gap-3">
                      <span
                        className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink-900 font-mono text-[11px] font-bold text-white"
                        aria-hidden="true"
                      >
                        {index + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <p className="text-sm font-extrabold text-ink-900">{exercise.name}</p>
                            <p className="mt-0.5 text-[11px] text-slate-500">
                              {exercise.nameZh} · ~{exercise.estimatedMinutes} min
                            </p>
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => onMoveItem(index, index - 1)}
                              disabled={index === 0}
                              className="focus-ring flex h-8 w-8 items-center justify-center rounded-lg border border-slate-300 text-xs text-slate-600 disabled:opacity-30"
                              aria-label={`Move ${exercise.name} up`}
                            >
                              ↑
                            </button>
                            <button
                              type="button"
                              onClick={() => onMoveItem(index, index + 1)}
                              disabled={index === draft.items.length - 1}
                              className="focus-ring flex h-8 w-8 items-center justify-center rounded-lg border border-slate-300 text-xs text-slate-600 disabled:opacity-30"
                              aria-label={`Move ${exercise.name} down`}
                            >
                              ↓
                            </button>
                            <button
                              type="button"
                              onClick={() => onRemoveItem(index)}
                              className="focus-ring flex h-8 items-center rounded-lg px-2 text-[11px] font-bold text-danger hover:bg-[#FBEEEA]"
                            >
                              Remove
                            </button>
                          </div>
                        </div>

                        <div className="mt-3 grid grid-cols-5 gap-2">
                          <label className="text-center text-[10px] font-bold uppercase tracking-[0.05em] text-slate-500">
                            Sets
                            <input
                              className={NUMBER_CLASS}
                              type="number"
                              min={1}
                              max={6}
                              value={item.sets}
                              onChange={(event) =>
                                onUpdateItem(index, { sets: Number(event.target.value) })
                              }
                            />
                          </label>
                          <label className="text-center text-[10px] font-bold uppercase tracking-[0.05em] text-slate-500">
                            Reps
                            <input
                              className={NUMBER_CLASS}
                              type="number"
                              min={1}
                              max={30}
                              value={item.reps ?? ""}
                              onChange={(event) =>
                                onUpdateItem(index, {
                                  reps: event.target.value
                                    ? Number(event.target.value)
                                    : undefined,
                                })
                              }
                            />
                          </label>
                          <label className="text-center text-[10px] font-bold uppercase tracking-[0.05em] text-slate-500">
                            Hold
                            <input
                              className={NUMBER_CLASS}
                              type="number"
                              min={0}
                              max={120}
                              value={item.holdSeconds ?? ""}
                              onChange={(event) =>
                                onUpdateItem(index, {
                                  holdSeconds: event.target.value
                                    ? Number(event.target.value)
                                    : undefined,
                                })
                              }
                            />
                          </label>
                          <label className="text-center text-[10px] font-bold uppercase tracking-[0.05em] text-slate-500">
                            Daily
                            <input
                              className={NUMBER_CLASS}
                              type="number"
                              min={1}
                              max={5}
                              value={item.frequencyPerDay}
                              onChange={(event) =>
                                onUpdateItem(index, {
                                  frequencyPerDay: Number(event.target.value),
                                })
                              }
                            />
                          </label>
                          <label className="text-center text-[10px] font-bold uppercase tracking-[0.05em] text-slate-500">
                            Rest
                            <input
                              className={NUMBER_CLASS}
                              type="number"
                              min={0}
                              max={180}
                              step={5}
                              value={item.restSeconds}
                              onChange={(event) =>
                                onUpdateItem(index, {
                                  restSeconds: Number(event.target.value),
                                })
                              }
                            />
                          </label>
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}

          <div className="mt-5 border-t border-border pt-5">
            <button
              type="button"
              onClick={onConfirm}
              disabled={confirmDisabled || draft.items.length === 0}
              className="focus-ring inline-flex h-12 w-full items-center justify-center rounded-xl bg-coral-500 px-5 text-sm font-extrabold text-white hover:bg-coral-600 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              Therapist: confirm and create patient link
            </button>
            <p className="mt-2 text-center text-[11px] leading-5 text-slate-500">
              This consequential action is intentionally unavailable to the agent.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}

