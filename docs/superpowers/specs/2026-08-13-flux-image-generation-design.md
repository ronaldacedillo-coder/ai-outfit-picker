# FLUX via fal.ai — Image Generation Provider — Design Spec

**Status:** Approved
**Date:** 2026-08-13
**Milestone:** Replace the planned image-generation path with FLUX via fal.ai, behind the existing `ImageGenProvider` abstraction.
**Relationship to prior work:** Builds on the Wardrobe Core milestone (auth, wardrobe, `AIProvider`/`StorageProvider` abstractions). Supersedes the [Architecture doc](../../../AI%20Outfit%20Picker%20-%20Architecture%20%26%20Technology%20Recommendation.md) section C.6's original recommendation (CatVTON self-hosted primary / Gemini image editing fallback / FASHN.ai commercial upgrade). Does **not** touch `AIProvider` (Gemini) or the wardrobe feature.

---

## 1. Scope

**In scope:** `ImageGenProvider` interface update, `FalFluxImageGenProvider` implementation, a reusable prompt-builder module, a minimal server action that generates and stores one outfit visualization from a set of clothing items, database columns for generation tracking, a new private Storage bucket for generated images.

**Explicitly out of scope:** the Outfit Picker UI, the deterministic compatibility-matching engine, outfit browsing/history UI. Those remain the next milestone. This work only proves the generation pipeline end-to-end (provider → storage → DB row) via tests and a server action, not a user-facing picker screen.

**Explicitly not touched:** `AIProvider`, `GeminiAIProvider`, clothing analysis, clothing classification, the wardrobe upload/review/grid feature.

---

## 2. Confirmed decisions

1. **Provider:** FLUX via fal.ai, using the official `@fal-ai/client` package (the `@fal-ai/serverless-client` package is deprecated — not used).
2. **Primary endpoint:** `fal-ai/flux-pro/kontext/max/multi` — accepts multiple reference images (`image_urls: string[]`) in one call, the only current FLUX endpoint that composites more than one reference image into a single generation. Used whenever 2+ garments are selected.
3. **Fallback endpoint:** `fal-ai/flux-pro/kontext` — single `image_url`, used when only one garment is selected (cheaper, no reason to pay the multi-image rate for one reference).
4. **Cost is real, not free:** fal.ai has no ongoing free tier (pay-as-you-go, one-time signup credit only). Confirmed pricing: Kontext Pro ≈ $0.04/image, Kontext Max ≈ $0.08/image (the multi-image variant's price isn't separately published; budget at the Max rate). This is documented plainly, not described as free.
5. **Commercial license:** fal.ai's hosted FLUX Kontext models carry standard commercial API terms — unlike the previously-planned CatVTON path (CC-BY-NC, non-commercial only), this resolves the licensing constraint the original architecture doc flagged.
6. **`FAL_KEY`** is a server-side-only secret, read the same way `GEMINI_API_KEY` already is — never `NEXT_PUBLIC_`-prefixed, never sent to the browser, never logged.
7. **Garment fidelity is "faithful approximation," not exact reproduction** — FLUX Kontext is general-purpose image editing, not a pixel-level warping try-on model. This is documented as a known limitation, matching the honesty requirement the original architecture doc already established (see spec section 8 below).
8. **No native model/identity consistency across separate generations** — Kontext edits/composites per call; it does not lock a character identity. Approximated via a fixed `seed` + consistent styling/background instructions in the prompt. Documented as a known gap, not oversold.

---

## 3. `ImageGenProvider` interface (updated)

Current (Wardrobe Core era, stub-only):

```ts
export interface ImageGenProvider {
  name: "catvton" | "gemini" | "fashn";
  generateOutfitVisualization(input: {
    modelReferenceUrl?: string;
    garmentImageUrls: string[];
  }): Promise<{ imageUrl: string }>;
}
```

Updated — garments carry metadata (needed for prompt construction, not just bare URLs), and the result carries enough to populate the new `outfits` generation-tracking columns:

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

