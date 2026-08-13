export interface ClothingItemRow {
  id: string;
  imagePath: string;
  imageSignedUrl: string;
  categoryId: number;
  categoryName: string;
  subcategoryId: number;
  subcategoryName: string;
  name: string | null;
  primaryColor: string;
  primaryColorHex: string | null;
  secondaryColors: string[];
  pattern: string;
  style: string;
  formalityLevel: number;
  description: string;
}
