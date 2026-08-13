# Wardrobe Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the full wardrobe-upload milestone — photo upload (single/multi) → client-side validation/resize/compression → Gemini clothing classification → user review/edit → save → My Wardrobe grid with view/edit/delete/filter — for the AI Outfit Picker app.

**Architecture:** Next.js Server Actions (dependency-injectable for testing, matching the project's existing action pattern) call two swappable providers — `AIProvider` (Gemini) and `StorageProvider` (Supabase Storage) — behind the interfaces already stubbed in `src/lib/providers/types.ts`. AI output is validated with zod before it ever reaches the client or the database; the review screen is the only path that writes to `clothing_items`, so unreviewed AI output is never persisted.

**Tech Stack:** Next.js 16 (App Router, Server Actions), Supabase (Postgres + Auth + Storage), `@google/genai` (Gemini 2.5 Flash), `zod`, Vitest.

## Global Constraints

- No new paid dependency. Gemini 2.5 Flash (stable free tier: 250 req/day, 10 RPM) — not Gemini 3 Flash (preview-only, tighter limits).
- Supabase Storage for this milestone (private bucket), not Cloudflare R2 — behind `StorageProvider` so the swap stays cheap later.
- Background removal is explicitly deferred — do not add it in this plan.
- The image is uploaded to Storage exactly once per item; Save never re-uploads.
- AI is optional everywhere: Gemini failure/timeout/quota/invalid-JSON must never block save — the review screen always accepts manual input.
- Bucket stays private; every Storage and DB path is scoped to `auth.uid()` and verified by an RLS-isolation test using two real test users.
- `GEMINI_API_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are server-side-only secrets (never `NEXT_PUBLIC_`-prefixed).
- Full spec: `docs/superpowers/specs/2026-08-13-wardrobe-core-design.md`.

---

## File Structure

**New files:**
- `src/lib/validation/clothing.ts` — zod schemas (`clothingAnalysisSchema`, `clothingItemInputSchema`)
- `src/lib/image/validate.ts` — pure file validation
- `src/lib/image/dimensions.ts` — pure resize-target math
- `src/lib/image/process.ts` — browser canvas resize/compress (uses `dimensions.ts`)
- `src/lib/wardrobe/matchCategory.ts` — fuzzy-matches Gemini's free-text category/subcategory against DB-seeded rows
- `src/lib/wardrobe/types.ts` — `ClothingItemRow` (a saved item, joined + signed-URL-resolved, for display)
- `src/lib/providers/supabase-storage.ts` — `SupabaseStorageProvider`
- `src/lib/providers/gemini.ts` — `GeminiAIProvider`
- `src/lib/providers/index.ts` — `getAIProvider()` / `getStorageProvider()` factory
- `src/app/dashboard/actions.ts` — all server actions for this milestone
- `src/components/wardrobe/ReviewForm.tsx` — shared editable form (used by both review and edit)
- `src/components/wardrobe/UploadItemCard.tsx` — per-file upload/analyze/review state machine
- `src/components/wardrobe/UploadPanel.tsx` — multi-file picker, renders a list of `UploadItemCard`
- `src/components/wardrobe/ClothingCard.tsx` — a saved item's grid card
- `src/components/wardrobe/EditItemDialog.tsx` — wraps `ReviewForm` for editing a saved item
- `src/components/wardrobe/WardrobeGrid.tsx` — grid + filters + edit dialog host
- `supabase/migrations/0001_clothing_photos_storage.sql`
- `vitest.config.ts`, `tests/setup.ts`
- `tests/integration/helpers/supabaseAdmin.ts`, `supabaseAnon.ts`, `testUser.ts`
- `tests/unit/image-validate.test.ts`, `tests/unit/image-dimensions.test.ts`, `tests/unit/clothing-validation.test.ts`, `tests/unit/match-category.test.ts`
- `tests/integration/storage-provider.test.ts`, `tests/integration/clothing-items-actions.test.ts`, `tests/integration/rls-isolation.test.ts`

**Modified files:**
- `src/lib/providers/types.ts` — add `getSignedUrl` to `StorageProvider`
- `src/app/dashboard/page.tsx` — rewritten to fetch data and render the upload/grid UI
- `package.json` — add `zod`, `@google/genai`, `vitest`, `dotenv`, `test` script

**Interfaces used across tasks:**
```ts
// src/lib/validation/clothing.ts
export type ClothingAnalysisInput = { category: string; subcategory: string; primaryColor: string; primaryColorHex?: string; secondaryColors: string[]; pattern: "solid"|"striped"|"checked"|"plaid"|"printed"|"textured"|"other"; style: "business_formal"|"business_casual"|"smart_casual"|"casual"; formalityLevel: number; description: string; visualDetails?: Record<string,string>; };
export type ClothingItemInput = { categoryId: number; subcategoryId: number; imagePath: string; name?: string; primaryColor: string; primaryColorHex?: string; secondaryColors: string[]; pattern: ClothingAnalysisInput["pattern"]; style: ClothingAnalysisInput["style"]; formalityLevel: number; description: string; aiAnalysis?: unknown; userEdited: boolean; };

// src/lib/wardrobe/matchCategory.ts
export interface CategoryOption { id: number; name: string; }
export interface SubcategoryOption { id: number; categoryId: number; name: string; }
export function matchSubcategory(categories: CategoryOption[], subcategories: SubcategoryOption[], aiCategory: string, aiSubcategory: string): { categoryId: number; subcategoryId: number } | null;

// src/lib/providers/types.ts (StorageProvider addition)
getSignedUrl(path: string, expiresInSeconds?: number): Promise<string>;

// src/app/dashboard/actions.ts
type ActionResult<T> = { data: T } | { error: string };
uploadClothingPhoto(file: Blob, fileExt: string, injectedClient?: SupabaseClient): Promise<ActionResult<{ path: string }>>;
analyzeClothingPhoto(path: string, injectedClient?: SupabaseClient, injectedAI?: AIProvider): Promise<ActionResult<{ analysis: ClothingAnalysisInput }>>;
saveClothingItem(input: ClothingItemInput, injectedClient?: SupabaseClient): Promise<ActionResult<{ id: string }>>;
updateClothingItem(id: string, input: ClothingItemInput, injectedClient?: SupabaseClient): Promise<ActionResult<{ id: string }>>;
deleteClothingItem(id: string, injectedClient?: SupabaseClient): Promise<ActionResult<{ id: string }>>;
cancelClothingUpload(path: string, injectedClient?: SupabaseClient): Promise<void>;
```

---

### Task 1: Dependencies and test harness

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`, `tests/setup.ts`, `tests/unit/smoke.test.ts`

**Interfaces:** none consumed. Produces: a working `npm test`.

- [ ] **Step 1: Install dependencies**

```bash
npm install zod @google/genai
npm install -D vitest dotenv
```

- [ ] **Step 2: Add the test script**

In `package.json`, inside `"scripts"`, add:
```json
"test": "vitest run"
```

- [ ] **Step 3: Create the Vitest config**

Note: this project's directory name contains a space ("Ai Outfit
Picker"). `URL.pathname` percent-encodes spaces to `%20`, which silently
breaks the `@/` alias — use `fileURLToPath` instead so the real path
(with an actual space character) is used.

```ts
// vitest.config.ts
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    setupFiles: ["./tests/setup.ts"],
    testTimeout: 20000,
  },
});
```

(`testTimeout` is raised from Vitest's 5s default — integration tests make several real round-trips to Supabase (`createTestUser` alone does an admin create + a sign-in), which routinely exceeds 5s.)

- [ ] **Step 4: Create the test setup file**

```ts
// tests/setup.ts
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
```

- [ ] **Step 5: Write and run a smoke test**

```ts
// tests/unit/smoke.test.ts
import { describe, it, expect } from "vitest";

describe("test harness", () => {
  it("runs", () => {
    expect(1 + 1).toBe(2);
  });
});
```

Run: `npm test`
Expected: 1 passed.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json vitest.config.ts tests/setup.ts tests/unit/smoke.test.ts
git commit -m "chore: add zod, Gemini SDK, and Vitest test harness"
```

---

### Task 2: Image validation and resize-target math (pure, unit-tested)

**Files:**
- Create: `src/lib/image/validate.ts`, `src/lib/image/dimensions.ts`
- Test: `tests/unit/image-validate.test.ts`, `tests/unit/image-dimensions.test.ts`

**Interfaces:**
- Produces: `validateImageFile(file: File): { valid: true } | { valid: false; error: string }`
- Produces: `computeTargetDimensions(width: number, height: number, maxDimension: number): { width: number; height: number }`

- [ ] **Step 1: Write the failing tests**

```ts
// tests/unit/image-validate.test.ts
import { describe, it, expect } from "vitest";
import { validateImageFile } from "@/lib/image/validate";

function makeFile(type: string, sizeBytes: number): File {
  return new File([new Uint8Array(sizeBytes)], "photo", { type });
}

describe("validateImageFile", () => {
  it("accepts a jpeg under the size limit", () => {
    expect(validateImageFile(makeFile("image/jpeg", 1024))).toEqual({ valid: true });
  });

  it("accepts png and webp", () => {
    expect(validateImageFile(makeFile("image/png", 1024)).valid).toBe(true);
    expect(validateImageFile(makeFile("image/webp", 1024)).valid).toBe(true);
  });

  it("rejects an unsupported type", () => {
    const result = validateImageFile(makeFile("image/gif", 1024));
    expect(result.valid).toBe(false);
  });

  it("rejects a file over 10MB", () => {
    const result = validateImageFile(makeFile("image/jpeg", 11 * 1024 * 1024));
    expect(result.valid).toBe(false);
  });

  it("rejects an empty file", () => {
    const result = validateImageFile(makeFile("image/jpeg", 0));
    expect(result.valid).toBe(false);
  });
});
```

```ts
// tests/unit/image-dimensions.test.ts
import { describe, it, expect } from "vitest";
import { computeTargetDimensions } from "@/lib/image/dimensions";

describe("computeTargetDimensions", () => {
  it("leaves an image under the max unchanged", () => {
    expect(computeTargetDimensions(800, 600, 1600)).toEqual({ width: 800, height: 600 });
  });

  it("scales down a wide image, preserving aspect ratio", () => {
    expect(computeTargetDimensions(3200, 1600, 1600)).toEqual({ width: 1600, height: 800 });
  });

  it("scales down a tall image, preserving aspect ratio", () => {
    expect(computeTargetDimensions(1200, 4000, 1600)).toEqual({ width: 480, height: 1600 });
  });

  it("handles a square image exactly at the max", () => {
    expect(computeTargetDimensions(1600, 1600, 1600)).toEqual({ width: 1600, height: 1600 });
  });
});
```

- [ ] **Step 2: Run and verify failure**

Run: `npm test -- image-validate image-dimensions`
Expected: FAIL — modules don't exist yet.

- [ ] **Step 3: Implement**

```ts
// src/lib/image/validate.ts
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_RAW_BYTES = 10 * 1024 * 1024;

export function validateImageFile(file: File): { valid: true } | { valid: false; error: string } {
  if (!ACCEPTED_TYPES.includes(file.type)) {
    return { valid: false, error: "Please upload a JPEG, PNG, or WebP photo." };
  }
  if (file.size === 0) {
    return { valid: false, error: "That file appears to be empty." };
  }
  if (file.size > MAX_RAW_BYTES) {
    return { valid: false, error: "Photo is too large — please use an image under 10MB." };
  }
  return { valid: true };
}
```

```ts
// src/lib/image/dimensions.ts
export function computeTargetDimensions(
  width: number,
  height: number,
  maxDimension: number
): { width: number; height: number } {
  if (width <= maxDimension && height <= maxDimension) {
    return { width, height };
  }
  const scale = width >= height ? maxDimension / width : maxDimension / height;
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}
```

- [ ] **Step 4: Run and verify pass**

Run: `npm test -- image-validate image-dimensions`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/image tests/unit/image-validate.test.ts tests/unit/image-dimensions.test.ts
git commit -m "feat: add pure image validation and resize-target math"
```

---

### Task 3: Clothing validation schemas (zod, unit-tested)

**Files:**
- Create: `src/lib/validation/clothing.ts`
- Test: `tests/unit/clothing-validation.test.ts`

**Interfaces:** Produces `clothingAnalysisSchema`, `clothingItemInputSchema` and their inferred types (see File Structure section).

- [ ] **Step 1: Write the failing tests**

```ts
// tests/unit/clothing-validation.test.ts
import { describe, it, expect } from "vitest";
import { clothingAnalysisSchema, clothingItemInputSchema } from "@/lib/validation/clothing";

const validAnalysis = {
  category: "top",
  subcategory: "long_sleeve_shirt",
  primaryColor: "light blue",
  primaryColorHex: "#a8c8e8",
  secondaryColors: ["white"],
  pattern: "solid",
  style: "business_formal",
  formalityLevel: 4,
  description: "Light blue long-sleeved business shirt.",
  visualDetails: { collar: "spread" },
};

describe("clothingAnalysisSchema", () => {
  it("accepts a valid Gemini response", () => {
    expect(clothingAnalysisSchema.safeParse(validAnalysis).success).toBe(true);
  });

  it("rejects a pattern outside the allowed enum", () => {
    const result = clothingAnalysisSchema.safeParse({ ...validAnalysis, pattern: "sparkly" });
    expect(result.success).toBe(false);
  });

  it("rejects formalityLevel outside 1-5", () => {
    const result = clothingAnalysisSchema.safeParse({ ...validAnalysis, formalityLevel: 9 });
    expect(result.success).toBe(false);
  });

  it("rejects a missing required field", () => {
    const { description, ...rest } = validAnalysis;
    void description;
    expect(clothingAnalysisSchema.safeParse(rest).success).toBe(false);
  });

  it("defaults secondaryColors to an empty array when omitted", () => {
    const { secondaryColors, ...rest } = validAnalysis;
    void secondaryColors;
    const result = clothingAnalysisSchema.safeParse(rest);
    expect(result.success && result.data.secondaryColors).toEqual([]);
  });
});

describe("clothingItemInputSchema", () => {
  const validInput = {
    categoryId: 1,
    subcategoryId: 1,
    imagePath: "user-id/uuid.jpg",
    primaryColor: "light blue",
    secondaryColors: [],
    pattern: "solid",
    style: "business_formal",
    formalityLevel: 4,
    description: "Light blue shirt.",
    userEdited: true,
  };

  it("accepts a valid save payload", () => {
    expect(clothingItemInputSchema.safeParse(validInput).success).toBe(true);
  });

  it("rejects a non-positive categoryId", () => {
    expect(clothingItemInputSchema.safeParse({ ...validInput, categoryId: 0 }).success).toBe(false);
  });

  it("rejects a missing imagePath", () => {
    const { imagePath, ...rest } = validInput;
    void imagePath;
    expect(clothingItemInputSchema.safeParse(rest).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run and verify failure**

Run: `npm test -- clothing-validation`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement**

```ts
// src/lib/validation/clothing.ts
import { z } from "zod";

const patternEnum = z.enum(["solid", "striped", "checked", "plaid", "printed", "textured", "other"]);
const styleEnum = z.enum(["business_formal", "business_casual", "smart_casual", "casual"]);
const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const clothingAnalysisSchema = z.object({
  category: z.string().min(1).max(100),
  subcategory: z.string().min(1).max(100),
  primaryColor: z.string().min(1).max(100),
  primaryColorHex: hexColor.optional(),
  secondaryColors: z.array(z.string().min(1).max(100)).max(5).default([]),
  pattern: patternEnum,
  style: styleEnum,
  formalityLevel: z.number().int().min(1).max(5),
  description: z.string().min(1).max(500),
  visualDetails: z.record(z.string(), z.string()).optional(),
});
export type ClothingAnalysisInput = z.infer<typeof clothingAnalysisSchema>;

export const clothingItemInputSchema = z.object({
  categoryId: z.number().int().positive(),
  subcategoryId: z.number().int().positive(),
  imagePath: z.string().min(1),
  name: z.string().max(120).optional(),
  primaryColor: z.string().min(1).max(100),
  primaryColorHex: hexColor.optional(),
  secondaryColors: z.array(z.string().min(1).max(100)).max(5).default([]),
  pattern: patternEnum,
  style: styleEnum,
  formalityLevel: z.number().int().min(1).max(5),
  description: z.string().max(500).default(""),
  aiAnalysis: z.unknown().optional(),
  userEdited: z.boolean(),
});
export type ClothingItemInput = z.infer<typeof clothingItemInputSchema>;
```

- [ ] **Step 4: Run and verify pass**

Run: `npm test -- clothing-validation`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/validation/clothing.ts tests/unit/clothing-validation.test.ts
git commit -m "feat: add zod schemas for AI analysis and clothing item input"
```

---

### Task 4: Category matching (pure, unit-tested)

**Files:**
- Create: `src/lib/wardrobe/matchCategory.ts`
- Test: `tests/unit/match-category.test.ts`

**Interfaces:** Produces `CategoryOption`, `SubcategoryOption`, `matchSubcategory` (see File Structure section).

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/match-category.test.ts
import { describe, it, expect } from "vitest";
import { matchSubcategory, type CategoryOption, type SubcategoryOption } from "@/lib/wardrobe/matchCategory";

const categories: CategoryOption[] = [
  { id: 1, name: "top" },
  { id: 2, name: "bottom" },
  { id: 3, name: "outerwear" },
];
const subcategories: SubcategoryOption[] = [
  { id: 1, categoryId: 1, name: "long_sleeve_shirt" },
  { id: 2, categoryId: 1, name: "short_sleeve_shirt" },
  { id: 3, categoryId: 1, name: "polo_shirt" },
  { id: 4, categoryId: 2, name: "pants" },
  { id: 5, categoryId: 3, name: "business_jacket" },
];

describe("matchSubcategory", () => {
  it("matches an exact slug", () => {
    expect(matchSubcategory(categories, subcategories, "top", "long_sleeve_shirt")).toEqual({
      categoryId: 1,
      subcategoryId: 1,
    });
  });

  it("matches a human-readable variant with different casing/spacing", () => {
    expect(matchSubcategory(categories, subcategories, "Top", "Long-Sleeved Shirt")).toEqual({
      categoryId: 1,
      subcategoryId: 1,
    });
  });

  it("matches polo shirt loosely", () => {
    expect(matchSubcategory(categories, subcategories, "top", "Polo")?.subcategoryId).toBe(3);
  });

  it("falls back to the first subcategory in a matched category when the subcategory text doesn't match", () => {
    expect(matchSubcategory(categories, subcategories, "bottom", "chinos")).toEqual({
      categoryId: 2,
      subcategoryId: 4,
    });
  });

  it("returns null when nothing matches", () => {
    expect(matchSubcategory(categories, subcategories, "footwear", "sneakers")).toBeNull();
  });
});
```

- [ ] **Step 2: Run and verify failure**

Run: `npm test -- match-category`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement**

Note: a naive normalize-and-substring match fails a real case ("Long-Sleeved
Shirt" vs. seeded `long_sleeve_shirt` — "sleeved" is not a substring of
"sleeve" or vice versa). Use per-token loose matching (prefix-based, to
absorb simple inflections) with a match-fraction threshold instead:

```ts
// src/lib/wardrobe/matchCategory.ts
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
```

- [ ] **Step 4: Run and verify pass**

Run: `npm test -- match-category`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/wardrobe/matchCategory.ts tests/unit/match-category.test.ts
git commit -m "feat: add fuzzy matching from AI category text to DB-seeded rows"
```

---

### Task 5: Storage bucket + RLS migration

**Files:**
- Create: `supabase/migrations/0001_clothing_photos_storage.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/0001_clothing_photos_storage.sql
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('clothing-photos', 'clothing-photos', false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "users can read own clothing photos"
on storage.objects for select
to authenticated
using (bucket_id = 'clothing-photos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "users can upload own clothing photos"
on storage.objects for insert
to authenticated
with check (bucket_id = 'clothing-photos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "users can delete own clothing photos"
on storage.objects for delete
to authenticated
using (bucket_id = 'clothing-photos' and (storage.foldername(name))[1] = auth.uid()::text);
```

- [ ] **Step 2: Apply the migration**

Apply this SQL to the `ai-outfit-picker` Supabase project (ref `ptdqnotoxaszbirwfijo`) via the Supabase MCP `apply_migration` tool (name: `clothing_photos_storage`), so it's tracked in the project's migration history.

- [ ] **Step 3: Verify**

Run this query via the Supabase MCP `execute_sql` tool and confirm one row comes back with `public = false`:
```sql
select id, public, file_size_limit, allowed_mime_types from storage.buckets where id = 'clothing-photos';
```
Then confirm three policies exist:
```sql
select policyname, cmd from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like '%clothing photos%';
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0001_clothing_photos_storage.sql
git commit -m "feat: add private clothing-photos storage bucket with per-user RLS"
```

---

### Task 6: StorageProvider interface update + Supabase implementation

**Files:**
- Modify: `src/lib/providers/types.ts`
- Create: `src/lib/providers/supabase-storage.ts`
- Test: `tests/integration/helpers/supabaseAdmin.ts`, `tests/integration/helpers/supabaseAnon.ts`, `tests/integration/helpers/testUser.ts`, `tests/integration/storage-provider.test.ts`

**Interfaces:**
- Consumes: none (this is the base provider layer)
- Produces: `SupabaseStorageProvider implements StorageProvider`, `createTestUser()` helper used by all later integration tests

**Prerequisite:** `SUPABASE_SERVICE_ROLE_KEY` must be present in `.env.local` (see spec section 8 for how to obtain it) — this task's tests will fail without it.

- [ ] **Step 1: Add `getSignedUrl` to the interface**

In `src/lib/providers/types.ts`, replace the `StorageProvider` interface:

```ts
/**
 * File storage provider (MVP default: Supabase Storage, private bucket).
 *
 * `uploadImage`'s returned `url` is the storage object PATH, not a
 * directly-fetchable URL — the bucket is private. Callers resolve a
 * short-lived renderable URL via `getSignedUrl`.
 */
export interface StorageProvider {
  uploadImage(input: { userId: string; file: Blob; path: string }): Promise<{ url: string }>;
  deleteImage(path: string): Promise<void>;
  getSignedUrl(path: string, expiresInSeconds?: number): Promise<string>;
}
```

- [ ] **Step 2: Write the test helpers**

```ts
// tests/integration/helpers/supabaseAdmin.ts
import { createClient } from "@supabase/supabase-js";

export function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
```

```ts
// tests/integration/helpers/supabaseAnon.ts
import { createClient } from "@supabase/supabase-js";

export function supabaseAnon() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
```

```ts
// tests/integration/helpers/testUser.ts
import { randomUUID } from "crypto";
import { supabaseAdmin } from "./supabaseAdmin";
import { supabaseAnon } from "./supabaseAnon";

export async function createTestUser() {
  const admin = supabaseAdmin();
  const email = `test-${randomUUID()}@example.com`;
  const password = "test-password-123!";

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) {
    throw new Error(`Could not create test user: ${error?.message}`);
  }

  const client = supabaseAnon();
  const { error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) {
    throw new Error(`Could not sign in test user: ${signInError.message}`);
  }

  return {
    id: data.user.id,
    client,
    async cleanup() {
      await admin.auth.admin.deleteUser(data.user.id);
    },
  };
}
```

- [ ] **Step 3: Write the failing test**

```ts
// tests/integration/storage-provider.test.ts
import { describe, it, expect } from "vitest";
import { createTestUser } from "./helpers/testUser";
import { SupabaseStorageProvider } from "@/lib/providers/supabase-storage";

describe("SupabaseStorageProvider", () => {
  it("uploads, signs, and deletes an image scoped to the user's folder", async () => {
    const user = await createTestUser();
    const provider = new SupabaseStorageProvider(user.client);
    const path = `${user.id}/test.jpg`;
    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: "image/jpeg" });

    const uploadResult = await provider.uploadImage({ userId: user.id, file: blob, path });
    expect(uploadResult.url).toBe(path);

    const signedUrl = await provider.getSignedUrl(path);
    expect(signedUrl).toContain("clothing-photos");

    const fetchResponse = await fetch(signedUrl);
    expect(fetchResponse.ok).toBe(true);

    await provider.deleteImage(path);
    await user.cleanup();
  });
});
```

- [ ] **Step 4: Run and verify failure**

Run: `npm test -- storage-provider`
Expected: FAIL — `SupabaseStorageProvider` doesn't exist.

- [ ] **Step 5: Implement**

```ts
// src/lib/providers/supabase-storage.ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { StorageProvider } from "./types";

const BUCKET = "clothing-photos";

export class SupabaseStorageProvider implements StorageProvider {
  constructor(private readonly supabase: SupabaseClient) {}

  async uploadImage(input: { userId: string; file: Blob; path: string }): Promise<{ url: string }> {
    const { error } = await this.supabase.storage.from(BUCKET).upload(input.path, input.file, {
      contentType: input.file.type || "image/jpeg",
      upsert: false,
    });
    if (error) {
      throw new Error(`Storage upload failed: ${error.message}`);
    }
    return { url: input.path };
  }

  async deleteImage(path: string): Promise<void> {
    const { error } = await this.supabase.storage.from(BUCKET).remove([path]);
    if (error) {
      throw new Error(`Storage delete failed: ${error.message}`);
    }
  }

  async getSignedUrl(path: string, expiresInSeconds = 3600): Promise<string> {
    const { data, error } = await this.supabase.storage
      .from(BUCKET)
      .createSignedUrl(path, expiresInSeconds);
    if (error || !data) {
      throw new Error(`Could not create signed URL: ${error?.message}`);
    }
    return data.signedUrl;
  }
}
```

- [ ] **Step 6: Run and verify pass**

Run: `npm test -- storage-provider`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/providers/types.ts src/lib/providers/supabase-storage.ts tests/integration
git commit -m "feat: implement SupabaseStorageProvider with signed-URL support"
```

---

### Task 7: RLS isolation test (Storage)

**Files:**
- Test: `tests/integration/rls-isolation.test.ts` (Storage part — DB part added in Task 9)

**Interfaces:** Consumes `createTestUser`, `SupabaseStorageProvider`.

- [ ] **Step 1: Write and run the test**

```ts
// tests/integration/rls-isolation.test.ts
import { describe, it, expect } from "vitest";
import { createTestUser } from "./helpers/testUser";
import { SupabaseStorageProvider } from "@/lib/providers/supabase-storage";

describe("RLS isolation between users", () => {
  it("user A cannot write into user B's storage folder", async () => {
    const userA = await createTestUser();
    const userB = await createTestUser();
    const providerAsA = new SupabaseStorageProvider(userA.client);
    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: "image/jpeg" });

    await expect(
      providerAsA.uploadImage({ userId: userA.id, file: blob, path: `${userB.id}/intrusion.jpg` })
    ).rejects.toThrow();

    await userA.cleanup();
    await userB.cleanup();
  });

  it("user A cannot read a signed URL for user B's photo without permission", async () => {
    const userA = await createTestUser();
    const userB = await createTestUser();
    const providerAsB = new SupabaseStorageProvider(userB.client);
    const providerAsA = new SupabaseStorageProvider(userA.client);
    const path = `${userB.id}/private.jpg`;
    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: "image/jpeg" });

    await providerAsB.uploadImage({ userId: userB.id, file: blob, path });

    // createSignedUrl itself is RLS-gated on the SELECT policy — user A's
    // client cannot mint a signed URL for an object outside their folder.
    await expect(providerAsA.getSignedUrl(path)).rejects.toThrow();

    await providerAsB.deleteImage(path);
    await userA.cleanup();
    await userB.cleanup();
  });
});
```

Run: `npm test -- rls-isolation`
Expected: PASS (both tests pass because the Task 5 migration's RLS policies are already applied).

- [ ] **Step 2: Commit**

```bash
git add tests/integration/rls-isolation.test.ts
git commit -m "test: verify storage RLS isolation between users"
```

---

### Task 8: GeminiAIProvider

**Files:**
- Create: `src/lib/providers/gemini.ts`
- Test: `tests/unit/gemini-provider.test.ts` (parse/validate glue, mocked — no real network call)

**Interfaces:**
- Consumes: `clothingAnalysisSchema` (Task 3)
- Produces: `GeminiAIProvider implements AIProvider`

- [ ] **Step 1: Write the failing test (mocks the SDK, tests the parse/validate wrapper)**

```ts
// tests/unit/gemini-provider.test.ts
import { describe, it, expect, vi } from "vitest";

