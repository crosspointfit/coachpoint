# CoachPoint exercise thumbnail prompt set

Mode: built-in `image_gen` edit workflow, one call per distinct asset.

Inputs for each call:

- Edit target: the matching `public/exercises/P0-*.png` source sheet.
- Style/composition anchor: the approved text-free `chin-tuck` thumbnail.

## Shared prompt

```text
Use case: precise-object-edit
Asset type: CoachPoint exercise-library thumbnail
Primary request: recreate the referenced physical-therapy exercise as a clean text-free clinical exercise illustration for a web gallery.
Scene/backdrop: plain warm white background (#FAFAF7), with no room or scenery unless a wall, chair, mat, table, towel, stick, or ball is required by the exercise.
Style/medium: polished hand-painted medical/physical-therapy illustration matching the style anchor, realistic adult proportions, crisp clean edges.
Composition/framing: landscape 4:3; show the complete clinically meaningful pose, equipment, support surface, and motion arrows fully inside the frame with generous safe margins.
Constraints: preserve or correct the clinically important joint positions according to the CoachPoint catalog. Remove every title, Chinese or English word, number, label, colored border, and card frame. Keep the neutral gray shirt, black shorts, and blue motion arrows.
Avoid: text, letters, numbers, logos, watermark, border, extra people, extra limbs, malformed hands or feet, cropped anatomy or equipment, photographic style, dramatic lighting.
```

## Asset-specific constraints

- `chin-tuck`: two side-profile stages; neutral-to-retracted chin; downward and rightward arrows.
- `cat-cow`: two quadruped spinal positions on a mat; curved arrows above both stages.
- `shoulder-pendulum`: non-working hand braced on a waist-height table; working arm relaxed; small pendulum circle below the hand.
- `shoulder-flexion-stick`: supine on a therapy table; both hands hold one stick shoulder-width apart; assisted movement toward overhead flexion.
- `shoulder-external-rotation-stick`: supine; elbow bent about 90 degrees and supported on a folded towel; stick guides the affected forearm outward.
- `wall-slide-flexion`: side view facing a wall; palm in contact; upward slide arrow beside the hand.
- `tendon-glide-combo`: five distinct hand positions in sequence; four transition arrows and one terminal upward arrow; anatomically complete fingers.
- `bridge`: full supine bridge, head/hands/feet visible; upward hip arrow.
- `bird-dog`: quadruped with opposite arm and leg extended; both outward arrows.
- `half-kneeling-hip-flexor-stretch`: full half-kneeling stance; both feet and rear knee visible; forward hip arrow.
- `standing-hip-abduction`: one hand lightly supported on a stable chair; support leg vertical; opposite straight leg moves laterally without trunk lean.
- `heel-raise`: hands lightly supported on a chair; knees straight; both heels clearly lifted with upward arrows.
- `half-squat`: full supported-ready half-squat position; hands and feet visible; downward arrow.
- `plantar-fascia-roll`: full foot on a small green ball; left-right rolling arrow.
- `single-leg-balance`: catalog definition overrides the mismatched seated source; standing beside a stable chair, one hand supported, one foot lifted.

## Delivery processing

Built-in outputs were `1448 × 1086` PNG files. Approved outputs were mechanically normalized with Sharp to `960 × 720` WebP at quality 86 for project delivery under `public/exercise-thumbnails/`. Original `P0` sheets remain unchanged.
