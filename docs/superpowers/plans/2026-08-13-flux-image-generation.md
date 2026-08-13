# FLUX via fal.ai Image Generation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the planned image-generation path with FLUX via fal.ai (`@fal-ai/client`), behind the existing `ImageGenProvider` abstraction, and prove the full pipeline (garments → prompt → FLUX → Storage → DB) end-to-end via a minimal server action — without touching `AIProvider`/Gemini or building the Outfit Picker UI.

**Architecture:** `FalFluxImageGenProvider` implements the (updated) `ImageGenProvider` interface. A pure `buildVisualizationPrompt` function constructs the FLUX prompt from Gemini-derived clothing metadata. A new server action wires garment selection → provider → download → `StorageProvider` → `outfits`/`outfit_items` rows, following the same dependency-injection pattern already used by `analyzeClothingPhoto`.

**Tech Stack:** `@fal-ai/client` (current, non-deprecated), existing Next.js/Supabase/Vitest stack.

## Global Constraints

- `FAL_KEY` is server-side only — never `NEXT_PUBLIC_`-prefixed, never logged, never returned to the client.
- Do not modify `AIProvider`, `GeminiAIProvider`, or any wardrobe (clothing upload/review/grid) code.
- `ImageGenProvider` stays a provider-agnostic interface — no fal.ai imports outside `src/lib/providers/fal-flux.ts`.
- Primary endpoint `fal-ai/flux-pro/kontext/max/multi` (2+ garments), fallback `fal-ai/flux-pro/kontext` (1 garment).
- fal.ai has no free tier — real cost (~$0.04–0.08/image) must be documented, not hidden.
- No sensitive data (API keys) in the database.
- Full spec: `docs/superpowers/specs/2026-08-13-flux-image-generation-design.md`.
- **Do not merge to `main` automatically when done** — present the branch for review, per explicit instruction.

---

## File Structure

**New files:**
- `src/lib/outfit/buildVisualizationPrompt.ts` — pure prompt-builder
- `src/lib/providers/fal-flux.ts` — `FalFluxImageGenProvider`
- `src/app/dashboard/outfit-actions.ts` — `generateOutfitVisualization` server action
- `supabase/migrations/0002_outfit_images_storage.sql`
- `tests/unit/build-visualization-prompt.test.ts`
- `tests/unit/fal-flux-provider.test.ts`
- `tests/integration/outfit-generation-actions.test.ts`

**Modified files:**
- `package.json` — add `@fal-ai/client`
- `src/lib/providers/types.ts` — widen `ImageGenProvider`, add `OutfitGarmentInput`
- `src/lib/providers/index.ts` — add `getImageGenProvider()`
- `tests/integration/rls-isolation.test.ts` — add outfit-generation RLS case
- `README.md` — document the new provider, cost, env var
- `AI Outfit Picker - Architecture & Technology Recommendation.md` — update section C.6/D to reflect FLUX via fal.ai as the actual choice

**Interfaces used across tasks:**
```ts
// src/lib/providers/types.ts
export interface OutfitGarmentInput {
  imageUrl: string;
  role: string;
  category: string;
  subcategory: string;
  primaryColor: string;
  pattern: string;
  style: string;
}

export interface ImageGenProvider {
  name: string;
  generateOutfitVisualization(input: {
    garments: OutfitGarmentInput[];
    seed?: number;
  }): Promise<{ imageUrl: string; requestId: string; model: string; prompt: string }>;
}

// src/lib/outfit/buildVisualizationPrompt.ts
export function buildVisualizationPrompt(garments: OutfitGarmentInput[]): string;

// src/lib/providers/fal-flux.ts
export class FalFluxImageGenProvider implements ImageGenProvider { ... }

// src/lib/providers/index.ts
export function getImageGenProvider(): ImageGenProvider;

// src/app/dashboard/outfit-actions.ts
type ActionResult<T> = { data: T } | { error: string };
export async function generateOutfitVisualization(
  clothingItemIds: string[],
  injectedClient?: SupabaseClient,
  injectedImageGen?: ImageGenProvider
): Promise<ActionResult<{ outfitId: string; imageUrl: string }>>;
```

