import { z } from "zod";

export const storeStatusEnum = z.enum(["active", "inactive"]);

export const storeInputSchema = z.object({
  storeCode: z.string().min(1).max(40),
  storeName: z.string().min(1).max(200),
  region: z.string().max(120).optional(),
  city: z.string().max(120).optional(),
  address: z.string().max(500).optional(),
  status: storeStatusEnum.default("active"),
  managerName: z.string().max(200).optional(),
  managerEmail: z.string().email().max(320).optional(),
});
export type StoreInput = z.infer<typeof storeInputSchema>;

export const productSkuStatusEnum = z.enum(["active", "discontinued"]);

// Every variant field is optional -- which ones are meaningful depends on
// the parent product's category (Part "PRODUCT VARIANT RULE FOR
// PANTS/TROUSERS": size for shirts/polos/jackets, style+fit+waistSize for
// pants). Deliberately not enforced with a discriminated union yet since
// the real shape is still pending ARROW's data sample -- validation stays
// permissive here, category-appropriate requirements belong in the UI
// layer (Phase 2) once it exists.
export const productSkuInputSchema = z.object({
  clothingItemId: z.string().uuid(),
  sku: z.string().min(1).max(80),
  size: z.string().max(40).optional(),
  style: z.string().max(80).optional(),
  fit: z.string().max(80).optional(),
  waistSize: z.string().max(20).optional(),
  length: z.string().max(20).optional(),
  attributes: z.record(z.string(), z.unknown()).default({}),
  status: productSkuStatusEnum.default("active"),
});
export type ProductSkuInput = z.infer<typeof productSkuInputSchema>;

export const inventoryTransactionTypeEnum = z.enum([
  "opening_balance",
  "sale",
  "return",
  "transfer_in",
  "transfer_out",
  "purchase_receipt",
  "production_receipt",
  "import_receipt",
  "adjustment_in",
  "adjustment_out",
  "damage",
  "loss",
  "stock_count",
  "reservation",
  "release",
]);

export const recordInventoryTransactionInputSchema = z.object({
  storeId: z.string().uuid(),
  productSkuId: z.string().uuid(),
  transactionType: inventoryTransactionTypeEnum,
  quantity: z.number().int().refine((n) => n !== 0, "Quantity cannot be zero."),
  referenceType: z.string().max(60).optional(),
  referenceId: z.string().uuid().optional(),
  reason: z.string().max(500).optional(),
});
export type RecordInventoryTransactionInput = z.infer<typeof recordInventoryTransactionInputSchema>;
