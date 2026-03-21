# WMS / External System Integration Guide

## Overview

This guide explains how to connect your WMS, OPS, or any external system to runQ's Finance-Accounting module. All integrations use REST APIs with JWT authentication.

---

## 1. Authentication

### Get a Service JWT

Your external system needs a service-level JWT token. Two options:

**Option A — Use the login API (simple):**
```
POST /api/v1/auth/login
Content-Type: application/json

{
  "email": "api-user@yourcompany.com",
  "password": "your-password",
  "tenant": "your-tenant-slug"
}
```

Response:
```json
{
  "data": {
    "token": "eyJhbG...",
    "user": { "id": "...", "role": "accountant" }
  }
}
```

Create a dedicated API user with `accountant` role in Settings > Users.

**Option B — Service JWT (for server-to-server):**

Generate a JWT signed with `SERVICE_JWT_SECRET` containing:
```json
{
  "serviceId": "wms",
  "tenantId": "your-tenant-uuid"
}
```

### Using the token

Include in all requests:
```
Authorization: Bearer <token>
```

---

## Base URL

```
https://erp.yourcompany.com/api/v1
```

Development: `http://localhost:3003/api/v1`

---

## 2. Sync Vendors (API)

Push vendor/supplier data to runQ. Idempotent — safe to call repeatedly.

```
POST /ap/vendors/sync
```

**Request:**
```json
{
  "vendors": [
    {
      "name": "Gopal Sharma — Collection Point Mathura",
      "phone": "9876543210",
      "email": "gopal@email.com",
      "bankAccountNumber": "33445566778",
      "bankIfsc": "SBIN0005678",
      "bankName": "State Bank of India",
      "wmsVendorId": "OPS-FARM-001",
      "paymentTermsDays": 15,
      "category": "raw_material"
    },
    {
      "name": "Ram Kumar — Collection Point Govardhan",
      "phone": "9876501234",
      "wmsVendorId": "OPS-FARM-002",
      "paymentTermsDays": 15
    }
  ]
}
```

**Response:**
```json
{
  "data": {
    "created": 1,
    "updated": 1,
    "errors": []
  }
}
```

**Matching logic:**
1. If `wmsVendorId` provided → match by wmsVendorId (exact)
2. Else → match by vendor name (case-insensitive)
3. If matched → update existing vendor
4. If no match → create new vendor

**Fields:**
| Field | Required | Notes |
|-------|----------|-------|
| name | Yes | Vendor name |
| wmsVendorId | No | Your system's vendor ID — enables reliable matching |
| phone | No | |
| email | No | |
| gstin | No | 15-char GST number (e.g., 09AABCM1234F1ZK) |
| pan | No | 10-char PAN (e.g., AABCM1234F) |
| bankAccountNumber | No | Required for payment execution |
| bankIfsc | No | Required for payment execution (e.g., SBIN0005678) |
| bankName | No | |
| addressLine1, city, state, pincode | No | |
| paymentTermsDays | No | Default: 30 |
| category | No | raw_material, service_provider, logistics, utilities, equipment, other |

---

## 3. Bulk Import Vendors (CSV)

```
POST /ap/vendors/import
Content-Type: application/json

{
  "csvData": "<csv string>"
}
```

**CSV format:**
```
Name,Phone,Email,GSTIN,PAN,Bank Account,IFSC,Bank Name,Address,City,State,Pincode,Category,Payment Terms
Gopal Sharma,9876543210,,,,,SBIN0001234,SBI,,Mathura,Uttar Pradesh,281001,raw_material,15
Ram Kumar,9876501234,,,,12345678901,,,,Govardhan,Uttar Pradesh,281006,raw_material,15
```

**Response:**
```json
{
  "data": {
    "created": 1,
    "updated": 0,
    "skipped": 0,
    "errors": []
  }
}
```

**Notes:**
- Header row required. Column order does not matter — matched by name.
- Matching by name (case-insensitive). If found, fills only empty fields — does not overwrite existing data.
- Rows with no name are skipped.
- Rows where no new data is found (everything already set) count as skipped.

---

## 4. Sync Customers (API)

Push customer data to runQ. Idempotent — safe to call repeatedly.

```
POST /ar/customers/sync
```

**Request:**
```json
{
  "customers": [
    {
      "name": "Krishna Supermarket",
      "type": "b2b",
      "phone": "9654321098",
      "email": "owner@krishna.in",
      "gstin": "09DDEFG3456I1ZP",
      "addressLine1": "Main Market",
      "city": "Vrindavan",
      "state": "Uttar Pradesh",
      "pincode": "281121",
      "paymentTermsDays": 15,
      "contactPerson": "Ramesh Agarwal"
    },
    {
      "name": "Gokul Dairy Retail",
      "type": "b2b",
      "paymentTermsDays": 7
    }
  ]
}
```