---

### Task 1: Add dependency and update `ImageGenProvider` interface

**Files:**
- Modify: `package.json`
- Modify: `src/lib/providers/types.ts`

**Interfaces:** Produces `OutfitGarmentInput`, updated `ImageGenProvider` (see File Structure section).

- [ ] **Step 1: Install the dependency**

```bash
npm install @fal-ai/client
```

- [ ] **Step 2: Update the interface**

Replace the current `ImageGenProvider` block in `src/lib/providers/types.ts`:

```ts
export interface OutfitGarmentInput {
  imageUrl: string; // signed URL, resolved by the caller via StorageProvider
  role: string; // "top" | "bottom" | "outerwear" | ... (matches outfit_items.role)
  category: string;
  subcategory: string;
  primaryColor: string;
  pattern: string;
  style: string;
}

/**
 * Outfit visualization provider (MVP default: FLUX via fal.ai). `name` is a
 * plain string, not a closed union -- the interface exists so providers can
 * be added without editing it every time.
 */
export interface ImageGenProvider {
  name: string;
  generateOutfitVisualization(input: {
    garments: OutfitGarmentInput[];
    seed?: number;
  }): Promise<{
    imageUrl: string; // temporary, provider-hosted -- caller downloads and re-stores it
    requestId: string;
    model: string;
    prompt: string;
  }>;
}
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: succeeds (no other file references the old `ImageGenProvider` shape yet, since it was a stub).

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json src/lib/providers/types.ts
git commit -m "feat: add @fal-ai/client, widen ImageGenProvider for FLUX"
```

---

### Task 2: Prompt builder (pure, unit-tested)

**Files:**
- Create: `src/lib/outfit/buildVisualizationPrompt.ts`
- Test: `tests/unit/build-visualization-prompt.test.ts`

**Interfaces:** Consumes `OutfitGarmentInput` (Task 1). Produces `buildVisualizationPrompt`.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/unit/build-visualization-prompt.test.ts
import { describe, it, expect } from "vitest";
import { buildVisualizationPrompt } from "@/lib/outfit/buildVisualizationPrompt";
import type { OutfitGarmentInput } from "@/lib/providers/types";

const jacket: OutfitGarmentInput = {
  imageUrl: "https://example.com/jacket.jpg",
  role: "outerwear",
  category: "outerwear",
  subcategory: "business_jacket",
  primaryColor: "navy",
  pattern: "solid",
  style: "business_formal",
};
const shirt: OutfitGarmentInput = {
  imageUrl: "https://example.com/shirt.jpg",
  role: "top",
  category: "top",
  subcategory: "long_sleeve_shirt",
  primaryColor: "white",
  pattern: "solid",
  style: "business_formal",
};
const pants: OutfitGarmentInput = {
  imageUrl: "https://example.com/pants.jpg",
  role: "bottom",
  category: "bottom",
  subcategory: "pants",
  primaryColor: "gray",
  pattern: "solid",
  style: "business_formal",
};

describe("buildVisualizationPrompt", () => {
  it("mentions every selected garment's color and subcategory", () => {
    const prompt = buildVisualizationPrompt([jacket, shirt, pants]);
    expect(prompt).toContain("navy");
    expect(prompt).toContain("business jacket");
    expect(prompt).toContain("white");
    expect(prompt).toContain("long sleeve shirt");
    expect(prompt).toContain("gray");
    expect(prompt).toContain("pants");
  });

  it("does not mention garments that were not selected", () => {
    const prompt = buildVisualizationPrompt([shirt]);
    expect(prompt.toLowerCase()).not.toContain("jacket");
    expect(prompt.toLowerCase()).not.toContain("navy");
  });

  it("instructs preservation of color, pattern, and construction", () => {
    const prompt = buildVisualizationPrompt([shirt]);
    expect(prompt.toLowerCase()).toContain("preserve");
  });

  it("instructs against inventing accessories, colors, or logos", () => {
    const prompt = buildVisualizationPrompt([shirt]);
    expect(prompt.toLowerCase()).toContain("do not add accessories");
    expect(prompt.toLowerCase()).toContain("do not change the garment colors");
    expect(prompt.toLowerCase()).toContain("do not invent logos");
  });

  it("requests a photorealistic male model with neutral background", () => {
    const prompt = buildVisualizationPrompt([shirt]);
    expect(prompt.toLowerCase()).toContain("male model");
    expect(prompt.toLowerCase()).toContain("photorealistic");
  });
});
```

- [ ] **Step 2: Run and verify failure**

Run: `npm test -- build-visualization-prompt`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement**

```ts
// src/lib/outfit/buildVisualizationPrompt.ts
import type { OutfitGarmentInput } from "@/lib/providers/types";

