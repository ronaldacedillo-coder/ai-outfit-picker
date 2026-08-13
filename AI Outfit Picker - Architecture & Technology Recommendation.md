# AI Outfit Picker — Architecture & Technology Recommendation

**Status:** Pre-implementation analysis (Phase 1–3 of the development process). No application code has been written yet.
**Date:** August 13, 2026

---

## A. Product Understanding

AI Outfit Picker is a personal-wardrobe stylist, not a fashion catalog. The user photographs clothes they actually own; the system classifies each item, and lets the user pin a "starting item" (any garment, not just a jacket). From there:

1. A **matching engine** scores every compatible item already in the user's wardrobe across color, style, formality, and pattern — never suggesting clothes the user doesn't own.
2. The AI explains *why* a combination works, in plain language, and offers several ranked alternatives.
3. The user can lock/swap pieces interactively, and the system re-evaluates compatibility live.
4. Once an outfit is chosen, the system generates a photorealistic image of an AI male model wearing that specific outfit, trying to preserve the real garments' color, pattern, and silhouette — not a generic stock outfit.
5. The AI behaves like a proactive stylist ("this jacket has three strong matches," "want something lighter?"), not a passive form.

The two hardest engineering problems are **(1)** compatibility scoring that isn't just "match the colors" and **(2)** image generation that preserves *actual* garment appearance rather than illustrating a similar-looking one. Everything else (CRUD, uploads, auth) is standard web app work.

---

## B. Key Risks

**1. Garment-preservation fidelity is the single biggest product risk.** No image-generation technology today — free or paid — guarantees pixel-exact reproduction of a specific real garment on a generated model. The state of the art (dedicated virtual try-on models) gets close on color/silhouette/general print; general-purpose image generators (e.g., Gemini image editing) are noticeably looser. This needs to be set as user-facing expectation from day one: "AI-generated visualization inspired by your actual item," not "exact photo of your garment." Details in section G.

**2. The best free/open-source try-on models are non-commercial-licensed.** IDM-VTON, OOTDiffusion, and CatVTON — the three leading open-source virtual try-on models — are all released under CC BY-NC-SA (non-commercial) licenses. This is a real conflict with the spec's "potentially commercial" goal and needs an explicit decision from you (see section C.6 and the Cost section). It does not block a free MVP used for personal validation; it blocks flipping a switch to "commercial" later without either a licensing conversation or a swap to a paid API.

**3. Free-tier ceilings are real and will bind faster than they sound.** Supabase free storage (≈500 MB–1 GB) fills up in the low hundreds of clothing photos; Hugging Face's free GPU compute (ZeroGPU) is minutes-per-day, not unlimited; Gemini's free tier is request-per-day capped. None of this blocks an MVP used by you and a handful of testers, but the architecture needs to isolate these limits so hitting one doesn't mean a rewrite (see section E's provider-abstraction requirement).

**4. Recommendation quality is subjective and hard to validate automatically.** "94% match" needs to feel right to a human, not just internally consistent. Plan for you to eyeball and tune weights early rather than trusting the first cut.

**5. Cold starts / latency on free infrastructure.** Free serverless GPU (HF ZeroGPU) and free web services (Render) sleep/queue when idle. A "generate my outfit" action that takes 30–90 seconds needs a loading/progress UX designed for that from the start, not bolted on later.

**6. Category extensibility must be designed in now.** The spec's own example schema (`jacket_id`, `shirt_id`, `pants_id` columns on `outfits`) hard-codes exactly three categories, which directly contradicts the spec's own extensibility requirement (section 25/26). I'm flagging this as a proposed change — see section F.

---

## C. Free Technology Research

Evaluated in the required order: completely free → generous free tier → open-source/local → paid. Pricing/limits verified via current (Aug 2026) sources; free tiers change often and should be re-checked before committing real usage.

### C.1 Frontend & Hosting

| Option | Free tier | Commercial use | Notes |
|---|---|---|---|
| **Cloudflare Pages + Workers** (recommended) | 100K requests/day (Workers), 500 builds/month (Pages), no bandwidth cap on static assets | No commercial-use prohibition found in current ToS | Edge functions double as a lightweight backend — avoids running a separate server |
| Vercel (Hobby) | 100 GB bandwidth/month, 100K function calls | **Hobby plan explicitly prohibits commercial/SaaS use** — would require Pro at ~$20/mo | Excellent DX, but the free tier's license terms conflict with "potentially commercial" |
| Netlify | Similar to Vercel, generous free tier | Free tier terms discourage large-scale commercial traffic | Comparable to Vercel |

