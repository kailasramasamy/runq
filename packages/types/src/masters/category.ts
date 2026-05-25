export interface Category {
  id: string;
  tenantId: string;
  name: string;
  parentId: string | null;
  parentName?: string | null;
  /** Default HSN/SAC inherited by items in this category when blank. */
  defaultHsnSac: string | null;
  /** Default GST rate (%) inherited by items in this category when blank. */
  defaultGstRate: number | null;
  sortOrder: number;
  isActive: boolean;
  subcategories?: Category[];
  createdAt: string;
  updatedAt: string;
}