function humanize(text: string): string {
  return text.replace(/_/g, " ");
}

export function buildVisualizationPrompt(garments: OutfitGarmentInput[]): string {
  const garmentLines = garments
    .map((g) => `- ${g.primaryColor} ${humanize(g.pattern)} ${humanize(g.subcategory)}`)
    .join("\n");

  return [
    "Photorealistic professional male model wearing the exact clothing items shown in the provided reference images.",
    "",
    "The outfit consists of:",
    garmentLines,
    "",
    "Preserve the visual identity, color, pattern, construction, proportions, and key details of the reference garments.",
    "",
    "Professional fashion photography.",
    "Full-body or three-quarter body composition.",
    "Natural realistic human proportions.",
    "Clean neutral studio background.",
    "Soft professional lighting.",
    "Photorealistic fabric texture.",
    "Sharp clothing details.",
    "Natural posture.",
    "",
    "The clothing is the primary visual focus.",
    "Do not add accessories that are not present in the requested outfit.",
    "Do not change the garment colors.",
    "Do not invent logos or patterns.",
  ].join("\n");
}
```

- [ ] **Step 4: Run and verify pass**

Run: `npm test -- build-visualization-prompt`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/outfit/buildVisualizationPrompt.ts tests/unit/build-visualization-prompt.test.ts
git commit -m "feat: add pure prompt-builder for outfit visualization"
```

---

### Task 3: `FalFluxImageGenProvider` (unit-tested, mocked `@fal-ai/client`)

**Files:**
- Create: `src/lib/providers/fal-flux.ts`
- Test: `tests/unit/fal-flux-provider.test.ts`

**Interfaces:** Consumes `buildVisualizationPrompt` (Task 2), `ImageGenProvider`/`OutfitGarmentInput` (Task 1). Produces `FalFluxImageGenProvider`.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/unit/fal-flux-provider.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { OutfitGarmentInput } from "@/lib/providers/types";

const shirt: OutfitGarmentInput = {
  imageUrl: "https://example.com/shirt.jpg",
  role: "top",
  category: "top",
  subcategory: "long_sleeve_shirt",
  primaryColor: "white",
  pattern: "solid",
  style: "business_formal",
};
const pants: OutfitGarmentInput = {
  imageUrl: "https://example.com/pants.jpg",
  role: "bottom",
  category: "bottom",
  subcategory: "pants",
  primaryColor: "gray",
  pattern: "solid",
  style: "business_formal",
};

const subscribeMock = vi.fn();
const configMock = vi.fn();

vi.mock("@fal-ai/client", () => ({
  fal: {
    config: (...args: unknown[]) => configMock(...args),
    subscribe: (...args: unknown[]) => subscribeMock(...args),
  },
}));

beforeEach(() => {
  subscribeMock.mockReset();
  configMock.mockReset();
});