export interface ImageGenProvider {
  name: string; // e.g. "fal-flux"
  generateOutfitVisualization(input: {
    garments: OutfitGarmentInput[];
    seed?: number;
  }): Promise<{
    imageUrl: string; // temporary, provider-hosted — caller downloads and re-stores it
    requestId: string;
    model: string;
    prompt: string;
  }>;
}
```

`name` widens from a closed union to `string` — the whole point of this milestone is adding a provider the original union didn't anticipate; a closed union would need editing every time a provider is added, which defeats the abstraction.

---

## 4. Reference-image strategy

Each selected garment's photo already lives in the private `clothing-photos` bucket. The server action resolves a signed URL per garment via the existing `StorageProvider.getSignedUrl` — with a longer expiry (10 minutes, vs. the 5 minutes used for Gemini analysis) so fal.ai's queue has time to fetch it during processing. These URLs are passed as `image_urls` to the multi endpoint (or a single `image_url` to the fallback endpoint). Gemini-derived structured metadata (category/color/pattern/style, already stored per item from the Wardrobe Core milestone) is *also* included as prompt text — the images are the primary fidelity signal, the text is a second, reinforcing signal, not a replacement.

---

## 5. Prompt construction

A pure, unit-testable function builds the prompt from garment metadata — not a hardcoded string:

```ts
// src/lib/outfit/buildVisualizationPrompt.ts
export function buildVisualizationPrompt(garments: OutfitGarmentInput[]): string
```

Rules encoded in the builder (matching the product requirements):
- Lists exactly the selected garments (by role, color, pattern, subcategory) — never invents items not in the list.
- Instructs the model to preserve color/pattern/construction/proportions from the reference images.
- Requests photorealistic male model, full or three-quarter body, neutral studio background, professional lighting, natural proportions.
- Explicitly instructs: don't add accessories not requested, don't change garment colors, don't invent logos/patterns.

---

## 6. `FalFluxImageGenProvider`

```ts
// src/lib/providers/fal-flux.ts
export class FalFluxImageGenProvider implements ImageGenProvider {
  readonly name = "fal-flux";
  constructor(apiKey: string) { /* fal.config({ credentials: apiKey }) */ }

  async generateOutfitVisualization(input: {
    garments: OutfitGarmentInput[];
    seed?: number;
  }): Promise<{ imageUrl: string; requestId: string; model: string; prompt: string }> {
    // garments.length === 1 -> fal-ai/flux-pro/kontext (image_url)
    // garments.length  >= 2 -> fal-ai/flux-pro/kontext/max/multi (image_urls)
    // prompt = buildVisualizationPrompt(garments)
    // fal.subscribe(endpoint, { input: { prompt, image_url(s), seed }, onQueueUpdate })
    // returns { imageUrl: result.data.images[0].url, requestId: result.requestId, model, prompt }
  }
}
```

Errors (missing/invalid key, fal.ai API failure, rate limit, timeout, invalid reference image) are caught and re-thrown as plain `Error`s with user-safe messages — no raw fal.ai internals or keys ever surface to the caller. Matches the existing `GeminiAIProvider` error-handling convention.

`getImageGenProvider()` is added to `src/lib/providers/index.ts`, mirroring `getAIProvider()`:

```ts
export function getImageGenProvider(): ImageGenProvider {
  const apiKey = process.env.FAL_KEY;
  if (!apiKey) throw new Error("FAL_KEY is not configured.");
  return new FalFluxImageGenProvider(apiKey);
}
```

---

## 7. Server action

A minimal, DI-testable action (matching the pattern already used for `analyzeClothingPhoto`):

```ts
// src/app/dashboard/outfit-actions.ts
export async function generateOutfitVisualization(
  clothingItemIds: string[],
  injectedClient?: SupabaseClient,
  injectedImageGen?: ImageGenProvider
): Promise<{ data: { outfitId: string; imageUrl: string } } | { error: string }>
```

Flow:
1. Auth check (same `requireUser` helper already in `actions.ts`).
2. Fetch the requested `clothing_items` rows, scoped to the caller (RLS + explicit `user_id` filter, same defense-in-depth pattern already used).
3. Insert an `outfits` row with `generation_status = 'processing'` immediately (so a row exists even if generation later fails — supports the "generation status" and "generation history" requirements without building a queue system).
4. Resolve signed URLs for each garment image, build `OutfitGarmentInput[]`.
5. Call `getImageGenProvider().generateOutfitVisualization(...)`.
6. On success: download the returned temporary image, `StorageProvider.uploadImage` into `outfit-images`, update the `outfits` row (`generation_status = 'completed'`, `generated_image_url`, `image_gen_provider`, `image_gen_model`, `generation_request_id`, `generation_prompt`), insert `outfit_items` rows (one per garment, using each item's stored `role`... actually `outfit_items.role` — see section 9, garments don't currently store a "role"; the action derives it from `clothing_categories.applicable_roles` the same way the architecture doc's matching-engine design already intends).
7. On failure: update the row to `generation_status = 'failed'`, `generation_error` set to a safe message, return `{ error: ... }` — never throws past the action boundary.

---

## 8. Database changes

`outfits` already has (from the foundation schema): `id, user_id, starting_item_id, compatibility_score, score_breakdown, ai_explanation, generated_image_url, image_gen_provider, is_saved, created_at`. No duplication — adding only what's missing, all nullable/additive:

```sql
alter table outfits
  add column image_gen_model text,
  add column generation_status text
    check (generation_status in ('queued', 'processing', 'completed', 'failed')),
  add column generation_error text,
  add column generation_request_id text,
  add column generation_prompt text;
