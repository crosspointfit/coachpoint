"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  confirmProgram,
  createProgramDraft,
  getExerciseById,
  searchExercises,
  validateCaseContext,
  validateDraft,
} from "@/domain";
import type {
  ActivityActor,
  AgentActivity,
  BodyRegion,
  CaseContext,
  ConfirmedProgram,
  Difficulty,
  DomainError,
  Exercise,
  ProgramDraft,
  ProgramItem,
} from "@/domain/types";
import {
  createTherapistToolDescriptors,
  useWebMcpTools,
  type DraftProgramInput,
  type GetExerciseDetailsInput,
  type SearchExercisesInput,
} from "@/lib/webmcp";
import {
  clearTherapistWorkspace,
  readTherapistWorkspace,
  storeConfirmedProgram,
  writeTherapistWorkspace,
} from "@/lib/therapistStorage";
import ActivityLog from "./ActivityLog";
import CaseContextForm from "./CaseContextForm";
import ConfirmedProgramPanel from "./ConfirmedProgramPanel";
import DraftEditor from "./DraftEditor";
import ExerciseCatalog from "./ExerciseCatalog";
import ExerciseDetailsPanel from "./ExerciseDetailsPanel";
import WebMcpSupportNotice from "./WebMcpSupportNotice";

const DEFAULT_CONTEXT: CaseContext = {
  patientLabel: "Demo Patient — Shoulder",
  diagnosis: "Shoulder impingement, six weeks post-op",
  goals: ["comfortable shoulder mobility", "daily activity"],
  minutesPerDay: 15,
  bodyRegion: "shoulder",
  postOpWeeks: 6,
  procedure: "Therapist-entered synthetic demo procedure",
  protocol: "Week-six demo protocol",
  equipment: ["wall", "stick", "table"],
  notes: "Competition demonstration. Verify every item against the actual procedure-specific protocol.",
};

