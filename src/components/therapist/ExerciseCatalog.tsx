"use client";

import Image from "next/image";
import {
  AdjustmentsHorizontalIcon,
  CheckIcon,
  ChevronRightIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import type { BodyRegion, Difficulty, Exercise } from "@/domain/types";

interface ExerciseCatalogProps {
  exercises: Exercise[];
  query: string;
  onQueryChange: (value: string) => void;
  bodyRegion?: BodyRegion;
  onBodyRegionChange: (value: BodyRegion | undefined) => void;
  difficulty?: Difficulty;
  onDifficultyChange: (value: Difficulty | undefined) => void;
  prescribedIds: Set<string>;
  stagedIds: Set<string>;
  stagedExercises: Exercise[];
  onToggleStaged: (exercise: Exercise) => void;
  onClearStaged: () => void;
  onAddStaged: () => void;
  onInspect: (exercise: Exercise) => void;
}

const REGIONS: Array<{ value?: BodyRegion; label: string }> = [
  { label: "All" },
  { value: "shoulder", label: "Shoulder" },
  { value: "neck", label: "Neck" },
  { value: "back", label: "Back" },
  { value: "hip", label: "Hip" },
  { value: "knee", label: "Knee" },
  { value: "hand", label: "Hand" },
  { value: "ankle", label: "Ankle" },
  { value: "balance", label: "Balance" },
];

export default function ExerciseCatalog({
  exercises,
  query,
  onQueryChange,
  bodyRegion,
  onBodyRegionChange,
  difficulty,
  onDifficultyChange,
  prescribedIds,
  stagedIds,
  stagedExercises,
  onToggleStaged,
  onClearStaged,
  onAddStaged,
  onInspect,
}: ExerciseCatalogProps) {
  return (
    <section
      aria-labelledby="catalog-heading"
      className="flex h-[720px] min-h-0 min-w-0 flex-col bg-[#FCFCF9] lg:h-auto"
    >
      <div className="flex items-end justify-between gap-4 bg-white px-5 pb-3 pt-4 lg:px-6">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-primary-700">
            Exercise library
          </p>
          <h2
            id="catalog-heading"
            className="mt-1 text-xl font-black tracking-[-0.02em] text-ink-900"
          >
            Choose the right movements
          </h2>
        </div>
        <p className="pb-0.5 font-mono text-[11px] text-slate-400">
          {exercises.length} shown
        </p>
      </div>

      <div className="border-b border-border bg-white px-5 pb-4 lg:px-6">
        <div className="flex items-center gap-2">
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">Search the exercise library</span>
            <MagnifyingGlassIcon
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
              aria-hidden="true"
            />
            <input
              type="search"
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder="Search movement, goal, or equipment"
              className="focus-ring h-10 w-full rounded-xl border border-slate-300 bg-white pl-9 pr-3 text-sm placeholder:text-slate-400"
            />
          </label>
          <label className="relative shrink-0">
            <span className="sr-only">Filter by difficulty</span>
            <AdjustmentsHorizontalIcon
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
              aria-hidden="true"
            />
            <select
              value={difficulty ?? ""}
              onChange={(event) =>
                onDifficultyChange(
                  event.target.value
                    ? (Number(event.target.value) as Difficulty)
                    : undefined,
                )
              }
              className="focus-ring h-10 appearance-none rounded-xl border border-slate-300 bg-white pl-9 pr-8 text-xs font-bold text-slate-600"
            >
              <option value="">Any level</option>
              <option value="1">Level 1</option>
              <option value="2">Level 2</option>
              <option value="3">Level 3</option>
            </select>
          </label>
        </div>

        <div className="mt-3 flex gap-1.5 overflow-x-auto pb-0.5" aria-label="Body region filters">
          {REGIONS.map((region) => {
            const active = bodyRegion === region.value;
            return (
              <button
                key={region.label}
                type="button"
                onClick={() => onBodyRegionChange(region.value)}
                aria-pressed={active}
                className={`focus-ring shrink-0 rounded-full px-3 py-1.5 text-[11px] font-bold transition-colors ${
                  active
                    ? "bg-ink-900 text-white"
                    : "border border-slate-200 bg-white text-slate-600 hover:border-primary-700 hover:text-primary-700"
                }`}
              >
                {region.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3.5 lg:p-4">
        {exercises.length === 0 ? (
          <div className="flex h-full min-h-48 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white px-6 text-center">
            <p className="font-extrabold text-ink-900">No matching movements</p>
            <p className="mt-1.5 text-sm text-slate-500">
              Clear a filter or try a broader search.
            </p>
          </div>
        ) : (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {exercises.map((exercise, index) => {
              const prescribed = prescribedIds.has(exercise.id);
              const staged = stagedIds.has(exercise.id);
              return (
                <li
                  key={exercise.id}
                  className={`group relative overflow-hidden rounded-2xl border bg-white shadow-[var(--cp-shadow-card)] transition-[border-color,box-shadow,transform] ${
                    staged
                      ? "border-primary-700 ring-2 ring-primary-100"
                      : prescribed
                        ? "border-primary-100"
                        : "border-border hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-[0_8px_22px_rgba(20,53,95,0.09)]"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => onToggleStaged(exercise)}
                    disabled={prescribed}
                    aria-pressed={staged}
                    aria-label={
                      prescribed
                        ? `${exercise.name} is already in the prescription`
                        : `${staged ? "Deselect" : "Select"} ${exercise.name}`
                    }
                    className="focus-ring block w-full text-left disabled:cursor-default"
                  >
                    <div className="relative h-36 overflow-hidden bg-[#F1F6F7]">
                      <Image
                        src={exercise.imagePath}
                        alt=""
                        fill
                        loading={index < 2 ? "eager" : "lazy"}
                        sizes="(max-width: 639px) 100vw, (max-width: 1023px) 50vw, 360px"
                        className="object-cover object-[center_28%] transition-transform duration-300 group-hover:scale-[1.02]"
                      />
                      <span
                        className={`absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full border-2 shadow-sm ${
                          staged || prescribed
                            ? "border-primary-700 bg-primary-700 text-white"
                            : "border-white bg-white/95 text-transparent"
                        }`}
                        aria-hidden="true"
                      >
                        <CheckIcon className="h-4 w-4 stroke-[3]" />
                      </span>
                      {prescribed && (
                        <span className="absolute bottom-2.5 left-2.5 rounded-full bg-white/95 px-2.5 py-1 text-[10px] font-bold text-primary-700 shadow-sm">
                          In prescription
                        </span>
                      )}
                    </div>
                    <div className="px-3.5 pb-3 pt-3">
                      <p className="line-clamp-1 text-sm font-extrabold text-ink-900">
                        {exercise.name}
                      </p>
                      <p className="mt-0.5 line-clamp-1 text-[11px] text-slate-500">
                        {exercise.nameZh} · {exercise.position}
                      </p>
                      <div className="mt-2.5 flex items-center gap-1.5 text-[10px] font-bold text-slate-500">
                        <span className="rounded-full bg-primary-100 px-2 py-1 capitalize text-primary-700">
                          {exercise.bodyRegion}
                        </span>
                        <span className="rounded-full bg-slate-50 px-2 py-1">
                          {exercise.estimatedMinutes} min
                        </span>
                        <span className="rounded-full bg-slate-50 px-2 py-1">
                          Level {exercise.difficulty}
                        </span>
                      </div>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => onInspect(exercise)}
                    className="focus-ring absolute bottom-2.5 right-2.5 flex h-8 w-8 items-center justify-center rounded-lg bg-white text-slate-400 hover:bg-primary-100 hover:text-primary-700"
                    aria-label={`View details for ${exercise.name}`}
                    title="View details"
                  >
                    <ChevronRightIcon className="h-4 w-4" aria-hidden="true" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div
        className={`border-t border-border bg-white px-4 py-3 transition-opacity ${
          stagedExercises.length === 0 ? "opacity-65" : "shadow-[0_-10px_24px_rgba(20,53,95,0.07)]"
        }`}
        aria-live="polite"
      >
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            {stagedExercises.length === 0 ? (
              <>
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-dashed border-slate-300 text-slate-400">
                  <PlusIcon className="h-4 w-4" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-extrabold text-ink-900">Select from the gallery</p>
                  <p className="mt-0.5 truncate text-[10px] text-slate-500">
                    Choose movements, then add them together.
                  </p>
                </div>
              </>
            ) : (
              <>
                <div className="flex shrink-0 -space-x-2">
                  {stagedExercises.slice(0, 4).map((exercise) => (
                    <span
                      key={exercise.id}
                      className="relative h-10 w-10 overflow-hidden rounded-xl border-2 border-white bg-slate-100 shadow-sm"
                      title={exercise.name}
                    >
                      <Image
                        src={exercise.imagePath}
                        alt=""
                        fill
                        sizes="40px"
                        className="object-cover object-top"
                      />
                    </span>
                  ))}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-extrabold text-ink-900">
                    {stagedExercises.length} selected
                  </p>
                  <p className="mt-0.5 truncate text-[10px] text-slate-500">
                    {stagedExercises.map((exercise) => exercise.name).join(", ")}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onClearStaged}
                  className="focus-ring ml-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-50 hover:text-slate-700"
                  aria-label="Clear selected exercises"
                >
                  <XMarkIcon className="h-4 w-4" aria-hidden="true" />
                </button>
              </>
            )}
          </div>
          <button
            type="button"
            onClick={onAddStaged}
            disabled={stagedExercises.length === 0}
            className="focus-ring inline-flex h-10 w-full shrink-0 items-center justify-center gap-1.5 rounded-xl bg-primary-700 px-4 text-xs font-extrabold text-white hover:bg-primary-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 sm:w-auto"
          >
            <PlusIcon className="h-4 w-4" aria-hidden="true" />
            Add to prescription
          </button>
        </div>
      </div>
    </section>
  );
}