const validJson = JSON.stringify({
  category: "top",
  subcategory: "long_sleeve_shirt",
  primaryColor: "light blue",
  secondaryColors: [],
  pattern: "solid",
  style: "business_formal",
  formalityLevel: 4,
  description: "Light blue long-sleeved business shirt.",
});

// Vitest requires the mocked implementation to be a `function`/`class`
// (not an arrow function) to support `new` invocation -- an arrow-function
// implementation throws "is not a constructor" and Vitest logs a warning
// pointing at this exact requirement.
vi.mock("@google/genai", () => ({
  GoogleGenAI: vi.fn().mockImplementation(function () {
    return {
      models: {
        generateContent: vi.fn().mockResolvedValue({ text: validJson }),
      },
    };
  }),
}));

// Minimal fetch stub so the provider's internal `fetch(imageUrl)` resolves.
global.fetch = vi.fn().mockResolvedValue({
  ok: true,
  headers: new Headers({ "content-type": "image/jpeg" }),
  arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
}) as unknown as typeof fetch;

describe("GeminiAIProvider", () => {
  it("returns a validated ClothingAnalysis on a well-formed response", async () => {
    const { GeminiAIProvider } = await import("@/lib/providers/gemini");
    const provider = new GeminiAIProvider("fake-key");
    const result = await provider.analyzeClothingImage("https://example.com/photo.jpg");
    expect(result.category).toBe("top");
    expect(result.formalityLevel).toBe(4);
  });

  it("throws when Gemini returns invalid JSON", async () => {
    const { GoogleGenAI } = await import("@google/genai");
    (GoogleGenAI as unknown as ReturnType<typeof vi.fn>).mockImplementation(function () {
      return { models: { generateContent: vi.fn().mockResolvedValue({ text: "not json" }) } };
    });
    const { GeminiAIProvider } = await import("@/lib/providers/gemini");
    const provider = new GeminiAIProvider("fake-key");
    await expect(provider.analyzeClothingImage("https://example.com/photo.jpg")).rejects.toThrow();
  });

  it("throws when Gemini's JSON fails schema validation", async () => {
    const { GoogleGenAI } = await import("@google/genai");
    (GoogleGenAI as unknown as ReturnType<typeof vi.fn>).mockImplementation(function () {
      return {
        models: {
          generateContent: vi.fn().mockResolvedValue({ text: JSON.stringify({ category: "top" }) }),
        },
      };
    });
    const { GeminiAIProvider } = await import("@/lib/providers/gemini");
    const provider = new GeminiAIProvider("fake-key");
    await expect(provider.analyzeClothingImage("https://example.com/photo.jpg")).rejects.toThrow();
  });
});
```

Note: `GeminiAIProvider` itself is imported dynamically (`await import(...)`) in every test, including the first — this keeps module resolution consistent with the two tests that reassign the mock mid-test, rather than relying on static-import hoisting order.

- [ ] **Step 2: Run and verify failure**

Run: `npm test -- gemini-provider`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement**

```ts
// src/lib/providers/gemini.ts
import { GoogleGenAI } from "@google/genai";
import type { AIProvider, ClothingAnalysis } from "./types";
import { clothingAnalysisSchema } from "@/lib/validation/clothing";

