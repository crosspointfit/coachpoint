"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeftIcon, XMarkIcon } from "@heroicons/react/24/outline";
import {
  confirmProgram,
  createProgramDraft,
  estimateProgramDuration,
  getExerciseById,
  getSyntheticClient,
  prepareProgramDraftContext,
  searchExercises,
  type TherapistWorkspaceSnapshot as CaseloadWorkspaceSnapshot,
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
import { selectConfirmedVersions } from "@/domain/caseload-views";
import {
  createTherapistToolDescriptors,
  useWebMcpTools,
  type DraftProgramInput,
  type GetExerciseDetailsInput,
  type PrepareDraftContextInput,
  type SearchExercisesInput,
} from "@/lib/webmcp";
import {
  createProgramForClient,
  listProgramsForClient,
  readProgramWorkspaceForClient,
  writeClientProgramWorkspace,
  writeProgramWorkspaceForClient,
} from "@/lib/caseloadStorage";
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

interface TherapistWorkspaceProps {
  clientId?: string;
  programId?: string;
}

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

export default function TherapistWorkspace({
  clientId,
  programId,
}: TherapistWorkspaceProps = {}) {
  const router = useRouter();
  const clientFixture = clientId ? getSyntheticClient(clientId) : undefined;
  const initialContext = clientFixture?.caseContext ?? DEFAULT_CONTEXT;
  const [caseContext, setCaseContext] = useState<CaseContext>(initialContext);
  const [caseEditValue, setCaseEditValue] =
    useState<CaseContext>(initialContext);
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
  const [hydratedScope, setHydratedScope] = useState<string | null>(null);
  const [programMissing, setProgramMissing] = useState(false);
  const workspaceScope = programId
    ? `${clientId ?? "missing-client"}/${programId}`
    : "legacy-workspace";

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
      const stored = programId
        ? clientId
          ? readProgramWorkspaceForClient(clientId, programId)
          : null
        : readTherapistWorkspace();
      if (stored) {
        setProgramMissing(false);
        setCaseContext(stored.caseContext);
        setCaseEditValue(stored.caseContext);
        setDraft(stored.draft);
        setConfirmedProgram(stored.confirmedProgram);
        setActivities(stored.activities);
      } else if (programId) {
        setProgramMissing(true);
      } else {
        const fallbackContext = clientId
          ? getSyntheticClient(clientId)?.caseContext ?? DEFAULT_CONTEXT
          : DEFAULT_CONTEXT;
        setCaseContext(fallbackContext);
        setCaseEditValue(fallbackContext);
        setActivities([
          makeActivity(
            "system",
            "Workspace ready.",
            "Synthetic shoulder case loaded; no patient data is present.",
          ),
        ]);
      }
      setHydratedScope(workspaceScope);
      setHydrated(true);
    }, 0);

    return () => window.clearTimeout(hydrationTimer);
  }, [clientId, programId, workspaceScope]);

  useEffect(() => {
    if (!hydrated || hydratedScope !== workspaceScope) return;
    const snapshot = {
      version: 1,
      caseContext,
      draft,
      confirmedProgram,
      activities,
    } as const;
    if (programId) {
      if (!programMissing && clientId) {
        writeProgramWorkspaceForClient(clientId, programId, snapshot);
      }
    } else {
      writeTherapistWorkspace(snapshot);
    }
  }, [
    activities,
    caseContext,
    clientId,
    confirmedProgram,
    draft,
    hydrated,
    hydratedScope,
    programId,
    programMissing,
    workspaceScope,
  ]);

  const toolsEnabled =
    hydrated &&
    !programMissing &&
    hydratedScope === workspaceScope;

  const persistWorkspaceNow = useCallback(
    (snapshot: CaseloadWorkspaceSnapshot): boolean => {
      if (programId) {
        return clientId
          ? writeProgramWorkspaceForClient(clientId, programId, snapshot)
          : false;
      }
      return writeTherapistWorkspace(snapshot);
    },
    [clientId, programId],
  );

  const toolDescriptors = useMemo(() => {
    if (!toolsEnabled) return [];
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
        getProgramEditorState: async () => {
          const storedWorkspace =
            clientId && programId
              ? readProgramWorkspaceForClient(clientId, programId)
              : null;
          if (!storedWorkspace) {
            return {
              ok: false as const,
              errors: [
                {
                  code: "program_not_found",
                  message:
                    "The route-bound program workspace is unavailable. Return to the client record and reopen a valid draft.",
                  field: "programId",
                  recoverable: true,
                },
              ],
            };
          }
          const activeConfirmedVersion = clientId
            ? selectConfirmedVersions(listProgramsForClient(clientId))
                .find(({ program }) => program.status !== "archived")?.version
            : undefined;
          return {
            clientId,
            programId,
            patientLabel: storedWorkspace.caseContext.patientLabel,
            diagnosis: storedWorkspace.caseContext.diagnosis,
            minutesPerDay: storedWorkspace.caseContext.minutesPerDay,
            draft: storedWorkspace.draft
              ? {
                  draftId: storedWorkspace.draft.id,
                  revision: storedWorkspace.draft.revision,
                  itemCount: storedWorkspace.draft.items.length,
                  estimatedMinutes: storedWorkspace.draft.estimatedMinutes,
                  source: storedWorkspace.draft.source,
                }
              : null,
            status: storedWorkspace.confirmedProgram
              ? "confirmed"
              : "awaiting_therapist_review",
            confirmedCode: storedWorkspace.confirmedProgram?.code,
            activeConfirmedCode: activeConfirmedVersion?.code,
          };
        },
        prepareDraftContext: async (
          input: PrepareDraftContextInput,
          { signal },
        ) => {
          signal.throwIfAborted();
          if (!input || !Array.isArray(input.searches)) {
            return {
              ok: false as const,
              errors: [
                {
                  code: "invalid_input",
                  message:
                    "One to three structured movement searches are required.",
                  field: "searches",
                  recoverable: true,
                },
              ],
            };
          }
          const storedWorkspace =
            clientId && programId
              ? readProgramWorkspaceForClient(clientId, programId)
              : null;
          if (!storedWorkspace) {
            return {
              ok: false as const,
              errors: [
                {
                  code: "program_not_found",
                  message:
                    "The route-bound program workspace is unavailable. Return to the client record and reopen a valid draft.",
                  field: "programId",
                  recoverable: true,
                },
              ],
            };
          }
          const prepared = prepareProgramDraftContext({
            caseContext: storedWorkspace.caseContext,
            currentDraft: storedWorkspace.draft,
            searches: input.searches,
          });
          if (!prepared.ok) return prepared;
          signal.throwIfAborted();
          return prepared;
        },
        draftProgram: async (input: DraftProgramInput, { signal }) => {
          signal.throwIfAborted();
          if (!input || !Array.isArray(input.items) || input.items.length === 0) {
            return {
              ok: false as const,
              errors: [
                {
                  code: "invalid_input",
                  message:
                    "One to four ordered movement requests with proposed dosage are required.",
                  field: "items",
                  recoverable: true,
                },
              ],
            };
          }
          const storedWorkspace =
            clientId && programId
              ? readProgramWorkspaceForClient(clientId, programId)
              : null;
          if (!storedWorkspace) {
            return {
              ok: false as const,
              errors: [
                {
                  code: "program_not_found",
                  message:
                    "The route-bound program workspace is unavailable. Return to the client record and reopen a valid draft.",
                  field: "programId",
                  recoverable: true,
                },
              ],
            };
          }
          if (storedWorkspace.confirmedProgram) {
            return {
              ok: false as const,
              errors: [
                {
                  code: "confirmed_program_requires_human_reopen",
                  message:
                    "This prescription is already confirmed. The therapist must reopen it or start a new prescription in the UI before an agent can create another draft.",
                  field: "program",
                  recoverable: true,
                },
              ],
            };
          }
          if (
            storedWorkspace.draft &&
            storedWorkspace.draft.items.length > 0
          ) {
            return {
              ok: false as const,
              errors: [
                {
                  code: "visible_draft_must_be_empty",
                  message:
                    "A non-empty draft is already visible. The therapist must start a fresh prescription or clear the draft in the UI before the agent can create another one.",
                  field: "program",
                  recoverable: true,
                },
              ],
            };
          }

          const currentRevision = storedWorkspace?.draft?.revision ?? 0;
          const programItems: ProgramItem[] = [];
          const selectedMovements: Array<{
            exerciseId: string;
            name: string;
            precautions: readonly string[];
            contraindications: readonly string[];
          }> = [];
          const selectedIds = new Set<string>();

          for (const [index, requestedItem] of input.items.entries()) {
            signal.throwIfAborted();
            const prepared = prepareProgramDraftContext({
              caseContext: storedWorkspace.caseContext,
              currentDraft: storedWorkspace.draft,
              searches: [
                {
                  query: requestedItem?.query,
                  bodyRegion: requestedItem?.bodyRegion,
                  goal: requestedItem?.goal,
                  equipment: requestedItem?.equipment,
                  phaseTag: requestedItem?.phaseTag,
                  difficulty: requestedItem?.difficulty,
                  maxResults: 1,
                },
              ],
            });
            if (!prepared.ok) return prepared;
            if (prepared.value.caseIssues.length > 0) {
              return {
                ok: false as const,
                errors: prepared.value.caseIssues,
              };
            }
            const movement = prepared.value.movements[0];
            if (!movement) {
              return {
                ok: false as const,
                errors: [
                  {
                    code: "exercise_not_found",
                    message: `No curated exercise matched movement request ${index + 1}.`,
                    field: `items.${index}.query`,
                    recoverable: true,
                  },
                ],
              };
            }
            if (selectedIds.has(movement.id)) {
              return {
                ok: false as const,
                errors: [
                  {
                    code: "duplicate_exercise",
                    message: `${movement.name} was selected more than once. Use distinct movement requests.`,
                    field: `items.${index}.query`,
                    recoverable: true,
                  },
                ],
              };
            }
            selectedIds.add(movement.id);
            programItems.push({
              exerciseId: movement.id,
              sets: requestedItem.sets,
              reps: requestedItem.reps,
              holdSeconds: requestedItem.holdSeconds,
              frequencyPerDay: requestedItem.frequencyPerDay,
              restSeconds: requestedItem.restSeconds,
              therapistNote: requestedItem.therapistNote,
            });
            selectedMovements.push({
              exerciseId: movement.id,
              name: movement.name,
              precautions: movement.precautions,
              contraindications: movement.contraindications,
            });
          }

          const result = createProgramDraft({
            caseContext: storedWorkspace.caseContext,
            items: programItems,
            source: "agent",
            revision: currentRevision + 1,
          });
          if (!result.ok) {
            setAgentErrors(result.errors);
            return result;
          }
          const activity = makeActivity(
            "agent",
            "Created a visible draft.",
            `${result.value.items.length} exercises · ${result.value.estimatedMinutes.toFixed(1)} minutes · awaiting therapist review.`,
          );
          const nextActivities = [
            activity,
            ...(storedWorkspace?.activities ?? []),
          ].slice(0, 60);
          const nextWorkspace = {
            version: 1,
            caseContext: result.value.caseContext,
            draft: result.value,
            confirmedProgram: null,
            activities: nextActivities,
          } as const;
          // Cancellation must win before the atomic client/program commit.
          signal.throwIfAborted();
          const persisted =
            clientId && programId
              ? writeClientProgramWorkspace(
                  clientId,
                  programId,
                  nextWorkspace,
                )
              : persistWorkspaceNow(nextWorkspace);
          if (!persisted) {
            const errors: DomainError[] = [
              {
                code: "storage_failure",
                message:
                  "The agent draft was validated, but the client and program workspace could not be committed together in this browser.",
                field: "program",
                recoverable: true,
              },
            ];
            setAgentErrors(errors);
            return { ok: false as const, errors };
          }
          setCaseContext(result.value.caseContext);
          setCaseEditValue(result.value.caseContext);
          setDraft(result.value);
          setStagedExerciseIds(new Set());
          setConfirmedProgram(null);
          setCaseErrors([]);
          setDraftErrors([]);
          setAgentErrors([]);
          setActivities(nextActivities);
          return {
            ok: true as const,
            value: {
              draftId: result.value.id,
              itemCount: result.value.items.length,
              estimatedMinutes: result.value.estimatedMinutes,
              selectedMovements,
              warnings: result.value.warnings.slice(0, 3),
              status: "awaiting_therapist_review",
            },
          };
        },
      });
  }, [
    appendActivity,
    clientId,
    persistWorkspaceNow,
    programId,
    toolsEnabled,
  ]);

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

    let nextDraft = draft;
    let nextDraftErrors: DomainError[] = [];
    if (draft) {
      const updatedDraft = {
        ...draft,
        patientLabel: result.value.patientLabel,
        caseContext: result.value,
        revision: draft.revision + 1,
      };
      const validation = validateDraft(updatedDraft.items, {
        minutesPerDay: result.value.minutesPerDay,
      });
      const duration = estimateProgramDuration(updatedDraft.items);
      nextDraft = validation.ok
        ? {
            ...updatedDraft,
            estimatedMinutes: validation.value.estimatedMinutes,
            warnings: validation.value.warnings,
          }
        : {
            ...updatedDraft,
            estimatedMinutes: duration.ok
              ? duration.value
              : updatedDraft.estimatedMinutes,
          };
      nextDraftErrors = validation.ok ? [] : validation.errors;
    }

    const activity = makeActivity(
      "therapist",
      "Applied case context.",
      `${result.value.diagnosis} · ${result.value.minutesPerDay} minutes per day.`,
    );
    const nextActivities = [activity, ...activities].slice(0, 60);
    const nextWorkspace = {
      version: 1,
      caseContext: result.value,
      draft: nextDraft,
      confirmedProgram: null,
      activities: nextActivities,
    } as const;
    const persisted =
      clientId && programId
        ? writeClientProgramWorkspace(clientId, programId, nextWorkspace)
        : persistWorkspaceNow(nextWorkspace);
    if (!persisted) {
      setCaseErrors([
        {
          code: "storage_failure",
          message:
            "The client context and program could not be committed together. Retry before continuing.",
          field: "caseContext",
          recoverable: true,
        },
      ]);
      return;
    }

    setCaseContext(result.value);
    setCaseEditValue(result.value);
    setCaseErrors([]);
    setAgentErrors([]);
    setConfirmedProgram(null);
    setDraft(nextDraft);
    setDraftErrors(nextDraftErrors);
    setActivities(nextActivities);
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
    const nextDraft: ProgramDraft = {
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
    };
    const nextActivities = activity
      ? [
          makeActivity("therapist", activity.action, activity.detail),
          ...activities,
        ].slice(0, 60)
      : activities;
    if (
      !persistWorkspaceNow({
        version: 1,
        caseContext,
        draft: nextDraft,
        confirmedProgram: null,
        activities: nextActivities,
      })
    ) {
      setDraftErrors([
        {
          code: "storage_failure",
          message:
            "This draft change could not be saved in the browser. Retry before continuing.",
          field: "program",
          recoverable: true,
        },
      ]);
      return;
    }
    setDraft(nextDraft);
    setConfirmedProgram(null);
    setDraftErrors(validation.ok ? [] : validation.errors);
    setAgentErrors([]);
    if (activity) {
      setActivities(nextActivities);
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
    const activity = makeActivity(
      "therapist",
      "Confirmed the prescription.",
      `Revision ${result.value.revision} · patient program ${result.value.code}.`,
    );
    const nextActivities = [activity, ...activities].slice(0, 60);
    const confirmationSnapshot = {
      version: 1,
      caseContext,
      draft,
      confirmedProgram: result.value,
      activities: nextActivities,
    } as const;
    const routeBound = Boolean(clientId && programId);
    if (!routeBound && !storeConfirmedProgram(result.value)) {
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
    if (!persistWorkspaceNow(confirmationSnapshot)) {
      const storageError: DomainError = {
        code: "storage_failure",
        message:
          "The confirmed version could not be committed to the therapist caseload. Retry before leaving this page.",
        field: "program",
        recoverable: true,
      };
      setDraftErrors([storageError]);
      appendActivity(
        "system",
        "Caseload confirmation could not be committed.",
        storageError.message,
      );
      return;
    }
    setConfirmedProgram(result.value);
    setStagedExerciseIds(new Set());
    setDraftErrors([]);
    setAgentErrors([]);
    setActivities(nextActivities);
    setWorkspaceAnnouncement("Prescription confirmed. Patient link ready.");
  };

  const focusDraftHeading = () => {
    window.requestAnimationFrame(() => {
      document.getElementById("draft-heading")?.focus();
    });
  };

  const reviseConfirmedProgram = () => {
    if (!draft || !confirmedProgram) return;
    if (
      clientId &&
      programId &&
      listProgramsForClient(clientId).some(
        (program) =>
          program.programId !== programId && program.status === "draft",
      )
    ) {
      setDraftErrors([
        {
          code: "existing_draft",
          message:
            "This client already has another draft in progress. Finish or archive that draft before revising this confirmed plan.",
          field: "program",
          recoverable: true,
        },
      ]);
      setWorkspaceAnnouncement(
        "Revision blocked because another draft is already in progress.",
      );
      return;
    }
    const confirmedCode = confirmedProgram.code;
    const nextDraft = {
      ...draft,
      source: "therapist",
      revision: draft.revision + 1,
    } as ProgramDraft;
    const activity = makeActivity(
      "therapist",
      "Reopened the confirmed plan for revision.",
      `The existing patient link ${confirmedCode} remains active until a replacement is confirmed.`,
    );
    const nextActivities = [activity, ...activities].slice(0, 60);
    if (
      !persistWorkspaceNow({
        version: 1,
        caseContext,
        draft: nextDraft,
        confirmedProgram: null,
        activities: nextActivities,
      })
    ) {
      setDraftErrors([
        {
          code: "storage_failure",
          message:
            "The confirmed plan could not be reopened durably. Finish any other draft for this client, then retry.",
          field: "program",
          recoverable: true,
        },
      ]);
      return;
    }
    setDraft(nextDraft);
    setConfirmedProgram(null);
    setDraftErrors([]);
    setAgentErrors([]);
    setActivities(nextActivities);
    setWorkspaceAnnouncement("Confirmed plan reopened as an editable draft.");
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
    if (clientId) {
      const created = createProgramForClient(clientId);
      if (!created) {
        setDraftErrors([
          {
            code: "storage_failure",
            message:
              "A new prescription record could not be created in this browser. Retry after checking browser storage.",
            field: "program",
            recoverable: true,
          },
        ]);
        return;
      }
      appendActivity(
        "therapist",
        "Started a new prescription record.",
        `The confirmed patient link ${confirmedCode} remains active.`,
      );
      router.push(
        `/therapist/clients/${clientId}/programs/${created.programId}`,
      );
      return;
    }
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
    const nextDraft = programId
      ? emptyDraft(initialContext, (draft?.revision ?? 0) + 1)
      : null;
    const nextActivities = [
      makeActivity("system", "Workspace reset.", "Synthetic case restored."),
    ];
    if (clientId && programId) {
      const resetSnapshot = {
        version: 1,
        caseContext: initialContext,
        draft: nextDraft,
        confirmedProgram: null,
        activities: nextActivities,
      } as const;
      if (!writeClientProgramWorkspace(clientId, programId, resetSnapshot)) {
        setDraftErrors([
          {
            code: "storage_failure",
            message:
              "The reset could not be committed. Finish any other draft for this client or retry after checking browser storage.",
            field: "program",
            recoverable: true,
          },
        ]);
        setWorkspaceAnnouncement("Workspace reset was not saved.");
        return;
      }
    } else {
      clearTherapistWorkspace();
    }
    setCaseContext(initialContext);
    setCaseEditValue(initialContext);
    setDraft(nextDraft);
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
    setProgramMissing(false);
    setActivities(nextActivities);
  };

  if (hydrated && programMissing) {
    return (
      <main className="flex flex-1 items-center justify-center px-6 py-20">
        <div className="max-w-md rounded-2xl border border-border bg-white p-8 text-center shadow-[var(--cp-shadow-card)]">
          <p className="text-xs font-bold uppercase tracking-[0.13em] text-primary-700">
            Prescription unavailable
          </p>
          <h1 className="mt-3 text-2xl font-black text-ink-900">
            This synthetic program could not be found.
          </h1>
          <p className="mt-3 text-sm leading-6 text-slate-500">
            Return to the client record and open an existing program or create a new draft.
          </p>
          <Link
            href={clientId ? `/therapist/clients/${clientId}` : "/therapist"}
            className="focus-ring mt-6 inline-flex h-10 items-center gap-2 rounded-xl bg-primary-700 px-4 text-sm font-bold text-white hover:bg-primary-800"
          >
            <ArrowLeftIcon className="h-4 w-4" aria-hidden="true" />
            Back to client
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1">
      <div className="mx-auto w-full max-w-[1440px] border-x border-border bg-white shadow-[0_1px_0_rgba(20,53,95,0.03)]">
        <h1 className="sr-only">CoachPoint therapist prescription workspace</h1>
        {clientId && (
          <div className="flex flex-wrap items-center gap-2 border-b border-border bg-[#FCFCF9] px-5 py-2.5 text-xs lg:px-7">
            <Link
              href={`/therapist/clients/${clientId}`}
              className="focus-ring inline-flex items-center gap-1.5 rounded-md font-bold text-primary-700 hover:text-primary-800"
            >
              <ArrowLeftIcon className="h-3.5 w-3.5" aria-hidden="true" />
              Client programs
            </Link>
            <span className="text-slate-300" aria-hidden="true">/</span>
            <span className="font-semibold text-slate-500">
              {clientFixture?.displayName ?? "Synthetic client"}
            </span>
            <span className="text-slate-300" aria-hidden="true">/</span>
            <span className="font-semibold text-ink-900">Prescription editor</span>
          </div>
        )}
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