```

Plus a new private Storage bucket `outfit-images`, RLS-scoped per-user-folder — identical pattern to `clothing-photos` (migration `0002_outfit_images_storage.sql`).

No sensitive data (API keys) stored in the database, per the existing convention.

---

## 9. Garment role resolution

`outfit_items.role` (e.g. `"top"`, `"bottom"`, `"outerwear"`) needs a value per garment for both the prompt builder and the DB insert. Since the matching engine (which would normally assign roles) doesn't exist yet, the server action derives role directly from each clothing item's `clothing_categories.name` (`top`/`bottom`/`outerwear` already match `applicable_roles` 1:1 for the 5 seeded subcategories) — a simple, correct mapping for the current category set, not a placeholder. This is revisited if/when the matching engine introduces more nuanced role assignment.

---

## 10. Storage flow

```
Selected clothing item IDs
        ↓
Signed URLs resolved (existing StorageProvider, clothing-photos bucket)
        ↓
FalFluxImageGenProvider.generateOutfitVisualization
        ↓
fal.ai / FLUX Kontext (temporary, fal.ai-hosted result URL)
        ↓
Server downloads the image bytes
        ↓
StorageProvider.uploadImage (new outfit-images bucket)
        ↓
outfits.generated_image_url = stored path (not the fal.ai URL)
        ↓
Signed URL resolved at render time, same convention as clothing photos
```

The app never depends on fal.ai's temporary output URL past the initial download — matches the existing architecture's storage-independence goal.

---

## 11. Error handling

| Failure | Behavior |
|---|---|
| `FAL_KEY` missing | `getImageGenProvider()` throws before any network call; action returns a friendly error, `outfits` row marked `failed` |
| fal.ai API failure / rate limit / insufficient credits | Caught in the provider, re-thrown as a plain `Error` with no raw provider internals; action marks the row `failed` with a safe message |
| Timeout | `fal.subscribe`'s own timeout surfaces as a caught error, same handling |
| Invalid/unreachable reference image | fal.ai returns an error for an unfetchable `image_url`; same catch-and-mark-failed path |
| Storage download/upload failure after a successful generation | Row marked `failed` with a distinct message (`"Generated but couldn't be saved"`), the temporary fal.ai URL is not persisted anywhere so nothing dangles |

Raw errors are never returned to the client; only safe, user-facing messages are. Nothing is logged that contains the API key.

---

## 12. Testing plan

**Unit (Vitest):**
- `buildVisualizationPrompt` — includes only selected garments, preserves color/pattern instructions, never adds unrequested items.
- `FalFluxImageGenProvider` — endpoint selection (1 garment → single endpoint, 2+ → multi endpoint), mocked `@fal-ai/client` for success/error/malformed-response cases, missing-key handling.

**Integration (Vitest against the real Supabase project, DI-injected fake `ImageGenProvider`):**
- `generateOutfitVisualization` action: creates an `outfits` row, updates it to `completed` with correct fields on success, updates to `failed` with a safe message when the injected provider throws, inserts correct `outfit_items` rows, stores the image via `StorageProvider` into `outfit-images`.
- RLS: user A cannot read/modify user B's `outfits`/`outfit_items` rows or `outfit-images` storage objects (same isolation-test pattern already established for wardrobe).

**Manual (only if a real `FAL_KEY` is available, asked for the same way `GEMINI_API_KEY` was):** real generation end-to-end — select real uploaded garments, confirm the actual FLUX output, confirm it lands in Storage and the `outfits` row, confirm the UI (test harness page or direct DB/Storage check) can render it.

---

## 13. Known limitations (carried into documentation, not hidden)

- `fal-ai/flux-pro/kontext/max/multi` is labeled "Experimental" by fal.ai; max image count and per-garment fidelity aren't documented guarantees — needs empirical verification and likely prompt tuning once real generations are tested.
- No native persistent virtual-model identity across separate generations; approximated via fixed seed + consistent prompt language, not guaranteed.
- General-purpose image editing, not pixel-level garment warping — expect "faithful approximation," not exact reproduction. A dedicated try-on model (IDM-VTON/CatVTON, also fal.ai-hosted) would improve structural fidelity but is non-commercial-licensed, which is why it isn't the pick here.
- Real per-generation cost (~$0.04–0.08/image) — no more $0/month claim for this specific feature.
