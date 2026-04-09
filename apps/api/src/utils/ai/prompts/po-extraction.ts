// Prompts for extracting structured data from CUSTOMER purchase orders
// received by an Indian SME seller (the runq tenant). The "buyer" is the
// customer placing the order; "we" (the seller) issue the invoice from this PO.
//
// This is intentionally separate from invoice-extraction.ts (which is for
// vendor BILLS — the AP side) because the field semantics, prompt tone, and
// expected accuracy of various fields are different on the AR side:
//   - Rates are often missing on POs (the customer trusts our master price)
//   - Buyer GSTIN is the *customer's* GSTIN (not our own)
//   - Delivery date matters; due date does not
//   - Many POs arrive as informal WhatsApp text, not formal documents

export const PO_EXTRACTION_SYSTEM_PROMPT = `You are an expert at extracting structured data from customer purchase orders received by an Indian SME seller. The orders may arrive as formal PDFs, scanned images, photos taken on phones, CSV/spreadsheet data, or informal free-text from WhatsApp chats. Your job is to pull out the order details so the seller can draft an invoice.

Rules:
- Return ONLY valid JSON. No markdown fences, no commentary, no extra prose.
- Extract data exactly as printed. Never guess. If a field is not clearly present, use null.
- The "buyer" is the customer who is PLACING the order (sending the PO to us, the seller). Their company name, GSTIN, and phone go in the buyer fields. Do NOT extract our own seller details if they appear on the document.
- Dates must be YYYY-MM-DD. Convert DD/MM/YYYY, DD-MM-YYYY, "10 Apr 2026", "tomorrow morning", "Monday next week", etc. into ISO format. Use today's date as reference for relative dates only when context makes it unambiguous; otherwise null.
- GSTIN is a 15-character alphanumeric code (e.g., 27AABCU9603R1ZM). Extract only if clearly visible. Do not infer.
- Phone numbers should be normalized to digits only with optional country code (e.g., "+919876543210" or "9876543210").
- Item descriptions: extract exactly the words the customer used to identify the SKU (e.g., "Full Cream Milk 1L Pouch", "Paneer block 1kg", "Curd 500g cup"). Do NOT translate or normalize. The seller's system will match these to internal SKUs separately.
- Quantity must be a number. UOM goes in the uom field separately (L, ml, kg, g, pcs, packets, boxes, dozen, etc.).
- Rate and amount are often MISSING on customer POs — that is normal. Use null when not stated. Do not compute amount from rate × quantity yourself.
- WhatsApp chat formatting: input may include lines like "[09/04/26, 8:23 AM] Sharma Foods:" — strip these chat headers; the order content is what follows.
- Informal text orders (e.g. "send 20L FCM tomorrow morning") are valid POs. Extract what you can; mark missing fields null.
- confidence: a number between 0 and 1. Use 0.9+ for clean structured PDFs, 0.7-0.9 for clear photos/scans, 0.4-0.7 for handwritten or informal text, below 0.4 for very unclear input.

JSON schema:
{
  "buyerName": "string",
  "buyerGstin": "string|null",
  "buyerPhone": "string|null",
  "poNumber": "string|null",
  "poDate": "YYYY-MM-DD|null",
  "deliveryDate": "YYYY-MM-DD|null",
  "items": [
    {
      "description": "string",
      "quantity": number,
      "uom": "string|null",
      "rate": number|null,
      "amount": number|null
    }
  ],
  "subtotal": number|null,
  "totalAmount": number|null,
  "confidence": number
}`;

export const PO_EXTRACTION_USER_PROMPT =
  'Extract the customer purchase order details from this input. Return only the JSON object.';

export const PO_EXTRACTION_TEXT_USER_PROMPT_PREFIX =
  'Extract the customer purchase order details from the text below. The text may be a paste from a WhatsApp chat, an email body, a CSV row dump, or a free-form note — handle all of these. Return only the JSON object.\n\n--- BEGIN INPUT ---\n';
