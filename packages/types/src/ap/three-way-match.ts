export type LineMatchStatus = 'matched' | 'mismatch';

export interface MatchLineResult {
  sku: string | null;
  itemName: string;
  status: LineMatchStatus;
  qty: { po: number; grn: number; invoice: number };
  unitPrice: { po: number; invoice: number };
  message: string | null;
}

export interface ThreeWayMatchResult {
  invoiceId: string;
  poId: string;
  grnId: string;
  status: 'matched' | 'mismatch';
  summary: {
    poTotal: number;
    grnTotal: number;
    invoiceTotal: number;
  };
  lines: MatchLineResult[];
}
