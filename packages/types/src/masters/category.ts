export interface Category {
  id: string;
  tenantId: string;
  name: string;
  parentId: string | null;
  parentName?: string | null;
  isActive: boolean;
  subcategories?: Category[];
  createdAt: string;
  updatedAt: string;
}
