# Wardrobe Core — Design Spec

**Status:** Approved
**Date:** 2026-08-13
**Milestone:** Wardrobe Core (Upload → AI Classification → Review → Save → My Wardrobe)
**Relationship to prior work:** Builds on the Foundation milestone (auth, Supabase schema, provider stubs) and the [Architecture & Technology Recommendation](../../../AI%20Outfit%20Picker%20-%20Architecture%20%26%20Technology%20Recommendation.md) doc, section J item 2 ("Wardrobe core").

---

## 1. Scope

**In scope:** photo upload (single + multiple), client-side image validation/resize/compression, Gemini-based clothing classification, a review/edit screen before anything is saved, persisting confirmed items to the wardrobe, and a My Wardrobe grid with view/edit/delete and basic filtering.

**Explicitly out of scope (next milestone):** starting-item selection, the deterministic matching engine, outfit visualization/virtual try-on, stylist chat. Nothing in this milestone should require touching `outfits` or `outfit_items`.

---

## 2. Confirmed decisions

1. **Storage:** Supabase Storage for this milestone (bucket `clothing-photos`, private). Access stays behind the existing `StorageProvider` interface so migrating to Cloudflare R2 later is an adapter swap, not an application rewrite.
2. **AI model:** Gemini 2.5 Flash (stable free tier: 250 requests/day, 10 RPM), called via the official `@google/genai` SDK's `ai.models.generateContent`. Gemini 3 Flash exists only as a preview with tighter limits as of this writing — not used for a path users depend on. Model name lives in one constant behind `GeminiAIProvider`, not hard-coded elsewhere.
3. **Background removal:** deferred. Not implemented this milestone; revisited when outfit visualization needs garment-preservation fidelity.
4. **Multi-upload:** supported. Each photo is uploaded, analyzed, and reviewed independently — no batch review form.
5. **No duplicate uploads:** the image is uploaded to Storage exactly once, immediately after client-side processing. Save only writes DB metadata referencing the already-uploaded object; it never re-uploads the image.
6. **AI is optional:** any Gemini failure (network error, timeout, quota exhaustion, invalid JSON) drops the user into the same review screen with empty/manual fields instead of blocking the upload.
7. **User corrections are authoritative:** once the user accepts or edits AI output and saves, the stored row reflects the user's values. `user_edited` is set to `true` whenever any field differs from the AI's raw suggestion (or when there was no valid AI suggestion at all).
8. **UI:** simple, visual, no unnecessary form fields beyond what's specified.
9. **Security:** bucket stays private (no public read); every Storage and DB access path is scoped to the authenticated user via RLS, verified by tests using two distinct test users.
10. **Testing:** required, listed in section 8.
11. **No outfit-matching work this milestone.**

---

## 3. Data model

No new tables and no column changes — the existing schema already fits:

- `clothing_categories` / `clothing_subcategories`: already seeded with exactly the 5 requested types (`top` → long/short-sleeve shirt, polo; `bottom` → pants; `outerwear` → business jacket).
- `clothing_items`: already has every field this milestone needs (`image_url`, `category_id`, `subcategory_id`, colors, `pattern`, `style`, `formality_level`, `description`, `ai_analysis` jsonb, `user_edited`).
- RLS policy `users can manage own clothing items` (`ALL`, `auth.uid() = user_id`) already covers select/insert/update/delete.

**One convention decision:** `clothing_items.image_url` stores the **Storage object path** (e.g. `"<user_id>/<uuid>.jpg"`), not a working HTTP URL — the bucket is private, so a bare URL wouldn't be fetchable anyway. The app resolves a short-lived signed URL from the path at render time. This is documented in code where the column is written/read so it isn't a silent surprise.

**New infrastructure (this milestone):**
- Private Storage bucket `clothing-photos`.
- `storage.objects` RLS policies scoping every operation to the caller's own `{user_id}/...` folder (via `storage.foldername(name)[1] = auth.uid()::text`).

---

## 4. Provider interfaces

`src/lib/providers/types.ts` gets one addition — a signed-URL method, needed because the bucket is private and nothing else in the interface currently supports resolving a renderable URL from a stored path:

```ts
export interface StorageProvider {
  uploadImage(input: { userId: string; file: Blob; path: string }): Promise<{ url: string }>;
  deleteImage(path: string): Promise<void>;
  getSignedUrl(path: string, expiresInSeconds?: number): Promise<string>;
}
```

`uploadImage`'s returned `url` is the object **path** for a private-storage implementation (documented on the interface) — callers that need a renderable URL call `getSignedUrl`.

