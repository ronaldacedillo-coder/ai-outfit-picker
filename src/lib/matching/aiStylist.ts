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

// Caps how long this page will ever wait on a single candidate's AI
// explanation. Without this, a candidate whose call falls through several
// exhausted/rate-limited fallback keys (see FallbackAIProvider) can still
// take tens of seconds per key it walks through -- comfortably enough,
// across a chain of keys, to blow past the outfit-picker page's own
// serverless/edge execution budget and crash the whole request with "the
// edge function timed out" instead of just losing the AI-written
// explanation for that one candidate. Root-caused directly against a real
// production failure: the primary key and four of five fallbacks were
// daily-quota-exhausted, and the remaining working key was still getting
// hit by a burst of concurrent requests (see topK below).
//
// 12s comfortably covers a normal single Gemini round-trip (observed
// ~4s when a key is healthy) plus its own request-level retry, while
// staying well under the page's total time budget alongside its other
// (much faster, sub-second) Supabase calls.
const AI_EXPLANATION_TIMEOUT_MS = 12_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
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
        const result = await withTimeout(
          ai.explainOutfitMatch({
            items: c.garments.map((g) => ({ name: `${g.primaryColor} ${g.subcategory}`, role: g.role })),
            scoreBreakdown: {
              color: c.scoreBreakdown.color,
              formality: c.scoreBreakdown.formality,
              style: c.scoreBreakdown.style,
              pattern: c.scoreBreakdown.pattern,
            },
          }),
          AI_EXPLANATION_TIMEOUT_MS
        );
        return { ...c, explanation: result.explanation, conflicts: result.conflicts };
      } catch {
        return { ...c, explanation: deterministicExplanation(c), conflicts: [] };
      }
    })
  );

  const restExplained = rest.map((c) => ({ ...c, explanation: deterministicExplanation(c), conflicts: [] }));
  return [...explained, ...restExplained];
}
