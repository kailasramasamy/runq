export interface UPILinkParams {
  upiId: string;
  payeeName: string;
  amount: number;
  transactionNote: string;
}

export interface UPILinkResult {
  deepLink: string;
  qrData: string;
}

export function generateUPILink(params: UPILinkParams): UPILinkResult {
  const { upiId, payeeName, amount, transactionNote } = params;

  const query = new URLSearchParams({
    pa: upiId,
    pn: payeeName,
    am: amount.toFixed(2),
    cu: 'INR',
    tn: transactionNote,
  });

  const uri = `upi://pay?${query.toString()}`;
  return { deepLink: uri, qrData: uri };
}
