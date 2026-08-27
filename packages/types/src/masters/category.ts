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
  /**
   * Items filed under this category *and everything below it*, present only
   * when the tree was asked for counts. A subtree total rather than a direct
   * one: a parent showing 0 while its children hold 24 reads as an empty
   * branch, which is the opposite of the truth.
   */
  itemCount?: number;
  createdAt: string;
  updatedAt: string;
}