**Response:**
```json
{
  "data": {
    "created": 1,
    "updated": 1,
    "errors": []
  }
}
```

**Matching logic:**
- Match by customer name (case-insensitive)
- If matched → update existing customer
- If no match → create new customer

**Fields:**
| Field | Required | Notes |
|-------|----------|-------|
| name | Yes | Customer name |
| type | No | b2b (default), payment_gateway |
| phone | No | |
| email | No | |
| gstin | No | 15-char GST number |
| pan | No | 10-char PAN |
| addressLine1, addressLine2, city, state, pincode | No | |
| paymentTermsDays | No | Default: 30 |
| contactPerson | No | |

---

## 5. Bulk Import Customers (CSV)

```
POST /ar/customers/import
Content-Type: application/json

{
  "csvData": "<csv string>"
}
```

**CSV format:**
```
Name,Type,Phone,Email,GSTIN,PAN,Address,City,State,Pincode,Payment Terms,Contact Person
Krishna Supermarket,b2b,9654321098,owner@krishna.in,09DDEFG3456I1ZP,,Main Market,Vrindavan,Uttar Pradesh,281121,15,Ramesh Agarwal
Gokul Dairy Retail,b2b,9876543210,,,,,Mathura,Uttar Pradesh,281001,7,
```

**Response:**
```json
{
  "data": {
    "created": 1,
    "updated": 0,
    "skipped": 0,
    "errors": []
  }
}
```

**Notes:**
- Header row required. Column order does not matter — matched by name.
- Matching by name (case-insensitive). If found, fills only empty fields.
- `Type` must be `b2b` or `payment_gateway`. Defaults to `b2b` if omitted.

---

## 6. Purchase Flow

### 6a. Create Purchase Order (for 3-way matching)

POs are currently created via webhook or direct DB insert:

**Option A — Webhook (recommended):**
```
POST /webhooks/wms
```
```json
{
  "eventType": "po.created",
  "eventId": "unique-event-id",
  "timestamp": "2026-03-15T10:00:00Z",
  "tenantId": "your-tenant-uuid",
  "payload": {
    "poNumber": "PO-2526-0042",
    "vendorId": "uuid-of-vendor",
    "orderDate": "2026-03-15",
    "totalAmount": 275000,
    "items": [
      {
        "itemName": "Fresh Cow Milk",
        "sku": "MILK-RAW-COW",
        "quantity": 5000,
        "unitPrice": 55,
        "amount": 275000
      }
    ]
  }
}
```

**Option B — Direct DB insert** (if you have DB access):
```sql
INSERT INTO purchase_orders (id, tenant_id, po_number, vendor_id, order_date, status, total_amount)
VALUES (gen_random_uuid(), 'tenant-uuid', 'PO-2526-0042', 'vendor-uuid', '2026-03-15', 'confirmed', 275000);
```

---

### 6b. Create GRN (for 3-way matching)

```
POST /webhooks/wms
```
```json
{
  "eventType": "grn.created",
  "eventId": "unique-event-id",
  "timestamp": "2026-03-16T10:00:00Z",
  "tenantId": "your-tenant-uuid",
  "payload": {
    "grnNumber": "GRN-2526-0089",
    "poId": "uuid-of-po",
    "receivedDate": "2026-03-16",
    "items": [
      {
        "itemName": "Fresh Cow Milk",
        "sku": "MILK-RAW-COW",
        "orderedQuantity": 5000,
        "receivedQuantity": 5000,
        "acceptedQuantity": 4850,
        "rejectedQuantity": 150
      }
    ]
  }
}
```

---

### 6c. Create Purchase Invoice (Bill)

When your WMS receives a vendor invoice, push it to runQ.

```
POST /ap/purchase-invoices
```

**Request:**
```json
{
  "vendorId": "uuid-of-vendor",
  "invoiceNumber": "MDC/2526/1847",
  "invoiceDate": "2026-03-17",
  "dueDate": "2026-03-24",
  "poId": "uuid-of-po-if-applicable",
  "items": [
    {
      "itemName": "Fresh Cow Milk",
      "sku": "MILK-RAW-COW",
      "quantity": 5000,
      "unitPrice": 55,
      "amount": 275000
    }
  ],
  "subtotal": 275000,
  "taxAmount": 0,
  "totalAmount": 275000
}
```

**Response (201):**
```json
{
  "data": {
    "id": "uuid",
    "invoiceNumber": "MDC/2526/1847",
    "status": "draft",
    "matchStatus": "unmatched"
  }
}
```