// UPDATE (verified against a real key during manual end-to-end testing):
// gemini-2.5-flash and gemini-2.5-flash-lite both return a hard 404
// ("no longer available to new users") for API keys/projects created
// after Google's 2.5-generation free-tier sunset -- this is not a
// rate-limit issue, the model is simply gone for new keys. Use
// gemini-3.5-flash instead: confirmed working via direct API call, GA
// (non-preview), 1,500 req/day free tier as of Aug 2026.
const MODEL = "gemini-3.5-flash";

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    category: { type: "string" },
    subcategory: { type: "string" },
    primaryColor: { type: "string" },
    primaryColorHex: { type: "string" },
    secondaryColors: { type: "array", items: { type: "string" } },
    pattern: {
      type: "string",
      enum: ["solid", "striped", "checked", "plaid", "printed", "textured", "other"],
    },
    style: {
      type: "string",
      enum: ["business_formal", "business_casual", "smart_casual", "casual"],
    },
    formalityLevel: { type: "integer" },
    description: { type: "string" },
    visualDetails: {
      type: "object",
      properties: {
        collar: { type: "string" },
        lapel: { type: "string" },
        sleeve: { type: "string" },
        silhouette: { type: "string" },
        texture: { type: "string" },
      },
    },
  },
  required: [
    "category", "subcategory", "primaryColor", "secondaryColors",
    "pattern", "style", "formalityLevel", "description",
  ],
};