**Recommendation:** Cloudflare Pages/Workers. It's free, has no commercial-use exclusion in its terms (unlike Vercel Hobby), and Workers can serve as our thin backend layer.

### C.2 Database

| Option | Free tier | Notes |
|---|---|---|
| **Supabase Postgres** (recommended) | 500 MB DB, 50K MAU auth, 2 active projects, auto-pauses after 7 days idle | Real Postgres, generous auth allowance, easy RLS for per-user data isolation |
| Neon | 500 MB–ish free Postgres, serverless, scales to zero | Good alternative if Supabase's storage/auth bundling isn't wanted |
| PlanetScale (MySQL) | Free tier removed in recent years for most new signups | Not reliable as a $0 option anymore |

**Recommendation:** Supabase Postgres — bundling DB + Auth + (optionally) Storage under one free tier meaningfully reduces integration work. Note: your Supabase org already has one active project ("MBT Project Pipeline," unrelated CRM data) — Outfit Picker needs a **new, separate project**, and the free tier allows 2 active projects per org, so this fits without upgrading.

### C.3 Authentication

| Option | Free tier | Notes |
|---|---|---|
| **Supabase Auth** (recommended) | 50,000 MAU free, email/password + OAuth (Google, etc.) | Comes free with the DB choice above — no separate service to integrate |
| Clerk | Free up to 10,000 MAU, then per-MAU billing | Nicer prebuilt UI components, but redundant if using Supabase |
| Auth0 | Free tier capped at 7,500 MAU, aggressive upsell | Not needed here |

**Recommendation:** Supabase Auth — zero marginal cost or integration since we're already on Supabase for the DB.

### C.4 Image / File Storage

