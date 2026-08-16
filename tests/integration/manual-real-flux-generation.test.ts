import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { createTestUser } from "./helpers/testUser";
import { supabaseAdmin } from "./helpers/supabaseAdmin";
import { generateOutfitVisualization } from "@/app/dashboard/outfit-actions";

// Opt-in only: this test spends real money on a real fal.ai generation
// (~$0.08 for a 3-garment/multi-image call). It never runs during a normal
// `npm test` -- only when explicitly requested:
//
//   RUN_REAL_FLUX_TEST=1 npm test -- manual-real-flux-generation
//
// Reuses the exact production code path (FalFluxImageGenProvider via
// getImageGenProvider(), the real generateOutfitVisualization action) --
// no second implementation. Uses real, uploaded reference images for one
// jacket + one shirt + one pair of pants and reports full generation
// metadata plus the local path of the downloaded result for manual
// garment-fidelity inspection.
const RUN = process.env.RUN_REAL_FLUX_TEST === "1";

const FIXTURES = path.join(__dirname, "..", "fixtures", "flux-fidelity-test");
const OUTPUT_DIR = "/private/tmp/claude-501/-Users-ronaldacedillo-Documents-dismas/0ca5cccb-219f-4e62-a09d-2f6a309d2a3b/scratchpad";

describe.skipIf(!RUN)("MANUAL: real FLUX generation (spends real money)", () => {
  it(
    "generates one real outfit visualization from a real jacket + shirt + pants",
    async () => {
      if (!process.env.FAL_KEY) {
        throw new Error(
          "FAL_KEY is not configured. Add it to .env.local (see README's Environment variables section) before running this test."
        );
      }

      const user = await createTestUser();
      const admin = supabaseAdmin();

      async function seedGarment(
        fileName: string,
        categoryName: string,
        subcategoryName: string,
        color: string,
        description: string
      ) {
        const imagePath = `${user.id}/${fileName}`;
        const fileBytes = fs.readFileSync(path.join(FIXTURES, fileName));
        const { error: uploadError } = await admin.storage
          .from("clothing-photos")
          .upload(imagePath, fileBytes, { contentType: "image/jpeg", upsert: true });
        if (uploadError) throw new Error(`Seed upload failed for ${fileName}: ${uploadError.message}`);

        const { data: category } = await admin
          .from("clothing_categories")
          .select("id")
          .eq("name", categoryName)
          .single();
        const { data: subcategory } = await admin
          .from("clothing_subcategories")
          .select("id")
          .eq("category_id", category!.id)
          .eq("name", subcategoryName)
          .single();

        const { data: item, error: insertError } = await admin
          .from("clothing_items")
          .insert({
            user_id: user.id,
            image_url: imagePath,
            category_id: category!.id,
            subcategory_id: subcategory!.id,
            primary_color: color,
            pattern: "solid",
            style: "business_formal",
            formality_level: 4,
            description,
          })
          .select("id")
          .single();
        if (insertError || !item) throw new Error(`Seed insert failed for ${fileName}: ${insertError?.message}`);
        return item.id as string;
      }

      const jacketId = await seedGarment(
        "jacket.jpg",
        "outerwear",
        "blazer",
        "navy",
        "Navy business jacket with notched lapels and two buttons."
      );
      const shirtId = await seedGarment(
        "shirt.jpg",
        "top",
        "long_sleeve_shirt",
        "white",
        "White long-sleeved business shirt with spread collar."
      );
      const pantsId = await seedGarment(
        "pants.jpg",
        "bottom",
        "pants",
        "gray",
        "Medium-gray tailored trousers with center crease."
      );

      console.log("Seeded real wardrobe items:", { jacketId, shirtId, pantsId });
      console.log("Calling generateOutfitVisualization with the REAL FalFluxImageGenProvider...");

      const start = Date.now();
      const result = await generateOutfitVisualization([jacketId, shirtId, pantsId], user.client);
      const elapsedMs = Date.now() - start;

      if ("error" in result) {
        const { data: outfit } = await admin
          .from("outfits")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .single();
        console.error("GENERATION FAILED:", result.error);
        console.error("Outfit row:", JSON.stringify(outfit, null, 2));
        throw new Error(`Real generation failed: ${result.error} / db error: ${outfit?.generation_error}`);
      }

      const { data: outfit } = await admin
        .from("outfits")
        .select("*")
        .eq("id", result.data.outfitId)
        .single();

      console.log("=== REAL GENERATION RESULT ===");
      console.log("outfit id:", outfit!.id);
      console.log("generation_status:", outfit!.generation_status);
      console.log("image_gen_provider:", outfit!.image_gen_provider);
      console.log("image_gen_model:", outfit!.image_gen_model);
      console.log("generation_request_id:", outfit!.generation_request_id);
      console.log("generated_image_url (storage path):", outfit!.generated_image_url);
      console.log("elapsed ms:", elapsedMs);
      console.log("prompt used:\n", outfit!.generation_prompt);

      expect(outfit!.generation_status).toBe("completed");

      // Download the stored result locally for manual visual inspection.
      const { data: signed } = await admin.storage
        .from("outfit-images")
        .createSignedUrl(outfit!.generated_image_url, 300);
      if (!signed) throw new Error("Could not sign the generated image for download.");
      const imageResponse = await fetch(signed.signedUrl);
      const buffer = Buffer.from(await imageResponse.arrayBuffer());
      const outputPath = path.join(OUTPUT_DIR, "flux-real-generation-result.jpg");
      fs.writeFileSync(outputPath, buffer);
      console.log("Downloaded generated image to:", outputPath);
      console.log("Test user id (not cleaned up automatically):", user.id);
    },
    120_000
  );
});
