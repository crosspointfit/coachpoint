"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  ArrowUpRightIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import type { Exercise } from "@/domain/types";

const ABOVE_FOLD_EXERCISES = new Set(["bridge", "chin-tuck", "bird-dog"]);

export default function HomeExerciseGallery({ exercises }: { exercises: readonly Exercise[] }) {
  const track = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const [selected, setSelected] = useState<Exercise | null>(null);
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(true);

  useEffect(() => {
    if (!selected) return;
    const modal = dialog.current;
    const previousOverflow = document.body.style.overflow;
    modal?.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      modal?.close();
      document.body.style.overflow = previousOverflow;
    };
  }, [selected]);

  const moveGallery = (direction: -1 | 1) => {
    const element = track.current;
    if (!element) return;
    element.scrollBy({
      left: direction * Math.max(240, element.clientWidth * 0.75),
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
    });
  };

  return (
    <section id="exercise-library" aria-labelledby="home-library-heading" className="scroll-mt-8 border-b border-border bg-white">
      <div className="home-container py-12 lg:py-16">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="max-w-2xl">
            <p className="home-eyebrow">The movement library</p>
            <h2 id="home-library-heading" className="home-section-heading">See the movement.<br className="sm:hidden" /> Not just the name.</h2>
            <p className="mt-3 text-sm leading-7 text-slate-500">{exercises.length} illustrated movements, from shoulder mobility to supported balance. Select a card to take a closer look.</p>
          </div>
          <div className="flex items-center gap-2" aria-label="Movement gallery controls">
            <button type="button" onClick={() => moveGallery(-1)} disabled={!canGoBack} className="home-gallery-arrow focus-ring" aria-label="Previous movements">
              <ArrowLeftIcon className="h-5 w-5" aria-hidden="true" />
            </button>
            <button type="button" onClick={() => moveGallery(1)} disabled={!canGoForward} className="home-gallery-arrow focus-ring" aria-label="Next movements">
              <ArrowRightIcon className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
        </div>
        <div
          ref={track}
          className="home-gallery-track -mx-1 mt-7 flex snap-x snap-mandatory gap-4 overflow-x-auto px-1 pb-5 pt-2"
          onScroll={(event) => {
            const element = event.currentTarget;
            // Account for the track's 4px snap padding at either edge.
            setCanGoBack(element.scrollLeft > 8);
            setCanGoForward(element.scrollLeft + element.clientWidth < element.scrollWidth - 8);
          }}
          role="list"
          aria-label="Exercise illustration previews"
        >
          {exercises.map((exercise) => (
            <div key={exercise.id} role="listitem" className="w-[218px] shrink-0 snap-start sm:w-[238px]">
              <button type="button" onClick={() => setSelected(exercise)} aria-label={`Preview ${exercise.name}`} className="focus-ring group block h-full w-full overflow-hidden rounded-[18px] border border-border bg-bg text-left transition-colors hover:border-primary-700">
                <Image
                  src={exercise.thumbnailPath ?? exercise.imagePath}
                  alt=""
                  width={960}
                  height={720}
                  sizes="(min-width: 640px) 238px, 218px"
                  loading={ABOVE_FOLD_EXERCISES.has(exercise.id) ? "eager" : "lazy"}
                  className="aspect-[4/3] w-full bg-[#FCFCFA] object-contain"
                />
                <div className="border-t border-border bg-white px-4 pb-4 pt-3.5">
                  <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-primary-700">{exercise.bodyRegion}</p>
                  <p className="mt-2 min-h-10 text-sm font-extrabold leading-5 text-ink-900">{exercise.name}</p>
                  <div className="mt-4 flex items-center justify-between gap-2 text-xs text-slate-500">
                    <span>Level {exercise.difficulty}</span>
                    <ArrowUpRightIcon className="h-4 w-4 text-primary-700" aria-hidden="true" />
                  </div>
                </div>
              </button>
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs leading-6 text-slate-500">Demo illustrations only. Your therapist determines the right movements and dosage.</p>
      </div>

      <dialog
        ref={dialog}
        aria-labelledby="exercise-preview-title"
        aria-describedby="exercise-preview-description"
        className="home-exercise-dialog fixed inset-0 m-auto max-h-[90dvh] w-[min(720px,calc(100%-32px))] overflow-y-auto rounded-3xl border border-border bg-white p-0 text-slate-600 shadow-2xl backdrop:bg-ink-900/40"
        onCancel={() => setSelected(null)}
        onClose={() => setSelected(null)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            setSelected(null);
          }
        }}
        onClick={(event) => { if (event.target === event.currentTarget) setSelected(null); }}
      >
        {selected && (
          <div className="p-5 sm:p-7">
            <div className="sticky top-0 z-10 -mx-5 -mt-5 flex items-start justify-between gap-5 border-b border-border bg-white px-5 pb-4 pt-5 sm:-mx-7 sm:-mt-7 sm:px-7 sm:pt-7">
              <div>
                <p className="home-eyebrow">Movement preview</p>
                <h3 id="exercise-preview-title" className="mt-2 text-2xl font-black tracking-tight text-ink-900">{selected.name}</h3>
                <p id="exercise-preview-description" className="mt-2 text-sm leading-6">{selected.position} · Level {selected.difficulty}</p>
              </div>
              <button type="button" className="focus-ring flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border text-ink-900 hover:bg-bg" aria-label="Close movement preview" onClick={() => setSelected(null)}>
                <XMarkIcon className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
            <Image src={selected.thumbnailPath ?? selected.imagePath} alt={`${selected.name} movement demonstration`} width={960} height={720} sizes="(min-width: 720px) 600px, 90vw" loading="eager" className="mx-auto mt-5 aspect-[4/3] max-h-[300px] w-full rounded-2xl bg-bg object-contain" />
            <div className="mt-6 grid gap-6 sm:grid-cols-2">
              <section aria-label="Movement instructions">
                <h4 className="text-sm font-extrabold text-ink-900">The movement</h4>
                <ol className="mt-3 list-decimal space-y-2 pl-4 text-sm leading-6">
                  {selected.instructions.map((instruction) => <li key={instruction}>{instruction}</li>)}
                </ol>
              </section>
              <section aria-label="Movement precautions">
                <h4 className="text-sm font-extrabold text-ink-900">Before you begin</h4>
                <p className="mt-3 text-sm leading-6">An illustration is not a personal prescription. A therapist must review suitability and dosage.</p>
                <ul className="mt-2 list-disc space-y-2 pl-4 text-sm leading-6">
                  {selected.precautions.slice(1).map((precaution) => <li key={precaution}>{precaution}</li>)}
                  {selected.contraindications.map((contraindication) => <li key={contraindication}>{contraindication}</li>)}
                </ul>
              </section>
            </div>
            <div className="mt-6 border-t border-border pt-5">
              <Link href="/therapist" onClick={() => setSelected(null)} className="focus-ring inline-flex min-h-11 items-center gap-2 text-sm font-bold text-primary-700 hover:text-primary-800">
                Build a plan in the workspace
                <ArrowRightIcon className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>
          </div>
        )}
      </dialog>
    </section>
  );
}