| Option | Free tier | Egress cost | Notes |
|---|---|---|---|
| **Cloudflare R2** (recommended) | 10 GB storage, 1M Class A + 10M Class B ops/month | **$0 egress** (this is R2's headline advantage) | S3-compatible API, so swapping providers later is a config change, not a rewrite |
| Supabase Storage | ~500 MB–1 GB (bundled with DB free tier) | Counts against 5 GB/month egress pool | Simpler (one dashboard) but the tightest storage ceiling of any component |

**Recommendation:** Cloudflare R2 for clothing photos and generated outfit images. Wardrobe photos are the single most storage-hungry part of this app, and R2's 10 GB free + zero egress fees materially outlast Supabase Storage's ~1 GB. Keep Supabase for DB/Auth only — this is a deliberate deviation from "put everything in Supabase" for the sake of not hitting a wall in month two.

### C.5 AI / LLM (classification, matching explanations, stylist chat)

| Option | Free tier | Multimodal (vision)? | Notes |
|---|---|---|---|
| **Google Gemini API (2.5 Flash-Lite / Flash)** (recommended) | ~1,000–1,500 requests/day (Flash-Lite), 250/day (Flash), no card required | Yes — native image+text input | Best free multimodal quality/quota combination available; one API covers clothing classification *and* natural-language explanations *and* stylist chat |
| Groq (Llama/Kimi/GPT-OSS models) | 14,400 req/day, very fast inference | Vision limited to specific preview models | Great as a fast fallback for text-only reasoning (scoring explanations, chat) if Gemini quota is tight |
| Local model (Ollama + a small vision-language model) | Free, unlimited, but needs your own compute | Yes, quality varies | Viable later for cost control, not necessary for MVP given Gemini's free quota |

**Recommendation:** Gemini for both vision (clothing analysis) and text (explanations, stylist chat), wrapped behind a provider-agnostic interface so Groq or a local model can be swapped in without touching business logic.

### C.6 Image Generation / Virtual Try-On (the critical component)

**Superseded — see `docs/superpowers/specs/2026-08-13-flux-image-generation-design.md`.** The project uses **FLUX via fal.ai** (`fal-ai/flux-pro/kontext` for one garment, `fal-ai/flux-pro/kontext/max/multi` for two or more) instead of the CatVTON/Gemini-image/FASHN analysis below. FLUX Kontext is an image-*editing* model — it takes the actual uploaded garment photos as references, not just a text description — and carries standard fal.ai/Black Forest Labs commercial API terms, which resolves the CatVTON licensing problem this section originally flagged as unresolved. It is not free: ~$0.04/image (one garment) to ~$0.08/image (multi-garment), pay-as-you-go, no ongoing free tier. The rest of this section is kept for historical context on the tradeoffs that were considered.

This deserves the most scrutiny because it's both the hardest technical problem and the one most likely to involve real cost or licensing constraints.

| Option | Cost | Garment fidelity | Commercial license? | Notes |
|---|---|---|---|---|
| **CatVTON**, self-hosted on Hugging Face **ZeroGPU Spaces** | $0 (free H200 minutes: ~3.5 min/day free-tier, ~25 min/day on $9/mo HF Pro) | High — purpose-built try-on architecture, best structural accuracy of the lightweight open models | **No — CC BY-NC-SA (non-commercial only)** | Best free fidelity, but daily quota is genuinely small (roughly 10–40 generations/day depending on resolution) and the license blocks commercial launch without a separate agreement |
| IDM-VTON, self-hosted | $0 on ZeroGPU (heavier: 7B params, slower) | Highest color/texture fidelity of the open models | **No — CC BY-NC-SA (non-commercial only)** | Better texture reproduction than CatVTON but ~2x the compute cost per image, eating the free GPU quota faster |
| **Gemini 2.5 Flash Image ("nano banana")** image editing | $0 within Gemini's free tier, then ~$0.039/image | Moderate — general-purpose editing, not a dedicated try-on architecture; approximates garment rather than warping it precisely onto a pose | **Yes — standard Gemini API commercial terms** | Simplest to build (same provider as classification/chat), legally unambiguous, but weaker at literal garment preservation |
| FASHN.ai API | $0.075/image (drops with volume), no subscription required | High — purpose-built commercial try-on API | **Yes, explicitly commercial-licensed** | Best "grown-up" option once real usage/monetization starts; pay-as-you-go with no upfront commitment |
| Replicate-hosted IDM-VTON | ~$0.05/run (A100 time) + Replicate's own IDM-VTON listing says non-commercial | Same as self-hosted IDM-VTON | **No** (same NC license applies regardless of host) | Hosting on Replicate doesn't change the underlying model's license |

**This is a decision point, not something I'll pick silently, per your instructions.**

- **Path A — best fidelity, free, but MVP/personal-use only:** Self-host CatVTON on a free Hugging Face ZeroGPU Space. Zero cost, best garment preservation available for free, but under a non-commercial license — appropriate for building and validating the product with yourself/testers, *not* for a public commercial launch without revisiting licensing.
- **Path B — commercially clean from day one, weaker fidelity:** Use Gemini image editing for visualization. Fully covered by standard commercial API terms, radically simpler to integrate (one provider for everything), free within quota — but will preserve garment appearance more loosely, and the app needs honest copy ("AI-generated visualization inspired by your garment," not "your exact jacket").

**My recommendation:** Build the image-generation layer behind a single interface (see section E) and ship the MVP on **Path A (CatVTON, self-hosted)** for the best possible demonstration of the core "recognizes my actual clothes" promise, since the MVP's purpose is your own validation, not a public commercial launch yet. Keep Path B implemented as a fallback provider for when ZeroGPU quota is exhausted or cold-start latency is too slow for a smooth demo. Before any commercial launch, revisit: either license CatVTON commercially, retrain/replace it, or switch the primary path to FASHN.ai (~$0.075/image, clean commercial license). Tell me if you'd rather start on Path B instead to sidestep the licensing question entirely — that's a completely reasonable trade to make now for peace of mind later.

### C.7 Image Analysis Support (background removal, color extraction)

| Option | Free tier | Notes |
|---|---|---|
| **@imgly/background-removal** (browser/WASM, open-source) | Free, runs client-side | Matches the spec's own priority order ("browser-side processing first") — zero server cost, zero latency added to your infra |
| rembg (Python, server-side) | Free, self-hosted | Only needed if browser-side quality proves insufficient; would require a small Python service (e.g., a HF Space) |
| Dominant/secondary color extraction | Done via a simple client-side color-quantization pass (e.g., `color-thief`) *and* cross-checked against Gemini's own color description | Free, no extra service; Gemini's vision analysis already returns color language, this just adds a deterministic hex value for UI swatches |

**Recommendation:** Client-side background removal and color-swatch extraction. No server component needed for either.

### C.8 Deployment / CI

| Option | Free tier | Notes |
|---|---|---|
| **GitHub + Cloudflare Pages auto-deploy** (recommended) | Free | Push-to-deploy, no separate CI service needed for a project this size |
| Render (only if a persistent Python service is ever needed, e.g., self-hosting rembg) | 750 hrs/month free web service, cold starts 30–50s | Not needed for MVP given the client-side/edge-function approach above |

### C.9 Analytics

| Option | Free tier | Notes |
|---|---|---|
| **Plausible/Umami (self-hosted)** or simple Supabase-logged events | Free | Skip a dedicated analytics vendor for MVP; log key events (upload, outfit generated, saved) into your own DB table |

---

## D. Recommended Technology Stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | Next.js (React), Tailwind | Standard, huge ecosystem, works cleanly on Cloudflare Pages |
| Hosting/Edge | Cloudflare Pages + Workers | Free, no commercial-use restriction, doubles as backend |
| Database | Supabase (Postgres) | Free tier, real Postgres, RLS for per-user data isolation |
| Auth | Supabase Auth | Bundled, 50K MAU free |
| File storage | Cloudflare R2 | 10 GB free, zero egress — the right fit for photo-heavy app |
| Clothing analysis / reasoning / chat | Google Gemini 2.5 Flash / Flash-Lite | Free multimodal quota covers vision + text in one provider |
| Compatibility scoring | Custom deterministic algorithm (not an LLM call) | Faster, cheaper, explainable, consistent — LLM only narrates the result (see section G) |
| Background removal / color swatch | Client-side (`@imgly/background-removal`, `color-thief`) | Zero server cost, per spec's own priority order |
| Image generation (actual) | FLUX via fal.ai (`flux-pro/kontext`, `/max/multi`) | Real reference-image editing (not text-only), commercially licensed, ~$0.04–0.08/image — see `docs/superpowers/specs/2026-08-13-flux-image-generation-design.md`. Rows below are the original analysis, superseded. |
| ~~Image generation (MVP default)~~ | ~~Self-hosted CatVTON on HF ZeroGPU Space~~ | Superseded — CC-BY-NC license blocked commercial use |
| ~~Image generation (fallback/simple path)~~ | ~~Gemini 2.5 Flash Image~~ | Superseded |
| ~~Image generation (future commercial upgrade)~~ | ~~FASHN.ai API~~ | Superseded |

All provider-specific code (Gemini, CatVTON, R2, Supabase) sits behind a small interface per concern (`AIProvider`, `ImageGenProvider`, `StorageProvider`) so swapping any one of them later is a config/adapter change, not an application rewrite — directly addressing the spec's vendor lock-in requirement.

---

## E. Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│  CLIENT (Next.js, browser)                                       │
│  - Upload UI, wardrobe grid, outfit builder                      │
│  - Client-side background removal + color swatch extraction      │
└───────────────────────────┬────────────────────────────────────--┘
                             │ HTTPS
┌───────────────────────────▼────────────────────────────────────┐
│  EDGE API (Cloudflare Workers)                                   │
│  - Thin request handlers, auth check via Supabase JWT             │
│  - Routes to the provider interfaces below                        │
├─────────────┬───────────────┬───────────────┬────────────────────┤
│ AIProvider   │ MatchEngine   │ ImageGenProvider │ StorageProvider │
│ (Gemini)     │ (deterministic│ (CatVTON ZeroGPU │ (Cloudflare R2) │
│ classify,    │  scoring +    │  primary /       │  upload/serve   │
│ explain, chat│  ranking)     │  Gemini fallback)│  images         │
└─────────────┴───────────────┴───────────────┴────────────────────┘
                             │
┌───────────────────────────▼────────────────────────────────────┐
│  Supabase (Postgres + Auth, RLS enforced per-user)                │
│  - users, clothing_items, outfits, outfit_items, saved_outfits    │
└────────────────────────────────────────────────────────────────┘
```

Each provider box is a swappable adapter, not a hard dependency — this is what "replaceable AI/image-gen/storage providers" means concretely.

---

## F. Database Schema

One deliberate change from the spec's literal example: **`outfits` should not have fixed `jacket_id` / `shirt_id` / `pants_id` columns.** That hard-codes exactly three categories and directly conflicts with the spec's own requirement (section 25) that the schema stay extensible for shoes, ties, belts, accessories, etc. Instead, use a join table (`outfit_items`) with a `role` (e.g., "outerwear," "top," "bottom") — adding a new category later is a data change, not a migration that touches every query referencing `jacket_id`. This is a small change with no cost implication and meaningfully less future rework; flagging it explicitly rather than changing it silently, per your instructions.

```sql
-- Users (mirrors Supabase auth.users, extended with app-specific fields)
users
  id uuid primary key references auth.users(id)
  display_name text
  preferences jsonb default '{}'
  created_at timestamptz default now()

-- Extensible category system (not hard-coded enums)
clothing_categories
  id serial primary key
  name text unique          -- 'top', 'bottom', 'outerwear', 'shoes', 'accessory', ...
  applicable_roles text[]   -- which outfit "slots" this category can fill

clothing_subcategories
  id serial primary key
  category_id int references clothing_categories(id)
  name text                 -- 'long_sleeve_shirt', 'polo', 'business_jacket', ...

-- Wardrobe
clothing_items
  id uuid primary key default gen_random_uuid()
  user_id uuid references users(id)
  image_url text            -- Cloudflare R2 object URL
  category_id int references clothing_categories(id)
  subcategory_id int references clothing_subcategories(id)
  name text
  primary_color text
  primary_color_hex text
  secondary_colors text[]
  pattern text               -- solid, striped, checked, plaid, printed, textured, other
  style text                 -- business_formal, business_casual, smart_casual, casual
  formality_level int        -- 1-5 scale, deterministic + AI-suggested
  description text
  ai_analysis jsonb          -- full raw Gemini classification output, for re-scoring later
  user_edited boolean default false
  created_at timestamptz default now()

-- Outfits (extensible, no fixed category columns)
outfits
  id uuid primary key default gen_random_uuid()
  user_id uuid references users(id)
  starting_item_id uuid references clothing_items(id)
  compatibility_score numeric
  score_breakdown jsonb      -- {color: 96, style: 95, formality: 94, pattern: 100, balance: 92}
  ai_explanation text
  generated_image_url text
  image_gen_provider text    -- 'catvton' | 'gemini' | 'fashn' — for traceability as providers change
  is_saved boolean default false
  created_at timestamptz default now()

-- Join table: which items make up an outfit, in which role
outfit_items
  id uuid primary key default gen_random_uuid()
  outfit_id uuid references outfits(id)
  clothing_item_id uuid references clothing_items(id)
  role text                  -- 'outerwear', 'top', 'bottom', 'shoes', 'accessory' ...
```

Row-Level Security (RLS) on every table scoped to `user_id = auth.uid()` — this is the access-control layer, no separate authorization service needed.

---

## G. AI Architecture

**Clothing analysis (upload time):** Photo → client-side background removal → sent to Gemini with a structured prompt requesting category, subcategory, color (primary/secondary/hex-ish description), pattern, style, formality, and visual details (collar, lapel, sleeve, silhouette) as JSON. Stored as both structured fields (for querying/filtering) and raw `ai_analysis` (so re-scoring logic can improve later without re-calling the AI). User reviews/edits before saving.

**Matching engine (the core "intelligence"):** This is intentionally **not** an LLM call. Color/formality/pattern/balance compatibility is computed by a deterministic scoring function (color-wheel relationships, formality-level distance, pattern-density penalties, contrast/brightness balance) against the user's wardrobe, applied to whichever categories are appropriate for the starting item (a jacket looks for shirts+pants; pants look for shirts/jackets/polos — the category → compatible-roles mapping lives in `clothing_categories.applicable_roles`, so this logic isn't hard-coded per garment type). Deterministic scoring is faster, cheaper, reproducible, and debuggable — you can see exactly why a score is what it is, which the spec's transparency requirement ("AI-generated estimates, not scientifically validated") actually benefits from.

**Explanation & stylist chat:** Gemini takes the *already-computed* score breakdown and item metadata and turns it into natural language ("the white shirt provides clean contrast..."). Because the score itself isn't AI-generated, the explanation is grounded in real numbers rather than the model inventing a rationale — reduces hallucination risk. The same Gemini call pattern powers proactive stylist prompts ("this jacket has three strong matches") by querying the match engine in the background and surfacing notable results.

**Image generation:** Selected outfit's item images + a fixed "consistent male model" reference prompt sent to the chosen provider (CatVTON primary / Gemini fallback per section C.6). Output stored in R2, linked to the `outfits` row, with `image_gen_provider` recorded so quality/fidelity can be tracked and compared as providers change.

**Honesty requirement:** UI copy should say something like "AI-generated visualization based on your item" rather than implying pixel-perfect reproduction, in line with the spec's own instruction not to overclaim fidelity.

---

## H. MVP Scope

**Must Have** (matches spec section 27 exactly)
1. Wardrobe upload with photo storage
2. AI clothing classification (Gemini) with user review/edit
3. Clothing metadata (category, color, pattern, style, formality)
4. Select any item as starting point
5. Deterministic matching engine + Gemini-narrated explanations
6. Multiple ranked outfit alternatives
7. Interactive builder (swap/lock one item, re-score the rest)
8. AI outfit visualization (CatVTON primary, Gemini fallback)
9. Save outfits

**Should Have** (soon after MVP, low cost/complexity)
- Search/filter wardrobe (category, color, style, formality)
- Proactive stylist nudges ("this jacket has 3 strong matches")
- "Compare combinations" side-by-side view
- Basic usage analytics (which outfits get saved vs. discarded)

**Later** (explicitly deferred, per spec section 26)
- Shoes, belts, watches, ties, bags, sweaters, casual jackets
- Weather/occasion/calendar-based suggestions
- Wardrobe gap analysis ("you're missing a gray trouser")
- Shopping recommendations, user-photo-based try-on, full avatar
- Native mobile app (responsive web covers MVP)

---

## I. Estimated Cost

| Service | MVP Cost | Future Trigger |
|---|---|---|
| Hosting (Cloudflare Pages/Workers) | $0 | >100K requests/day |
| Database (Supabase) | $0 | >500 MB data or >2 active projects in org |
| Auth (Supabase Auth) | $0 | >50,000 monthly active users |
| Storage (Cloudflare R2) | $0 | >10 GB stored or >1M/10M ops |
| AI classification/reasoning (Gemini) | $0 | >~1,500 requests/day (gemini-3.5-flash) |
| Image generation (FLUX via fal.ai) | **~$0.04–0.08 per generated outfit image** | Pay-as-you-go, no ongoing free tier — see `docs/superpowers/specs/2026-08-13-flux-image-generation-design.md` |
| Analytics | $0 | N/A — self-logged |

**Total estimated cost: $0/month for everything except outfit image generation**, which is real, per-image, pay-as-you-go (~$0.04–0.08/image via fal.ai/FLUX) — there is no free tier for this specific feature. This was a deliberate, transparent tradeoff (see the linked spec): the previously-analyzed free path (self-hosted CatVTON) is non-commercially-licensed, which FLUX via fal.ai resolves at the cost of a small per-generation fee. Every other layer of the app remains free at MVP/personal-testing scale.

---

## J. Development Plan

1. **Foundation:** Supabase project (new, separate from MBT Project Pipeline) + schema from section F, Cloudflare Pages/Workers scaffold, Auth wired up.
2. **Wardrobe core:** Upload flow, R2 storage, Gemini classification + review/edit UI, wardrobe grid with search/filter.
3. **Matching engine:** Deterministic scoring implementation, tested against a handful of manually-judged outfit combos to sanity-check weights before trusting it.
4. **Outfit picker UI:** Starting-item selection, ranked alternatives, interactive builder (lock/swap/regenerate).
5. **Explanations & stylist voice:** Gemini narration layer on top of the scoring engine, proactive nudges.
6. **Image generation:** Stand up the CatVTON HF Space, wire the `ImageGenProvider` interface, implement the Gemini fallback path.
7. **Save/history:** Saved outfits screen, dashboard.
8. **Test pass:** Upload edge cases (bad photos, ambiguous garments), classification accuracy spot-check, matching quality review, generation latency/failure handling, mobile responsiveness.
9. **Polish:** Loading states for the 30–90s generation step, error states, empty states.
10. **Deploy:** Cloudflare Pages production deploy, custom domain if desired.

I'd suggest building and testing steps 1–3 before touching image generation at all — it's the highest-risk, highest-latency piece, and it's much easier to validate the matching logic on real classified wardrobe data first.

---

## Open Decision For You

The one thing I don't want to decide silently: **image-generation path (section C.6).** Path A (self-hosted CatVTON) gives the best free garment fidelity but is non-commercial-licensed; Path B (Gemini image editing) is commercially clean from day one but preserves garments more loosely. I'd default to Path A for the MVP since the near-term goal is validating the product with you, not a public launch — but tell me if you'd rather start on Path B to avoid the licensing question entirely.
