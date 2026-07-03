import { describe, it, expect } from 'vitest';
import { narrationContains, extractNarrationPattern } from './categorize.service';

// The regression that motivated this: an RTGS credit from "Think FreshFirst
// Technologies" arrives with the payer name truncated mid-word ("THINK
// FRESHFIRST TECHN"), so neither the learned rule ("THINK FRESHFIRST
// TECHNOLOGIE") nor the full customer name substring-matched, and no receipt
// was auto-created.
const RTGS = 'RTGS/HDFCR52026070278265368/THINK FRESHFIRST TECHN/HDFC BANK///vendor payment//OP'.toUpperCase();

describe('narrationContains', () => {
  it('matches a learned rule whose pattern is longer than the truncated narration', () => {
    expect(narrationContains(RTGS, 'THINK FRESHFIRST TECHNOLOGIE')).toBe(true);
  });

  it('matches the full customer name against a truncated narration', () => {
    expect(narrationContains(RTGS, 'Think FreshFirst Technologies Pvt Ltd')).toBe(true);
  });

  it('still matches on exact containment (no behaviour change for working cases)', () => {
    expect(narrationContains('NEFT/HSBCN18262169390/INNOVATIVE RETAIL CONCEPTS', 'INNOVATIVE RETAIL CONCEPTS')).toBe(true);
  });

  it('does not match an unrelated payer', () => {
    expect(narrationContains(RTGS, 'FRESHALICIOUS SUPER BAZAR')).toBe(false);
  });

  it('will not match on a single generic short token', () => {
    // "SRI" alone is under the 8-char distinctive-prefix floor, so a bare
    // "SRI" narration must not be pulled into a "Sri Ram Traders" bucket.
    expect(narrationContains('IMPS/12345/SRI PAYMENT', 'Sri Ram Traders')).toBe(false);
  });
});

describe('extractNarrationPattern — RTGS', () => {
  it('extracts the (possibly truncated) payee from an RTGS narration', () => {
    expect(extractNarrationPattern('RTGS/HDFCR52026070278265368/THINK FRESHFIRST TECHN/HDFC BANK///vendor payment//OP'))
      .toBe('THINK FRESHFIRST TECHN');
  });
});
