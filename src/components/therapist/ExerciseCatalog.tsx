"use client";

import Image from "next/image";
import type { BodyRegion, Difficulty, Exercise } from "@/domain/types";

interface ExerciseCatalogProps {
  exercises: Exercise[];
  query: string;
  onQueryChange: (value: string) => void;
  bodyRegion?: BodyRegion;
  onBodyRegionChange: (value: BodyRegion | undefined) => void;
  difficulty?: Difficulty;
  onDifficultyChange: (value: Difficulty | undefined) => void;
  onAdd: (exercise: Exercise) => void;
  onInspect: (exercise: Exercise) => void;
  selectedIds: Set<string>;
}

const REGIONS: BodyRegion[] = [
  "neck",
  "shoulder",
  "hand",
  "back",
  "hip",
  "knee",
  "ankle",
  "balance",
];

export default function ExerciseCatalog({
  exercises,
  query,
  onQueryChange,
  bodyRegion,
  onBodyRegionChange,
  difficulty,
  onDifficultyChange,
  onAdd,
  onInspect,
  selectedIds,
}: ExerciseCatalogProps) {
  return (
    <section aria-labelledby="catalog-heading" className="min-w-0">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border px-5 py-4 lg:px-6">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.13em] text-primary-700">
            Exercise catalog
          </p>
          <h2 id="catalog-heading" className="mt-1 text-lg font-extrabold text-ink-900">
            Therapist-reviewed building blocks
          </h2>
        </div>
        <p className="font-mono text-xs text-slate-500">{exercises.length} results</p>
      </div>

      <div className="grid gap-3 border-b border-border bg-[#FCFCF9] px-5 py-4 sm:grid-cols-[1fr_160px_130px] lg:px-6">
        <label className="text-xs font-bold text-slate-700">
          Search
          <input
            type="search"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Name, goal, equipment…"
            className="focus-ring mt-1.5 h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-normal"
          />
        </label>
        <label className="text-xs font-bold text-slate-700">
          Region
          <select
            value={bodyRegion ?? ""}
            onChange={(event) =>
              onBodyRegionChange(
                (event.target.value || undefined) as BodyRegion | undefined,
              )
            }
            className="focus-ring mt-1.5 h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-normal capitalize"
          >
            <option value="">All regions</option>
            {REGIONS.map((region) => (
              <option key={region} value={region}>
                {region}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-bold text-slate-700">
          Difficulty
          <select
            value={difficulty ?? ""}
            onChange={(event) =>
              onDifficultyChange(
                event.target.value
                  ? (Number(event.target.value) as Difficulty)
                  : undefined,
              )
            }
            className="focus-ring mt-1.5 h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-normal"
          >
            <option value="">Any</option>
            <option value="1">1 · Foundational</option>
            <option value="2">2 · Progressive</option>
            <option value="3">3 · Advanced</option>
          </select>
        </label>
      </div>

      <div className="max-h-[820px] overflow-y-auto p-3 lg:p-4">
        {exercises.length === 0 ? (
          <div className="border border-dashed border-slate-300 px-6 py-14 text-center">
            <p className="font-bold text-ink-900">No exercises match these filters.</p>
            <p className="mt-2 text-sm text-slate-500">Try a broader goal or clear one filter.</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {exercises.map((exercise) => {
              const selected = selectedIds.has(exercise.id);
              return (
                <li
                  key={exercise.id}
                  className="grid grid-cols-[68px_1fr_auto] items-center gap-3 border border-border bg-white p-2.5 shadow-[var(--cp-shadow-card)]"
                >
                  <button
                    type="button"
                    onClick={() => onInspect(exercise)}
                    className="focus-ring block overflow-hidden rounded-lg bg-bg"
                    aria-label={`View details for ${exercise.name}`}
                  >
                    <Image
                      src={exercise.imagePath}
                      alt=""
                      width={600}
                      height={900}
                      sizes="68px"
                      className="h-[86px] w-[58px] object-cover object-top"
                    />
                  </button>
                  <button
                    type="button"
                    onClick={() => onInspect(exercise)}
                    className="focus-ring min-w-0 rounded-md text-left"
                  >
                    <span className="block truncate text-sm font-extrabold text-ink-900">
                      {exercise.name}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-slate-500">
                      {exercise.nameZh} · {exercise.position}
                    </span>
                    <span className="mt-2 flex flex-wrap gap-1.5">
                      <span className="rounded-full bg-primary-100 px-2 py-0.5 text-[10px] font-bold capitalize text-primary-700">
                        {exercise.bodyRegion}
                      </span>
                      <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                        ~{exercise.estimatedMinutes} min
                      </span>
                      <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                        Level {exercise.difficulty}
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onAdd(exercise)}
                    disabled={selected}
                    className="focus-ring inline-flex h-10 min-w-20 items-center justify-center rounded-xl border border-primary-700 px-3 text-xs font-bold text-primary-700 hover:bg-primary-100 disabled:border-slate-300 disabled:bg-slate-50 disabled:text-slate-400"
                  >
                    {selected ? "Added" : "Add"}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