const PROMPT = `You are analyzing a single photo of one clothing item from a personal wardrobe app.
Describe only what you can actually see in the image — do not invent details you can't observe.
Return the classification as JSON matching the provided schema: overall category (e.g. "top", "bottom", "outerwear"), a specific subcategory in plain English (e.g. "long-sleeve shirt", "polo shirt", "business jacket"), the primary color, any secondary colors, the pattern, the style, a formality level from 1 (very casual) to 5 (very formal), a one-sentence description, and any visible details like collar, lapel, sleeve, silhouette, or texture.`;

export class GeminiAIProvider implements AIProvider {
  private readonly client: GoogleGenAI;

  constructor(apiKey: string) {
    this.client = new GoogleGenAI({ apiKey });
  }

  async analyzeClothingImage(imageUrl: string): Promise<ClothingAnalysis> {
    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) {
      throw new Error(`Could not fetch image for analysis (${imageResponse.status})`);
    }
    const arrayBuffer = await imageResponse.arrayBuffer();
    const base64Data = Buffer.from(arrayBuffer).toString("base64");
    const mimeType = imageResponse.headers.get("content-type") ?? "image/jpeg";

    const result = await this.client.models.generateContent({
      model: MODEL,
      contents: [
        {
          role: "user",
          parts: [{ text: PROMPT }, { inlineData: { mimeType, data: base64Data } }],
        },
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA,
      },
    });

    const raw = result.text;
    if (!raw) {
      throw new Error("Gemini returned an empty response.");
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error("Gemini returned invalid JSON.");
    }

    const validated = clothingAnalysisSchema.safeParse(parsed);
    if (!validated.success) {
      throw new Error(`Gemini response failed validation: ${validated.error.message}`);
    }
    return validated.data;
  }

  async explainOutfitMatch(): Promise<string> {
    throw new Error("explainOutfitMatch is not implemented — out of scope for the Wardrobe Core milestone.");
  }
}
```

- [ ] **Step 4: Run and verify pass**

Run: `npm test -- gemini-provider`
Expected: PASS.

- [ ] **Step 5: Add the provider factory**

```ts
// src/lib/providers/index.ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AIProvider, StorageProvider } from "./types";
import { GeminiAIProvider } from "./gemini";
import { SupabaseStorageProvider } from "./supabase-storage";

export function getAIProvider(): AIProvider {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured.");
  }
  return new GeminiAIProvider(apiKey);
}

export function getStorageProvider(supabase: SupabaseClient): StorageProvider {
  return new SupabaseStorageProvider(supabase);
}
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/providers/gemini.ts src/lib/providers/index.ts tests/unit/gemini-provider.test.ts
git commit -m "feat: implement GeminiAIProvider with schema-validated JSON output"
```

---

### Task 9: Server actions + RLS isolation (DB)

**Files:**
- Create: `src/app/dashboard/actions.ts`
- Test: `tests/integration/clothing-items-actions.test.ts`
- Modify: `tests/integration/rls-isolation.test.ts` (add the DB-isolation case)

**Interfaces:**
- Consumes: `getAIProvider`/`getStorageProvider` (Task 8), `clothingItemInputSchema` (Task 3), `createClient` from `@/lib/supabase/server`
- Produces: the six action signatures listed in the File Structure section's Interfaces block

- [ ] **Step 1: Write the failing tests**

```ts
// tests/integration/clothing-items-actions.test.ts
import { describe, it, expect } from "vitest";
import { createTestUser } from "./helpers/testUser";
import { supabaseAdmin } from "./helpers/supabaseAdmin";
import {
  uploadClothingPhoto,
  saveClothingItem,
  updateClothingItem,
  deleteClothingItem,
} from "@/app/dashboard/actions";
import type { AIProvider } from "@/lib/providers/types";

async function getFirstCategoryAndSubcategory() {
  const admin = supabaseAdmin();
  const { data: category } = await admin.from("clothing_categories").select("id").limit(1).single();
  const { data: subcategory } = await admin
    .from("clothing_subcategories")
    .select("id")
    .eq("category_id", category!.id)
    .limit(1)
    .single();
  return { categoryId: category!.id, subcategoryId: subcategory!.id };
}

