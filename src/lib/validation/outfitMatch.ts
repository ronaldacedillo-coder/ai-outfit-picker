import { z } from "zod";

export const outfitMatchExplanationSchema = z.object({
  explanation: z.string().min(1).max(400),
  conflicts: z.array(z.string().max(200)).max(5).default([]),
  rank: z.number().int().min(1).optional(),
});
export type OutfitMatchExplanation = z.infer<typeof outfitMatchExplanationSchema>;
