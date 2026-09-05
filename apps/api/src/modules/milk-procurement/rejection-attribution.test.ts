import { describe, expect, it } from 'vitest';
import { attribute, type SourcePour } from './rejection-attribution';

const pour = (farmerId: string, qtyLitres: number, ratePerLitre = 40): SourcePour =>
  ({ pourId: `p-${farmerId}`, farmerId, qtyLitres, ratePerLitre });

const base = { fromNodeId: 'vmcc-1', vmccRatePerLitre: 38 };

describe('attribute', () => {
  // The incident this whole feature exists for: Vrindavan's buffalo is a
  // single-farmer stream, so the tanker that failed at the plant — three legs
  // from the can — was entirely Kishore's. Deciding by stage would have made it
  // a company write-off.
  it('charges the one farmer behind a load, however far downstream it failed', () => {
    const r = attribute({ ...base, qtyLitres: 97.7, pours: [pour('kishore', 97.7, 65)] });
    expect(r.borneBy).toBe('farmer');
    expect(r.charges).toEqual([{
      farmerId: 'kishore', vmccNodeId: null, pourId: 'p-kishore',
      qtyLitres: 97.7, ratePerLitre: 65, amount: 6350.5,
    }]);
  });

  it('charges the source VMCC when no pours stand behind the load', () => {
    const r = attribute({ ...base, qtyLitres: 50, pours: [] });
    expect(r.borneBy).toBe('vmcc');
    expect(r.charges).toEqual([{
      farmerId: null, vmccNodeId: 'vmcc-1', pourId: null,
      qtyLitres: 50, ratePerLitre: 38, amount: 1900,
    }]);
  });

  it('splits a blended can across its farmers by volume, at each pour rate', () => {
    const r = attribute({
      ...base, qtyLitres: 30,
      pours: [pour('a', 60, 40), pour('b', 40, 45)],
    });
    expect(r.borneBy).toBe('farmer');
    expect(r.charges.map((c) => [c.farmerId, c.qtyLitres, c.amount]))
      .toEqual([['a', 18, 720], ['b', 12, 540]]);
  });

  // Shares that each round independently do not sum back to the litres refused,
  // and a statement 0.01 L out is a statement nobody trusts.
  it('sums the shares back to exactly the litres refused', () => {
    const r = attribute({
      ...base, qtyLitres: 10,
      pours: [pour('a', 1), pour('b', 1), pour('c', 1)],
    });
    const total = r.charges.reduce((s, c) => s + c.qtyLitres, 0);
    expect(Math.round(total * 1000) / 1000).toBe(10);
  });

  it('pins the whole rejection on a named farmer when the lab identifies one', () => {
    const r = attribute({
      ...base, qtyLitres: 20, attributeToFarmerId: 'b',
      pours: [pour('a', 60), pour('b', 40)],
    });
    expect(r.charges).toHaveLength(1);
    expect(r.charges[0]!.farmerId).toBe('b');
    expect(r.charges[0]!.qtyLitres).toBe(20);
  });

  // Naming a farmer must not charge them for milk they never sent: a 200 L
  // rejection cannot land on the one farmer who brought 12.
  it('caps a named farmer at what they poured and pools the excess', () => {
    const r = attribute({
      ...base, qtyLitres: 100, attributeToFarmerId: 'b',
      pours: [pour('a', 60), pour('b', 40)],
    });
    const byFarmer = Object.fromEntries(r.charges.map((c) => [c.farmerId, c.qtyLitres]));
    expect(byFarmer.b).toBe(40);
    expect(byFarmer.a).toBe(60);
  });

  it('ignores a named farmer with no pour behind this load', () => {
    const r = attribute({
      ...base, qtyLitres: 10, attributeToFarmerId: 'stranger',
      pours: [pour('a', 60), pour('b', 40)],
    });
    expect(r.charges.map((c) => c.farmerId)).toEqual(['a', 'b']);
  });

  it('falls back to the company only when nothing traces', () => {
    expect(attribute({ qtyLitres: 10, pours: [], fromNodeId: null, vmccRatePerLitre: null }).borneBy)
      .toBe('company');
    // A VMCC whose milk no rate chart prices cannot be charged a number.
    expect(attribute({ qtyLitres: 10, pours: [], fromNodeId: 'vmcc-1', vmccRatePerLitre: null }).borneBy)
      .toBe('company');
  });

  it('charges nothing for a zero or negative rejection', () => {
    expect(attribute({ ...base, qtyLitres: 0, pours: [pour('a', 10)] }).charges).toEqual([]);
  });
});
