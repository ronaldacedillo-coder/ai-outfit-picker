// Phase 1 inventory foundation types. No UI consumes these yet -- they
// exist so the server actions in this phase (and the tests exercising
// them) are properly typed, and so Phase 2's UI has a stable shape to
// build against.

export type StoreStatus = "active" | "inactive";

export interface Store {
  id: string;
  storeCode: string;
  storeName: string;
  region: string | null;
  city: string | null;
  address: string | null;
  status: StoreStatus;
  managerName: string | null;
  managerEmail: string | null;
  createdAt: string;
  updatedAt: string;
}

export type ProductSkuStatus = "active" | "discontinued";

// Variant columns are a deliberate placeholder (see migration 0018) --
// separate style/fit columns, waist_size for pants, plain size for
// everything else, plus a catch-all. Expect this shape to be revised once
// ARROW provides a real inventory data sample.
export interface ProductSku {
  id: string;
  clothingItemId: string;
  sku: string;
  size: string | null;
  style: string | null;
  fit: string | null;
  waistSize: string | null;
  length: string | null;
  attributes: Record<string, unknown>;
  status: ProductSkuStatus;
  createdAt: string;
  updatedAt: string;
}

export type InventoryTransactionType =
  | "opening_balance"
  | "sale"
  | "return"
  | "transfer_in"
  | "transfer_out"
  | "purchase_receipt"
  | "production_receipt"
  | "import_receipt"
  | "adjustment_in"
  | "adjustment_out"
  | "damage"
  | "loss"
  | "stock_count"
  | "reservation"
  | "release";

export interface InventoryTransaction {
  id: string;
  storeId: string;
  productSkuId: string;
  transactionType: InventoryTransactionType;
  quantity: number;
  referenceType: string | null;
  referenceId: string | null;
  previousQuantity: number;
  newQuantity: number;
  reason: string | null;
  performedBy: string | null;
  createdAt: string;
}

export interface InventoryBalance {
  id: string;
  storeId: string;
  productSkuId: string;
  quantity: number;
  reservedQuantity: number;
  availableQuantity: number;
  minimumStock: number | null;
  targetStock: number | null;
  reorderPoint: number | null;
  updatedAt: string;
}
