import { describe, it, expect } from 'vitest';
import { payeeFromNarration } from './monthly-pnl-detail.service';

describe('payeeFromNarration', () => {
  it.each([
    ['UPI/110354916908/UPI Pay/vasascientific@//ICI6fd234dba52b44648ede24d7bac418cd/', 'vasascientific@'],
    ['MMT/IMPS/622016747059/VendorAAAChemic/CBIN0283402', 'VendorAAAChemic'],
    ['INF/NEFT/IN42624758567386/CNRB/INDUSPRAKASH', 'INDUSPRAKASH'],
    ['INB/NEFT/AXODH20563382269/POORVIKA J N/KARNATAKA BANK LIMIT//////', 'POORVIKA J N'],
    ['POS/NARAYANAPPA JAYAP/Channapatna/060826/19:02/2722', 'NARAYANAPPA JAYAP'],
    ['NEFT-AXISCN1390846012-RAZORPAY PAYMENTS PVT LTD PAYMENT AGGREGATOR ESCROW ACCOUNT -RAZORPAY', 'RAZORPAY PAYMENTS PVT LTD PAYMENT AGGREGATOR ESCROW ACCOUNT'],
  ])('reads the beneficiary from %s', (narration, payee) => {
    expect(payeeFromNarration(narration)).toBe(payee);
  });

  it('returns null for shapes it does not know', () => {
    expect(payeeFromNarration('CHQ DEP 000123')).toBeNull();
    expect(payeeFromNarration(null)).toBeNull();
  });
});