describe("FalFluxImageGenProvider", () => {
  it("uses the single-image endpoint for one garment", async () => {
    subscribeMock.mockResolvedValue({
      data: { images: [{ url: "https://fal.media/result.jpg" }] },
      requestId: "req-1",
    });
    const { FalFluxImageGenProvider } = await import("@/lib/providers/fal-flux");
    const provider = new FalFluxImageGenProvider("fake-key");
    const result = await provider.generateOutfitVisualization({ garments: [shirt] });

    expect(subscribeMock).toHaveBeenCalledWith(
      "fal-ai/flux-pro/kontext",
      expect.objectContaining({ input: expect.objectContaining({ image_url: shirt.imageUrl }) })
    );
    expect(result.imageUrl).toBe("https://fal.media/result.jpg");
    expect(result.requestId).toBe("req-1");
    expect(result.model).toBe("fal-ai/flux-pro/kontext");
  });

  it("uses the multi-image endpoint for two or more garments", async () => {
    subscribeMock.mockResolvedValue({
      data: { images: [{ url: "https://fal.media/result2.jpg" }] },
      requestId: "req-2",
    });
    const { FalFluxImageGenProvider } = await import("@/lib/providers/fal-flux");
    const provider = new FalFluxImageGenProvider("fake-key");
    const result = await provider.generateOutfitVisualization({ garments: [shirt, pants] });

    expect(subscribeMock).toHaveBeenCalledWith(
      "fal-ai/flux-pro/kontext/max/multi",
      expect.objectContaining({
        input: expect.objectContaining({ image_urls: [shirt.imageUrl, pants.imageUrl] }),
      })
    );
    expect(result.model).toBe("fal-ai/flux-pro/kontext/max/multi");
  });

  it("throws a safe error when fal.ai returns no images", async () => {
    subscribeMock.mockResolvedValue({ data: { images: [] }, requestId: "req-3" });
    const { FalFluxImageGenProvider } = await import("@/lib/providers/fal-flux");
    const provider = new FalFluxImageGenProvider("fake-key");
    await expect(provider.generateOutfitVisualization({ garments: [shirt] })).rejects.toThrow();
  });

  it("throws a safe error when the fal.ai call fails", async () => {
    subscribeMock.mockRejectedValue(new Error("fal.ai internal detail that should not leak"));
    const { FalFluxImageGenProvider } = await import("@/lib/providers/fal-flux");
    const provider = new FalFluxImageGenProvider("fake-key");
    await expect(provider.generateOutfitVisualization({ garments: [shirt] })).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run and verify failure**

Run: `npm test -- fal-flux-provider`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement**

```ts
// src/lib/providers/fal-flux.ts
import { fal } from "@fal-ai/client";
import type { ImageGenProvider, OutfitGarmentInput } from "./types";
import { buildVisualizationPrompt } from "@/lib/outfit/buildVisualizationPrompt";

const SINGLE_ENDPOINT = "fal-ai/flux-pro/kontext";
const MULTI_ENDPOINT = "fal-ai/flux-pro/kontext/max/multi";

interface FalImageResult {
  data?: { images?: { url: string }[] };
  requestId?: string;
}

export class FalFluxImageGenProvider implements ImageGenProvider {
  readonly name = "fal-flux";

  constructor(apiKey: string) {
    fal.config({ credentials: apiKey });
  }

  async generateOutfitVisualization(input: {
    garments: OutfitGarmentInput[];
    seed?: number;
  }): Promise<{ imageUrl: string; requestId: string; model: string; prompt: string }> {
    const prompt = buildVisualizationPrompt(input.garments);
    const model = input.garments.length >= 2 ? MULTI_ENDPOINT : SINGLE_ENDPOINT;
    const requestInput =
      input.garments.length >= 2
        ? { prompt, image_urls: input.garments.map((g) => g.imageUrl), seed: input.seed }
        : { prompt, image_url: input.garments[0].imageUrl, seed: input.seed };

    let result: FalImageResult;
    try {
      result = (await fal.subscribe(model, { input: requestInput })) as FalImageResult;
    } catch {
      throw new Error("Image generation failed — please try again.");
    }

    const imageUrl = result.data?.images?.[0]?.url;
    if (!imageUrl) {
      throw new Error("Image generation did not return a result — please try again.");
    }

    return {
      imageUrl,
      requestId: result.requestId ?? "",
      model,
      prompt,
    };
  }
}
```

- [ ] **Step 4: Run and verify pass**

Run: `npm test -- fal-flux-provider`
Expected: all PASS.

- [ ] **Step 5: Add the factory function**

In `src/lib/providers/index.ts`, add:

```ts
import { FalFluxImageGenProvider } from "./fal-flux";
import type { ImageGenProvider } from "./types";

export function getImageGenProvider(): ImageGenProvider {
  const apiKey = process.env.FAL_KEY;
  if (!apiKey) {
    throw new Error("FAL_KEY is not configured.");
  }
  return new FalFluxImageGenProvider(apiKey);
}
```

- [ ] **Step 6: Verify build and full unit suite**

```bash
npm test
npm run build
```
Expected: all pass, build succeeds.

- [ ] **Step 7: Commit**

```bash
git add src/lib/providers/fal-flux.ts src/lib/providers/index.ts tests/unit/fal-flux-provider.test.ts
git commit -m "feat: implement FalFluxImageGenProvider with endpoint selection by garment count"
```

---

### Task 4: Database migration — generation-tracking columns + `outfit-images` bucket

**Files:**
- Create: `supabase/migrations/0002_outfit_images_storage.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/0002_outfit_images_storage.sql
alter table outfits
  add column image_gen_model text,
  add column generation_status text
    check (generation_status in ('queued', 'processing', 'completed', 'failed')),
  add column generation_error text,
  add column generation_request_id text,
  add column generation_prompt text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('outfit-images', 'outfit-images', false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "users can read own outfit images"
on storage.objects for select
to authenticated
using (bucket_id = 'outfit-images' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "users can upload own outfit images"
on storage.objects for insert
to authenticated
with check (bucket_id = 'outfit-images' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "users can delete own outfit images"
on storage.objects for delete
to authenticated
using (bucket_id = 'outfit-images' and (storage.foldername(name))[1] = auth.uid()::text);
```

- [ ] **Step 2: Apply via the Supabase MCP `apply_migration` tool**

Project ref `ptdqnotoxaszbirwfijo`, migration name `outfit_images_storage`.

- [ ] **Step 3: Verify**

```sql
select column_name from information_schema.columns where table_name = 'outfits' and column_name like 'generation%' or column_name = 'image_gen_model';
select id, public from storage.buckets where id = 'outfit-images';
select policyname from pg_policies where tablename = 'objects' and policyname like '%outfit images%';
```
Expected: 5 new columns, 1 bucket row (`public = false`), 3 policies.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0002_outfit_images_storage.sql
git commit -m "feat: add outfit generation-tracking columns and private outfit-images bucket"
```

---

### Task 5: Server action + integration tests + RLS isolation

**Files:**
- Create: `src/app/dashboard/outfit-actions.ts`
- Test: `tests/integration/outfit-generation-actions.test.ts`
- Modify: `tests/integration/rls-isolation.test.ts`

**Interfaces:** Consumes `getImageGenProvider`/`getStorageProvider` (Tasks 3, existing), `ImageGenProvider`/`OutfitGarmentInput` (Task 1).

- [ ] **Step 1: Write the failing tests**

```ts
// tests/integration/outfit-generation-actions.test.ts
import { describe, it, expect, vi } from "vitest";
import { createTestUser } from "./helpers/testUser";
import { supabaseAdmin } from "./helpers/supabaseAdmin";
import { generateOutfitVisualization } from "@/app/dashboard/outfit-actions";
import type { ImageGenProvider } from "@/lib/providers/types";

// The fake success provider returns a placeholder URL, not a real fetchable
// image -- stub global.fetch so the action's "download the generated image"
// step succeeds deterministically without depending on a real network
// resource. Must forward init (headers etc.) on the pass-through path, or
// Supabase's own authenticated requests break with "No API key found".
const realFetch = global.fetch;
global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  if (String(input) === "https://example.com/generated.jpg") {
    return new Response(new Uint8Array([1, 2, 3]), {
      status: 200,
      headers: { "content-type": "image/jpeg" },
    });
  }
  return realFetch(input as never, init);
}) as typeof fetch;

async function seedClothingItem(userId: string, categoryName: string, color: string) {
  const admin = supabaseAdmin();
  const imagePath = `${userId}/${categoryName}.jpg`;

  // getSignedUrl requires the object to actually exist in the bucket --
  // insert a real (tiny) placeholder so the action's signed-URL step works,
  // matching what a real uploaded clothing photo would provide.
  const { error: uploadError } = await admin.storage
    .from("clothing-photos")
    .upload(imagePath, new Blob([new Uint8Array([1, 2, 3])], { type: "image/jpeg" }), {
      contentType: "image/jpeg",
      upsert: true,
    });
  if (uploadError) throw new Error(`Could not seed storage object: ${uploadError.message}`);

  const { data: category } = await admin
    .from("clothing_categories")
    .select("id")
    .eq("name", categoryName)
    .single();
  const { data: subcategory } = await admin
    .from("clothing_subcategories")
    .select("id, name")
    .eq("category_id", category!.id)
    .limit(1)
    .single();
  const { data: item } = await admin
    .from("clothing_items")
    .insert({
      user_id: userId,
      image_url: imagePath,
      category_id: category!.id,
      subcategory_id: subcategory!.id,
      primary_color: color,
      pattern: "solid",
      style: "business_formal",
      formality_level: 4,
      description: `${color} ${categoryName}`,
    })
    .select("id")
    .single();
  return item!.id as string;
}

const fakeSuccessProvider: ImageGenProvider = {
  name: "fal-flux",
  generateOutfitVisualization: async () => ({
    imageUrl: "https://example.com/generated.jpg",
    requestId: "req-test-1",
    model: "fal-ai/flux-pro/kontext",
    prompt: "test prompt",
  }),
};

const fakeFailingProvider: ImageGenProvider = {
  name: "fal-flux",
  generateOutfitVisualization: async () => {
    throw new Error("simulated failure");
  },
};

describe("generateOutfitVisualization action", () => {
  it("creates a completed outfit with a stored image on success", async () => {
    const user = await createTestUser();
    const itemId = await seedClothingItem(user.id, "top", "white");

    const result = await generateOutfitVisualization([itemId], user.client, fakeSuccessProvider);
    if ("error" in result) throw new Error(result.error);

    const admin = supabaseAdmin();
    const { data: outfit } = await admin
      .from("outfits")
      .select("*")
      .eq("id", result.data.outfitId)
      .single();
    expect(outfit!.generation_status).toBe("completed");
    expect(outfit!.image_gen_provider).toBe("fal-flux");
    expect(outfit!.generated_image_url).toBeTruthy();
    expect(outfit!.generation_request_id).toBe("req-test-1");

    const { data: outfitItems } = await admin
      .from("outfit_items")
      .select("*")
      .eq("outfit_id", result.data.outfitId);
    expect(outfitItems).toHaveLength(1);

    await admin.storage.from("clothing-photos").remove([`${user.id}/top.jpg`]);
    await admin.storage.from("outfit-images").remove([outfit!.generated_image_url]);
    await user.cleanup();
  });

  it("marks the outfit failed and returns a safe error when generation fails", async () => {
    const user = await createTestUser();
    const itemId = await seedClothingItem(user.id, "bottom", "gray");

    const result = await generateOutfitVisualization([itemId], user.client, fakeFailingProvider);
    expect("error" in result).toBe(true);

    const admin = supabaseAdmin();
    const { data: outfits } = await admin
      .from("outfits")
      .select("generation_status, generation_error")
      .eq("user_id", user.id);
    expect(outfits![0].generation_status).toBe("failed");
    expect(outfits![0].generation_error).toBeTruthy();

    await admin.storage.from("clothing-photos").remove([`${user.id}/bottom.jpg`]);
    await user.cleanup();
  });

  it("returns an error for an empty selection instead of throwing", async () => {
    const user = await createTestUser();
    const result = await generateOutfitVisualization([], user.client, fakeSuccessProvider);
    expect("error" in result).toBe(true);
    await user.cleanup();
  });
});
```

- [ ] **Step 2: Run and verify failure**

Run: `npm test -- outfit-generation-actions`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement**

```ts
// src/app/dashboard/outfit-actions.ts
"use server";

import { randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getImageGenProvider, getStorageProvider } from "@/lib/providers";
import type { ImageGenProvider, OutfitGarmentInput } from "@/lib/providers/types";

type ActionResult<T> = { data: T } | { error: string };

async function requireUser(supabase: SupabaseClient) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

interface ClothingItemQueryRow {
  id: string;
  image_url: string;
  primary_color: string | null;
  pattern: string | null;
  style: string | null;
  clothing_categories: { name: string } | null;
  clothing_subcategories: { name: string } | null;
}

export async function generateOutfitVisualization(
  clothingItemIds: string[],
  injectedClient?: SupabaseClient,
  injectedImageGen?: ImageGenProvider
): Promise<ActionResult<{ outfitId: string; imageUrl: string }>> {
  const supabase = injectedClient ?? (await createClient());
  const user = await requireUser(supabase);
  if (!user) return { error: "You need to sign in again." };
  if (clothingItemIds.length === 0) return { error: "Select at least one clothing item." };

  const { data: items, error: itemsError } = await supabase
    .from("clothing_items")
    .select(
      "id, image_url, primary_color, pattern, style, clothing_categories(name), clothing_subcategories(name)"
    )
    .in("id", clothingItemIds)
    .eq("user_id", user.id);

  if (itemsError || !items || items.length !== clothingItemIds.length) {
    return { error: "Some selected items could not be found." };
  }

  const { data: outfit, error: insertError } = await supabase
    .from("outfits")
    .insert({ user_id: user.id, generation_status: "processing" })
    .select("id")
    .single();
  if (insertError || !outfit) {
    return { error: "Couldn't start generation — please try again." };
  }

  const storage = getStorageProvider(supabase);

  try {
    const rows = items as unknown as ClothingItemQueryRow[];
    const garments: OutfitGarmentInput[] = await Promise.all(
      rows.map(async (item) => ({
        imageUrl: await storage.getSignedUrl(item.image_url, 600),
        role: item.clothing_categories?.name ?? "top",
        category: item.clothing_categories?.name ?? "",
        subcategory: item.clothing_subcategories?.name ?? "",
        primaryColor: item.primary_color ?? "",
        pattern: item.pattern ?? "solid",
        style: item.style ?? "casual",
      }))
    );

    const imageGen = injectedImageGen ?? getImageGenProvider();
    const generated = await imageGen.generateOutfitVisualization({ garments });

    const imageResponse = await fetch(generated.imageUrl);
    if (!imageResponse.ok) {
      throw new Error("Could not download the generated image.");
    }
    const blob = await imageResponse.blob();
    const path = `${user.id}/${randomUUID()}.jpg`;
    await storage.uploadImage({ userId: user.id, file: blob, path });

    await supabase
      .from("outfits")
      .update({
        generation_status: "completed",
        generated_image_url: path,
        image_gen_provider: imageGen.name,
        image_gen_model: generated.model,
        generation_request_id: generated.requestId,
        generation_prompt: generated.prompt,
      })
      .eq("id", outfit.id);

    await supabase.from("outfit_items").insert(
      rows.map((item) => ({
        outfit_id: outfit.id,
        clothing_item_id: item.id,
        role: item.clothing_categories?.name ?? "top",
      }))
    );

    return { data: { outfitId: outfit.id, imageUrl: path } };
  } catch (err) {
    await supabase
      .from("outfits")
      .update({
        generation_status: "failed",
        generation_error: err instanceof Error ? err.message : "Generation failed.",
      })
      .eq("id", outfit.id);
    return { error: "Couldn't generate your outfit visualization — please try again." };
  }
}
```

- [ ] **Step 4: Run and verify pass**

Run: `npm test -- outfit-generation-actions`
Expected: all PASS.

- [ ] **Step 5: Add the RLS isolation case**

Append to `tests/integration/rls-isolation.test.ts` (new `it` inside the existing `describe` block):

```ts
it("user A cannot read or modify user B's outfits row", async () => {
  const userA = await createTestUser();
  const userB = await createTestUser();
  const admin = supabaseAdmin();

  const { data: outfit } = await userB.client
    .from("outfits")
    .insert({ user_id: userB.id, generation_status: "completed", generated_image_url: `${userB.id}/x.jpg` })
    .select("id")
    .single();

  const { data: readAsA } = await userA.client.from("outfits").select("id").eq("id", outfit!.id);
  expect(readAsA).toEqual([]);

  const { data: updateAsA } = await userA.client
    .from("outfits")
    .update({ generation_status: "failed" })
    .eq("id", outfit!.id)
    .select();
  expect(updateAsA).toEqual([]);

  await admin.from("outfits").delete().eq("id", outfit!.id);
  await userA.cleanup();
  await userB.cleanup();
});
```

Run: `npm test -- rls-isolation`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/dashboard/outfit-actions.ts tests/integration/outfit-generation-actions.test.ts tests/integration/rls-isolation.test.ts
git commit -m "feat: add generateOutfitVisualization server action with RLS isolation tests"
```

---

### Task 6: Documentation

**Files:**
- Modify: `README.md`
- Modify: `AI Outfit Picker - Architecture & Technology Recommendation.md`

- [ ] **Step 1: Update README**

Add to the Status section: FLUX-via-fal.ai image generation is implemented behind `ImageGenProvider` (provider + prompt builder + server action), not yet wired to a picker UI. Add to Environment variables: `FAL_KEY` — server-side only, paid (no free tier; ~$0.04–0.08/image), get it from fal.ai dashboard.

- [ ] **Step 2: Update the architecture doc**

In section C.6, add a note above the original CatVTON/Gemini/FASHN table: "**Superseded (see `docs/superpowers/specs/2026-08-13-flux-image-generation-design.md`):** the project uses FLUX via fal.ai (`fal-ai/flux-pro/kontext` / `/max/multi`) instead of the CatVTON/Gemini-image/FASHN path originally analyzed below. Kept for historical context." Update section D's "Image generation" rows similarly.

- [ ] **Step 3: Commit**

```bash
git add README.md "AI Outfit Picker - Architecture & Technology Recommendation.md"
git commit -m "docs: document FLUX via fal.ai as the image-generation provider"
```

---

### Task 7: Full verification + manual test (if `FAL_KEY` available)

- [ ] **Step 1: Full automated suite**

```bash
npm test
npm run lint
npm run build
```
Expected: all pass, clean lint, successful build.

- [ ] **Step 2: Ask whether a real `FAL_KEY` is available for a manual end-to-end test**

If yes: write a small one-off script (or reuse the integration test pattern) that calls `generateOutfitVisualization` with real seeded clothing items and the real `getImageGenProvider()` (no injected fake), using real uploaded garment photos. Verify: fal.ai returns an image, it lands in the `outfit-images` bucket, the `outfits` row is `completed` with all generation-tracking fields populated, `outfit_items` rows are correct. Clean up test data afterward.

If no: report the pipeline as tested via the injected-fake-provider integration tests, with real-provider verification deferred.

- [ ] **Step 3: Do NOT merge**

Per the explicit instruction: leave the branch/worktree in place and report it ready for review. Do not merge to `main` automatically.

---

## Self-Review

**Spec coverage:** Provider abstraction preserved (Task 1) — `ImageGenProvider` widened, not replaced. Multi-garment reference images (Task 3, endpoint selection). Prompt builder is dynamic, not hardcoded (Task 2). `FAL_KEY` server-side only (Task 3's factory, never referenced in client code). Storage independence from fal.ai's URL (Task 5, download-then-upload). DB tracking fields (Task 4). Error handling / failed-status path (Task 5). Tests at both unit and integration level (Tasks 2, 3, 5). Documentation of cost/limitations (Task 6). No merge without review (Task 7 Step 3). Gemini/`AIProvider`/wardrobe code is never touched by any task.

**Placeholder scan:** no TBD/TODO; every step has real code or an exact command.

**Type consistency:** `OutfitGarmentInput` (Task 1) flows unchanged through `buildVisualizationPrompt` (Task 2), `FalFluxImageGenProvider` (Task 3), and `outfit-actions.ts` (Task 5). `ImageGenProvider.generateOutfitVisualization`'s return shape (`imageUrl`, `requestId`, `model`, `prompt`) is defined once in Task 1 and consumed identically in Tasks 3 and 5.
