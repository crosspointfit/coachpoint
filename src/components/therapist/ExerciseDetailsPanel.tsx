import type { Exercise } from "@/domain/types";

interface ExerciseDetailsPanelProps {
  exercise: Exercise | null;
  onClose: () => void;
}

export default function ExerciseDetailsPanel({
  exercise,
  onClose,
}: ExerciseDetailsPanelProps) {
  if (!exercise) return null;
  return (
    <aside
      className="fixed inset-y-0 right-0 z-50 w-full max-w-md overflow-y-auto border-l border-border bg-white p-6 shadow-[-18px_0_40px_rgba(20,53,95,0.12)]"
      aria-label={`${exercise.name} details`}
    >
      <div className="flex items-start justify-between gap-5">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-primary-700">
            Exercise details
          </p>
          <h2 className="mt-2 text-2xl font-black text-ink-900">{exercise.name}</h2>
          <p className="mt-1 text-sm text-slate-500">{exercise.nameZh}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="focus-ring flex h-10 w-10 items-center justify-center rounded-xl border border-slate-300 text-lg text-slate-600"
          aria-label="Close exercise details"
        >
          ×
        </button>
      </div>

      <dl className="mt-7 grid grid-cols-2 gap-4 border-y border-border py-5 text-sm">
        <div>
          <dt className="text-xs font-bold uppercase text-slate-500">Region</dt>
          <dd className="mt-1 font-semibold capitalize text-ink-900">{exercise.bodyRegion}</dd>
        </div>
        <div>
          <dt className="text-xs font-bold uppercase text-slate-500">Time</dt>
          <dd className="mt-1 font-semibold text-ink-900">~{exercise.estimatedMinutes} min</dd>
        </div>
        <div>
          <dt className="text-xs font-bold uppercase text-slate-500">Position</dt>
          <dd className="mt-1 font-semibold text-ink-900">{exercise.position}</dd>
        </div>
        <div>
          <dt className="text-xs font-bold uppercase text-slate-500">Coaching</dt>
          <dd className="mt-1 font-semibold capitalize text-ink-900">{exercise.coachingMode}</dd>
        </div>
      </dl>

      <div className="mt-6 space-y-6 text-sm leading-6">
        <section>
          <h3 className="font-extrabold text-ink-900">Instructions</h3>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-slate-600">
            {exercise.instructions.map((instruction) => (
              <li key={instruction}>{instruction}</li>
            ))}
          </ol>
        </section>
        <section>
          <h3 className="font-extrabold text-ink-900">Goals</h3>
          <p className="mt-2 text-slate-600">{exercise.goals.join(", ")}</p>
        </section>
        <section>
          <h3 className="font-extrabold text-ink-900">Precautions</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-slate-600">
            {exercise.precautions.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
        <section>
          <h3 className="font-extrabold text-danger">Contraindications</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-slate-600">
            {exercise.contraindications.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      </div>
    </aside>
  );
}

