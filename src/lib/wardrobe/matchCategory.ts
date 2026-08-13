export interface CategoryOption {
  id: number;
  name: string;
}

export interface SubcategoryOption {
  id: number;
  categoryId: number;
  name: string;
}

const SUBCATEGORY_MATCH_THRESHOLD = 0.5;

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

// Loose token equality: handles simple inflection differences (e.g.
// "sleeve" vs "sleeved") without a full stemmer, by treating the shorter
// token as a match if it's a prefix of the longer one.
function tokensLooselyMatch(a: string, b: string): boolean {
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
  return shorter.length >= 3 && longer.startsWith(shorter);
}

function subcategoryScore(subcategoryName: string, aiText: string): number {
  const nameTokens = tokenize(subcategoryName.replace(/_/g, " "));
  const textTokens = tokenize(aiText);
  if (nameTokens.length === 0) return 0;
  const matched = nameTokens.filter((nt) => textTokens.some((tt) => tokensLooselyMatch(nt, tt)));
  return matched.length / nameTokens.length;
}

export function matchSubcategory(
  categories: CategoryOption[],
  subcategories: SubcategoryOption[],
  aiCategory: string,
  aiSubcategory: string
): { categoryId: number; subcategoryId: number } | null {
  let best: { subcategory: SubcategoryOption; score: number } | null = null;
  for (const sub of subcategories) {
    const score = subcategoryScore(sub.name, aiSubcategory);
    if (!best || score > best.score) {
      best = { subcategory: sub, score };
    }
  }
  if (best && best.score >= SUBCATEGORY_MATCH_THRESHOLD) {
    return { categoryId: best.subcategory.categoryId, subcategoryId: best.subcategory.id };
  }

  const normalizedCat = tokenize(aiCategory).join("");
  const byCategory = categories.find((c) => tokenize(c.name).join("") === normalizedCat);
  if (byCategory) {
    const firstSub = subcategories.find((s) => s.categoryId === byCategory.id);
    if (firstSub) {
      return { categoryId: byCategory.id, subcategoryId: firstSub.id };
    }
  }

  return null;
}
