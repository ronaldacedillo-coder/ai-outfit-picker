import { z } from "zod";

const patternEnum = z.enum(["solid", "striped", "checked", "plaid", "printed", "textured", "other"]);
const styleEnum = z.enum(["business_formal", "business_casual", "smart_casual", "casual"]);
const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const clothingAnalysisSchema = z.object({
  category: z.string().min(1).max(100),
  subcategory: z.string().min(1).max(100),
  primaryColor: z.string().min(1).max(100),
  primaryColorHex: hexColor.optional(),
  secondaryColors: z.array(z.string().min(1).max(100)).max(5).default([]),
  pattern: patternEnum,
  style: styleEnum,
  formalityLevel: z.number().int().min(1).max(5),
  description: z.string().min(1).max(500),
  visualDetails: z.record(z.string(), z.string()).optional(),
});
export type ClothingAnalysisInput = z.infer<typeof clothingAnalysisSchema>;

export const clothingItemInputSchema = z.object({
  categoryId: z.number().int().positive(),
  subcategoryId: z.number().int().positive(),
  imagePath: z.string().min(1),
  name: z.string().max(120).optional(),
  primaryColor: z.string().min(1).max(100),
  primaryColorHex: hexColor.optional(),
  secondaryColors: z.array(z.string().min(1).max(100)).max(5).default([]),
  pattern: patternEnum,
  style: styleEnum,
  formalityLevel: z.number().int().min(1).max(5),
  description: z.string().max(500).default(""),
  aiAnalysis: z.unknown().optional(),
  userEdited: z.boolean(),
});
export type ClothingItemInput = z.infer<typeof clothingItemInputSchema>;