**Notes:**
- `vendorId` must be a valid UUID from runQ's vendor list. Sync vendors first.
- `poId` is optional. If provided, 3-way matching can be triggered.
- Invoice is created in `draft` status. Finance team approves it in the admin panel.

---

### 6d. Create Debit Note

When goods are returned or there's a quality issue:

```
POST /ap/debit-notes
```

```json
{
  "vendorId": "uuid-of-vendor",
  "invoiceId": "uuid-of-purchase-invoice",
  "issueDate": "2026-03-17",
  "amount": 8250,
  "reason": "150 litres raw milk rejected — adulteration detected in batch 3"
}
```

---

## 7. Payment Flow

### 7a. Direct Payment (no bill required)

For payments without bills — milk collection, salary, fuel, etc.

```
POST /ap/payments/direct
```

```json
{
  "vendorId": "uuid-of-vendor",
  "bankAccountId": "uuid-of-bank-account",
  "paymentMethod": "bank_transfer",
  "referenceNumber": "UTR12345678",
  "paymentDate": "2026-03-17",
  "amount": 92000,
  "notes": "Milk collection Mar 1-15, 2026",
  "category": "raw_material"
}
```

**Response (201):**
```json
{
  "data": {
    "id": "uuid",
    "type": "direct",
    "status": "completed",
    "amount": 92000
  }
}
```

**Fields:**
| Field | Required | Notes |
|-------|----------|-------|
| vendorId | Yes | UUID of the vendor |
| bankAccountId | Yes | UUID of the bank account to pay from |
| paymentMethod | Yes | Must be `bank_transfer` |
| paymentDate | Yes | ISO date (YYYY-MM-DD) |
| amount | Yes | Positive number |
| referenceNumber | No | UTR / transaction reference |
| notes | No | Memo or description |
| category | No | Free-form category label |

---

### 7b. Advance Payment (pay before invoice)

Pay a vendor before receiving their invoice.

```
POST /ap/payments/advance
```

```json
{
  "vendorId": "uuid-of-vendor",
  "bankAccountId": "uuid-of-bank-account",
  "paymentMethod": "bank_transfer",
  "referenceNumber": "UTR99887766",
  "paymentDate": "2026-03-17",
  "amount": 50000,
  "notes": "Advance for March supplies"
}
```

**Response (201):**
```json
{
  "data": {
    "id": "uuid",
    "type": "advance",
    "status": "open",
    "amount": 50000,
    "unadjustedAmount": 50000
  }
}
```

To apply the advance against an invoice later:

```
POST /ap/payments/:advanceId/adjust
```

```json
{
  "invoiceId": "uuid-of-invoice",
  "amount": 50000
}
```

---

### 7c. Payment Against Bills

Pay one or more specific invoices.

```
POST /ap/payments
```

```json
{
  "vendorId": "uuid-of-vendor",
  "bankAccountId": "uuid-of-bank-account",
  "paymentMethod": "bank_transfer",
  "referenceNumber": "UTR11223344",
  "paymentDate": "2026-03-20",
  "totalAmount": 275000,
  "allocations": [
    {
      "invoiceId": "uuid-of-invoice-1",
      "amount": 150000
    },
    {
      "invoiceId": "uuid-of-invoice-2",
      "amount": 125000
    }
  ],
  "notes": "March settlement"
}
```

---

### 7d. Bulk Payment Batch / Queue

Your OPS/HR system calculates payments and sends them as a batch for finance approval.

```
POST /ap/payment-queue
```

**Request:**
```json
{
  "batchId": "MILK-MAR-2-2026",
  "source": "vrindavan-dairy-ops",
  "description": "Milk collection payments — March 16-31, 2026",
  "instructions": [
    {
      "vendorName": "Gopal Sharma — Collection Point Mathura",
      "vendorId": "uuid-if-known",
      "amount": 92000,
      "reference": "MC/MAR2/001",
      "reason": "5257L @ ₹17.50",
      "dueDate": "2026-04-01"
    },
    {
      "vendorName": "Ram Kumar — Collection Point Govardhan",
      "amount": 68500,
      "reference": "MC/MAR2/002",
      "reason": "3914L @ ₹17.50"
    }
  ]
}
```

**Response:**
```json
{
  "data": {
    "id": "batch-uuid",
    "batchId": "MILK-MAR-2-2026",
    "status": "pending_approval",
    "totalCount": 2,
    "totalAmount": 160500,
    "instructions": [
      {
        "vendorName": "Gopal Sharma...",
        "vendorId": "matched-uuid-or-null",
        "amount": 92000,
        "status": "pending"
      }
    ]
  }
}
```

**Notes:**
- `batchId` must be unique per tenant — prevents double submission
- Vendors are matched by name (case-insensitive) if `vendorId` not provided
- Unmatched vendors are flagged — finance team can create them from the admin panel
- Finance team reviews → approves → executes (creates payments)

