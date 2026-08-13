import type { AIProvider } from "@/lib/providers/types";
import type { OutfitCandidate } from "./types";

export interface ExplainedOutfitCandidate extends OutfitCandidate {
  explanation: string;
  conflicts: string[];
}

function deterministicExplanation(candidate: OutfitCandidate): string {
  const { score } = candidate;
  if (score >= 85) return "A well-balanced combination across color and formality.";
  if (score >= 70) return "A solid combination with good overall coordination.";
  return "A workable combination, though not the strongest pairing in your wardrobe.";
}

export async function explainCandidates(
  candidates: OutfitCandidate[],
  ai: AIProvider | undefined,
  topK = 5
): Promise<ExplainedOutfitCandidate[]> {
  const toExplain = candidates.slice(0, topK);
  const rest = candidates.slice(topK);

  const explained = await Promise.all(
    toExplain.map(async (c) => {
      if (!ai) {
        return { ...c, explanation: deterministicExplanation(c), conflicts: [] };
      }
      try {
        const result = await ai.explainOutfitMatch({
          items: c.garments.map((g) => ({ name: `${g.primaryColor} ${g.subcategory}`, role: g.role })),
          scoreBreakdown: {
            color: c.scoreBreakdown.color,
            formality: c.scoreBreakdown.formality,
            style: c.scoreBreakdown.style,
            pattern: c.scoreBreakdown.pattern,
          },
        });
        return { ...c, explanation: result.explanation, conflicts: result.conflicts };
      } catch {
        return { ...c, explanation: deterministicExplanation(c), conflicts: [] };
      }
    })
  );

  const restExplained = rest.map((c) => ({ ...c, explanation: deterministicExplanation(c), conflicts: [] }));
  return [...explained, ...restExplained];
}
