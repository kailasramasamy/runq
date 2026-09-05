/**
 * Who pays for milk refused on quality.
 *
 * The rule is that quality-rejected milk is not paid for, and the supplier who
 * sent it carries it. Which supplier that is follows what the milk TRACES BACK
 * TO — never the stage that happened to catch it. The 97.7 L that started this
 * failed at the plant, three legs downstream from the can it was poured into,
 * and was still one farmer's milk.
 *
 * Deciding by stage instead was the first draft's mistake: it defaulted every
 * plant rejection to a company write-off on the reasoning that a tanker blends
 * many farmers, which is true of most tankers and false of the one that
 * mattered.
 */

/** One pour standing behind a rejected load, with what it was priced at. */
export interface SourcePour {
  pourId: string;
  farmerId: string;
  qtyLitres: number;
  ratePerLitre: number;
}

/** A share of a rejection, charged to one party. */
export interface AttributedCharge {
  farmerId: string | null;
  vmccNodeId: string | null;
  pourId: string | null;
  qtyLitres: number;
  ratePerLitre: number;
  amount: number;
}

export type Bearer = 'farmer' | 'vmcc' | 'company';

export interface Attribution {
  borneBy: Bearer;
  charges: AttributedCharge[];
}

export interface AttributionInput {
  /** Litres refused. */
  qtyLitres: number;
  /** The pours behind the load, empty for a direct receipt. */
  pours: SourcePour[];
  /** Source VMCC, for the direct-receipt case. */
  fromNodeId: string | null;
  /** Rate to charge a VMCC at — the chart price its milk was billed on. */
  vmccRatePerLitre: number | null;
  /**
   * Operator pinned it on one farmer (a retained sample named them). Ignored
   * when that farmer has no pour behind this load, because charging someone
   * for milk they demonstrably did not send is worse than splitting it.
   */
  attributeToFarmerId?: string | null;
}

/**
 * Resolve a rejection to its charges.
 *
 * 1. no pours          → the source VMCC; its milk is bulk it sold us
 * 2. one pour          → that farmer, whichever tier caught it
 * 3. many, one named   → the named farmer, capped at what they actually poured
 * 4. many              → split by volume, each at their own pour's rate
 * 5. nothing traceable → the company, and only then
 */
export function attribute(input: AttributionInput): Attribution {
  const qty = round3(input.qtyLitres);
  if (qty <= 0) return { borneBy: 'company', charges: [] };

  const live = input.pours.filter((p) => p.qtyLitres > 0);
  if (!live.length) {
    if (!input.fromNodeId || input.vmccRatePerLitre == null) {
      return { borneBy: 'company', charges: [] };
    }
    return {
      borneBy: 'vmcc',
      charges: [charge({
        vmccNodeId: input.fromNodeId, qtyLitres: qty, ratePerLitre: input.vmccRatePerLitre,
      })],
    };
  }

  const named = input.attributeToFarmerId
    ? live.filter((p) => p.farmerId === input.attributeToFarmerId)
    : [];
  // A named farmer answers for the rejection alone — but never for more litres
  // than they poured. Beyond that the excess has to fall back to the pool, or a
  // 200 L rejection lands on the one farmer who brought 12.
  if (named.length) {
    const pooled = round3(named.reduce((s, p) => s + p.qtyLitres, 0));
    const onNamed = Math.min(qty, pooled);
    const charges = split(named, onNamed);
    const spill = round3(qty - onNamed);
    if (spill > 0) charges.push(...split(live.filter((p) => !named.includes(p)), spill));
    return { borneBy: 'farmer', charges };
  }

  return { borneBy: 'farmer', charges: split(live, qty) };
}

/**
 * Share `qty` across pours by volume, each at its own rate.
 *
 * The last pour takes the rounding remainder rather than every share being
 * rounded independently — otherwise the charges do not sum back to the litres
 * refused, and a farmer statement that is 0.01 L out is a farmer statement
 * nobody trusts.
 */
function split(pours: SourcePour[], qty: number): AttributedCharge[] {
  const total = round3(pours.reduce((s, p) => s + p.qtyLitres, 0));
  if (total <= 0) return [];
  const out: AttributedCharge[] = [];
  let left = round3(qty);
  pours.forEach((p, i) => {
    const share = i === pours.length - 1 ? left : round3((qty * p.qtyLitres) / total);
    if (share <= 0) return;
    left = round3(left - share);
    out.push(charge({
      farmerId: p.farmerId, pourId: p.pourId, qtyLitres: share, ratePerLitre: p.ratePerLitre,
    }));
  });
  return out;
}

function charge(v: {
  farmerId?: string; vmccNodeId?: string; pourId?: string;
  qtyLitres: number; ratePerLitre: number;
}): AttributedCharge {
  return {
    farmerId: v.farmerId ?? null,
    vmccNodeId: v.vmccNodeId ?? null,
    pourId: v.pourId ?? null,
    qtyLitres: v.qtyLitres,
    ratePerLitre: v.ratePerLitre,
    amount: round2(v.qtyLitres * v.ratePerLitre),
  };
}

function round2(n: number): number { return Math.round(n * 100) / 100; }
function round3(n: number): number { return Math.round(n * 1000) / 1000; }
