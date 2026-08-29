"use client";

import Image from "next/image";
import { useState, type DragEvent } from "react";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  Bars3Icon,
  ChevronDownIcon,
  PencilSquareIcon,
  PlusIcon,
  ShieldCheckIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import type {
  ConfirmedProgram,
  DomainError,
  Exercise,
  ProgramDraft,
  ProgramItem,
} from "@/domain/types";
import ConfirmedProgramPanel from "./ConfirmedProgramPanel";

interface DraftEditorProps {
  draft: ProgramDraft | null;
  resolveExercise: (id: string) => Exercise | undefined;
  onAddStarterDraft: () => void;
  onUpdateItem: (index: number, update: Partial<ProgramItem>) => void;
  onRemoveItem: (index: number) => void;
  onMoveItem: (from: number, to: number) => void;
  onConfirm: () => void;
  confirmedProgram?: ConfirmedProgram | null;
  validationErrors?: DomainError[];
  noticeErrors?: DomainError[];
  confirmDisabled?: boolean;
}

const NUMBER_CLASS =
  "focus-ring mt-1 h-9 w-full rounded-lg border border-slate-300 bg-white px-2 text-center font-mono text-xs tabular-nums";

function dosageLabel(item: ProgramItem): string {
  const volume = item.reps
    ? `${item.sets} sets × ${item.reps} reps`
    : `${item.sets} sets × ${item.holdSeconds ?? 0} sec hold`;
  return `${volume} · ${item.restSeconds}s rest · ${item.frequencyPerDay}× daily`;
}