describe("clothing item actions", () => {
  it("uploads a photo, saves an item, updates it, then deletes it", async () => {
    const user = await createTestUser();
    const { categoryId, subcategoryId } = await getFirstCategoryAndSubcategory();

    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: "image/jpeg" });
    const uploadResult = await uploadClothingPhoto(blob, "jpg", user.client);
    if ("error" in uploadResult) throw new Error(uploadResult.error);

    const saveResult = await saveClothingItem(
      {
        categoryId,
        subcategoryId,
        imagePath: uploadResult.data.path,
        primaryColor: "blue",
        secondaryColors: [],
        pattern: "solid",
        style: "casual",
        formalityLevel: 2,
        description: "test item",
        userEdited: true,
      },
      user.client
    );
    if ("error" in saveResult) throw new Error(saveResult.error);

    const admin = supabaseAdmin();
    const { data: saved } = await admin.from("clothing_items").select("*").eq("id", saveResult.data.id).single();
    expect(saved!.primary_color).toBe("blue");
    expect(saved!.image_url).toBe(uploadResult.data.path);

    const updateResult = await updateClothingItem(
      saveResult.data.id,
      {
        categoryId,
        subcategoryId,
        imagePath: uploadResult.data.path,
        primaryColor: "navy",
        secondaryColors: [],
        pattern: "solid",
        style: "casual",
        formalityLevel: 2,
        description: "updated",
        userEdited: true,
      },
      user.client
    );
    expect("error" in updateResult).toBe(false);

    const { data: updated } = await admin.from("clothing_items").select("primary_color").eq("id", saveResult.data.id).single();
    expect(updated!.primary_color).toBe("navy");

    const deleteResult = await deleteClothingItem(saveResult.data.id, user.client);
    expect("error" in deleteResult).toBe(false);

    const { data: gone } = await admin.from("clothing_items").select("id").eq("id", saveResult.data.id);
    expect(gone).toEqual([]);

    await user.cleanup();
  });

  it("returns a friendly error and does not throw when input is invalid", async () => {
    const user = await createTestUser();
    const result = await saveClothingItem(
      // @ts-expect-error deliberately invalid for this test
      { categoryId: -1 },
      user.client
    );
    expect("error" in result).toBe(true);
    await user.cleanup();
  });

  it("falls back to manual entry when the AI provider fails", async () => {
    const user = await createTestUser();
    const { path } = { path: `${user.id}/does-not-matter.jpg` };
    const failingProvider: AIProvider = {
      analyzeClothingImage: async () => {
        throw new Error("quota exceeded");
      },
      explainOutfitMatch: async () => "",
    };

    const { analyzeClothingPhoto } = await import("@/app/dashboard/actions");
    const result = await analyzeClothingPhoto(path, user.client, failingProvider);
    expect("error" in result).toBe(true);

    await user.cleanup();
  });
});
```

- [ ] **Step 2: Run and verify failure**

Run: `npm test -- clothing-items-actions`
Expected: FAIL — `src/app/dashboard/actions.ts` doesn't exist yet.

- [ ] **Step 3: Implement**

```ts
// src/app/dashboard/actions.ts
"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getAIProvider, getStorageProvider } from "@/lib/providers";
import type { AIProvider } from "@/lib/providers/types";
import { clothingItemInputSchema, type ClothingItemInput } from "@/lib/validation/clothing";

type ActionResult<T> = { data: T } | { error: string };

async function requireUser(supabase: SupabaseClient) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

// revalidatePath requires a live Next.js request context (an internal
// AsyncLocalStorage store). That context doesn't exist when these actions
// are invoked directly -- e.g. from integration tests -- so calling it
// there throws. There's nothing to invalidate outside a real request
// anyway, so it's safe to swallow.
function safeRevalidatePath(path: string) {
  try {
    revalidatePath(path);
  } catch {
    // no request context to revalidate against (e.g. running in tests)
  }
}

export async function uploadClothingPhoto(
  file: Blob,
  fileExt: string,
  injectedClient?: SupabaseClient
): Promise<ActionResult<{ path: string }>> {
  const supabase = injectedClient ?? (await createClient());
  const user = await requireUser(supabase);
  if (!user) return { error: "You need to sign in again." };

  const path = `${user.id}/${randomUUID()}.${fileExt}`;
  try {
    const storage = getStorageProvider(supabase);
    await storage.uploadImage({ userId: user.id, file, path });
    return { data: { path } };
  } catch {
    return { error: "Couldn't upload the photo — please try again." };
  }
}

export async function analyzeClothingPhoto(
  path: string,
  injectedClient?: SupabaseClient,
  injectedAI?: AIProvider
): Promise<ActionResult<{ analysis: Awaited<ReturnType<AIProvider["analyzeClothingImage"]>> }>> {
  const supabase = injectedClient ?? (await createClient());
  const user = await requireUser(supabase);
  if (!user) return { error: "You need to sign in again." };
  if (!path.startsWith(`${user.id}/`)) return { error: "Invalid photo reference." };

  try {
    const storage = getStorageProvider(supabase);
    const signedUrl = await storage.getSignedUrl(path, 300);
    const ai = injectedAI ?? getAIProvider();
    const analysis = await ai.analyzeClothingImage(signedUrl);
    return { data: { analysis } };
  } catch {
    return { error: "AI analysis is unavailable right now — you can still enter details manually." };
  }
}

export async function saveClothingItem(
  input: ClothingItemInput,
  injectedClient?: SupabaseClient
): Promise<ActionResult<{ id: string }>> {
  const supabase = injectedClient ?? (await createClient());
  const user = await requireUser(supabase);
  if (!user) return { error: "You need to sign in again." };

  const parsed = clothingItemInputSchema.safeParse(input);
  if (!parsed.success) return { error: "Some details are missing or invalid." };

  const { data, error } = await supabase
    .from("clothing_items")
    .insert({
      user_id: user.id,
      image_url: parsed.data.imagePath,
      category_id: parsed.data.categoryId,
      subcategory_id: parsed.data.subcategoryId,
      name: parsed.data.name ?? null,
      primary_color: parsed.data.primaryColor,
      primary_color_hex: parsed.data.primaryColorHex ?? null,
      secondary_colors: parsed.data.secondaryColors,
      pattern: parsed.data.pattern,
      style: parsed.data.style,
      formality_level: parsed.data.formalityLevel,
      description: parsed.data.description,
      ai_analysis: parsed.data.aiAnalysis ?? null,
      user_edited: parsed.data.userEdited,
    })
    .select("id")
    .single();

  if (error || !data) return { error: "Couldn't save this item — please try again." };

  safeRevalidatePath("/dashboard");
  return { data: { id: data.id } };
}

export async function updateClothingItem(
  id: string,
  input: ClothingItemInput,
  injectedClient?: SupabaseClient
): Promise<ActionResult<{ id: string }>> {
  const supabase = injectedClient ?? (await createClient());
  const user = await requireUser(supabase);
  if (!user) return { error: "You need to sign in again." };

  const parsed = clothingItemInputSchema.safeParse(input);
  if (!parsed.success) return { error: "Some details are missing or invalid." };

  const { data, error } = await supabase
    .from("clothing_items")
    .update({
      category_id: parsed.data.categoryId,
      subcategory_id: parsed.data.subcategoryId,
      name: parsed.data.name ?? null,
      primary_color: parsed.data.primaryColor,
      primary_color_hex: parsed.data.primaryColorHex ?? null,
      secondary_colors: parsed.data.secondaryColors,
      pattern: parsed.data.pattern,
      style: parsed.data.style,
      formality_level: parsed.data.formalityLevel,
      description: parsed.data.description,
      user_edited: true,
    })
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id")
    .single();

  if (error || !data) return { error: "Couldn't save your changes — please try again." };

  safeRevalidatePath("/dashboard");
  return { data: { id: data.id } };
}

export async function deleteClothingItem(
  id: string,
  injectedClient?: SupabaseClient
): Promise<ActionResult<{ id: string }>> {
  const supabase = injectedClient ?? (await createClient());
  const user = await requireUser(supabase);
  if (!user) return { error: "You need to sign in again." };

  const { data: item, error: fetchError } = await supabase
    .from("clothing_items")
    .select("image_url")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();
  if (fetchError || !item) return { error: "Item not found." };

  const { error: deleteError } = await supabase
    .from("clothing_items")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);
  if (deleteError) return { error: "Couldn't delete this item — please try again." };

  try {
    const storage = getStorageProvider(supabase);
    await storage.deleteImage(item.image_url);
  } catch {
    // DB row is already gone; a lingering Storage object isn't user-visible.
  }

  safeRevalidatePath("/dashboard");
  return { data: { id } };
}

export async function cancelClothingUpload(path: string, injectedClient?: SupabaseClient): Promise<void> {
  const supabase = injectedClient ?? (await createClient());
  const user = await requireUser(supabase);
  if (!user || !path.startsWith(`${user.id}/`)) return;
  try {
    const storage = getStorageProvider(supabase);
    await storage.deleteImage(path);
  } catch {
    // best-effort cleanup of an unsaved upload
  }
}
```

- [ ] **Step 4: Run and verify pass**

Run: `npm test -- clothing-items-actions`
Expected: PASS.

- [ ] **Step 5: Add the DB RLS-isolation case**

Append to `tests/integration/rls-isolation.test.ts`:

```ts
import { updateClothingItem, deleteClothingItem } from "@/app/dashboard/actions";
import { supabaseAdmin } from "./helpers/supabaseAdmin";

