import { describe, it, expect } from 'vitest';
import { uncoveredLitres } from './farmer-sale-stock';

/**
 * The one number that decides whether a gate sale touches plant stock.
 *
 * A centre that collected the type it sold nets the sale off its own dispatch,
 * so the plant receives less and the inventory ledger must stay out of it.
 * A centre that collected none of it handed over milk from the plant's tank,
 * and that is the case the ledger has to see.
 */
describe('uncoveredLitres', () => {
  it('posts nothing when the day\'s collection covers the sale', () => {
    // Vrindavan A1: 293 L poured, 80 L sold at the gate.
    expect(uncoveredLitres(0, 80, 293)).toBe(0);
  });

  it('posts the whole sale when the centre collected none of that type', () => {
    // Vrindavan A2: never poured there, so all 80 L came off the plant.
    expect(uncoveredLitres(0, 80, 0)).toBe(80);
  });

  it('posts only the shortfall on a partial cover', () => {
    expect(uncoveredLitres(0, 100, 60)).toBe(40);
  });

  it('measures a second sale against what the first already used', () => {
    // 60 L collected, 40 L sold earlier: the first sale was fully covered, so
    // only 30 of this 50 L sale can be.
    expect(uncoveredLitres(40, 50, 60)).toBe(30);
    // A third sale in the same slot is now entirely off plant stock.
    expect(uncoveredLitres(90, 20, 60)).toBe(20);
  });

  it('never posts more than the sale itself', () => {
    // Earlier sales overdrew the slot; this sale still only moved its own qty.
    expect(uncoveredLitres(200, 10, 60)).toBe(10);
  });

  it('keeps litres at the precision the column stores', () => {
    expect(uncoveredLitres(0, 10.5555, 0)).toBe(10.556);
    expect(uncoveredLitres(0, 10, 9.7778)).toBe(0.222);
  });
});