export default function DraftEditor({
  draft,
  resolveExercise,
  onAddStarterDraft,
  onUpdateItem,
  onRemoveItem,
  onMoveItem,
  onConfirm,
  confirmedProgram = null,
  validationErrors = [],
  noticeErrors = [],
  confirmDisabled = false,
}: DraftEditorProps) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  const drop = (event: DragEvent<HTMLLIElement>, target: number) => {
    event.preventDefault();
    const from = Number(event.dataTransfer.getData("text/plain"));
    if (Number.isInteger(from)) {
      setEditingIndex(null);
      onMoveItem(from, target);
    }
  };

  const allErrors = [...validationErrors, ...noticeErrors];
  const warnings = [
    ...(draft?.warnings ?? []),
    ...allErrors.map((error) => error.message),
  ];
  const estimateUnavailable = validationErrors.some((error) =>
    error.code !== "duration_exceeded" &&
    ["items", "minutesPerDay"].some(
      (field) => error.field === field || error.field?.startsWith(`${field}.`),
    ),
  );
  const durationExceeded = validationErrors.some(
    (error) => error.code === "duration_exceeded",
  );

  return (
    <section
      aria-labelledby="draft-heading"
      className="flex h-full min-w-0 flex-col border-t border-border bg-white lg:border-l lg:border-t-0"
    >
      <div className="flex items-end justify-between gap-4 border-b border-border bg-white px-5 py-3 lg:sticky lg:top-0 lg:z-10 lg:px-6">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-primary-700">
              Prescription draft
            </p>
            {draft && (
              <span className="rounded-full bg-primary-100 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.08em] text-primary-700">
                {draft.source === "agent" ? "Agent-created" : "Therapist-created"}
              </span>
            )}
          </div>
          <h2
            id="draft-heading"
            className="mt-1 text-xl font-black tracking-[-0.02em] text-ink-900"
          >
            Review and refine
          </h2>
        </div>
        {draft && (
          <div className="shrink-0 text-right">
            <p className="font-mono text-xl font-bold tabular-nums text-ink-900">
              {estimateUnavailable ? "—" : draft.estimatedMinutes.toFixed(1)}
              {!estimateUnavailable && (
                <span className="ml-1 text-xs text-slate-400">min</span>
              )}
            </p>
            <p className="text-[9px] font-bold uppercase tracking-[0.1em] text-slate-400">
              {estimateUnavailable
                ? "Needs valid dose"
                : durationExceeded
                  ? "Over daily target"
                  : "Daily estimate"}
            </p>
          </div>
        )}
      </div>

      {!draft ? (
        <div className="flex min-h-[420px] flex-col bg-[#FCFCF9] p-6">
          {allErrors.length > 0 && (
            <div role="alert" className="rounded-xl border border-[#E9D7B6] bg-[#FFF9ED] px-4 py-3 text-xs text-[#74501D]">
              <p className="font-bold">The agent draft needs clarification</p>
              <ul className="mt-1 list-disc space-y-1 pl-4 leading-5">
                {allErrors.map((error) => (
                  <li key={`${error.code}-${error.field ?? "draft"}`}>{error.message}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="flex flex-1 items-center justify-center">
            <div className="max-w-sm text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-100 text-primary-700">
              <PlusIcon className="h-5 w-5" aria-hidden="true" />
            </span>
            <p className="mt-4 text-base font-extrabold text-ink-900">Your draft is ready to begin</p>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              Select movements from the gallery or let the agent assemble the first version.
            </p>
            <button
              type="button"
              onClick={onAddStarterDraft}
              className="focus-ring mt-5 inline-flex h-10 items-center gap-2 rounded-xl border border-primary-700 px-4 text-xs font-bold text-primary-700 hover:bg-primary-100"
            >
              <PlusIcon className="h-4 w-4" aria-hidden="true" />
              Start an empty draft
            </button>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="flex-1 bg-[#FCFCF9] p-4">
            <div className="mb-3 flex items-center justify-between gap-3 rounded-xl border border-border bg-white px-3.5 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-xs font-extrabold text-ink-900">
                  {draft.patientLabel}
                </p>
                <p className="mt-0.5 text-[10px] text-slate-500">
                  Revision {draft.revision} · {draft.items.length} movements
                </p>
              </div>
              <span
                className={`shrink-0 rounded-full px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.08em] ${
                  confirmedProgram
                    ? "bg-primary-100 text-primary-700"
                    : "bg-[#FFF0EC] text-coral-600"
                }`}
              >
                {confirmedProgram ? "Confirmed" : "Awaiting review"}
              </span>
            </div>

            {warnings.length > 0 && (
              <details className="group mb-3 rounded-xl border border-[#E9D7B6] bg-[#FFF9ED] text-[#74501D]">
                <summary className="focus-ring flex list-none items-center justify-between gap-3 rounded-xl px-3.5 py-2.5 text-xs font-bold [&::-webkit-details-marker]:hidden">
                  <span>{warnings.length} clinical review note{warnings.length === 1 ? "" : "s"}</span>
                  <ChevronDownIcon
                    className="h-4 w-4 transition-transform group-open:rotate-180"
                    aria-hidden="true"
                  />
                </summary>
                <ul className="space-y-1 border-t border-[#E9D7B6] px-4 py-3 text-[11px] leading-5">
                  {warnings.map((warning, index) => (
                    <li key={`${warning}-${index}`} className="list-disc ml-4">
                      {warning}
                    </li>
                  ))}
                </ul>
              </details>
            )}

            {draft.items.length === 0 ? (
              <div className="flex min-h-48 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white px-6 text-center">
                <p className="text-sm font-extrabold text-ink-900">No movements yet</p>
                <p className="mt-1.5 text-xs text-slate-500">
                  Select cards in the gallery, then add them to this draft.
                </p>
              </div>
            ) : (
              <ol className="space-y-2.5">
                {draft.items.map((item, index) => {
                  const exercise = resolveExercise(item.exerciseId);
                  if (!exercise) return null;
                  const editing = editingIndex === index;
                  return (
                    <li
                      key={`${item.exerciseId}-${index}`}
                      draggable={!editing}
                      onDragStart={(event) => {
                        event.dataTransfer.effectAllowed = "move";
                        event.dataTransfer.setData("text/plain", String(index));
                      }}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={(event) => drop(event, index)}
                      className="rounded-2xl border border-border bg-white p-3 shadow-[var(--cp-shadow-card)]"
                    >
                      <div className="flex items-start gap-3">
                        <span className="mt-1 flex h-7 w-5 shrink-0 items-center justify-center text-slate-300" title="Drag to reorder">
                          <Bars3Icon className="h-5 w-5" aria-hidden="true" />
                        </span>
                        <div className="relative h-[70px] w-[70px] shrink-0 overflow-hidden rounded-xl bg-[#F1F6F7]">
                          <Image
                            src={exercise.thumbnailPath}
                            alt=""
                            fill
                            sizes="70px"
                            className="object-contain"
                          />
                          <span className="absolute left-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-ink-900 font-mono text-[9px] font-bold text-white">
                            {index + 1}
                          </span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-extrabold text-ink-900">
                                {exercise.name}
                              </p>
                              <p className="mt-1 text-[11px] leading-4 text-slate-500">
                                {dosageLabel(item)}
                              </p>
                            </div>
                            <div className="flex shrink-0 items-center gap-0.5">
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingIndex(null);
                                  onMoveItem(index, index - 1);
                                }}
                                disabled={index === 0}
                                className="focus-ring flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-50 hover:text-slate-700 disabled:opacity-25"
                                aria-label={`Move ${exercise.name} up`}
                              >
                                <ArrowUpIcon className="h-3.5 w-3.5" aria-hidden="true" />
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingIndex(null);
                                  onMoveItem(index, index + 1);
                                }}
                                disabled={index === draft.items.length - 1}
                                className="focus-ring flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-50 hover:text-slate-700 disabled:opacity-25"
                                aria-label={`Move ${exercise.name} down`}
                              >
                                <ArrowDownIcon className="h-3.5 w-3.5" aria-hidden="true" />
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingIndex(null);
                                  onRemoveItem(index);
                                }}
                                className="focus-ring flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-[#FBEEEA] hover:text-danger"
                                aria-label={`Remove ${exercise.name}`}
                              >
                                <TrashIcon className="h-3.5 w-3.5" aria-hidden="true" />
                              </button>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => setEditingIndex(editing ? null : index)}
                            className="focus-ring mt-2 inline-flex items-center gap-1 text-[10px] font-bold text-primary-700 hover:text-primary-800"
                            aria-expanded={editing}
                          >
                            <PencilSquareIcon className="h-3.5 w-3.5" aria-hidden="true" />
                            {editing ? "Done editing" : "Edit dosage"}
                          </button>
                        </div>
                      </div>

                      {editing && (
                        <div className="mt-3 grid grid-cols-5 gap-2 border-t border-border pt-3">
                          <label className="text-center text-[9px] font-bold uppercase tracking-[0.05em] text-slate-500">
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
                          <label className="text-center text-[9px] font-bold uppercase tracking-[0.05em] text-slate-500">
                            Reps
                            <input
                              className={NUMBER_CLASS}
                              type="number"
                              min={1}
                              max={30}
                              value={item.reps ?? ""}
                              onChange={(event) =>
                                onUpdateItem(index, {
                                  reps: event.target.value ? Number(event.target.value) : undefined,
                                })
                              }
                            />
                          </label>
                          <label className="text-center text-[9px] font-bold uppercase tracking-[0.05em] text-slate-500">
                            Hold
                            <input
                              className={NUMBER_CLASS}
                              type="number"
                              min={0}
                              max={120}
                              value={item.holdSeconds ?? ""}
                              onChange={(event) =>
                                onUpdateItem(index, {
                                  holdSeconds: event.target.value ? Number(event.target.value) : undefined,
                                })
                              }
                            />
                          </label>
                          <label className="text-center text-[9px] font-bold uppercase tracking-[0.05em] text-slate-500">
                            Daily
                            <input
                              className={NUMBER_CLASS}
                              type="number"
                              min={1}
                              max={5}
                              value={item.frequencyPerDay}
                              onChange={(event) =>
                                onUpdateItem(index, { frequencyPerDay: Number(event.target.value) })
                              }
                            />
                          </label>
                          <label className="text-center text-[9px] font-bold uppercase tracking-[0.05em] text-slate-500">
                            Rest
                            <input
                              className={NUMBER_CLASS}
                              type="number"
                              min={0}
                              max={180}
                              step={5}
                              value={item.restSeconds}
                              onChange={(event) =>
                                onUpdateItem(index, { restSeconds: Number(event.target.value) })
                              }
                            />
                          </label>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ol>
            )}
          </div>

          <div
            className={`sticky bottom-2 z-20 mx-2 rounded-xl bg-white shadow-[0_-8px_20px_rgba(20,53,95,0.08)] ${
              confirmedProgram
                ? "p-0"
                : "border border-border px-5 py-3.5 lg:px-6"
            }`}
          >
            {confirmedProgram ? (
              <ConfirmedProgramPanel program={confirmedProgram} compact />
            ) : (
              <>
                <button
                  type="button"
                  onClick={onConfirm}
                  disabled={confirmDisabled || draft.items.length === 0}
                  className="focus-ring inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-coral-500 px-5 text-sm font-extrabold text-white shadow-[0_4px_12px_rgba(239,91,62,0.18)] hover:bg-coral-600 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
                >
                  <ShieldCheckIcon className="h-5 w-5" aria-hidden="true" />
                  Confirm prescription
                </button>
                <p className="mt-1.5 text-center text-[10px] text-slate-400">
                  Only the treating therapist can complete this action.
                </p>
              </>
            )}
          </div>
        </>
      )}
    </section>
  );
}
