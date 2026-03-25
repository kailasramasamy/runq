export type HsnSacType = 'hsn' | 'sac';

export interface HsnSacCode {
  id: string;
  code: string;
  type: HsnSacType;
  description: string;
  gstRate: number | null;
  createdAt: string;
  updatedAt: string;
}
