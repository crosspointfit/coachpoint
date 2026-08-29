import type {
  BodyRegion,
  Difficulty,
  Exercise,
} from "./types";

const DEMO_PRECAUTION =
  "Competition demo only. A licensed therapist must verify suitability and dosage before use.";

type CatalogExercise = Omit<
  Exercise,
  "imagePath" | "thumbnailPath" | "reviewStatus"
>;

function defineExercise(exercise: CatalogExercise): Exercise {
  return {
    ...exercise,
    imagePath: `/exercises/${exercise.sourceFile}`,
    thumbnailPath: `/exercise-thumbnails/${exercise.id}.webp`,
    precautions: [DEMO_PRECAUTION, ...exercise.precautions],
    reviewStatus: "demo-only",
  };
}

/**
 * A deliberately small competition catalog. These records demonstrate the
 * product workflow; they are not a clinical protocol or autonomous treatment
 * recommendation.
 */
export const EXERCISES: readonly Exercise[] = [
  defineExercise({
    id: "chin-tuck",
    sourceFile: "P0-0001.png",
    name: "Chin Tuck",
    nameZh: "下巴內收",
    bodyRegion: "neck",
    goals: ["posture", "cervical control", "mobility"],
    difficulty: 1,
    position: "Seated or standing",
    equipment: [],
    estimatedMinutes: 2,
    instructions: [
      "Keep the eyes level and gently draw the chin straight back.",
      "Return to neutral without forcing the range.",
    ],
    precautions: ["Use a comfortable range and stop if symptoms increase."],
    contraindications: [
      "Do not continue with new dizziness, numbness, or radiating symptoms; seek clinician guidance.",
    ],
    phaseTags: ["neck-foundation", "mobility-demo"],
    defaultDosage: {
      sets: 2,
      reps: 8,
      frequencyPerDay: 1,
      restSeconds: 30,
    },
    coachingMode: "timer",
  }),
  defineExercise({
    id: "cat-cow",
    sourceFile: "P0-0009.png",
    name: "Cat-Cow Spinal Mobility",
    nameZh: "貓牛式脊椎活動",
    bodyRegion: "back",
    goals: ["spinal mobility", "movement control", "warm-up"],
    difficulty: 1,
    position: "Quadruped",
    equipment: ["mat"],
    estimatedMinutes: 2,
    instructions: [
      "Move slowly between a comfortable rounded and extended spine position.",
      "Keep the movement smooth and breathe normally.",
    ],
    precautions: ["Use a smaller range if kneeling or spinal loading is uncomfortable."],
    contraindications: [
      "Do not use when weight bearing through the hands or knees has not been cleared.",
    ],
    phaseTags: ["spine-foundation", "mobility-demo"],
    defaultDosage: {
      sets: 2,
      reps: 8,
      frequencyPerDay: 1,
      restSeconds: 30,
    },
    coachingMode: "timer",
  }),
  defineExercise({
    id: "shoulder-pendulum",
    sourceFile: "P0-0012.png",
    name: "Shoulder Pendulum",
    nameZh: "鐘擺運動",
    bodyRegion: "shoulder",
    goals: ["gentle mobility", "relaxation", "supported movement"],
    difficulty: 1,
    position: "Standing with trunk supported",
    equipment: ["table"],
    estimatedMinutes: 3,
    instructions: [
      "Support the body with the other arm and let the working arm relax.",
      "Use gentle body movement to make a small, comfortable pendulum motion.",
    ],
    precautions: ["The arm should remain relaxed; do not force the circle size."],
    contraindications: [
      "Post-operative use requires the procedure and therapist-approved protocol to be documented.",
    ],
    phaseTags: ["shoulder-early-mobility", "post-operative-demo"],
    defaultDosage: {
      sets: 2,
      holdSeconds: 30,
      frequencyPerDay: 1,
      restSeconds: 30,
    },
    coachingMode: "timer",
  }),
  defineExercise({
    id: "shoulder-flexion-stick",
    sourceFile: "P0-0013.png",
    name: "Assisted Shoulder Flexion with Stick",
    nameZh: "棍棒輔助肩前舉",
    bodyRegion: "shoulder",
    goals: ["assisted mobility", "shoulder flexion", "range of motion"],
    difficulty: 1,
    position: "Supine",
    equipment: ["stick"],
    estimatedMinutes: 3,
    instructions: [
      "Use the other arm to guide the stick upward through a comfortable range.",
      "Move slowly and return with control.",
    ],
    precautions: ["Stay within the range specifically cleared by the therapist."],
    contraindications: [
      "Do not use after surgery without a documented procedure and therapist-approved protocol.",
    ],
    phaseTags: ["shoulder-assisted-motion", "post-operative-demo"],
    defaultDosage: {
      sets: 2,
      reps: 8,
      frequencyPerDay: 1,
      restSeconds: 30,
    },
    coachingMode: "timer",
  }),
  defineExercise({
    id: "shoulder-external-rotation-stick",
    sourceFile: "P0-0014.png",
    name: "Assisted Shoulder External Rotation with Stick",
    nameZh: "棍棒輔助肩外旋",
    bodyRegion: "shoulder",
    goals: ["assisted mobility", "external rotation", "range of motion"],
    difficulty: 1,
    position: "Supine with elbow supported",
    equipment: ["stick", "towel"],
    estimatedMinutes: 3,
    instructions: [
      "Keep the elbow comfortably supported while the other arm guides the stick.",
      "Stop at the therapist-defined range and return slowly.",
    ],
    precautions: ["Do not let the elbow drift away from the supported position."],
    contraindications: [
      "Do not use after surgery without procedure-specific clearance and a therapist-approved protocol.",
    ],
    phaseTags: ["shoulder-assisted-motion", "post-operative-demo"],
    defaultDosage: {
      sets: 2,
      reps: 8,
      frequencyPerDay: 1,
      restSeconds: 30,
    },
    coachingMode: "timer",
  }),
  defineExercise({
    id: "wall-slide-flexion",
    sourceFile: "P0-0017.png",
    name: "Wall Slide Shoulder Flexion",
    nameZh: "爬牆肩前舉",
    bodyRegion: "shoulder",
    goals: ["active-assisted mobility", "shoulder flexion", "movement control"],
    difficulty: 2,
    position: "Standing facing a wall",
    equipment: ["wall"],
    estimatedMinutes: 3,
    instructions: [
      "Slide the hand upward on the wall through the therapist-defined range.",
      "Keep the shoulder relaxed and lower the arm with control.",
    ],
    precautions: ["Avoid shrugging or pushing into a painful range."],
    contraindications: [
      "Do not begin active elevation when it is restricted by the documented procedure or protocol.",
    ],
    phaseTags: ["shoulder-active-assisted", "post-operative-demo"],
    defaultDosage: {
      sets: 2,
      reps: 8,
      frequencyPerDay: 1,
      restSeconds: 30,
    },
    coachingMode: "timer",
  }),
  defineExercise({
    id: "tendon-glide-combo",
    sourceFile: "P0-0034.png",
    name: "Finger Tendon Glide Sequence",
    nameZh: "手指肌腱滑動",
    bodyRegion: "hand",
    goals: ["hand mobility", "tendon excursion", "movement control"],
    difficulty: 1,
    position: "Seated with forearm supported",
    equipment: [],
    estimatedMinutes: 2,
    instructions: [
      "Move through the demonstrated hand shapes slowly and without forcing.",
      "Return to an open hand between positions.",
    ],
    precautions: ["Use only the sequence and range selected by the therapist."],
    contraindications: [
      "Do not use when tendon motion is restricted by a surgical or splinting protocol.",
    ],
    phaseTags: ["hand-wrist-demo", "mobility-demo"],
    defaultDosage: {
      sets: 2,
      reps: 5,
      frequencyPerDay: 1,
      restSeconds: 30,
    },
    coachingMode: "timer",
  }),
  defineExercise({
    id: "bridge",
    sourceFile: "P0-0046.png",
    name: "Bridge",
    nameZh: "橋式",
    bodyRegion: "hip",
    goals: ["hip strength", "trunk control", "posterior chain"],
    difficulty: 2,
    position: "Supine with knees bent",
    equipment: ["mat"],
    estimatedMinutes: 3,
    instructions: [
      "Press through the feet and lift the hips through a comfortable range.",
      "Keep the trunk controlled and lower slowly.",
    ],
    precautions: ["Use a smaller range if the back or hamstrings become uncomfortable."],
    contraindications: ["Do not use when loaded hip or spine movement has not been cleared."],
    phaseTags: ["hip-strength-foundation", "trunk-control-demo"],
    defaultDosage: {
      sets: 2,
      reps: 10,
      frequencyPerDay: 1,
      restSeconds: 45,
    },
    coachingMode: "timer",
  }),
  defineExercise({
    id: "bird-dog",
    sourceFile: "P0-0047.png",
    name: "Bird Dog",
    nameZh: "鳥狗式",
    bodyRegion: "back",
    goals: ["trunk control", "balance", "coordination"],
    difficulty: 3,
    position: "Quadruped",
    equipment: ["mat"],
    estimatedMinutes: 4,
    instructions: [
      "Reach the selected arm and leg while keeping the trunk steady.",
      "Return with control and alternate only as directed.",
    ],
    precautions: ["Begin with one limb at a time if the full pattern is not controlled."],
    contraindications: [
      "Do not use when quadruped loading or balance challenge has not been cleared.",
    ],
    phaseTags: ["trunk-control-demo", "balance-progression"],
    defaultDosage: {
      sets: 2,
      reps: 6,
      frequencyPerDay: 1,
      restSeconds: 45,
    },
    coachingMode: "timer",
  }),
  defineExercise({
    id: "half-kneeling-hip-flexor-stretch",
    sourceFile: "P0-0051.png",
    name: "Half-Kneeling Hip Flexor Stretch",
    nameZh: "半跪髖屈肌伸展",
    bodyRegion: "hip",
    goals: ["hip mobility", "flexibility", "posture"],
    difficulty: 2,
    position: "Half kneeling",
    equipment: ["mat"],
    estimatedMinutes: 3,
    instructions: [
      "Maintain a tall trunk and gently shift forward from the hips.",
      "Hold only a comfortable stretch and avoid arching the lower back.",
    ],
    precautions: ["Use padding and external support if kneeling balance is limited."],
    contraindications: ["Do not kneel when knee loading has not been cleared."],
    phaseTags: ["hip-mobility-demo", "flexibility-demo"],
    defaultDosage: {
      sets: 2,
      holdSeconds: 30,
      frequencyPerDay: 1,
      restSeconds: 30,
    },
    coachingMode: "timer",
  }),
  defineExercise({
    id: "standing-hip-abduction",
    sourceFile: "P0-0057.png",
    name: "Standing Hip Abduction",
    nameZh: "站姿髖外展",
    bodyRegion: "hip",
    goals: ["hip strength", "standing control", "balance"],
    difficulty: 2,
    position: "Standing with hand support",
    equipment: ["chair"],
    estimatedMinutes: 3,
    instructions: [
      "Hold a stable support and move the leg out to the side without leaning.",
      "Return slowly while keeping the toes generally forward.",
    ],
    precautions: ["Use stable support and a range that does not disturb balance."],
    contraindications: ["Do not perform unsupported when standing balance has not been cleared."],
    phaseTags: ["hip-strength-foundation", "standing-balance-demo"],
    defaultDosage: {
      sets: 2,
      reps: 10,
      frequencyPerDay: 1,
      restSeconds: 45,
    },
    coachingMode: "timer",
  }),
  defineExercise({
    id: "heel-raise",
    sourceFile: "P0-0068.png",
    name: "Supported Heel Raise",
    nameZh: "提踵",
    bodyRegion: "ankle",
    goals: ["calf strength", "ankle control", "standing tolerance"],
    difficulty: 2,
    position: "Standing with hand support",
    equipment: ["chair"],
    estimatedMinutes: 3,
    instructions: [
      "Hold stable support and rise onto the balls of the feet.",
      "Pause briefly, then lower with control.",
    ],
    precautions: ["Keep support within reach and use an even, comfortable range."],
    contraindications: ["Do not use when weight bearing through the foot or ankle is restricted."],
    phaseTags: ["ankle-strength-foundation", "standing-demo"],
    defaultDosage: {
      sets: 2,
      reps: 12,
      frequencyPerDay: 1,
      restSeconds: 45,
    },
    coachingMode: "timer",
  }),
  defineExercise({
    id: "half-squat",
    sourceFile: "P0-0069.png",
    name: "Supported Half Squat",
    nameZh: "半蹲",
    bodyRegion: "knee",
    goals: ["lower-limb strength", "sit-to-stand preparation", "movement control"],
    difficulty: 2,
    position: "Standing with support available",
    equipment: ["chair"],
    estimatedMinutes: 3,
    instructions: [
      "Bend the hips and knees through the therapist-defined range.",
      "Keep the movement controlled and return to standing.",
    ],
    precautions: ["Use stable support and stop if pain or balance worsens."],
    contraindications: ["Do not use when loaded knee bending or weight bearing is restricted."],
    phaseTags: ["knee-strength-foundation", "camera-demo-candidate"],
    defaultDosage: {
      sets: 2,
      reps: 8,
      frequencyPerDay: 1,
      restSeconds: 45,
    },
    coachingMode: "camera",
  }),
  defineExercise({
    id: "plantar-fascia-roll",
    sourceFile: "P0-0087.png",
    name: "Plantar Fascia Ball Roll",
    nameZh: "足底滾球放鬆",
    bodyRegion: "ankle",
    goals: ["foot mobility", "self-management", "soft-tissue comfort"],
    difficulty: 1,
    position: "Seated",
    equipment: ["ball"],
    estimatedMinutes: 3,
    instructions: [
      "While seated, roll the ball slowly under the foot with light pressure.",
      "Stay within the area and pressure demonstrated by the therapist.",
    ],
    precautions: ["Inspect the foot first when sensation or skin integrity is a concern."],
    contraindications: [
      "Do not use over an open wound or when protective sensation is insufficient for safe self-monitoring.",
    ],
    phaseTags: ["foot-mobility-demo", "self-management-demo"],
    defaultDosage: {
      sets: 2,
      holdSeconds: 45,
      frequencyPerDay: 1,
      restSeconds: 30,
    },
    coachingMode: "timer",
  }),
  defineExercise({
    id: "single-leg-balance",
    sourceFile: "P0-0089.png",
    name: "Supported Single-Leg Balance",
    nameZh: "扶椅單腳站",
    bodyRegion: "balance",
    goals: ["balance", "single-leg control", "fall-risk management"],
    difficulty: 3,
    position: "Standing beside stable support",
    equipment: ["chair"],
    estimatedMinutes: 3,
    instructions: [
      "Keep a hand near stable support and lift one foot only as directed.",
      "Set the foot down whenever balance feels uncertain.",
    ],
    precautions: ["A stable support and a clear surrounding area are required."],
    contraindications: [
      "Do not perform without direct assistance when the therapist has identified unsafe standing balance.",
    ],
    phaseTags: ["supported-balance", "fall-prevention-demo"],
    defaultDosage: {
      sets: 2,
      holdSeconds: 20,
      frequencyPerDay: 1,
      restSeconds: 30,
    },
    coachingMode: "timer",
  }),
] satisfies readonly Exercise[];