// ...inside the existing describe block:
it("user A cannot read, update, or delete user B's clothing_items row", async () => {
  const userA = await createTestUser();
  const userB = await createTestUser();
  const admin = supabaseAdmin();

  const { data: category } = await admin.from("clothing_categories").select("id").limit(1).single();
  const { data: subcategory } = await admin
    .from("clothing_subcategories")
    .select("id")
    .eq("category_id", category!.id)
    .limit(1)
    .single();

  const { data: item, error: insertError } = await userB.client
    .from("clothing_items")
    .insert({
      user_id: userB.id,
      image_url: `${userB.id}/item.jpg`,
      category_id: category!.id,
      subcategory_id: subcategory!.id,
      primary_color: "blue",
      pattern: "solid",
      style: "casual",
      formality_level: 2,
      description: "test item",
    })
    .select("id")
    .single();
  expect(insertError).toBeNull();

  const { data: readAsA } = await userA.client.from("clothing_items").select("id").eq("id", item!.id);
  expect(readAsA).toEqual([]);

  const updateResult = await updateClothingItem(
    item!.id,
    {
      categoryId: category!.id,
      subcategoryId: subcategory!.id,
      imagePath: `${userB.id}/item.jpg`,
      primaryColor: "hacked",
      secondaryColors: [],
      pattern: "solid",
      style: "casual",
      formalityLevel: 2,
      description: "hacked",
      userEdited: true,
    },
    userA.client
  );
  expect("error" in updateResult).toBe(true);

  const deleteResult = await deleteClothingItem(item!.id, userA.client);
  expect("error" in deleteResult).toBe(true);

  const { data: stillThere } = await admin.from("clothing_items").select("id").eq("id", item!.id);
  expect(stillThere).toHaveLength(1);

  await admin.from("clothing_items").delete().eq("id", item!.id);
  await userA.cleanup();
  await userB.cleanup();
});
```

Run: `npm test -- rls-isolation`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/dashboard/actions.ts tests/integration/clothing-items-actions.test.ts tests/integration/rls-isolation.test.ts
git commit -m "feat: add wardrobe server actions with DI for testing and DB RLS isolation tests"
```

---

### Task 10: Client-side image processing (browser-only, manually verified)

**Files:**
- Create: `src/lib/image/process.ts`

**Interfaces:** Consumes `computeTargetDimensions` (Task 2). Produces `processImageFile(file: File): Promise<Blob>`.

**Note:** jsdom has no real canvas rasterizer, so this isn't unit-tested here — it's exercised end-to-end in Task 12's manual browser pass, per the spec's testing section.

- [ ] **Step 1: Implement**

```ts
// src/lib/image/process.ts
"use client";

import { computeTargetDimensions } from "./dimensions";

const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.82;

export async function processImageFile(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const { width, height } = computeTargetDimensions(bitmap.width, bitmap.height, MAX_DIMENSION);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas is not supported in this browser.");
  }
  ctx.drawImage(bitmap, 0, 0, width, height);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Image compression failed."))),
      "image/jpeg",
      JPEG_QUALITY
    );
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/image/process.ts
git commit -m "feat: add client-side canvas resize/compress for wardrobe photos"
```

---

### Task 11: Upload + review UI

**Files:**
- Create: `src/lib/wardrobe/types.ts`
- Create: `src/components/wardrobe/ReviewForm.tsx`
- Create: `src/components/wardrobe/UploadItemCard.tsx`
- Create: `src/components/wardrobe/UploadPanel.tsx`

