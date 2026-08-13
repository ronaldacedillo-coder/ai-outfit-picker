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
- Each photo uploaded once to a private Supabase Storage bucket, then classified by Gemini 2.5 Flash (`src/lib/providers/gemini.ts`) behind the `AIProvider` interface
- AI output is schema-validated (zod) and never trusted directly — the user reviews/edits every field before anything is saved; AI failures fall back to manual entry, never block saving
- My Wardrobe grid: view, edit, delete, and filter by category/style/formality/color

Not yet built: starting-item selection, the matching engine, outfit visualization. These come next.

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
- Storage: private `clothing-photos` bucket, RLS-scoped per user folder (`<user_id>/...`)

## Environment variables

`.env.local` needs, beyond the Supabase URL/anon key already there:
- `SUPABASE_SERVICE_ROLE_KEY` — server-side only, used by integration tests to create/clean up throwaway test users
- `GEMINI_API_KEY` — server-side only, free key from [Google AI Studio](https://aistudio.google.com/apikey), used for clothing classification

## Deployment (not yet done)

Per the architecture doc: Cloudflare Pages is the recommended host (free, no commercial-use restriction, unlike Vercel's Hobby tier). Not wired up yet — flag when you're ready to deploy and we'll set it up.
