import { colorCompatibilityScore } from "./colorCompatibility";
import { formalityScore, styleScore, patternScore, silhouetteScore } from "./compatibilityRules";
import type { CandidateGarment, OutfitCandidate, ScoreBreakdown } from "./types";

// Documented weights (see design spec section 3): color matters most visually,
// formality next, then style (deliberately correlated with formality in
// today's data -- see spec), pattern, then silhouette (often unavailable).
const WEIGHTS = { color: 30, formality: 25, style: 20, pattern: 15, silhouette: 10 };

function pairwiseAverage(garments: CandidateGarment[], fn: (a: CandidateGarment, b: CandidateGarment) => number): number {
  let total = 0;
  let count = 0;
  for (let i = 0; i < garments.length; i++) {
    for (let j = i + 1; j < garments.length; j++) {
      total += fn(garments[i], garments[j]);
      count++;
    }
  }
  return count === 0 ? 100 : total / count;
}

export function scoreOutfitCandidate(garments: CandidateGarment[]): OutfitCandidate {
  const color = pairwiseAverage(garments, (a, b) => colorCompatibilityScore(a.primaryColor, b.primaryColor));
  const formality = pairwiseAverage(garments, (a, b) => formalityScore(a.formalityLevel, b.formalityLevel));
  const style = pairwiseAverage(garments, (a, b) => styleScore(a.style, b.style));
  const pattern = pairwiseAverage(garments, (a, b) => patternScore(a.pattern, b.pattern));

  const silhouetteValues = garments
    .map((g) => g.visualDetails?.silhouette)
    .filter((v): v is string => Boolean(v));
  const silhouette =
    silhouetteValues.length >= 2
      ? pairwiseAverage(garments, (a, b) =>
          silhouetteScore(a.visualDetails?.silhouette, b.visualDetails?.silhouette) ?? 100
        )
      : null;

  const activeWeights = { ...WEIGHTS };
  if (silhouette === null) {
    // Redistribute the silhouette weight proportionally across the rest
    // rather than penalizing candidates that simply lack the data.
    const redistribute = activeWeights.silhouette;
    const remainingTotal = activeWeights.color + activeWeights.formality + activeWeights.style + activeWeights.pattern;
    activeWeights.color += (activeWeights.color / remainingTotal) * redistribute;
    activeWeights.formality += (activeWeights.formality / remainingTotal) * redistribute;
    activeWeights.style += (activeWeights.style / remainingTotal) * redistribute;
    activeWeights.pattern += (activeWeights.pattern / remainingTotal) * redistribute;
    activeWeights.silhouette = 0;
  }

  const totalWeight = Object.values(activeWeights).reduce((a, b) => a + b, 0);
  const score =
    (color * activeWeights.color +
      formality * activeWeights.formality +
      style * activeWeights.style +
      pattern * activeWeights.pattern +
      (silhouette ?? 0) * activeWeights.silhouette) /
    totalWeight;

  const scoreBreakdown: ScoreBreakdown = { color, formality, style, pattern, silhouette };

  return { garments, score: Math.round(Math.min(100, Math.max(0, score))), scoreBreakdown };
}