`AIProvider.analyzeClothingImage(imageUrl: string)` keeps its existing signature. The Gemini implementation receives a signed URL, fetches the bytes itself server-side, base64-encodes them, and sends them to Gemini as `inlineData` — this keeps the interface swap-friendly (any future AI provider just needs *a* URL, not knowledge of Supabase's private-bucket mechanics) and never sends a raw file over to Google except via the provider that needs it.

Both concrete providers (`GeminiAIProvider`, `SupabaseStorageProvider`) live in `src/lib/providers/` next to the interfaces, selected through a small factory (`src/lib/providers/index.ts`) so nothing else in the app imports a vendor SDK directly — matching the existing file's own stated rule ("Nothing outside `src/lib/providers/*` should import a vendor SDK directly").

---

## 5. Upload → analyze → review → save flow

```
select file(s)
  → validate (type, size) — client-side, immediate feedback
  → resize + compress via <canvas> — client-side
  → upload processed image once → Supabase Storage (private, "<user_id>/<uuid>.jpg")
  → server action: analyze via GeminiAIProvider
      success → structured JSON → validated with zod → review screen pre-filled
      failure/invalid → review screen with empty fields, non-blocking notice
  → user edits/confirms fields
  → Accept & Save → insert clothing_items row (image_url = stored path, user_edited computed)
  → item appears in My Wardrobe (revalidated)
```

Multi-file selection processes each file through this pipeline independently and concurrently; each gets its own progress → review card. A slow or failed item never blocks the others.

**Re-analyze** re-runs Gemini against the *same already-uploaded* image (no re-upload). **Cancel** discards the review card and deletes the uploaded Storage object (since nothing referencing it was ever saved) — this is the one path where an upload can be cleaned up before a DB row exists.

---

## 6. Validation

Two zod schemas in `src/lib/validation/clothing.ts`:

- `clothingAnalysisSchema` — validates Gemini's raw JSON response before it's trusted anywhere (category/subcategory as free-form strings resolved against the DB-seeded lists client-side, since Gemini's classification vocabulary won't always match seeded rows exactly; pattern/style/formality constrained to the same enums as the DB check constraints so a save never violates a DB constraint).
- `clothingItemInputSchema` — validates the review screen's submitted payload before insert/update (this is what actually gets trusted into the database; the AI schema only gates what's allowed to *pre-fill* the form).

Client-side image validation is separate, pure, and unit-tested on its own: file type allow-list (`image/jpeg`, `image/png`, `image/webp`), max raw size (10 MB), and a pure `computeTargetDimensions(width, height, maxDimension)` function the canvas step calls into — the canvas draw/export itself is exercised by manual browser testing (see section 8), since jsdom has no real canvas rasterizer worth trusting for pixel-level correctness.

---

## 7. Error handling

| Failure | User-facing behavior |
|---|---|
| Invalid file type/size | Inline message before any upload starts; file never leaves the browser |
| Storage upload fails | Retry button on that item's card; other items unaffected |
| Gemini fails / times out / quota exhausted | Review screen opens with empty fields and a small notice ("AI analysis unavailable — enter details manually"); never blocks save |
| Gemini returns invalid/unparseable JSON | Same as above — treated identically to a failure, not surfaced as a raw error |
| Auth session missing/expired | Server actions re-check `auth.getUser()` independently of any client state; redirect to `/login` |
| DB insert/update/delete fails | Generic message ("Couldn't save — try again"); actual error logged server-side only, never returned to the client |
| Delete of an item whose Storage object is already gone | DB row is still removed; Storage deletion errors are swallowed (already-deleted is not a failure state) |

---

## 8. Testing plan

**Unit (Vitest, new dependency):**
- `clothingAnalysisSchema` / `clothingItemInputSchema` — valid input, missing required fields, out-of-enum values, wrong types.
- Image validation (`validateImageFile`): accepted types, rejected types, oversized file.
- `computeTargetDimensions`: various aspect ratios against the max-dimension cap.

**Integration (Vitest against the real `ai-outfit-picker` Supabase project, two throwaway test users via `SUPABASE_SERVICE_ROLE_KEY`):**
- Save → row exists with expected fields, `user_edited` computed correctly.
- Update → only the owner's row changes.
- Delete → DB row and Storage object both gone.
- **RLS isolation:** user A cannot select/update/delete user B's `clothing_items` row or read/write user B's Storage folder — asserted by attempting the operation as user A's authenticated client and expecting it to no-op/fail, not by inspecting policy SQL.

**Manual (browser, this session, before reporting done):** single upload, multiple uploads, oversized/invalid file rejected, successful Gemini analysis, a forced Gemini failure path (manual entry works end-to-end), review edit changes what's saved, wardrobe grid displays saved items, filters work, edit an existing item, delete an item (confirm Storage object is removed), confirm a second browser session (different user) cannot see the first user's items.

---

## 9. Free-tier footprint

| Service | This milestone's usage |
|---|---|
| Supabase Storage | Clothing photos only, resized/compressed client-side before upload — well under the ~1 GB free ceiling for personal-scale testing |
| Supabase Postgres/Auth | No change — already within free tier |
| Gemini 2.5 Flash | One request per upload + one per re-analyze; 250/day free is far more than a personal wardrobe needs |

No paid dependency introduced. `SUPABASE_SERVICE_ROLE_KEY` and `GEMINI_API_KEY` are both server-side-only secrets (never `NEXT_PUBLIC_`-prefixed, never sent to the browser).

---

## 10. Open items carried forward (not blocking this milestone)

- Cloudflare R2 migration, if/when Supabase Storage's free ceiling becomes a real constraint.
- Background removal, revisited at the outfit-visualization milestone.
- Image-generation provider licensing decision (CatVTON vs. Gemini image editing) — untouched by this milestone.
