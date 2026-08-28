import type { BodySide, NormalizedLandmarkLike } from "./types.ts";

export interface KneeTriplet {
  hip: NormalizedLandmarkLike;
  knee: NormalizedLandmarkLike;
  ankle: NormalizedLandmarkLike;
}

export interface SideSelection {
  side: BodySide;
  triplet: KneeTriplet;
  visibility: number;
}

const LANDMARK_INDEX = {
  left: { hip: 23, knee: 25, ankle: 27 },
  right: { hip: 24, knee: 26, ankle: 28 },
} as const;

function finitePoint(point: NormalizedLandmarkLike | undefined): point is NormalizedLandmarkLike {
  return !!point && Number.isFinite(point.x) && Number.isFinite(point.y);
}

function pointVisibility(point: NormalizedLandmarkLike): number {
  return Math.min(point.visibility ?? 1, point.presence ?? 1);
}

function tripletFor(
  landmarks: readonly NormalizedLandmarkLike[],
  side: BodySide,
): KneeTriplet | null {
  const indices = LANDMARK_INDEX[side];
  const hip = landmarks[indices.hip];
  const knee = landmarks[indices.knee];
  const ankle = landmarks[indices.ankle];
  return finitePoint(hip) && finitePoint(knee) && finitePoint(ankle)
    ? { hip, knee, ankle }
    : null;
}

function tripletVisibility(triplet: KneeTriplet): number {
  return Math.min(
    pointVisibility(triplet.hip),
    pointVisibility(triplet.knee),
    pointVisibility(triplet.ankle),
  );
}

export function calculateAngleDeg(
  first: NormalizedLandmarkLike,
  vertex: NormalizedLandmarkLike,
  third: NormalizedLandmarkLike,
): number | null {
  const ax = first.x - vertex.x;
  const ay = first.y - vertex.y;
  const bx = third.x - vertex.x;
  const by = third.y - vertex.y;
  const magnitudeA = Math.hypot(ax, ay);
  const magnitudeB = Math.hypot(bx, by);
  if (magnitudeA === 0 || magnitudeB === 0) return null;
  const cosine = Math.max(
    -1,
    Math.min(1, (ax * bx + ay * by) / (magnitudeA * magnitudeB)),
  );
  return (Math.acos(cosine) * 180) / Math.PI;
}

export function selectKneeSide(
  landmarks: readonly NormalizedLandmarkLike[],
): SideSelection | null {
  const candidates: SideSelection[] = [];
  for (const side of ["left", "right"] as const) {
    const triplet = tripletFor(landmarks, side);
    if (triplet) {
      candidates.push({ side, triplet, visibility: tripletVisibility(triplet) });
    }
  }
  return candidates.sort((a, b) => b.visibility - a.visibility)[0] ?? null;
}

