# AI Outfit Picker

"My personal AI stylist that knows the clothes I actually own."

See **`AI Outfit Picker - Architecture & Technology Recommendation.md`** in this folder for the full product/technical analysis (stack rationale, database schema, AI architecture, cost breakdown, and the open decision on virtual try-on licensing).

## Status

Foundation milestone complete:
- Next.js 16 (App Router, TypeScript, Tailwind) scaffold
- Supabase project provisioned (Postgres + Auth), schema applied, RLS enabled on every table
- Working sign up / log in / log out flow, protected `/dashboard` route
- Provider interfaces stubbed out (`src/lib/providers/types.ts`) for AI, image generation, and storage — kept swappable per the architecture doc

Wardrobe Core milestone complete:
- Upload one or more clothing photos, with client-side validation (type/size) and resize/compression before upload
- Each photo uploaded once to a private Supabase Storage bucket, then classified by Gemini 3.5 Flash (`src/lib/providers/gemini.ts`) behind the `AIProvider` interface — gemini-2.5-flash/flash-lite return a hard 404 for API keys created after Google's 2.5-generation sunset, not just a rate-limit issue
- AI output is schema-validated (zod) and never trusted directly — the user reviews/edits every field before anything is saved; AI failures fall back to manual entry, never block saving
- My Wardrobe grid: view, edit, delete, and filter by category/style/formality/color

FLUX-via-fal.ai image generation implemented (provider + prompt builder + server action), not yet wired to a picker UI:
- `FalFluxImageGenProvider` (`src/lib/providers/fal-flux.ts`) implements the `ImageGenProvider` interface — application code depends on the interface, not on fal.ai directly
- Uses `fal-ai/flux-pro/kontext/max/multi` (2+ reference garment photos composited into one image) or `fal-ai/flux-pro/kontext` (1 garment) — the only current FLUX endpoints that accept real reference images, not just a text prompt, so an uploaded garment's actual color/pattern/cut can be preserved rather than reduced to a description
- **Not free** — fal.ai has no ongoing free tier. ~$0.04/image (single-garment) to ~$0.08/image (multi-garment), pay-as-you-go
- `generateOutfitVisualization` server action (`src/app/dashboard/outfit-actions.ts`) wires garment selection → FLUX → download → `StorageProvider` (private `outfit-images` bucket) → `outfits`/`outfit_items` rows — proven end-to-end via tests, no picker UI yet
- Known limitations: the multi-image endpoint is labeled "Experimental" by fal.ai with no documented max-image or fidelity guarantee; no native persistent model identity across separate generations (approximated via fixed seed, not guaranteed); this is general-purpose image editing, not pixel-level garment warping, so expect a faithful approximation, not exact reproduction — see `docs/superpowers/specs/2026-08-13-flux-image-generation-design.md`

Not yet built: the Outfit Picker UI, the deterministic compatibility-matching engine, outfit browsing/history.

## Local setup

```bash
npm install
npm run dev
```

Then open http://localhost:3000. `.env.local` already contains this project's Supabase URL and publishable key (safe to expose client-side — these are not secret keys).

## Supabase project

- Project: `ai-outfit-picker` (ref `ptdqnotoxaszbirwfijo`), same org as your other Supabase projects, free tier
- Tables: `users`, `clothing_categories`, `clothing_subcategories`, `clothing_items`, `outfits`, `outfit_items`
- Every table has Row-Level Security scoped to the signed-in user
- Storage: private `clothing-photos` bucket and private `outfit-images` bucket, both RLS-scoped per user folder (`<user_id>/...`)

## Environment variables

`.env.local` needs, beyond the Supabase URL/anon key already there:
- `SUPABASE_SERVICE_ROLE_KEY` — server-side only, used by integration tests to create/clean up throwaway test users
- `GEMINI_API_KEY` — server-side only, free key from [Google AI Studio](https://aistudio.google.com/apikey), used for clothing classification and outfit reasoning (unchanged by the FLUX work below)
- `FAL_KEY` — server-side only, **paid** (no free tier, one-time signup credit only) key from the [fal.ai dashboard](https://fal.ai/dashboard/keys), used for outfit image generation

## Testing generation

- Unit/integration tests run without a real `FAL_KEY` — the provider layer is exercised via a mocked `@fal-ai/client`, and the server action's tests inject a fake `ImageGenProvider` (same dependency-injection pattern used for Gemini).
- A real end-to-end generation (actual FLUX call) requires a real `FAL_KEY` in `.env.local` and is run manually, the same way real Gemini classification is verified.

## Replacing a provider later

Both `AIProvider` and `ImageGenProvider` are interfaces in `src/lib/providers/types.ts`; concrete implementations live alongside them (`gemini.ts`, `fal-flux.ts`, `supabase-storage.ts`) and are selected in one place, `src/lib/providers/index.ts`. To swap `FalFluxImageGenProvider` for a different image-generation backend, implement `ImageGenProvider` in a new file and change what `getImageGenProvider()` returns — nothing else in the app imports fal.ai directly.

## Deployment (not yet done)

Per the architecture doc: Cloudflare Pages is the recommended host (free, no commercial-use restriction, unlike Vercel's Hobby tier). Not wired up yet — flag when you're ready to deploy and we'll set it up.