**Interfaces:**
- Consumes: `matchSubcategory` (Task 4), `processImageFile` (Task 10), `validateImageFile` (Task 2), actions from Task 9, `ClothingItemInput`/`ClothingAnalysisInput` (Task 3)
- Produces: `ReviewFormValue`, `ReviewFormSaveInput` (consumed by Task 13's `EditItemDialog`)

- [ ] **Step 1: Add the shared display type**

```ts
// src/lib/wardrobe/types.ts
export interface ClothingItemRow {
  id: string;
  imagePath: string;
  imageSignedUrl: string;
  categoryId: number;
  categoryName: string;
  subcategoryId: number;
  subcategoryName: string;
  name: string | null;
  primaryColor: string;
  primaryColorHex: string | null;
  secondaryColors: string[];
  pattern: string;
  style: string;
  formalityLevel: number;
  description: string;
}
```

- [ ] **Step 2: Implement the shared review/edit form**

```tsx
// src/components/wardrobe/ReviewForm.tsx
"use client";

import { useState } from "react";
import type { ClothingAnalysisInput, ClothingItemInput } from "@/lib/validation/clothing";
import { matchSubcategory, type CategoryOption, type SubcategoryOption } from "@/lib/wardrobe/matchCategory";

const PATTERNS = ["solid", "striped", "checked", "plaid", "printed", "textured", "other"] as const;
const STYLES = ["business_formal", "business_casual", "smart_casual", "casual"] as const;

export type ReviewFormSaveInput = Omit<ClothingItemInput, "imagePath" | "aiAnalysis">;

export interface ReviewFormValue {
  categoryId: number | null;
  subcategoryId: number | null;
  name: string;
  primaryColor: string;
  primaryColorHex: string;
  secondaryColors: string;
  pattern: (typeof PATTERNS)[number];
  style: (typeof STYLES)[number];
  formalityLevel: number;
  description: string;
}

function fromAnalysis(
  analysis: ClothingAnalysisInput | null,
  categories: CategoryOption[],
  subcategories: SubcategoryOption[]
): ReviewFormValue {
  const match = analysis
    ? matchSubcategory(categories, subcategories, analysis.category, analysis.subcategory)
    : null;
  return {
    categoryId: match?.categoryId ?? null,
    subcategoryId: match?.subcategoryId ?? null,
    name: "",
    primaryColor: analysis?.primaryColor ?? "",
    primaryColorHex: analysis?.primaryColorHex ?? "",
    secondaryColors: analysis?.secondaryColors.join(", ") ?? "",
    pattern: analysis?.pattern ?? "solid",
    style: analysis?.style ?? "casual",
    formalityLevel: analysis?.formalityLevel ?? 3,
    description: analysis?.description ?? "",
  };
}

export function ReviewForm({
  analysis,
  categories,
  subcategories,
  initialValue,
  onSave,
  onReanalyze,
  onCancel,
  saving,
}: {
  analysis: ClothingAnalysisInput | null;
  categories: CategoryOption[];
  subcategories: SubcategoryOption[];
  initialValue?: ReviewFormValue;
  onSave: (input: ReviewFormSaveInput) => void;
  onReanalyze?: () => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [value, setValue] = useState<ReviewFormValue>(
    initialValue ?? fromAnalysis(analysis, categories, subcategories)
  );

  const availableSubcategories = subcategories.filter((s) => s.categoryId === value.categoryId);
  const isFreshManualEntry = !analysis && !initialValue;
  const edited = analysis
    ? JSON.stringify(value) !== JSON.stringify(fromAnalysis(analysis, categories, subcategories))
    : true;

  function submit() {
    if (!value.categoryId || !value.subcategoryId) return;
    onSave({
      categoryId: value.categoryId,
      subcategoryId: value.subcategoryId,
      name: value.name || undefined,
      primaryColor: value.primaryColor,
      primaryColorHex: value.primaryColorHex || undefined,
      secondaryColors: value.secondaryColors.split(",").map((c) => c.trim()).filter(Boolean),
      pattern: value.pattern,
      style: value.style,
      formalityLevel: value.formalityLevel,
      description: value.description,
      userEdited: edited,
    });
  }

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-neutral-200 p-4">
      {isFreshManualEntry && (
        <p className="text-sm text-amber-600">
          AI analysis unavailable — enter the details below manually.
        </p>
      )}

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-sm">
          Category
          <select
            className="rounded border border-neutral-300 px-2 py-1"
            value={value.categoryId ?? ""}
            onChange={(e) =>
              setValue((v) => ({ ...v, categoryId: Number(e.target.value) || null, subcategoryId: null }))
            }
          >
            <option value="">Select category</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          Subcategory
          <select
            className="rounded border border-neutral-300 px-2 py-1"
            value={value.subcategoryId ?? ""}
            onChange={(e) => setValue((v) => ({ ...v, subcategoryId: Number(e.target.value) || null }))}
            disabled={!value.categoryId}
          >
            <option value="">Select subcategory</option>
            {availableSubcategories.map((s) => (
              <option key={s.id} value={s.id}>{s.name.replace(/_/g, " ")}</option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          Primary color
          <input
            className="rounded border border-neutral-300 px-2 py-1"
            value={value.primaryColor}
            onChange={(e) => setValue((v) => ({ ...v, primaryColor: e.target.value }))}
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          Pattern
          <select
            className="rounded border border-neutral-300 px-2 py-1"
            value={value.pattern}
            onChange={(e) => setValue((v) => ({ ...v, pattern: e.target.value as ReviewFormValue["pattern"] }))}
          >
            {PATTERNS.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          Style
          <select
            className="rounded border border-neutral-300 px-2 py-1"
            value={value.style}
            onChange={(e) => setValue((v) => ({ ...v, style: e.target.value as ReviewFormValue["style"] }))}
          >
            {STYLES.map((s) => (
              <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          Formality (1-5)
          <input
            type="number"
            min={1}
            max={5}
            className="rounded border border-neutral-300 px-2 py-1"
            value={value.formalityLevel}
            onChange={(e) => setValue((v) => ({ ...v, formalityLevel: Number(e.target.value) }))}
          />
        </label>
      </div>

      <label className="flex flex-col gap-1 text-sm">
        Description
        <textarea
          className="rounded border border-neutral-300 px-2 py-1"
          value={value.description}
          onChange={(e) => setValue((v) => ({ ...v, description: e.target.value }))}
        />
      </label>

      <div className="flex gap-2">
        <button
          type="button"
          className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          onClick={submit}
          disabled={saving || !value.categoryId || !value.subcategoryId}
        >
          {saving ? "Saving…" : "Save"}
        </button>
        {onReanalyze && (
          <button type="button" className="rounded-md border border-neutral-300 px-3 py-2 text-sm" onClick={onReanalyze}>
            Re-analyze
          </button>
        )}
        <button type="button" className="rounded-md border border-neutral-300 px-3 py-2 text-sm" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Implement the per-file upload/analyze/review card**

Guard the pipeline with a ref so React's dev-mode StrictMode double-invoke never uploads the same file twice — this directly enforces the "no duplicate uploads" requirement.

```tsx
// src/components/wardrobe/UploadItemCard.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { processImageFile } from "@/lib/image/process";
import { validateImageFile } from "@/lib/image/validate";
import {
  analyzeClothingPhoto,
  cancelClothingUpload,
  saveClothingItem,
  uploadClothingPhoto,
} from "@/app/dashboard/actions";
import type { ClothingAnalysisInput } from "@/lib/validation/clothing";
import { ReviewForm, type ReviewFormSaveInput } from "./ReviewForm";
import type { CategoryOption, SubcategoryOption } from "@/lib/wardrobe/matchCategory";

type Status = "uploading" | "analyzing" | "review" | "saving" | "saved" | "error";

export function UploadItemCard({
  file,
  categories,
  subcategories,
  onSaved,
  onRemove,
}: {
  file: File;
  categories: CategoryOption[];
  subcategories: SubcategoryOption[];
  onSaved: () => void;
  onRemove: () => void;
}) {
  const [status, setStatus] = useState<Status>("uploading");
  const [error, setError] = useState<string | null>(null);
  const [path, setPath] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<ClothingAnalysisInput | null>(null);
  const startedRef = useRef(false);
  // Lazy useState initializer (not a ref read) so the object URL is created
  // exactly once and stays stable across re-renders -- reading
  // useRef().current during render is disallowed by
  // eslint-plugin-react-hooks.
  const [previewUrl] = useState(() => URL.createObjectURL(file));

  useEffect(() => {
    return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    async function run() {
      const validation = validateImageFile(file);
      if (!validation.valid) {
        setError(validation.error);
        setStatus("error");
        return;
      }

      const processed = await processImageFile(file);
      const uploadResult = await uploadClothingPhoto(processed, "jpg");
      if ("error" in uploadResult) {
        setError(uploadResult.error);
        setStatus("error");
        return;
      }
      setPath(uploadResult.data.path);

      setStatus("analyzing");
      const analysisResult = await analyzeClothingPhoto(uploadResult.data.path);
      setAnalysis("error" in analysisResult ? null : analysisResult.data.analysis);
      setStatus("review");
    }

    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleReanalyze() {
    if (!path) return;
    setStatus("analyzing");
    const analysisResult = await analyzeClothingPhoto(path);
    setAnalysis("error" in analysisResult ? null : analysisResult.data.analysis);
    setStatus("review");
  }

  async function handleSave(input: ReviewFormSaveInput) {
    if (!path) return;
    setStatus("saving");
    const result = await saveClothingItem({ ...input, imagePath: path, aiAnalysis: analysis ?? undefined });
    if ("error" in result) {
      setError(result.error);
      setStatus("review");
      return;
    }
    setStatus("saved");
    onSaved();
  }

  async function handleCancel() {
    if (path) await cancelClothingUpload(path);
    onRemove();
  }

  return (
    <div className="flex gap-4 rounded-lg border border-neutral-200 p-4">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={previewUrl} alt="" className="h-32 w-32 rounded object-cover" />
      <div className="flex-1">
        {status === "uploading" && <p className="text-sm text-neutral-500">Uploading…</p>}
        {status === "analyzing" && <p className="text-sm text-neutral-500">Analyzing with AI…</p>}
        {status === "error" && (
          <div className="text-sm text-red-600">
            {error}
            <button className="ml-2 underline" onClick={handleCancel}>Remove</button>
          </div>
        )}
        {(status === "review" || status === "saving") && (
          <ReviewForm
            analysis={analysis}
            categories={categories}
            subcategories={subcategories}
            onSave={handleSave}
            onReanalyze={handleReanalyze}
            onCancel={handleCancel}
            saving={status === "saving"}
          />
        )}
        {status === "saved" && <p className="text-sm text-green-600">Saved to your wardrobe.</p>}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Implement the multi-file panel**

```tsx
// src/components/wardrobe/UploadPanel.tsx
"use client";

import { useState, type ChangeEvent } from "react";
import { UploadItemCard } from "./UploadItemCard";
import type { CategoryOption, SubcategoryOption } from "@/lib/wardrobe/matchCategory";

export function UploadPanel({
  categories,
  subcategories,
}: {
  categories: CategoryOption[];
  subcategories: SubcategoryOption[];
}) {
  const [files, setFiles] = useState<{ id: string; file: File }[]>([]);

  function handleSelect(e: ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files ?? []);
    setFiles((prev) => [...prev, ...selected.map((file) => ({ id: crypto.randomUUID(), file }))]);
    e.target.value = "";
  }

  function removeFile(id: string) {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  }

  return (
    <section className="flex flex-col gap-4">
      <label className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed border-neutral-300 px-6 py-10 text-center text-sm text-neutral-500 hover:bg-neutral-50">
        <span>Click to upload one or more clothing photos</span>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          className="hidden"
          onChange={handleSelect}
        />
      </label>

      <div className="flex flex-col gap-4">
        {files.map(({ id, file }) => (
          <UploadItemCard
            key={id}
            file={file}
            categories={categories}
            subcategories={subcategories}
            onSaved={() => removeFile(id)}
            onRemove={() => removeFile(id)}
          />
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/wardrobe/types.ts src/components/wardrobe/ReviewForm.tsx src/components/wardrobe/UploadItemCard.tsx src/components/wardrobe/UploadPanel.tsx
git commit -m "feat: add upload panel, per-item review card, and shared review form"
```

---

### Task 12: Wardrobe grid, card, edit dialog

**Files:**
- Create: `src/components/wardrobe/ClothingCard.tsx`
- Create: `src/components/wardrobe/EditItemDialog.tsx`
- Create: `src/components/wardrobe/WardrobeGrid.tsx`

**Interfaces:** Consumes `ClothingItemRow` (Task 11), `ReviewForm`/`ReviewFormSaveInput` (Task 11), `updateClothingItem`/`deleteClothingItem` (Task 9).

- [ ] **Step 1: Implement the card**

```tsx
// src/components/wardrobe/ClothingCard.tsx
"use client";

import { useState } from "react";
import { deleteClothingItem } from "@/app/dashboard/actions";
import type { ClothingItemRow } from "@/lib/wardrobe/types";

export function ClothingCard({ item, onEdit }: { item: ClothingItemRow; onEdit: () => void }) {
  const [deleting, setDeleting] = useState(false);
  const [confirming, setConfirming] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    await deleteClothingItem(item.id);
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-neutral-200 p-3">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={item.imageSignedUrl}
        alt={item.description}
        className="aspect-square w-full rounded object-cover"
      />
      <div className="text-sm font-medium">{item.subcategoryName.replace(/_/g, " ")}</div>
      <div className="text-xs text-neutral-500">{item.primaryColor}</div>
      <p className="line-clamp-2 text-xs text-neutral-600">{item.description}</p>
      <div className="flex gap-2 text-xs">
        <button className="underline" onClick={onEdit}>Edit</button>
        {confirming ? (
          <button className="text-red-600 underline" onClick={handleDelete} disabled={deleting}>
            {deleting ? "Deleting…" : "Confirm delete"}
          </button>
        ) : (
          <button className="text-red-600 underline" onClick={() => setConfirming(true)}>Delete</button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Implement the edit dialog**

```tsx
// src/components/wardrobe/EditItemDialog.tsx
"use client";

import { useState } from "react";
import { updateClothingItem } from "@/app/dashboard/actions";
import type { ClothingItemRow } from "@/lib/wardrobe/types";
import type { CategoryOption, SubcategoryOption } from "@/lib/wardrobe/matchCategory";
import { ReviewForm, type ReviewFormValue, type ReviewFormSaveInput } from "./ReviewForm";

export function EditItemDialog({
  item,
  categories,
  subcategories,
  onClose,
}: {
  item: ClothingItemRow;
  categories: CategoryOption[];
  subcategories: SubcategoryOption[];
  onClose: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const initialValue: ReviewFormValue = {
    categoryId: item.categoryId,
    subcategoryId: item.subcategoryId,
    name: item.name ?? "",
    primaryColor: item.primaryColor,
    primaryColorHex: item.primaryColorHex ?? "",
    secondaryColors: item.secondaryColors.join(", "),
    pattern: item.pattern as ReviewFormValue["pattern"],
    style: item.style as ReviewFormValue["style"],
    formalityLevel: item.formalityLevel,
    description: item.description,
  };

  async function handleSave(input: ReviewFormSaveInput) {
    setSaving(true);
    const result = await updateClothingItem(item.id, { ...input, imagePath: item.imagePath, aiAnalysis: undefined });
    setSaving(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    onClose();
  }

  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-lg bg-white p-4">
        <h2 className="mb-3 text-lg font-semibold">Edit item</h2>
        {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
        <ReviewForm
          analysis={null}
          categories={categories}
          subcategories={subcategories}
          initialValue={initialValue}
          onSave={handleSave}
          onCancel={onClose}
          saving={saving}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Implement the grid with filters**

```tsx
// src/components/wardrobe/WardrobeGrid.tsx
"use client";

import { useMemo, useState } from "react";
import type { ClothingItemRow } from "@/lib/wardrobe/types";
import type { CategoryOption, SubcategoryOption } from "@/lib/wardrobe/matchCategory";
import { ClothingCard } from "./ClothingCard";
import { EditItemDialog } from "./EditItemDialog";

export function WardrobeGrid({
  items,
  categories,
  subcategories,
}: {
  items: ClothingItemRow[];
  categories: CategoryOption[];
  subcategories: SubcategoryOption[];
}) {
  const [categoryFilter, setCategoryFilter] = useState<number | "all">("all");
  const [styleFilter, setStyleFilter] = useState("all");
  const [formalityFilter, setFormalityFilter] = useState<number | "all">("all");
  const [colorFilter, setColorFilter] = useState("");
  const [editing, setEditing] = useState<ClothingItemRow | null>(null);

  const filtered = useMemo(() => {
    return items.filter((item) => {
      if (categoryFilter !== "all" && item.categoryId !== categoryFilter) return false;
      if (styleFilter !== "all" && item.style !== styleFilter) return false;
      if (formalityFilter !== "all" && item.formalityLevel !== formalityFilter) return false;
      if (colorFilter && !item.primaryColor.toLowerCase().includes(colorFilter.toLowerCase())) return false;
      return true;
    });
  }, [items, categoryFilter, styleFilter, formalityFilter, colorFilter]);

  if (items.length === 0) {
    return <p className="text-sm text-neutral-500">Your wardrobe is empty — upload your first item above.</p>;
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-3 text-sm">
        <select
          className="rounded border border-neutral-300 px-2 py-1"
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value === "all" ? "all" : Number(e.target.value))}
        >
          <option value="all">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <select className="rounded border border-neutral-300 px-2 py-1" value={styleFilter} onChange={(e) => setStyleFilter(e.target.value)}>
          <option value="all">All styles</option>
          <option value="business_formal">business formal</option>
          <option value="business_casual">business casual</option>
          <option value="smart_casual">smart casual</option>
          <option value="casual">casual</option>
        </select>
        <select
          className="rounded border border-neutral-300 px-2 py-1"
          value={formalityFilter}
          onChange={(e) => setFormalityFilter(e.target.value === "all" ? "all" : Number(e.target.value))}
        >
          <option value="all">Any formality</option>
          {[1, 2, 3, 4, 5].map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
        <input
          className="rounded border border-neutral-300 px-2 py-1"
          placeholder="Filter by color"
          value={colorFilter}
          onChange={(e) => setColorFilter(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
        {filtered.map((item) => (
          <ClothingCard key={item.id} item={item} onEdit={() => setEditing(item)} />
        ))}
      </div>

      {editing && (
        <EditItemDialog
          item={editing}
          categories={categories}
          subcategories={subcategories}
          onClose={() => setEditing(null)}
        />
      )}
    </section>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add src/components/wardrobe/ClothingCard.tsx src/components/wardrobe/EditItemDialog.tsx src/components/wardrobe/WardrobeGrid.tsx
git commit -m "feat: add wardrobe grid with filters, card, and edit dialog"
```

---

### Task 13: Wire up the dashboard page

**Files:**
- Modify: `src/app/dashboard/page.tsx`

**Interfaces:** Consumes `UploadPanel` (Task 11), `WardrobeGrid` (Task 12), `getStorageProvider` (Task 8), `ClothingItemRow` (Task 11).

**Note:** `page.tsx` is a Server Component — it must not pass inline functions as props to the Client Components it renders (Next.js rejects non-serializable props across that boundary). `UploadPanel` and `WardrobeGrid` are called with data props only; the wardrobe list refreshes automatically because every mutating Server Action calls `revalidatePath("/dashboard")`.

- [ ] **Step 1: Implement**

```tsx
// src/app/dashboard/page.tsx
import { createClient } from "@/lib/supabase/server";
import { signOut } from "../login/actions";
import { getStorageProvider } from "@/lib/providers";
import { UploadPanel } from "@/components/wardrobe/UploadPanel";
import { WardrobeGrid } from "@/components/wardrobe/WardrobeGrid";
import type { ClothingItemRow } from "@/lib/wardrobe/types";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Deliberately sequential, not Promise.all. Manual browser testing found
  // that firing these three queries concurrently on this SSR cookie-based
  // client reproducibly caused the middle query (clothing_subcategories)
  // to silently return an empty array -- no error, just zero rows -- even
  // though the exact same query run standalone (same user, same session)
  // returns all 5 rows correctly. Root cause: a race in how
  // @supabase/ssr's createServerClient resolves the auth/cookie context
  // for concurrent requests within a single render. Sequential awaits
  // cost a few hundred ms of extra latency but are reliably correct.
  const { data: categories } = await supabase.from("clothing_categories").select("id, name").order("sort_order");
  const { data: subcategories } = await supabase
    .from("clothing_subcategories")
    .select("id, category_id, name");
  const { data: items } = await supabase
    .from("clothing_items")
    .select(
      "id, image_url, category_id, subcategory_id, name, primary_color, primary_color_hex, secondary_colors, pattern, style, formality_level, description, clothing_categories(name), clothing_subcategories(name)"
    )
    .order("created_at", { ascending: false });

  const storage = getStorageProvider(supabase);
  const rows: ClothingItemRow[] = await Promise.all(
    (items ?? []).map(async (item) => ({
      id: item.id,
      imagePath: item.image_url,
      imageSignedUrl: await storage.getSignedUrl(item.image_url),
      categoryId: item.category_id,
      categoryName: item.clothing_categories?.name ?? "",
      subcategoryId: item.subcategory_id,
      subcategoryName: item.clothing_subcategories?.name ?? "",
      name: item.name,
      primaryColor: item.primary_color ?? "",
      primaryColorHex: item.primary_color_hex,
      secondaryColors: item.secondary_colors ?? [],
      pattern: item.pattern ?? "solid",
      style: item.style ?? "casual",
      formalityLevel: item.formality_level ?? 3,
      description: item.description ?? "",
    }))
  );

  const categoryOptions = (categories ?? []).map((c) => ({ id: c.id, name: c.name }));
  const subcategoryOptions = (subcategories ?? []).map((s) => ({
    id: s.id,
    categoryId: s.category_id,
    name: s.name,
  }));

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-8 px-6 py-16">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">My Wardrobe</h1>
          <p className="mt-1 text-sm text-neutral-500">Signed in as {user?.email}</p>
        </div>
        <form action={signOut}>
          <button
            type="submit"
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm font-medium hover:bg-neutral-50"
          >
            Sign out
          </button>
        </form>
      </header>

      <UploadPanel categories={categoryOptions} subcategories={subcategoryOptions} />
      <WardrobeGrid items={rows} categories={categoryOptions} subcategories={subcategoryOptions} />
    </main>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: build succeeds with no type errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/dashboard/page.tsx
git commit -m "feat: wire wardrobe upload and grid into the dashboard page"
```

---

### Task 14: Full test suite + manual browser verification

**Files:** none new — this task runs and verifies everything built in Tasks 1–13.

- [ ] **Step 1: Run the full automated suite**

Run: `npm test`
Expected: all unit and integration tests pass, including both RLS-isolation tests.

- [ ] **Step 2: Run lint and build**

```bash
npm run lint
npm run build
```
Expected: no errors.

- [ ] **Step 3: Manual browser walkthrough**

Start the dev server (`npm run dev`), sign in, and verify each item from the spec's testing section against the running app:

1. Single upload → review pre-filled from Gemini → Save → appears in My Wardrobe.
2. Multiple uploads in one selection → each gets its own card and can be saved independently.
3. Upload an oversized (>10MB) or wrong-type file → rejected before any network call.
4. Confirm in Supabase Storage (via the dashboard or `execute_sql` against `storage.objects`) that an uploaded photo appears exactly once per saved item — no duplicates.
5. Force a Gemini failure (temporarily rename `GEMINI_API_KEY` in `.env.local` to an invalid value, restart the dev server) → review screen opens with empty fields and the "AI analysis unavailable" notice → manually fill in and save successfully → restore the real key afterward.
6. Edit a saved item, change a field, save → wardrobe card reflects the change.
7. Delete an item → confirm it disappears from the grid and its Storage object is gone (spot-check via `execute_sql`).
8. Use each filter (category, style, formality, color) and confirm the grid narrows correctly.
9. Sign in as a second account (or use an incognito window) and confirm the first account's items are not visible.

- [ ] **Step 4: Fix anything found, then final commit**

If any manual check fails, fix the issue, re-run `npm test`, and commit the fix with a description of what was wrong.

```bash
git add -A
git commit -m "test: verify full wardrobe core flow end-to-end"
```

---

## Self-Review

**Spec coverage:** Upload (single/multi) — Task 11. Review/edit/re-analyze/cancel — Task 11 (`ReviewForm`, `UploadItemCard`). Save without duplicate upload — Task 9 (`saveClothingItem` never touches Storage) + Task 11 (`UploadItemCard` uploads exactly once in its effect). AI optional/never blocks — Task 9 (`analyzeClothingPhoto` swallows provider errors into `{error}`) + Task 11 (review renders with `analysis: null`). User corrections authoritative — `userEdited` computed by diffing against the AI baseline in `ReviewForm.submit()`. My Wardrobe display/filter/edit/delete — Task 12. Private storage + RLS — Task 5 (migration), Task 7 & 9 (isolation tests). Background removal deferred — not present anywhere in this plan. No outfit-matching work — no task touches `outfits`/`outfit_items`.

**Placeholder scan:** no TBD/TODO; every step has real, complete code or an exact command.

**Type consistency:** `ClothingAnalysisInput` (Task 3) is the single type flowing from `GeminiAIProvider.analyzeClothingImage` (Task 8) through `analyzeClothingPhoto` (Task 9) into `ReviewForm`'s `analysis` prop (Task 11). `ReviewFormSaveInput` (Task 11) is the single type flowing from both `UploadItemCard.handleSave` and `EditItemDialog.handleSave` into `saveClothingItem`/`updateClothingItem` (Task 9). `ClothingItemRow` (Task 11) is the single type flowing from `page.tsx` (Task 13) through `WardrobeGrid` → `ClothingCard`/`EditItemDialog` (Task 12).