function makeActivity(
  actor: ActivityActor,
  action: string,
  detail: string,
): AgentActivity {
  const id =
    typeof globalThis.crypto?.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : `activity_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  return {
    id,
    actor,
    action,
    detail,
    createdAt: new Date().toISOString(),
  };
}

function emptyDraft(context: CaseContext, revision = 1): ProgramDraft {
  return {
    id: `draft_pending_${Date.now()}`,
    patientLabel: context.patientLabel,
    caseContext: { ...context },
    items: [],
    estimatedMinutes: 0,
    warnings: [
      "Competition demo catalog only — therapist review is required before confirmation.",
    ],
    createdAt: new Date().toISOString(),
    source: "therapist",
    revision,
  };
}

function conciseExercise(exercise: Exercise) {
  return {
    id: exercise.id,
    name: exercise.name,
    bodyRegion: exercise.bodyRegion,
    goals: exercise.goals,
    difficulty: exercise.difficulty,
    equipment: exercise.equipment,
    estimatedMinutes: exercise.estimatedMinutes,
    defaultDosage: exercise.defaultDosage,
    coachingMode: exercise.coachingMode,
  };
}

export default function TherapistWorkspace() {
  const [caseContext, setCaseContext] = useState<CaseContext>(DEFAULT_CONTEXT);
  const [draft, setDraft] = useState<ProgramDraft | null>(null);
  const [confirmedProgram, setConfirmedProgram] =
    useState<ConfirmedProgram | null>(null);
  const [activities, setActivities] = useState<AgentActivity[]>([]);
  const [caseErrors, setCaseErrors] = useState<DomainError[]>([]);
  const [draftErrors, setDraftErrors] = useState<DomainError[]>([]);
  const [query, setQuery] = useState("");
  const [bodyRegion, setBodyRegion] = useState<BodyRegion | undefined>(
    "shoulder",
  );
  const [difficulty, setDifficulty] = useState<Difficulty | undefined>();
  const [inspectedExercise, setInspectedExercise] = useState<Exercise | null>(
    null,
  );
  const [hydrated, setHydrated] = useState(false);

  const appendActivity = useCallback(
    (actor: ActivityActor, action: string, detail: string) => {
      setActivities((current) => [
        makeActivity(actor, action, detail),
        ...current,
      ].slice(0, 60));
    },
    [],
  );

  useEffect(() => {
    const hydrationTimer = window.setTimeout(() => {
      const stored = readTherapistWorkspace();
      if (stored) {
        setCaseContext(stored.caseContext);
        setDraft(stored.draft);
        setConfirmedProgram(stored.confirmedProgram);
        setActivities(stored.activities);
        setBodyRegion(stored.caseContext.bodyRegion);
      } else {
        setActivities([
          makeActivity(
            "system",
            "Workspace ready.",
            "Synthetic shoulder case loaded; no patient data is present.",
          ),
        ]);
      }
      setHydrated(true);
    }, 0);

    return () => window.clearTimeout(hydrationTimer);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    writeTherapistWorkspace({
      version: 1,
      caseContext,
      draft,
      confirmedProgram,
      activities,
    });
  }, [activities, caseContext, confirmedProgram, draft, hydrated]);

  const toolDescriptors = useMemo(
    () =>
      createTherapistToolDescriptors({
        searchExercises: async (input: SearchExercisesInput) => {
          if (typeof input?.query !== "string" || input.query.trim() === "") {
            return {
              ok: false as const,
              errors: [
                {
                  code: "invalid_input",
                  message: "A non-empty catalog search query is required.",
                  field: "query",
                  recoverable: true,
                },
              ],
            };
          }
          const matches = searchExercises({
            query: input.query,
            bodyRegion: input.bodyRegion,
            difficulty: input.difficulty,
            goals: input.goal,
            equipment: input.equipment,
            phaseTags: input.phaseTag,
            limit: input.maxResults ?? 6,
          });
          appendActivity(
            "agent",
            "Searched the catalog.",
            `${matches.length} candidates matched “${input.query}”.`,
          );
          return { results: matches.map(conciseExercise) };
        },
        getExerciseDetails: async (input: GetExerciseDetailsInput) => {
          if (
            typeof input?.exerciseId !== "string" ||
            input.exerciseId.trim() === ""
          ) {
            return {
              ok: false as const,
              errors: [
                {
                  code: "invalid_input",
                  message: "A catalog exercise ID is required.",
                  field: "exerciseId",
                  recoverable: true,
                },
              ],
            };
          }
          const exercise = getExerciseById(input.exerciseId);
          if (!exercise) {
            return {
              ok: false as const,
              errors: [
                {
                  code: "exercise_not_found",
                  message: `Exercise '${input.exerciseId}' is not in the curated catalog.`,
                  field: "exerciseId",
                  recoverable: true,
                },
              ],
            };
          }
          setInspectedExercise(exercise);
          appendActivity(
            "agent",
            "Reviewed exercise details.",
            exercise.name,
          );
          return {
            exercise: {
              ...conciseExercise(exercise),
              position: exercise.position,
              instructions: exercise.instructions,
              phaseTags: exercise.phaseTags,
              precautions: exercise.precautions,
              contraindications: exercise.contraindications,
              reviewStatus: exercise.reviewStatus,
            },
          };
        },
        draftProgram: async (input: DraftProgramInput) => {
          if (
            !input?.caseContext ||
            typeof input.caseContext !== "object" ||
            !Array.isArray(input.items)
          ) {
            return {
              ok: false as const,
              errors: [
                {
                  code: "invalid_input",
                  message: "A caseContext object and ordered items array are required.",
                  field: "caseContext,items",
                  recoverable: true,
                },
              ],
            };
          }
          const result = createProgramDraft({
            caseContext: input.caseContext,
            items: input.items,
            source: "agent",
          });
          if (!result.ok) {
            setCaseErrors(
              result.errors.filter((error) =>
                error.field?.startsWith("caseContext"),
              ),
            );
            setDraftErrors(result.errors);
            return result;
          }
          setCaseContext(result.value.caseContext);
          setBodyRegion(result.value.caseContext.bodyRegion);
          setDraft(result.value);
          setConfirmedProgram(null);
          setCaseErrors([]);
          setDraftErrors([]);
          appendActivity(
            "agent",
            "Created a visible draft.",
            `${result.value.items.length} exercises · ${result.value.estimatedMinutes.toFixed(1)} minutes · awaiting therapist review.`,
          );
          return {
            ok: true as const,
            value: {
              draftId: result.value.id,
              itemCount: result.value.items.length,
              estimatedMinutes: result.value.estimatedMinutes,
              warnings: result.value.warnings.slice(0, 3),
              status: "awaiting_therapist_review",
            },
          };
        },
      }),
    [appendActivity],
  );

  const webMcp = useWebMcpTools(toolDescriptors);

  const visibleExercises = useMemo(
    () =>
      searchExercises({
        query,
        bodyRegion,
        difficulty,
        limit: 15,
      }),
    [bodyRegion, difficulty, query],
  );

  const selectedIds = useMemo(
    () => new Set(draft?.items.map((item) => item.exerciseId) ?? []),
    [draft],
  );

  const applyCaseContext = () => {
    const result = validateCaseContext(caseContext);
    if (!result.ok) {
      setCaseErrors(result.errors);
      appendActivity(
        "system",
        "Case needs clarification.",
        result.errors.map((error) => error.message).join(" "),
      );
      return;
    }

    setCaseContext(result.value);
    setBodyRegion(result.value.bodyRegion);
    setCaseErrors([]);
    setConfirmedProgram(null);

    if (draft) {
      const nextDraft = {
        ...draft,
        patientLabel: result.value.patientLabel,
        caseContext: result.value,
        revision: draft.revision + 1,
      };
      const validation = validateDraft(nextDraft.items, {
        minutesPerDay: result.value.minutesPerDay,
      });
      setDraft(
        validation.ok
          ? {
              ...nextDraft,
              estimatedMinutes: validation.value.estimatedMinutes,
              warnings: validation.value.warnings,
            }
          : nextDraft,
      );
      setDraftErrors(validation.ok ? [] : validation.errors);
    }

    appendActivity(
      "therapist",
      "Applied case context.",
      `${result.value.diagnosis} · ${result.value.minutesPerDay} minutes per day.`,
    );
  };

  const updateDraftItems = (
    items: ProgramItem[],
    activity?: { action: string; detail: string },
  ) => {
    const current = draft ?? emptyDraft(caseContext);
    const validation = validateDraft(items, {
      minutesPerDay: caseContext.minutesPerDay,
    });
    setDraft({
      ...current,
      patientLabel: caseContext.patientLabel,
      caseContext: { ...caseContext },
      items,
      revision: current.revision + 1,
      estimatedMinutes: validation.ok
        ? validation.value.estimatedMinutes
        : current.estimatedMinutes,
      warnings: validation.ok ? validation.value.warnings : current.warnings,
      source: current.source,
    });
    setConfirmedProgram(null);
    setDraftErrors(validation.ok ? [] : validation.errors);
    if (activity) {
      appendActivity("therapist", activity.action, activity.detail);
    }
  };

  const addExercise = (exercise: Exercise) => {
    if (selectedIds.has(exercise.id)) return;
    const item: ProgramItem = {
      exerciseId: exercise.id,
      ...exercise.defaultDosage,
    };
    updateDraftItems([...(draft?.items ?? []), item], {
      action: "Added an exercise.",
      detail: exercise.name,
    });
  };

  const updateItem = (index: number, update: Partial<ProgramItem>) => {
    if (!draft) return;
    updateDraftItems(
      draft.items.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...update } : item,
      ),
      {
        action: "Changed draft dosage.",
        detail: getExerciseById(draft.items[index]?.exerciseId ?? "")?.name ??
          "Draft item",
      },
    );
  };

  const removeItem = (index: number) => {
    if (!draft) return;
    const removed = getExerciseById(draft.items[index]?.exerciseId ?? "");
    updateDraftItems(
      draft.items.filter((_, itemIndex) => itemIndex !== index),
      { action: "Removed an exercise.", detail: removed?.name ?? "Draft item" },
    );
  };

  const moveItem = (from: number, to: number) => {
    if (!draft || from === to || to < 0 || to >= draft.items.length) return;
    const next = [...draft.items];
    const [moved] = next.splice(from, 1);
    if (!moved) return;
    next.splice(to, 0, moved);
    updateDraftItems(next, {
      action: "Reordered the draft.",
      detail: `${getExerciseById(moved.exerciseId)?.name ?? "Exercise"} moved to position ${to + 1}.`,
    });
  };

  const confirmDraft = () => {
    if (!draft) return;
    const result = confirmProgram(draft, { actor: "therapist" });
    if (!result.ok) {
      setDraftErrors(result.errors);
      appendActivity(
        "system",
        "Confirmation blocked.",
        result.errors.map((error) => error.message).join(" "),
      );
      return;
    }
    setConfirmedProgram(result.value);
    storeConfirmedProgram(result.value);
    setDraftErrors([]);
    appendActivity(
      "therapist",
      "Confirmed the prescription.",
      `Revision ${result.value.revision} · patient program ${result.value.code}.`,
    );
  };

  const resetWorkspace = () => {
    if (!window.confirm("Reset this synthetic demo workspace?")) return;
    clearTherapistWorkspace();
    setCaseContext(DEFAULT_CONTEXT);
    setDraft(null);
    setConfirmedProgram(null);
    setCaseErrors([]);
    setDraftErrors([]);
    setBodyRegion("shoulder");
    setQuery("");
    setActivities([
      makeActivity("system", "Workspace reset.", "Synthetic case restored."),
    ]);
  };

  return (
    <main className="flex-1">
      <section className="border-b border-border bg-white">
        <div className="mx-auto flex w-full max-w-[1440px] flex-wrap items-start justify-between gap-6 px-6 py-7 lg:px-8">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary-700">
              Therapist workspace
            </p>
            <h1 className="mt-2 text-3xl font-black tracking-[-0.03em] text-ink-900">
              Build together. Prescribe deliberately.
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              Try: “Shoulder impingement, six weeks post-op, 15 minutes per day. Search the catalog, inspect suitable options, then create a draft for my review.”
            </p>
          </div>
          <button
            type="button"
            onClick={resetWorkspace}
            className="focus-ring inline-flex h-10 items-center rounded-xl border border-slate-300 px-3 text-xs font-bold text-slate-600 hover:bg-slate-50"
          >
            Reset synthetic demo
          </button>
        </div>
      </section>

      <div className="mx-auto w-full max-w-[1440px] border-x border-border bg-white">
        <WebMcpSupportNotice
          supported={webMcp.status !== "unsupported"}
          status={webMcp.status}
          error={webMcp.error ?? undefined}
        />
        <CaseContextForm
          value={caseContext}
          onChange={setCaseContext}
          onSubmit={applyCaseContext}
          errors={caseErrors}
        />

        <div className="grid min-h-[780px] lg:grid-cols-[minmax(0,0.96fr)_minmax(560px,1.04fr)]">
          <ExerciseCatalog
            exercises={visibleExercises}
            query={query}
            onQueryChange={setQuery}
            bodyRegion={bodyRegion}
            onBodyRegionChange={setBodyRegion}
            difficulty={difficulty}
            onDifficultyChange={setDifficulty}
            onAdd={addExercise}
            onInspect={setInspectedExercise}
            selectedIds={selectedIds}
          />
          <DraftEditor
            draft={draft}
            resolveExercise={getExerciseById}
            onAddStarterDraft={() => {
              setDraft(emptyDraft(caseContext, (draft?.revision ?? 0) + 1));
              setConfirmedProgram(null);
              appendActivity(
                "therapist",
                "Started an empty draft.",
                "Exercises can now be added manually or by the agent.",
              );
            }}
            onUpdateItem={updateItem}
            onRemoveItem={removeItem}
            onMoveItem={moveItem}
            onConfirm={confirmDraft}
            validationErrors={draftErrors}
            confirmDisabled={caseErrors.length > 0 || draftErrors.length > 0}
          />
        </div>

        {confirmedProgram && (
          <ConfirmedProgramPanel program={confirmedProgram} />
        )}
        <ActivityLog activities={activities} />
      </div>

      {inspectedExercise && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 bg-ink-900/20"
            onClick={() => setInspectedExercise(null)}
            aria-label="Close exercise details"
          />
          <ExerciseDetailsPanel
            exercise={inspectedExercise}
            onClose={() => setInspectedExercise(null)}
          />
        </>
      )}
    </main>
  );
}
