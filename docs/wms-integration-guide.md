# WMS / External System Integration Guide

## Overview

This guide explains how to connect your WMS, OPS, or any external system to runQ's Finance-Accounting module. All integrations use REST APIs with JWT authentication.

---

## Authentication

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

## API Endpoints for External Systems

### 1. Sync Vendors

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

### 2. Create Purchase Invoice (Bill)

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
    "matchStatus": "unmatched",
    ...
  }
}
```

**Notes:**
- `vendorId` must be a valid UUID from runQ's vendor list. Sync vendors first.
- `poId` is optional. If provided, 3-way matching can be triggered.
- Invoice is created in `draft` status. Finance team approves it in the admin panel.
- If the bill has no PO, finance can approve directly without matching.

---

### 3. Create Purchase Order (for 3-way matching)

If your WMS manages purchase orders and you want runQ to do 3-way matching:

```
Direct DB insert or use the webhook endpoint
```

POs are currently read-only in runQ (no CRUD API). Two options:

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

### 4. Create GRN (for 3-way matching)

Same as PO — webhook or direct DB insert:

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

### 5. Send Payment Instructions (Bulk)

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

### 6. Create Debit Note

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

### 7. Create Sales Invoice

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

### 8. Create Credit Note

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

## Common Patterns

### Lookup vendor by wmsVendorId

Before creating invoices, you may need to find the runQ vendor UUID:

```
GET /ap/vendors?search=OPS-FARM-001
```

Or sync the vendor first and store the returned UUID.

### Error handling

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
| 400 | Validation error (check `details`) |
| 401 | Invalid or missing token |
| 404 | Resource not found |
| 409 | Conflict (duplicate batchId, vendor has unpaid invoices, etc.) |
| 500 | Server error |

### Recommended integration order

1. **Sync vendors** first — ensure all your suppliers/farmers exist in runQ
2. **Create PO + GRN** (if using 3-way matching) — or skip for direct approval
3. **Create purchase invoices** — when vendor sends a bill
4. **Send payment instructions** — when OPS calculates payments
5. **Create sales invoices** — when orders are shipped
6. **Create credit/debit notes** — when returns/issues occur

---

## Webhook Events (runQ → Your System)

Currently runQ sends events **from** external systems **to** runQ. Outbound webhooks (runQ notifying your system) are planned for:

- `payment.completed` — when finance executes a payment
- `invoice.paid` — when a sales invoice is fully paid
- `batch.executed` — when a payment batch is executed

These are not yet built. For now, poll the relevant APIs to check status.
