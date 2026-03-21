# Payment Integration — Plan

## Decision
runQ will be pluggable — support multiple payment providers. No vendor lock-in. Tenant chooses what works for them.

## Providers (in priority order)

### 1. Manual / Payment File Export (build first)
- Generate CSV/Excel with approved payments
- Client downloads, uploads to net banking portal
- Works with ALL banks, zero integration needed
- Universal fallback

### 2. ICICI Connected Banking API
- Direct NEFT/RTGS/IMPS from client's ICICI current account
- No intermediary, no pre-funding
- Requires: corporate banking + API agreement with bank RM

### 3. Axis Connect API
- Same as ICICI, for Axis bank clients

### 4. HDFC Corporate API
- Same pattern

### 5. RazorpayX
- Pre-fund virtual account, API payouts to any bank
- Best for: clients already using Razorpay, small businesses
- Cost: ₹2-5 per payout

### 6. Cashfree Payouts
- Same as RazorpayX, alternative provider

## Architecture
```typescript
interface PaymentProvider {
  initiatePayment(params: PayoutRequest): Promise<PayoutResponse>;
  checkStatus(transactionId: string): Promise<PayoutStatus>;
  getBalance(): Promise<number>;
}
```
- Each provider implements this interface
- Tenant configures provider + credentials in Settings
- Payment flow calls the configured provider
- ManualProvider just generates the file and marks as "pending"

## Status: PLANNED — not yet built