---

## 8. Sales Flow

### 8a. Create Sales Invoice

When your order system needs to generate a customer invoice:

```
POST /ar/invoices
```

```json
{
  "customerId": "uuid-of-customer",
  "invoiceDate": "2026-03-15",
  "dueDate": "2026-03-30",
  "items": [
    {
      "description": "Full Cream Milk 500ml × 200 pouches",
      "quantity": 200,
      "unitPrice": 30,
      "amount": 6000
    }
  ],
  "subtotal": 6000,
  "taxAmount": 0,
  "totalAmount": 6000
}
```

**Response:**
```json
{
  "data": {
    "id": "uuid",
    "invoiceNumber": "VMP-2526-0003",
    "status": "draft"
  }
}
```

Invoice number is auto-generated based on tenant settings.

---

### 8b. Record Payment Receipt

When a customer pays one or more invoices:

```
POST /ar/receipts
```

```json
{
  "customerId": "uuid-of-customer",
  "bankAccountId": "uuid-of-bank-account",
  "paymentMethod": "bank_transfer",
  "referenceNumber": "UTR55667788",
  "receiptDate": "2026-03-22",
  "totalAmount": 6000,
  "allocations": [
    {
      "invoiceId": "uuid-of-invoice",
      "amount": 6000
    }
  ],
  "notes": "March payment from Krishna Supermarket"
}
```

**Response (201):**
```json
{
  "data": {
    "id": "uuid",
    "receiptNumber": "RCP-2526-0001",
    "status": "completed",
    "totalAmount": 6000
  }
}
```

**Fields:**
| Field | Required | Notes |
|-------|----------|-------|
| customerId | Yes | UUID of the customer |
| bankAccountId | Yes | UUID of the bank account where payment was received |
| paymentMethod | Yes | Must be `bank_transfer` |
| receiptDate | Yes | ISO date (YYYY-MM-DD) |
| totalAmount | Yes | Must equal sum of allocations |
| allocations | Yes | Array of { invoiceId, amount } — at least one required |
| referenceNumber | No | UTR / transaction reference |
| notes | No | Memo |

---

### 8c. Create Credit Note

When goods are returned or a discount is applied:

```
POST /ar/credit-notes
```

```json
{
  "customerId": "uuid-of-customer",
  "invoiceId": "uuid-of-sales-invoice",
  "issueDate": "2026-03-22",
  "amount": 1750,
  "reason": "5 kg Paneer returned — texture issue"
}
```

---

## 9. Error Handling

All errors follow the format:
```json
{
  "statusCode": 400,
  "error": "Bad Request",
  "message": "Human-readable message",
  "details": [{ "field": "amount", "message": "Must be positive" }]
}
```

Common status codes:
| Code | Meaning |
|------|---------|
| 201 | Created successfully |
| 204 | Deleted successfully (no body) |
| 400 | Validation error (check `details`) |
| 401 | Invalid or missing token |
| 404 | Resource not found |
| 409 | Conflict (duplicate batchId, vendor has unpaid invoices, etc.) |
| 500 | Server error |

**Sync endpoints** (`/sync`, `/import`) never return 4xx for individual row failures — they return 200 with per-row errors in the `errors` array. Always check `errors.length` in the response.

---

## 10. Recommended Integration Order

1. **Sync vendors** — ensure all suppliers/farmers exist in runQ (`POST /ap/vendors/sync`)
2. **Sync customers** — ensure all customers exist in runQ (`POST /ar/customers/sync`)
3. **Create PO + GRN** (if using 3-way matching) — or skip for direct invoice approval
4. **Create purchase invoices** — when vendors send bills (`POST /ap/purchase-invoices`)
5. **Send payment batch** — when OPS calculates collections (`POST /ap/payment-queue`)
6. **Create direct/advance payments** — for non-invoice payments (`POST /ap/payments/direct`, `/advance`)
7. **Create sales invoices** — when orders are shipped (`POST /ar/invoices`)
8. **Record receipts** — when customers pay (`POST /ar/receipts`)
9. **Create debit/credit notes** — when returns or disputes occur

**Vendor lookup tip:** Before creating invoices, find the runQ vendor UUID:
```
GET /ap/vendors?search=OPS-FARM-001
```
Or sync the vendor first and store the returned UUID.

---

## Webhook Events (runQ → Your System)

Currently runQ sends events **from** external systems **to** runQ. Outbound webhooks (runQ notifying your system) are planned for:

- `payment.completed` — when finance executes a payment
- `invoice.paid` — when a sales invoice is fully paid
- `batch.executed` — when a payment batch is executed

These are not yet built. For now, poll the relevant APIs to check status.
