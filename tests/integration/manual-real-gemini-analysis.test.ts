import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { createTestUser } from "./helpers/testUser";
import { supabaseAdmin } from "./helpers/supabaseAdmin";
import { getStorageProvider } from "@/lib/providers";
import { GeminiAIProvider } from "@/lib/providers/gemini";

// Opt-in only: this hits the real Gemini API over the network (free within
// quota, but a live external call -- not something the default `npm test`
// run should depend on for pass/fail, same reasoning as
// manual-real-flux-generation.test.ts's gating). Run explicitly with:
//
//   RUN_REAL_GEMINI_TEST=1 npm test -- manual-real-gemini-analysis
//
// Exercises the exact production path end to end: a real Supabase signed
// URL (not a bare fetch) into the real, unmocked GeminiAIProvider, added
// while root-causing the "AI analysis unavailable" production symptom --
// every other Gemini test in this repo mocks @google/genai, so nothing
// else in the suite would have caught the model-availability failure this
// verifies stays fixed.
const RUN = process.env.RUN_REAL_GEMINI_TEST === "1";

const FIXTURE = path.join(__dirname, "..", "fixtures", "flux-fidelity-test", "shirt.jpg");

describe.skipIf(!RUN)("MANUAL: real Gemini clothing analysis (live API call)", () => {
  it(
    "analyzes a real uploaded photo via a real signed URL and the real provider",
    async () => {
      if (!process.env.GEMINI_API_KEY) {
        throw new Error("GEMINI_API_KEY is not configured. Add it to .env.local before running this test.");
      }

      const user = await createTestUser();
      const admin = supabaseAdmin();
      const filePath = `${user.id}/shirt.jpg`;

      try {
        const fileBuffer = fs.readFileSync(FIXTURE);
        const { error: uploadError } = await admin.storage
          .from("clothing-photos")
          .upload(filePath, fileBuffer, { contentType: "image/jpeg", upsert: true });
        if (uploadError) throw new Error(`fixture upload failed: ${uploadError.message}`);

        const storage = getStorageProvider(user.client);
        const signedUrl = await storage.getSignedUrl(filePath, 300);

        const provider = new GeminiAIProvider(process.env.GEMINI_API_KEY);
        const analysis = await provider.analyzeClothingImage(signedUrl);

        console.log("Real Gemini analysis result:", JSON.stringify(analysis, null, 2));
        expect(analysis.category.length).toBeGreaterThan(0);
        expect(analysis.subcategory.length).toBeGreaterThan(0);
        expect(analysis.formalityLevel).toBeGreaterThanOrEqual(1);
        expect(analysis.formalityLevel).toBeLessThanOrEqual(5);
      } finally {
        await admin.storage.from("clothing-photos").remove([filePath]);
        await user.cleanup();
      }
    },
    60000
  );
});
