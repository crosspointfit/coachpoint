"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { XMarkIcon } from "@heroicons/react/24/outline";
import {
  confirmProgram,
  createProgramDraft,
  estimateProgramDuration,
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
import CaseSummaryBar from "./CaseSummaryBar";
import CaseContextForm from "./CaseContextForm";
import DraftEditor from "./DraftEditor";
import ExerciseCatalog from "./ExerciseCatalog";
import ExerciseDetailsPanel from "./ExerciseDetailsPanel";

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
  const [caseEditValue, setCaseEditValue] =
    useState<CaseContext>(DEFAULT_CONTEXT);
  const [draft, setDraft] = useState<ProgramDraft | null>(null);
  const [confirmedProgram, setConfirmedProgram] =
    useState<ConfirmedProgram | null>(null);
  const [activities, setActivities] = useState<AgentActivity[]>([]);
  const [caseErrors, setCaseErrors] = useState<DomainError[]>([]);
  const [draftErrors, setDraftErrors] = useState<DomainError[]>([]);
  const [agentErrors, setAgentErrors] = useState<DomainError[]>([]);
  const [workspaceAnnouncement, setWorkspaceAnnouncement] = useState("");
  const [query, setQuery] = useState("");
  const [bodyRegion, setBodyRegion] = useState<BodyRegion | undefined>();
  const [difficulty, setDifficulty] = useState<Difficulty | undefined>();
  const [stagedExerciseIds, setStagedExerciseIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [caseEditorOpen, setCaseEditorOpen] = useState(false);
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
        setCaseEditValue(stored.caseContext);
        setDraft(stored.draft);
        setConfirmedProgram(stored.confirmedProgram);
        setActivities(stored.activities);
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

  const toolDescriptors = useMemo(() => {
    if (!hydrated) return [];
    return createTherapistToolDescriptors({
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
            setAgentErrors(result.errors);
            return result;
          }
          setCaseContext(result.value.caseContext);
          setCaseEditValue(result.value.caseContext);
          setDraft(result.value);
          setStagedExerciseIds(new Set());
          setConfirmedProgram(null);
          setCaseErrors([]);
          setDraftErrors([]);
          setAgentErrors([]);
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
      });
  }, [appendActivity, hydrated]);

  const webMcp = useWebMcpTools(toolDescriptors);

  const visibleExercises = useMemo(
    () =>
      searchExercises({
        query,
        bodyRegion,
        difficulty,
        limit: 30,
      }),
    [bodyRegion, difficulty, query],
  );

  const prescribedIds = useMemo(
    () => new Set(draft?.items.map((item) => item.exerciseId) ?? []),
    [draft],
  );

  const stagedExercises = useMemo(
    () =>
      [...stagedExerciseIds]
        .map((exerciseId) => getExerciseById(exerciseId))
        .filter((exercise): exercise is Exercise => Boolean(exercise)),
    [stagedExerciseIds],
  );

  const confirmationBlocked =
    caseErrors.length > 0 ||
    draftErrors.some((error) => error.code !== "storage_failure");

  const applyCaseContext = () => {
    const result = validateCaseContext(caseEditValue);
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
    setCaseEditValue(result.value);
    setCaseErrors([]);
    setAgentErrors([]);
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
      const duration = estimateProgramDuration(nextDraft.items);
      setDraft(
        validation.ok
          ? {
              ...nextDraft,
              estimatedMinutes: validation.value.estimatedMinutes,
              warnings: validation.value.warnings,
            }
          : {
              ...nextDraft,
              estimatedMinutes: duration.ok
                ? duration.value
                : nextDraft.estimatedMinutes,
            },
      );
      setDraftErrors(validation.ok ? [] : validation.errors);
    } else {
      setDraftErrors([]);
    }

    appendActivity(
      "therapist",
      "Applied case context.",
      `${result.value.diagnosis} · ${result.value.minutesPerDay} minutes per day.`,
    );
    setCaseEditorOpen(false);
  };

  const updateDraftItems = (
    items: ProgramItem[],
    activity?: { action: string; detail: string },
  ) => {
    const current = draft ?? emptyDraft(caseContext);
    const validation = validateDraft(items, {
      minutesPerDay: caseContext.minutesPerDay,
    });
    const duration = estimateProgramDuration(items);
    setDraft({
      ...current,
      patientLabel: caseContext.patientLabel,
      caseContext: { ...caseContext },
      items,
      revision: current.revision + 1,
      estimatedMinutes: validation.ok
        ? validation.value.estimatedMinutes
        : duration.ok
          ? duration.value
          : current.estimatedMinutes,
      warnings: validation.ok ? validation.value.warnings : current.warnings,
      source: current.source,
    });
    setConfirmedProgram(null);
    setDraftErrors(validation.ok ? [] : validation.errors);
    setAgentErrors([]);
    if (activity) {
      appendActivity("therapist", activity.action, activity.detail);
    }
  };

  const toggleStagedExercise = (exercise: Exercise) => {
    if (prescribedIds.has(exercise.id)) return;
    setStagedExerciseIds((current) => {
      const next = new Set(current);
      if (next.has(exercise.id)) next.delete(exercise.id);
      else next.add(exercise.id);
      return next;
    });
  };

  const addStagedExercises = () => {
    const additions = stagedExercises.filter(
      (exercise) => !prescribedIds.has(exercise.id),
    );
    if (additions.length === 0) return;
    const items: ProgramItem[] = additions.map((exercise) => ({
      exerciseId: exercise.id,
      ...exercise.defaultDosage,
    }));
    updateDraftItems([...(draft?.items ?? []), ...items], {
      action: `Added ${additions.length} exercise${additions.length === 1 ? "" : "s"}.`,
      detail: additions.map((exercise) => exercise.name).join(", "),
    });
    setStagedExerciseIds(new Set());
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
    if (!storeConfirmedProgram(result.value)) {
      const storageError: DomainError = {
        code: "storage_failure",
        message:
          "The prescription could not be saved in this browser. Free storage or retry before sharing a patient link.",
        field: "confirmation",
        recoverable: true,
      };
      setDraftErrors([storageError]);
      appendActivity(
        "system",
        "Confirmation could not be saved.",
        storageError.message,
      );
      return;
    }
    setConfirmedProgram(result.value);
    setStagedExerciseIds(new Set());
    setDraftErrors([]);
    setAgentErrors([]);
    setWorkspaceAnnouncement("Prescription confirmed. Patient link ready.");
    appendActivity(
      "therapist",
      "Confirmed the prescription.",
      `Revision ${result.value.revision} · patient program ${result.value.code}.`,
    );
  };

  const focusDraftHeading = () => {
    window.requestAnimationFrame(() => {
      document.getElementById("draft-heading")?.focus();
    });
  };

  const reviseConfirmedProgram = () => {
    if (!draft || !confirmedProgram) return;
    const confirmedCode = confirmedProgram.code;
    setDraft({
      ...draft,
      source: "therapist",
      revision: draft.revision + 1,
    });
    setConfirmedProgram(null);
    setDraftErrors([]);
    setAgentErrors([]);
    setWorkspaceAnnouncement("Confirmed plan reopened as an editable draft.");
    appendActivity(
      "therapist",
      "Reopened the confirmed plan for revision.",
      `The existing patient link ${confirmedCode} remains active until a replacement is confirmed.`,
    );
    focusDraftHeading();
  };

  const startNewPrescription = () => {
    if (!confirmedProgram) return;
    if (
      !window.confirm(
        "Start a new prescription draft? The confirmed patient link will remain active, but this workspace will switch to a new empty draft. Copy the link first if you still need it.",
      )
    ) {
      return;
    }
    const confirmedCode = confirmedProgram.code;
    setDraft(emptyDraft(caseContext, (draft?.revision ?? 0) + 1));
    setConfirmedProgram(null);
    setCaseErrors([]);
    setDraftErrors([]);
    setAgentErrors([]);
    setStagedExerciseIds(new Set());
    setQuery("");
    setBodyRegion(undefined);
    setDifficulty(undefined);
    setWorkspaceAnnouncement("New empty prescription draft started.");
    appendActivity(
      "therapist",
      "Started a new prescription draft.",
      `The confirmed patient link ${confirmedCode} remains active.`,
    );
    focusDraftHeading();
  };

  const openCaseEditor = () => {
    setCaseEditValue({ ...caseContext });
    setCaseErrors([]);
    setCaseEditorOpen(true);
  };

  const closeCaseEditor = () => {
    setCaseEditValue({ ...caseContext });
    setCaseErrors([]);
    setCaseEditorOpen(false);
  };

  const resetWorkspace = () => {
    if (!window.confirm("Reset this synthetic demo workspace?")) return;
    clearTherapistWorkspace();
    setCaseContext(DEFAULT_CONTEXT);
    setCaseEditValue(DEFAULT_CONTEXT);
    setDraft(null);
    setConfirmedProgram(null);
    setCaseErrors([]);
    setDraftErrors([]);
    setAgentErrors([]);
    setWorkspaceAnnouncement("");
    setBodyRegion(undefined);
    setQuery("");
    setDifficulty(undefined);
    setStagedExerciseIds(new Set());
    setCaseEditorOpen(false);
    setActivities([
      makeActivity("system", "Workspace reset.", "Synthetic case restored."),
    ]);
  };

  return (
    <main className="flex-1">
      <div className="mx-auto w-full max-w-[1440px] border-x border-border bg-white shadow-[0_1px_0_rgba(20,53,95,0.03)]">
        <h1 className="sr-only">CoachPoint therapist prescription workspace</h1>
        <CaseSummaryBar
          caseContext={caseContext}
          draft={draft}
          webMcpStatus={webMcp.status}
          webMcpToolCount={webMcp.toolNames.length}
          webMcpError={webMcp.error ?? undefined}
          onEditCase={openCaseEditor}
          onReset={resetWorkspace}
        />

        <div className="grid lg:grid-cols-[minmax(0,1.12fr)_minmax(460px,0.88fr)]">
          <ExerciseCatalog
            exercises={visibleExercises}
            query={query}
            onQueryChange={setQuery}
            bodyRegion={bodyRegion}
            onBodyRegionChange={setBodyRegion}
            difficulty={difficulty}
            onDifficultyChange={setDifficulty}
            prescribedIds={prescribedIds}
            stagedIds={stagedExerciseIds}
            stagedExercises={stagedExercises}
            locked={Boolean(confirmedProgram)}
            onToggleStaged={toggleStagedExercise}
            onClearStaged={() => setStagedExerciseIds(new Set())}
            onAddStaged={addStagedExercises}
            onInspect={setInspectedExercise}
          />
          <DraftEditor
            key={`${draft?.id ?? "no-draft"}:${confirmedProgram ? "confirmed" : "editable"}`}
            draft={draft}
            resolveExercise={getExerciseById}
            onAddStarterDraft={() => {
              setDraft(emptyDraft(caseContext, (draft?.revision ?? 0) + 1));
              setConfirmedProgram(null);
              setAgentErrors([]);
              setWorkspaceAnnouncement("New empty prescription draft started.");
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
            onReviseConfirmed={reviseConfirmedProgram}
            onStartNewPrescription={startNewPrescription}
            confirmedProgram={confirmedProgram}
            validationErrors={draftErrors}
            noticeErrors={agentErrors}
            confirmDisabled={confirmationBlocked}
            announcement={workspaceAnnouncement}
          />
        </div>

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

      {caseEditorOpen && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 bg-ink-900/25"
            onClick={closeCaseEditor}
            aria-label="Close case editor"
          />
          <aside
            className="fixed inset-y-0 right-0 z-50 w-full max-w-3xl overflow-y-auto border-l border-border bg-white shadow-[-18px_0_40px_rgba(20,53,95,0.14)]"
            aria-label="Edit case context"
            aria-modal="true"
            role="dialog"
          >
            <button
              type="button"
              onClick={closeCaseEditor}
              className="focus-ring fixed right-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-xl border border-slate-300 bg-white text-slate-600 shadow-sm hover:border-primary-700 hover:text-primary-700"
              aria-label="Close case editor"
            >
              <XMarkIcon className="h-5 w-5" aria-hidden="true" />
            </button>
            <CaseContextForm
              value={caseEditValue}
              onChange={setCaseEditValue}
              onSubmit={applyCaseContext}
              errors={caseErrors}
            />
          </aside>
        </>
      )}
    </main>
  );
}
