# AI Outfit Picker

"My personal AI stylist that knows the clothes I actually own."

See **`AI Outfit Picker - Architecture & Technology Recommendation.md`** in this folder for the full product/technical analysis (stack rationale, database schema, AI architecture, cost breakdown, and the open decision on virtual try-on licensing).

## Status

Foundation milestone complete:
- Next.js 16 (App Router, TypeScript, Tailwind) scaffold
- Supabase project provisioned (Postgres + Auth), schema applied, RLS enabled on every table
- Working sign up / log in / log out flow, protected `/dashboard` route
- Provider interfaces stubbed out (`src/lib/providers/types.ts`) for AI, image generation, and storage — kept swappable per the architecture doc

Not yet built: wardrobe upload, clothing classification, matching engine, outfit visualization. These come next, one at a time.

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

## Deployment (not yet done)

Per the architecture doc: Cloudflare Pages is the recommended host (free, no commercial-use restriction, unlike Vercel's Hobby tier). Not wired up yet — flag when you're ready to deploy and we'll set it up.