const EXERCISES_BY_ID = new Map(EXERCISES.map((exercise) => [exercise.id, exercise]));

export interface ExerciseSearchFilters {
  query?: string;
  bodyRegion?: BodyRegion | readonly BodyRegion[];
  difficulty?: Difficulty | readonly Difficulty[];
  goals?: string | readonly string[];
  equipment?: string | readonly string[];
  phaseTags?: string | readonly string[];
  limit?: number;
}

export function getExerciseById(id: string): Exercise | undefined {
  return EXERCISES_BY_ID.get(id.trim().toLowerCase());
}

function normalize(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase("en");
}

function asArray<T>(value: T | readonly T[] | undefined): readonly T[] {
  if (value === undefined) {
    return [];
  }

  return Array.isArray(value) ? value : [value as T];
}

function includesEvery(haystack: readonly string[], needles: readonly string[]): boolean {
  const normalizedHaystack = haystack.map(normalize);
  return needles.every((needle) => {
    const normalizedNeedle = normalize(needle);
    return normalizedHaystack.some(
      (value) => value === normalizedNeedle || value.includes(normalizedNeedle),
    );
  });
}

export function searchExercises(filters: ExerciseSearchFilters = {}): Exercise[] {
  const bodyRegions = asArray(filters.bodyRegion);
  const difficulties = asArray(filters.difficulty);
  const queryTokens = normalize(filters.query ?? "")
    .split(/\s+/)
    .filter(Boolean);
  const requestedLimit = Number.isFinite(filters.limit) ? Math.floor(filters.limit!) : 15;
  const limit = Math.max(0, Math.min(requestedLimit, 50));

  if (limit === 0) {
    return [];
  }

  return EXERCISES.filter((exercise) => {
    if (bodyRegions.length > 0 && !bodyRegions.includes(exercise.bodyRegion)) {
      return false;
    }

    if (difficulties.length > 0 && !difficulties.includes(exercise.difficulty)) {
      return false;
    }

    if (!includesEvery(exercise.goals, asArray(filters.goals))) {
      return false;
    }

    if (!includesEvery(exercise.equipment, asArray(filters.equipment))) {
      return false;
    }

    if (!includesEvery(exercise.phaseTags, asArray(filters.phaseTags))) {
      return false;
    }

    if (queryTokens.length === 0) {
      return true;
    }

    const searchableText = normalize(
      [
        exercise.id,
        exercise.name,
        exercise.nameZh,
        exercise.bodyRegion,
        exercise.position,
        ...exercise.goals,
        ...exercise.equipment,
        ...exercise.phaseTags,
      ].join(" "),
    );

    return queryTokens.every((token) => searchableText.includes(token));
  }).slice(0, limit);
}
