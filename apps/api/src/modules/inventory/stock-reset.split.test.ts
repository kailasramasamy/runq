import { describe, it, expect } from 'vitest';
import { splitPool, type LedgerMove } from './stock-reset.service';

/**
 * Splitting a mixed pool decides whether a write-off posts a journal entry.
 * Over-count the capitalised share and inventory is credited that was never
 * debited, double-expensing the milk; under-count it and an asset lingers on
 * the books. The two production batches that exposed the gap are here
 * verbatim, plus the edges around them.
 */

const mpIn = (qty: number): LedgerMove =>
  ({ qtyIn: qty, qtyOut: 0, sourceType: 'mp_receipt' });
const adjIn = (qty: number): LedgerMove =>
  ({ qtyIn: qty, qtyOut: 0, sourceType: 'inventory_adjustment' });
const adjOut = (qty: number): LedgerMove =>
  ({ qtyIn: 0, qtyOut: qty, sourceType: 'inventory_adjustment' });
const woOut = (qty: number): LedgerMove =>
  ({ qtyIn: 0, qtyOut: qty, sourceType: 'work_order' });
const grnIn = (qty: number): LedgerMove =>
  ({ qtyIn: qty, qtyOut: 0, sourceType: 'grn' });

describe('splitPool', () => {
  /**
   * CON/2026-27/01181 — MP milk partly consumed by a work order, then topped
   * up by a GL-posting adjustment (ADJ-000004, ₹6,135.78 on 144.100 @ 42.58).
   * The work order must eat the MP layer, leaving the adjustment intact.
   */
  it('leaves a later capitalised top-up intact when a work order ate the MP milk', () => {
    expect(splitPool([mpIn(297.9), woOut(274.215), adjIn(144.1)])).toEqual({
      capitalised: 144.1,
      uncapitalised: 23.685,
    });
  });

  /**
   * The bug this replaced: attributing an outflow by its own source type.
   * A work order is not an `mp_receipt`, so counting its 274.215 against the
   * capitalised layer wiped out the 144.100 that genuinely was on the GL and
   * reported the whole pool as uncapitalised.
   */
  it('does not let a work order cancel a capitalised layer it never touched', () => {
    const s = splitPool([mpIn(297.9), woOut(274.215), adjIn(144.1)]);
    expect(s.capitalised).not.toBe(0);
  });

  /**
   * CON/2026-27/01178 — an adjustment added 144.1 and a second took it back
   * out the same morning. FIFO consumes the MP layer first, so the leftover
   * reads as capitalised — but every movement is at zero cost, so the caller
   * folds a worthless capitalised share back into uncapitalised and no
   * journal entry posts either way.
   */
  it('replays a same-day mistake and correction without losing the pool', () => {
    const s = splitPool([mpIn(586.8), adjIn(144.1), adjOut(144.1), woOut(469.145)]);
    expect(s.capitalised + s.uncapitalised).toBeCloseTo(117.655, 3);
  });

  it('treats a pool fed only by MP receipts as entirely uncapitalised', () => {
    expect(splitPool([mpIn(500)])).toEqual({ capitalised: 0, uncapitalised: 500 });
  });

  it('treats a pool fed only by receipts as entirely capitalised', () => {
    expect(splitPool([grnIn(144.1)])).toEqual({
      capitalised: 144.1,
      uncapitalised: 0,
    });
  });

  it('consumes the earliest layer first across both classes', () => {
    // GRN arrives first and is eaten; the MP milk behind it survives.
    expect(splitPool([grnIn(100), mpIn(50), woOut(120)])).toEqual({
      capitalised: 0,
      uncapitalised: 30,
    });
  });

  it('empties the pool when everything is consumed', () => {
    expect(splitPool([mpIn(100), grnIn(50), woOut(150)])).toEqual({
      capitalised: 0,
      uncapitalised: 0,
    });
  });

  /**
   * A pool can go briefly negative through a back-dated correction. The
   * replay must not produce a negative layer or loop forever draining an
   * empty stack.
   */
  it('survives an outflow larger than everything received', () => {
    const s = splitPool([mpIn(10), woOut(999)]);
    expect(s).toEqual({ capitalised: 0, uncapitalised: 0 });
  });

  it('handles an empty ledger', () => {
    expect(splitPool([])).toEqual({ capitalised: 0, uncapitalised: 0 });
  });

  it('holds three-decimal quantities without drift', () => {
    const s = splitPool([mpIn(333.333), grnIn(222.222), woOut(111.111)]);
    expect(s.uncapitalised).toBe(222.222);
    expect(s.capitalised).toBe(222.222);
  });

  /**
   * The invariant that matters regardless of shape: neither half is ever
   * negative, and together they equal what the replay says is left.
   */
  it('never returns a negative share', () => {
    const shapes: LedgerMove[][] = [
      [mpIn(297.9), woOut(274.215), adjIn(144.1)],
      [mpIn(586.8), adjIn(144.1), adjOut(144.1), woOut(469.145)],
      [grnIn(1), mpIn(1), woOut(1), adjIn(1), adjOut(2)],
      [woOut(50)],
    ];
    for (const moves of shapes) {
      const s = splitPool(moves);
      expect(s.capitalised).toBeGreaterThanOrEqual(0);
      expect(s.uncapitalised).toBeGreaterThanOrEqual(0);
    }
  });
});
