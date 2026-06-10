import { describe, it, expect } from 'vitest';
import { looksLikeOnAccountCredit } from './auto-receipt.service';

describe('looksLikeOnAccountCredit', () => {
  it('flags transport / advance narrations as on-account', () => {
    expect(looksLikeOnAccountCredit('NEFT/HDFC/THINK FRESHFIRST/0001truck advance')).toBe(true);
    expect(looksLikeOnAccountCredit('security deposit refund')).toBe(true);
    expect(looksLikeOnAccountCredit('FREIGHT charges')).toBe(true);
    expect(looksLikeOnAccountCredit('loan repayment')).toBe(true);
  });

  it('treats ordinary invoice payments as not on-account', () => {
    expect(looksLikeOnAccountCredit('NEFT/HDFC/THINK FRESHFIRST/0001vendor payment')).toBe(false);
    expect(looksLikeOnAccountCredit('IMPS/INNOVATIVE RETAIL CONCEPTS')).toBe(false);
    expect(looksLikeOnAccountCredit('UPI settlement')).toBe(false);
  });

  it('handles missing narration', () => {
    expect(looksLikeOnAccountCredit(null)).toBe(false);
    expect(looksLikeOnAccountCredit('')).toBe(false);
  });
});
