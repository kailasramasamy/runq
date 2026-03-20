# RunQ Finance-Accounting Module — API Routes

## Conventions

- Base URL: `/api/v1`
- Auth: `Authorization: Bearer <jwt>` (user JWT for admin, service JWT for inter-service)
- Pagination: `?page=1&limit=25` → `{ data: [], meta: { page, limit, total, totalPages } }`
- Sorting: `?sort=created_at&order=desc`
- Dates: ISO 8601
- Currency: INR, amounts in paise (integer) internally
- IDs: UUIDs
- Validation: Zod schemas shared frontend/backend

### Auth Types

| Type | Use |
|------|-----|
| `user` JWT | Admin panel — contains userId, tenantId, role |
| `service` JWT | Inter-service (WMS→runq) — short-lived (5 min) |

### RBAC

| Pattern | owner | accountant | viewer |
|---------|-------|------------|--------|
| GET (list/detail) | Yes | Yes | Yes |
| POST/PUT (create/update) | Yes | Yes | No |
| DELETE | Yes | No | No |
| Approve | Yes | No | No |
| Settings | Yes | No | No |

### Standard Error Response

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human-readable message",
    "details": [{ "field": "amount", "message": "Must be positive" }]
  }
}
```

### Standard Success Response

```json
{
  "data": { ... },
  "meta": { "page": 1, "limit": 25, "total": 142, "totalPages": 6 }
}
```

---

## 1. Auth & Tenant (4 routes)

### `POST /api/v1/auth/login`

Login with email and password. Returns JWT.

- **Auth**: None
- **Request**:
```json
{
  "email": "vaidehi@example.com",
  "password": "securepassword"
}
```
- **Response** `200`:
```json
{
  "data": {
    "token": "eyJhbGciOiJSUzI1NiIs...",
    "user": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "name": "Vaidehi",
      "email": "vaidehi@example.com",
      "role": "owner",
      "tenantId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
    }
  }
}
```
- **Errors**: `401 INVALID_CREDENTIALS`

### `POST /api/v1/auth/refresh`

Refresh JWT token.

- **Auth**: Bearer (expired token accepted within grace window)
- **Response** `200`:
```json
{
  "data": { "token": "eyJhbGciOiJSUzI1NiIs..." }
}
```

### `GET /api/v1/auth/me`

Get current user profile.

- **Auth**: Bearer (user)
- **Response** `200`:
```json
{
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "Vaidehi",
    "email": "vaidehi@example.com",
    "role": "owner",
    "tenantId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "tenant": {
      "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "name": "RunQ Logistics",
      "slug": "runq-logistics"
    }
  }
}
```

### `PUT /api/v1/auth/password`

Change current user's password.

- **Auth**: Bearer (user)
- **Request**:
```json
{
  "currentPassword": "oldpassword",
  "newPassword": "newsecurepassword"
}
```
- **Response** `200`:
```json
{
  "data": { "message": "Password updated" }
}
```

---

## 2. Vendors (7 routes)

### `GET /api/v1/ap/vendors`

List vendors with pagination and search.

- **Auth**: Bearer (user)
- **Query**: `?page=1&limit=25&search=acme&is_active=true`
- **Response** `200`:
```json
{
  "data": [
    {
      "id": "v-uuid-1",
      "name": "Acme Supplies",
      "gstin": "29AABCU9603R1ZM",
      "city": "Bangalore",
      "state": "Karnataka",
      "paymentTermsDays": 30,
      "isActive": true,
      "outstandingBalance": 125000.00
    }
  ],
  "meta": { "page": 1, "limit": 25, "total": 48, "totalPages": 2 }
}
```

### `GET /api/v1/ap/vendors/:id`

Get vendor details with summary.

- **Auth**: Bearer (user)
- **Response** `200`:
```json
{
  "data": {
    "id": "v-uuid-1",
    "name": "Acme Supplies",
    "gstin": "29AABCU9603R1ZM",
    "pan": "AABCU9603R",
    "email": "billing@acme.com",
    "phone": "9876543210",
    "addressLine1": "123 Industrial Area",
    "city": "Bangalore",
    "state": "Karnataka",
    "pincode": "560001",
    "bankAccountName": "Acme Supplies Pvt Ltd",
    "bankAccountNumber": "1234567890123",
    "bankIfsc": "HDFC0001234",
    "bankName": "HDFC Bank",
    "paymentTermsDays": 30,
    "wmsVendorId": "WMS-V-001",
    "isActive": true,
    "summary": {
      "totalInvoices": 24,
      "totalPaid": 450000.00,
      "outstandingBalance": 125000.00,
      "overdueAmount": 50000.00
    }
  }
}
```

### `POST /api/v1/ap/vendors`

Create a new vendor.

- **Auth**: Bearer (user, role: owner/accountant)
- **Request**:
```json
{
  "name": "Acme Supplies",
  "gstin": "29AABCU9603R1ZM",
  "pan": "AABCU9603R",
  "email": "billing@acme.com",
  "phone": "9876543210",
  "addressLine1": "123 Industrial Area",
  "city": "Bangalore",
  "state": "Karnataka",
  "pincode": "560001",
  "bankAccountName": "Acme Supplies Pvt Ltd",
  "bankAccountNumber": "1234567890123",
  "bankIfsc": "HDFC0001234",
  "bankName": "HDFC Bank",
  "paymentTermsDays": 30
}
```
- **Response** `201`: Full vendor object

### `PUT /api/v1/ap/vendors/:id`

Update vendor details.

- **Auth**: Bearer (user, role: owner/accountant)
- **Request**: Partial vendor object (same fields as create)
- **Response** `200`: Updated vendor object

### `DELETE /api/v1/ap/vendors/:id`

Soft-delete a vendor. Fails if vendor has unpaid invoices.

- **Auth**: Bearer (user, role: owner)
- **Response** `200`:
```json
{
  "data": { "message": "Vendor deactivated" }
}
```
- **Errors**: `409 VENDOR_HAS_OUTSTANDING_BALANCE`

### `GET /api/v1/ap/vendors/:id/ledger`

Get vendor transaction ledger (invoices, payments, debit notes).

- **Auth**: Bearer (user)
- **Query**: `?from=2025-04-01&to=2026-03-31`
- **Response** `200`:
```json
{
  "data": {
    "vendorId": "v-uuid-1",
    "vendorName": "Acme Supplies",
    "period": { "from": "2025-04-01", "to": "2026-03-31" },
    "openingBalance": 0.00,
    "closingBalance": 125000.00,
    "entries": [
      {
        "date": "2025-06-15",
        "type": "invoice",
        "reference": "ACM-INV-2024-089",
        "debit": 200000.00,
        "credit": 0.00,
        "balance": 200000.00
      },
      {
        "date": "2025-07-01",
        "type": "payment",
        "reference": "UTR-123456789",
        "debit": 0.00,
        "credit": 75000.00,
        "balance": 125000.00
      }
    ]
  }
}
```

### `POST /api/v1/ap/vendors/sync-from-wms`

Pull vendor master data from WMS and upsert.

- **Auth**: Bearer (user, role: owner/accountant)
- **Request**:
```json
{
  "wmsVendorIds": ["WMS-V-001", "WMS-V-002"]
}
```
- **Response** `200`:
```json
{
  "data": {
    "created": 1,
    "updated": 1,
    "errors": []
  }
}
```

---

## 3. Purchase Orders (2 routes)

Read-only — POs are created by WMS via webhook.

### `GET /api/v1/ap/purchase-orders`

List purchase orders.

- **Auth**: Bearer (user)
- **Query**: `?page=1&limit=25&vendor_id=v-uuid-1&status=confirmed`
- **Response** `200`:
```json
{
  "data": [
    {
      "id": "po-uuid-1",
      "poNumber": "PO-2526-0042",
      "vendorId": "v-uuid-1",
      "vendorName": "Acme Supplies",
      "orderDate": "2025-06-01",
      "expectedDeliveryDate": "2025-06-15",
      "status": "confirmed",
      "totalAmount": 200000.00,
      "itemCount": 5
    }
  ],
  "meta": { "page": 1, "limit": 25, "total": 12, "totalPages": 1 }
}
```

### `GET /api/v1/ap/purchase-orders/:id`

Get PO detail with line items and linked GRNs/invoices.

- **Auth**: Bearer (user)
- **Response** `200`:
```json
{
  "data": {
    "id": "po-uuid-1",
    "poNumber": "PO-2526-0042",
    "vendorId": "v-uuid-1",
    "vendorName": "Acme Supplies",
    "orderDate": "2025-06-01",
    "status": "fully_received",
    "totalAmount": 200000.00,
    "items": [
      {
        "id": "poi-uuid-1",
        "itemName": "Widget A",
        "sku": "WDG-A-001",
        "quantity": 100.000,
        "unitPrice": 1000.00,
        "amount": 100000.00
      },
      {
        "id": "poi-uuid-2",
        "itemName": "Widget B",
        "sku": "WDG-B-001",
        "quantity": 50.000,
        "unitPrice": 2000.00,
        "amount": 100000.00
      }
    ],
    "grns": [{ "id": "grn-uuid-1", "grnNumber": "GRN-2526-0038", "receivedDate": "2025-06-14" }],
    "invoices": [{ "id": "inv-uuid-1", "invoiceNumber": "ACM-INV-089", "status": "matched" }]
  }
}
```

---

## 4. GRNs (2 routes)

Read-only — GRNs are created by WMS via webhook.

### `GET /api/v1/ap/grns`

List goods receipt notes.

- **Auth**: Bearer (user)
- **Query**: `?page=1&limit=25&po_id=po-uuid-1`
- **Response** `200`:
```json
{
  "data": [
    {
      "id": "grn-uuid-1",
      "grnNumber": "GRN-2526-0038",
      "poId": "po-uuid-1",
      "poNumber": "PO-2526-0042",
      "vendorName": "Acme Supplies",
      "receivedDate": "2025-06-14",
      "status": "confirmed",
      "itemCount": 2
    }
  ],
  "meta": { "page": 1, "limit": 25, "total": 5, "totalPages": 1 }
}
```

### `GET /api/v1/ap/grns/:id`

Get GRN detail with line items showing ordered vs received vs accepted quantities.

- **Auth**: Bearer (user)
- **Response** `200`:
```json
{
  "data": {
    "id": "grn-uuid-1",
    "grnNumber": "GRN-2526-0038",
    "poId": "po-uuid-1",
    "poNumber": "PO-2526-0042",
    "receivedDate": "2025-06-14",
    "status": "confirmed",
    "items": [
      {
        "id": "gi-uuid-1",
        "itemName": "Widget A",
        "sku": "WDG-A-001",
        "orderedQuantity": 100.000,
        "receivedQuantity": 100.000,
        "acceptedQuantity": 98.000,
        "rejectedQuantity": 2.000
      },
      {
        "id": "gi-uuid-2",
        "itemName": "Widget B",
        "sku": "WDG-B-001",
        "orderedQuantity": 50.000,
        "receivedQuantity": 50.000,
        "acceptedQuantity": 50.000,
        "rejectedQuantity": 0.000
      }
    ]
  }
}
```

---

## 5. Purchase Invoices (7 routes)

### `GET /api/v1/ap/invoices`

List purchase invoices with filtering.

- **Auth**: Bearer (user)
- **Query**: `?page=1&limit=25&vendor_id=v-uuid-1&status=pending_match&match_status=mismatch&due_before=2025-07-31`
- **Response** `200`:
```json
{
  "data": [
    {
      "id": "pi-uuid-1",
      "invoiceNumber": "ACM-INV-089",
      "vendorId": "v-uuid-1",
      "vendorName": "Acme Supplies",
      "invoiceDate": "2025-06-16",
      "dueDate": "2025-07-16",
      "totalAmount": 200000.00,
      "amountPaid": 0.00,
      "balanceDue": 200000.00,
      "status": "matched",
      "matchStatus": "matched"
    }
  ],
  "meta": { "page": 1, "limit": 25, "total": 24, "totalPages": 1 }
}
```

### `GET /api/v1/ap/invoices/:id`

Get invoice detail with line items, match result, and payment history.

- **Auth**: Bearer (user)
- **Response** `200`: Full invoice with items, PO/GRN links, match details, payments

### `POST /api/v1/ap/invoices`

Create a purchase invoice manually (or via webhook).

- **Auth**: Bearer (user, role: owner/accountant)
- **Request**:
```json
{
  "invoiceNumber": "ACM-INV-089",
  "vendorId": "v-uuid-1",
  "poId": "po-uuid-1",
  "grnId": "grn-uuid-1",
  "invoiceDate": "2025-06-16",
  "dueDate": "2025-07-16",
  "items": [
    {
      "poItemId": "poi-uuid-1",
      "itemName": "Widget A",
      "sku": "WDG-A-001",
      "quantity": 98.000,
      "unitPrice": 1000.00,
      "amount": 98000.00
    },
    {
      "poItemId": "poi-uuid-2",
      "itemName": "Widget B",
      "sku": "WDG-B-001",
      "quantity": 50.000,
      "unitPrice": 2000.00,
      "amount": 100000.00
    }
  ],
  "taxAmount": 35640.00
}
```
- **Response** `201`: Created invoice with auto-computed subtotal, total, balance

### `PUT /api/v1/ap/invoices/:id`

Update a draft invoice. Cannot update once matched/approved.

- **Auth**: Bearer (user, role: owner/accountant)
- **Response** `200`: Updated invoice
- **Errors**: `409 INVOICE_NOT_EDITABLE` (if status is not draft)

### `POST /api/v1/ap/invoices/:id/match`

Run 3-way matching on an invoice. Compares PO items, GRN items, and invoice items.

- **Auth**: Bearer (user, role: owner/accountant)
- **Response** `200` (all checks pass — match):
```json
{
  "data": {
    "invoiceId": "pi-uuid-1",
    "matchStatus": "matched",
    "checks": {
      "poVsGrn": {
        "status": "pass",
        "details": [
          {
            "poItemId": "poi-uuid-1",
            "itemName": "Widget A",
            "poQuantity": 100.000,
            "grnAccepted": 98.000,
            "status": "pass",
            "note": "GRN accepted within PO quantity"
          },
          {
            "poItemId": "poi-uuid-2",
            "itemName": "Widget B",
            "poQuantity": 50.000,
            "grnAccepted": 50.000,
            "status": "pass",
            "note": "Exact match"
          }
        ]
      },
      "poVsInvoice": {
        "status": "pass",
        "details": [
          {
            "poItemId": "poi-uuid-1",
            "itemName": "Widget A",
            "poUnitPrice": 1000.00,
            "invoiceUnitPrice": 1000.00,
            "poQuantity": 100.000,
            "invoiceQuantity": 98.000,
            "status": "pass",
            "note": "Invoice quantity <= PO quantity, price matches"
          }
        ]
      },
      "grnVsInvoice": {
        "status": "pass",
        "details": [
          {
            "itemName": "Widget A",
            "grnAccepted": 98.000,
            "invoiceQuantity": 98.000,
            "status": "pass",
            "note": "Invoice quantity matches GRN accepted"
          }
        ]
      }
    }
  }
}
```

- **Response** `200` (mismatch — hard block):
```json
{
  "data": {
    "invoiceId": "pi-uuid-2",
    "matchStatus": "mismatch",
    "checks": {
      "poVsGrn": { "status": "pass", "details": [] },
      "poVsInvoice": {
        "status": "fail",
        "details": [
          {
            "poItemId": "poi-uuid-1",
            "itemName": "Widget A",
            "poUnitPrice": 1000.00,
            "invoiceUnitPrice": 1100.00,
            "poQuantity": 100.000,
            "invoiceQuantity": 100.000,
            "status": "fail",
            "note": "Unit price mismatch: PO ₹1,000.00 vs Invoice ₹1,100.00"
          }
        ]
      },
      "grnVsInvoice": {
        "status": "fail",
        "details": [
          {
            "itemName": "Widget A",
            "grnAccepted": 98.000,
            "invoiceQuantity": 100.000,
            "status": "fail",
            "note": "Invoice quantity (100) exceeds GRN accepted (98)"
          }
        ]
      }
    }
  }
}
```

### `GET /api/v1/ap/invoices/:id/match-status`

Get the current match status and last match result without re-running.

- **Auth**: Bearer (user)
- **Response** `200`: Same structure as match response, from stored result

### `POST /api/v1/ap/invoices/:id/approve`

Approve a matched invoice for payment. Only matched invoices can be approved.

- **Auth**: Bearer (user, role: owner)
- **Response** `200`:
```json
{
  "data": {
    "invoiceId": "pi-uuid-1",
    "status": "approved",
    "approvedBy": "550e8400-e29b-41d4-a716-446655440000",
    "approvedAt": "2025-06-17T10:30:00Z"
  }
}
```
- **Errors**: `409 INVOICE_NOT_MATCHED` (if match_status != 'matched')

---

## 6. Vendor Payments (4 routes)

### `GET /api/v1/ap/payments`

List vendor payments.

- **Auth**: Bearer (user)
- **Query**: `?page=1&limit=25&vendor_id=v-uuid-1&status=completed&from=2025-06-01&to=2025-06-30`
- **Response** `200`:
```json
{
  "data": [
    {
      "id": "pay-uuid-1",
      "vendorId": "v-uuid-1",
      "vendorName": "Acme Supplies",
      "paymentDate": "2025-07-01",
      "amount": 75000.00,
      "paymentMethod": "bank_transfer",
      "utrNumber": "UTR-123456789",
      "status": "completed",
      "allocations": [
        { "invoiceId": "pi-uuid-1", "invoiceNumber": "ACM-INV-089", "amount": 75000.00 }
      ]
    }
  ],
  "meta": { "page": 1, "limit": 25, "total": 15, "totalPages": 1 }
}
```

### `POST /api/v1/ap/payments`

Create a payment with allocation to one or more invoices. Supports partial payments.

- **Auth**: Bearer (user, role: owner/accountant)
- **Request** (partial payment across two invoices):
```json
{
  "vendorId": "v-uuid-1",
  "bankAccountId": "ba-uuid-1",
  "paymentDate": "2025-07-01",
  "amount": 75000.00,
  "paymentMethod": "bank_transfer",
  "utrNumber": "UTR-123456789",
  "allocations": [
    { "invoiceId": "pi-uuid-1", "amount": 50000.00 },
    { "invoiceId": "pi-uuid-2", "amount": 25000.00 }
  ]
}
```
- **Response** `201`:
```json
{
  "data": {
    "id": "pay-uuid-1",
    "vendorId": "v-uuid-1",
    "amount": 75000.00,
    "status": "completed",
    "allocations": [
      {
        "invoiceId": "pi-uuid-1",
        "invoiceNumber": "ACM-INV-089",
        "amount": 50000.00,
        "invoiceTotal": 198000.00,
        "invoiceBalanceAfter": 148000.00
      },
      {
        "invoiceId": "pi-uuid-2",
        "invoiceNumber": "ACM-INV-090",
        "amount": 25000.00,
        "invoiceTotal": 50000.00,
        "invoiceBalanceAfter": 25000.00
      }
    ]
  }
}
```
- **Errors**: `409 INVOICE_NOT_APPROVED` (if any invoice not approved), `422 ALLOCATION_EXCEEDS_BALANCE`

### `POST /api/v1/ap/advances`

Record an advance payment to a vendor (before invoice).

- **Auth**: Bearer (user, role: owner/accountant)
- **Request**:
```json
{
  "vendorId": "v-uuid-1",
  "bankAccountId": "ba-uuid-1",
  "amount": 50000.00,
  "advanceDate": "2025-06-01",
  "paymentMethod": "bank_transfer",
  "utrNumber": "UTR-987654321",
  "notes": "Advance for Q3 raw materials"
}
```
- **Response** `201`:
```json
{
  "data": {
    "id": "adv-uuid-1",
    "vendorId": "v-uuid-1",
    "amount": 50000.00,
    "balance": 50000.00,
    "advanceDate": "2025-06-01"
  }
}
```

### `POST /api/v1/ap/advances/:id/adjust`

Adjust an advance against an invoice.

- **Auth**: Bearer (user, role: owner/accountant)
- **Request**:
```json
{
  "invoiceId": "pi-uuid-1",
  "amount": 30000.00
}
```
- **Response** `200`:
```json
{
  "data": {
    "advanceId": "adv-uuid-1",
    "invoiceId": "pi-uuid-1",
    "adjustedAmount": 30000.00,
    "advanceBalanceAfter": 20000.00,
    "invoiceBalanceAfter": 168000.00
  }
}
```
- **Errors**: `422 ADJUSTMENT_EXCEEDS_ADVANCE_BALANCE`, `422 ADJUSTMENT_EXCEEDS_INVOICE_BALANCE`

---

## 7. Debit Notes (5 routes)

### `GET /api/v1/ap/debit-notes`

List debit notes.

- **Auth**: Bearer (user)
- **Query**: `?page=1&limit=25&vendor_id=v-uuid-1&status=issued`
- **Response** `200`: Paginated list of debit notes

### `GET /api/v1/ap/debit-notes/:id`

Get debit note detail.

- **Auth**: Bearer (user)
- **Response** `200`:
```json
{
  "data": {
    "id": "dn-uuid-1",
    "debitNoteNumber": "DN-2526-0001",
    "vendorId": "v-uuid-1",
    "vendorName": "Acme Supplies",
    "invoiceId": "pi-uuid-1",
    "invoiceNumber": "ACM-INV-089",
    "issueDate": "2025-06-20",
    "amount": 2000.00,
    "reason": "2 units of Widget A rejected — quality defect",
    "status": "issued"
  }
}
```

### `POST /api/v1/ap/debit-notes`

Create a debit note.

- **Auth**: Bearer (user, role: owner/accountant)
- **Request**:
```json
{
  "vendorId": "v-uuid-1",
  "invoiceId": "pi-uuid-1",
  "issueDate": "2025-06-20",
  "amount": 2000.00,
  "reason": "2 units of Widget A rejected — quality defect"
}
```
- **Response** `201`: Created debit note with auto-generated number

### `PUT /api/v1/ap/debit-notes/:id`

Update a draft debit note.

- **Auth**: Bearer (user, role: owner/accountant)
- **Response** `200`: Updated debit note
- **Errors**: `409 DEBIT_NOTE_NOT_EDITABLE`

### `POST /api/v1/ap/debit-notes/:id/issue`

Issue a draft debit note (changes status from draft to issued).

- **Auth**: Bearer (user, role: owner/accountant)
- **Response** `200`:
```json
{
  "data": {
    "id": "dn-uuid-1",
    "status": "issued",
    "debitNoteNumber": "DN-2526-0001"
  }
}
```

---

## 8. Customers (5 routes)

### `GET /api/v1/ar/customers`

List customers.

- **Auth**: Bearer (user)
- **Query**: `?page=1&limit=25&search=metro&type=b2b&is_active=true`
- **Response** `200`: Paginated list with outstanding balances

### `GET /api/v1/ar/customers/:id`

Get customer detail with AR summary.

- **Auth**: Bearer (user)
- **Response** `200`:
```json
{
  "data": {
    "id": "c-uuid-1",
    "name": "Metro Retail",
    "type": "b2b",
    "email": "accounts@metro.in",
    "phone": "9876543210",
    "gstin": "27AABCM1234F1ZX",
    "addressLine1": "Plot 45, MIDC",
    "city": "Mumbai",
    "state": "Maharashtra",
    "pincode": "400001",
    "paymentTermsDays": 30,
    "contactPerson": "Rahul Mehta",
    "summary": {
      "totalInvoiced": 850000.00,
      "totalReceived": 600000.00,
      "outstandingBalance": 250000.00,
      "overdueAmount": 100000.00
    }
  }
}
```

### `POST /api/v1/ar/customers`

Create a customer.

- **Auth**: Bearer (user, role: owner/accountant)
- **Request**:
```json
{
  "name": "Metro Retail",
  "type": "b2b",
  "email": "accounts@metro.in",
  "gstin": "27AABCM1234F1ZX",
  "paymentTermsDays": 30,
  "contactPerson": "Rahul Mehta",
  "city": "Mumbai",
  "state": "Maharashtra",
  "pincode": "400001"
}
```
- **Response** `201`: Created customer

### `PUT /api/v1/ar/customers/:id`

Update customer details.

- **Auth**: Bearer (user, role: owner/accountant)
- **Response** `200`: Updated customer

### `DELETE /api/v1/ar/customers/:id`

Soft-delete a customer. Fails if customer has outstanding invoices.

- **Auth**: Bearer (user, role: owner)
- **Response** `200`:
```json
{
  "data": { "message": "Customer deactivated" }
}
```
- **Errors**: `409 CUSTOMER_HAS_OUTSTANDING_BALANCE`

---

## 9. Sales Invoices (7 routes)

### `GET /api/v1/ar/invoices`

List sales invoices.

- **Auth**: Bearer (user)
- **Query**: `?page=1&limit=25&customer_id=c-uuid-1&status=sent&due_before=2025-07-31&sort=due_date&order=asc`
- **Response** `200`: Paginated list with status, balance, customer name

### `GET /api/v1/ar/invoices/:id`

Get invoice detail with line items and receipt history.

- **Auth**: Bearer (user)
- **Response** `200`:
```json
{
  "data": {
    "id": "si-uuid-1",
    "invoiceNumber": "INV-2526-0001",
    "customerId": "c-uuid-1",
    "customerName": "Metro Retail",
    "invoiceDate": "2025-06-01",
    "dueDate": "2025-07-01",
    "subtotal": 100000.00,
    "taxAmount": 18000.00,
    "totalAmount": 118000.00,
    "amountReceived": 50000.00,
    "balanceDue": 68000.00,
    "status": "partially_paid",
    "fileUrl": "https://spaces.example.com/invoices/INV-2526-0001.pdf",
    "items": [
      {
        "id": "sii-uuid-1",
        "description": "Consulting — June 2025",
        "quantity": 1.000,
        "unitPrice": 100000.00,
        "amount": 100000.00
      }
    ],
    "receipts": [
      {
        "id": "rcpt-uuid-1",
        "receiptDate": "2025-06-15",
        "amount": 50000.00,
        "referenceNumber": "UTR-555666777"
      }
    ]
  }
}
```

### `POST /api/v1/ar/invoices`

Create a sales invoice. Auto-generates invoice number from sequence.

- **Auth**: Bearer (user, role: owner/accountant)
- **Request**:
```json
{
  "customerId": "c-uuid-1",
  "invoiceDate": "2025-06-01",
  "dueDate": "2025-07-01",
  "items": [
    {
      "description": "Consulting — June 2025",
      "quantity": 1.000,
      "unitPrice": 100000.00,
      "amount": 100000.00
    }
  ],
  "taxAmount": 18000.00,
  "notes": "Payment via NEFT preferred"
}
```
- **Response** `201`: Created invoice with auto-generated `invoiceNumber`

### `PUT /api/v1/ar/invoices/:id`

Update a draft invoice. Cannot update sent/paid invoices.

- **Auth**: Bearer (user, role: owner/accountant)
- **Response** `200`: Updated invoice
- **Errors**: `409 INVOICE_NOT_EDITABLE`

### `DELETE /api/v1/ar/invoices/:id`

Cancel a draft invoice.

- **Auth**: Bearer (user, role: owner)
- **Response** `200`:
```json
{
  "data": { "message": "Invoice cancelled" }
}
```
- **Errors**: `409 INVOICE_HAS_RECEIPTS`

### `POST /api/v1/ar/invoices/:id/send`

Mark invoice as sent (changes status from draft to sent). Optionally triggers email.

- **Auth**: Bearer (user, role: owner/accountant)
- **Request**:
```json
{
  "sendEmail": true
}
```
- **Response** `200`:
```json
{
  "data": {
    "id": "si-uuid-1",
    "status": "sent",
    "emailSent": true
  }
}
```

### `POST /api/v1/ar/invoices/:id/mark-paid`

Manually mark an invoice as fully paid (for cash/offline payments).

- **Auth**: Bearer (user, role: owner/accountant)
- **Request**:
```json
{
  "paidDate": "2025-07-01",
  "notes": "Cash payment received"
}
```
- **Response** `200`:
```json
{
  "data": {
    "id": "si-uuid-1",
    "status": "paid",
    "amountReceived": 118000.00,
    "balanceDue": 0.00
  }
}
```

---

## 10. Payment Receipts (3 routes)

### `GET /api/v1/ar/receipts`

List payment receipts.

- **Auth**: Bearer (user)
- **Query**: `?page=1&limit=25&customer_id=c-uuid-1&from=2025-06-01&to=2025-06-30`
- **Response** `200`: Paginated list with allocations

### `GET /api/v1/ar/receipts/:id`

Get receipt detail.

- **Auth**: Bearer (user)
- **Response** `200`:
```json
{
  "data": {
    "id": "rcpt-uuid-1",
    "customerId": "c-uuid-1",
    "customerName": "Metro Retail",
    "bankAccountId": "ba-uuid-1",
    "receiptDate": "2025-06-15",
    "amount": 50000.00,
    "paymentMethod": "bank_transfer",
    "referenceNumber": "UTR-555666777",
    "allocations": [
      {
        "invoiceId": "si-uuid-1",
        "invoiceNumber": "INV-2526-0001",
        "amount": 50000.00
      }
    ]
  }
}
```

### `POST /api/v1/ar/receipts`

Record a payment receipt with allocation to invoices.

- **Auth**: Bearer (user, role: owner/accountant)
- **Request**:
```json
{
  "customerId": "c-uuid-1",
  "bankAccountId": "ba-uuid-1",
  "receiptDate": "2025-06-15",
  "amount": 50000.00,
  "paymentMethod": "bank_transfer",
  "referenceNumber": "UTR-555666777",
  "allocations": [
    { "invoiceId": "si-uuid-1", "amount": 50000.00 }
  ]
}
```
- **Response** `201`: Created receipt with allocations and updated invoice balances

---

## 11. Credit Notes (5 routes)

### `GET /api/v1/ar/credit-notes`

List credit notes.

- **Auth**: Bearer (user)
- **Query**: `?page=1&limit=25&customer_id=c-uuid-1&status=issued`
- **Response** `200`: Paginated list

### `GET /api/v1/ar/credit-notes/:id`

Get credit note detail.

- **Auth**: Bearer (user)
- **Response** `200`:
```json
{
  "data": {
    "id": "cn-uuid-1",
    "creditNoteNumber": "CN-2526-0001",
    "customerId": "c-uuid-1",
    "customerName": "Metro Retail",
    "invoiceId": "si-uuid-1",
    "invoiceNumber": "INV-2526-0001",
    "issueDate": "2025-06-25",
    "amount": 10000.00,
    "reason": "Service not delivered for 1 day",
    "status": "issued"
  }
}
```

### `POST /api/v1/ar/credit-notes`

Create a credit note.

- **Auth**: Bearer (user, role: owner/accountant)
- **Request**:
```json
{
  "customerId": "c-uuid-1",
  "invoiceId": "si-uuid-1",
  "issueDate": "2025-06-25",
  "amount": 10000.00,
  "reason": "Service not delivered for 1 day"
}
```
- **Response** `201`: Created credit note with auto-generated number

### `PUT /api/v1/ar/credit-notes/:id`

Update a draft credit note.

- **Auth**: Bearer (user, role: owner/accountant)
- **Response** `200`: Updated credit note
- **Errors**: `409 CREDIT_NOTE_NOT_EDITABLE`

### `POST /api/v1/ar/credit-notes/:id/issue`

Issue a draft credit note.

- **Auth**: Bearer (user, role: owner/accountant)
- **Response** `200`:
```json
{
  "data": {
    "id": "cn-uuid-1",
    "status": "issued",
    "creditNoteNumber": "CN-2526-0001"
  }
}
```

---

## 12. Dunning (3 routes)

### `GET /api/v1/ar/dunning/rules`

List dunning rules.

- **Auth**: Bearer (user)
- **Response** `200`:
```json
{
  "data": [
    {
      "id": "dr-uuid-1",
      "name": "First Reminder",
      "daysAfterDue": 3,
      "channel": "email",
      "subjectTemplate": "Payment reminder: Invoice {{invoice_number}}",
      "isActive": true
    },
    {
      "id": "dr-uuid-2",
      "name": "Second Reminder",
      "daysAfterDue": 7,
      "channel": "email",
      "isActive": true
    },
    {
      "id": "dr-uuid-3",
      "name": "Final Notice",
      "daysAfterDue": 14,
      "channel": "email",
      "isActive": true
    }
  ]
}
```

### `POST /api/v1/ar/dunning/rules`

Create or update dunning rules (upsert).

- **Auth**: Bearer (user, role: owner)
- **Request**:
```json
{
  "rules": [
    {
      "name": "First Reminder",
      "daysAfterDue": 3,
      "channel": "email",
      "subjectTemplate": "Payment reminder: Invoice {{invoice_number}}",
      "bodyTemplate": "Dear {{customer_name}},\n\nThis is a reminder that invoice {{invoice_number}} for ₹{{amount}} was due on {{due_date}}.\n\nPlease arrange payment at the earliest.\n\nRegards,\n{{tenant_name}}"
    }
  ]
}
```
- **Response** `200`: Created/updated rules

### `GET /api/v1/ar/dunning/log`

Get dunning activity log.

- **Auth**: Bearer (user)
- **Query**: `?page=1&limit=25&invoice_id=si-uuid-1`
- **Response** `200`:
```json
{
  "data": [
    {
      "id": "dl-uuid-1",
      "invoiceId": "si-uuid-1",
      "invoiceNumber": "INV-2526-0001",
      "customerName": "Metro Retail",
      "ruleName": "First Reminder",
      "channel": "email",
      "sentAt": "2025-07-04T09:00:00Z",
      "status": "sent"
    }
  ],
  "meta": { "page": 1, "limit": 25, "total": 3, "totalPages": 1 }
}
```

---

## 13. Bank Accounts (6 routes)

### `GET /api/v1/banking/accounts`

List bank accounts.

- **Auth**: Bearer (user)
- **Response** `200`:
```json
{
  "data": [
    {
      "id": "ba-uuid-1",
      "name": "HDFC Main",
      "bankName": "HDFC Bank",
      "accountNumber": "****7890",
      "accountType": "current",
      "currentBalance": 1250000.00,
      "isActive": true
    }
  ]
}
```

### `GET /api/v1/banking/accounts/:id`

Get bank account detail.

- **Auth**: Bearer (user)
- **Response** `200`: Full account details including opening balance

### `POST /api/v1/banking/accounts`

Create a bank account.

- **Auth**: Bearer (user, role: owner/accountant)
- **Request**:
```json
{
  "name": "HDFC Main",
  "bankName": "HDFC Bank",
  "accountNumber": "50100012347890",
  "ifscCode": "HDFC0001234",
  "accountType": "current",
  "openingBalance": 500000.00
}
```
- **Response** `201`: Created bank account

### `PUT /api/v1/banking/accounts/:id`

Update bank account details (name, active status).

- **Auth**: Bearer (user, role: owner/accountant)
- **Response** `200`: Updated account

### `GET /api/v1/banking/accounts/:id/balance`

Get current balance with last reconciled date.

- **Auth**: Bearer (user)
- **Response** `200`:
```json
{
  "data": {
    "accountId": "ba-uuid-1",
    "name": "HDFC Main",
    "currentBalance": 1250000.00,
    "lastReconciledDate": "2025-05-31",
    "unreconciledCount": 14,
    "unreconciledAmount": 85000.00
  }
}
```

### `GET /api/v1/banking/accounts/:id/transactions`

List transactions for a specific bank account.

- **Auth**: Bearer (user)
- **Query**: `?page=1&limit=50&from=2025-06-01&to=2025-06-30&type=debit&recon_status=unreconciled`
- **Response** `200`:
```json
{
  "data": [
    {
      "id": "bt-uuid-1",
      "transactionDate": "2025-06-15",
      "type": "debit",
      "amount": 75000.00,
      "reference": "UTR-123456789",
      "narration": "NEFT to Acme Supplies",
      "runningBalance": 1175000.00,
      "reconStatus": "matched"
    }
  ],
  "meta": { "page": 1, "limit": 50, "total": 89, "totalPages": 2 }
}
```

---

## 14. Bank Transactions & Reconciliation (5 routes)

### `POST /api/v1/banking/transactions/import`

Import bank transactions from CSV.

- **Auth**: Bearer (user, role: owner/accountant)
- **Request**: `multipart/form-data` with `file` (CSV) and `bankAccountId`
- **Response** `200`:
```json
{
  "data": {
    "imported": 45,
    "duplicatesSkipped": 3,
    "errors": [],
    "batchId": "batch-uuid-1"
  }
}
```

### `GET /api/v1/banking/reconciliation/unmatched`

Get unmatched bank transactions with suggested matches.

- **Auth**: Bearer (user)
- **Query**: `?bank_account_id=ba-uuid-1`
- **Response** `200`:
```json
{
  "data": [
    {
      "bankTransaction": {
        "id": "bt-uuid-2",
        "transactionDate": "2025-06-20",
        "type": "debit",
        "amount": 50000.00,
        "reference": "UTR-999888777",
        "narration": "NEFT to vendor"
      },
      "suggestedMatches": [
        {
          "type": "payment",
          "id": "pay-uuid-2",
          "date": "2025-06-20",
          "amount": 50000.00,
          "reference": "UTR-999888777",
          "vendorName": "Beta Corp",
          "matchConfidence": "high",
          "matchReason": "UTR number exact match"
        }
      ]
    },
    {
      "bankTransaction": {
        "id": "bt-uuid-3",
        "transactionDate": "2025-06-22",
        "type": "credit",
        "amount": 118000.00,
        "reference": null,
        "narration": "NEFT CR from Metro"
      },
      "suggestedMatches": [
        {
          "type": "receipt",
          "id": "rcpt-uuid-2",
          "date": "2025-06-22",
          "amount": 118000.00,
          "reference": null,
          "customerName": "Metro Retail",
          "matchConfidence": "medium",
          "matchReason": "Amount and date match"
        }
      ]
    }
  ]
}
```

### `POST /api/v1/banking/reconciliation/auto`

Run auto-reconciliation on a bank account. Matches by UTR first, then amount+date.

- **Auth**: Bearer (user, role: owner/accountant)
- **Request**:
```json
{
  "bankAccountId": "ba-uuid-1",
  "periodStart": "2025-06-01",
  "periodEnd": "2025-06-30"
}
```
- **Response** `200`:
```json
{
  "data": {
    "totalUnmatched": 45,
    "autoMatched": 38,
    "matchBreakdown": {
      "byUtr": 30,
      "byAmountDate": 8
    },
    "remainingUnmatched": 7,
    "matches": [
      {
        "bankTransactionId": "bt-uuid-4",
        "paymentId": "pay-uuid-3",
        "receiptId": null,
        "matchType": "auto_utr",
        "amount": 75000.00,
        "reference": "UTR-111222333"
      }
    ]
  }
}
```

### `POST /api/v1/banking/reconciliation/manual`

Manually match a bank transaction with a payment or receipt.

- **Auth**: Bearer (user, role: owner/accountant)
- **Request**:
```json
{
  "bankTransactionId": "bt-uuid-5",
  "paymentId": "pay-uuid-4",
  "receiptId": null
}
```
- **Response** `200`:
```json
{
  "data": {
    "matchId": "rm-uuid-1",
    "bankTransactionId": "bt-uuid-5",
    "paymentId": "pay-uuid-4",
    "matchType": "manual",
    "matchedBy": "550e8400-e29b-41d4-a716-446655440000"
  }
}
```
- **Errors**: `409 TRANSACTION_ALREADY_MATCHED`, `422 AMOUNT_MISMATCH`

### `POST /api/v1/banking/reconciliation/complete`

Complete reconciliation for a period. Records closing balances.

- **Auth**: Bearer (user, role: owner/accountant)
- **Request**:
```json
{
  "bankAccountId": "ba-uuid-1",
  "periodStart": "2025-06-01",
  "periodEnd": "2025-06-30",
  "bankClosingBalance": 1250000.00
}
```
- **Response** `200`:
```json
{
  "data": {
    "id": "br-uuid-1",
    "bankClosingBalance": 1250000.00,
    "bookClosingBalance": 1247500.00,
    "difference": 2500.00,
    "isCompleted": true,
    "completedAt": "2025-07-05T14:30:00Z"
  }
}
```

---

## 15. Petty Cash (6 routes)

### `GET /api/v1/banking/petty-cash/accounts`

List petty cash accounts.

- **Auth**: Bearer (user)
- **Response** `200`:
```json
{
  "data": [
    {
      "id": "pc-uuid-1",
      "name": "Warehouse Petty Cash",
      "location": "HSR Layout Warehouse",
      "cashLimit": 25000.00,
      "currentBalance": 12500.00,
      "isActive": true
    }
  ]
}
```

### `GET /api/v1/banking/petty-cash/accounts/:id`

Get petty cash account detail with recent transactions.

- **Auth**: Bearer (user)
- **Response** `200`: Account detail + last 10 transactions

### `POST /api/v1/banking/petty-cash/accounts`

Create a petty cash account.

- **Auth**: Bearer (user, role: owner/accountant)
- **Request**:
```json
{
  "name": "Warehouse Petty Cash",
  "location": "HSR Layout Warehouse",
  "cashLimit": 25000.00,
  "initialBalance": 25000.00
}
```
- **Response** `201`: Created account

### `GET /api/v1/banking/petty-cash/accounts/:id/transactions`

List transactions for a petty cash account.

- **Auth**: Bearer (user)
- **Query**: `?page=1&limit=25&from=2025-06-01&to=2025-06-30&category=office_supplies`
- **Response** `200`: Paginated transactions

### `POST /api/v1/banking/petty-cash/accounts/:id/transactions`

Record a petty cash transaction (spend or replenish).

- **Auth**: Bearer (user, role: owner/accountant)
- **Request**:
```json
{
  "transactionDate": "2025-06-15",
  "type": "debit",
  "amount": 500.00,
  "description": "Auto fare for bank visit",
  "category": "travel"
}
```
- **Response** `201`:
```json
{
  "data": {
    "id": "pct-uuid-1",
    "accountId": "pc-uuid-1",
    "transactionDate": "2025-06-15",
    "type": "debit",
    "amount": 500.00,
    "description": "Auto fare for bank visit",
    "category": "travel",
    "accountBalanceAfter": 12000.00
  }
}
```
- **Errors**: `422 EXCEEDS_CASH_LIMIT` (for credit), `422 INSUFFICIENT_BALANCE` (for debit)

### `PUT /api/v1/banking/petty-cash/accounts/:id`

Update petty cash account (name, location, limit).

- **Auth**: Bearer (user, role: owner/accountant)
- **Response** `200`: Updated account

---

## 16. PG Reconciliation (4 routes)

### `POST /api/v1/pg-recon/settlements/import`

Import payment gateway settlement report (CSV).

- **Auth**: Bearer (user, role: owner/accountant)
- **Request**: `multipart/form-data` with `file` (CSV), `gateway` (razorpay/phonepe/paytm), `bankAccountId`
- **Response** `200`:
```json
{
  "data": {
    "settlementId": "pgs-uuid-1",
    "gateway": "razorpay",
    "settlementDate": "2025-06-15",
    "grossAmount": 150000.00,
    "totalFees": 3540.00,
    "totalTax": 637.20,
    "netAmount": 145822.80,
    "lineCount": 42,
    "imported": 42,
    "errors": []
  }
}
```

### `GET /api/v1/pg-recon/settlements`

List PG settlements.

- **Auth**: Bearer (user)
- **Query**: `?page=1&limit=25&gateway=razorpay&from=2025-06-01&to=2025-06-30`
- **Response** `200`: Paginated settlements with match summary

### `GET /api/v1/pg-recon/settlements/:id`

Get settlement detail with all line items and match status.

- **Auth**: Bearer (user)
- **Response** `200`:
```json
{
  "data": {
    "id": "pgs-uuid-1",
    "gateway": "razorpay",
    "settlementId": "setl_abcdef123456",
    "settlementDate": "2025-06-15",
    "grossAmount": 150000.00,
    "totalFees": 3540.00,
    "netAmount": 145822.80,
    "matchSummary": {
      "total": 42,
      "matched": 38,
      "unmatched": 3,
      "disputed": 1
    },
    "lines": [
      {
        "id": "pgsl-uuid-1",
        "orderId": "order_xyz789",
        "transactionId": "pay_abc123",
        "transactionDate": "2025-06-14T18:30:00Z",
        "grossAmount": 5000.00,
        "fee": 118.00,
        "tax": 21.24,
        "netAmount": 4860.76,
        "matchStatus": "matched",
        "receiptId": "rcpt-uuid-3"
      }
    ]
  }
}
```

### `POST /api/v1/pg-recon/settlements/:id/reconcile`

Run reconciliation on a PG settlement — match lines to payment receipts.

- **Auth**: Bearer (user, role: owner/accountant)
- **Response** `200`:
```json
{
  "data": {
    "settlementId": "pgs-uuid-1",
    "matched": 38,
    "unmatched": 3,
    "disputed": 1,
    "newMatches": 12
  }
}
```

---

## 17. Webhooks (2 routes)

### `POST /api/v1/webhooks/wms`

Receive events from WMS (PO created, GRN confirmed, etc.).

- **Auth**: Bearer (service JWT)
- **Request**:
```json
{
  "eventType": "po.created",
  "tenantId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "payload": {
    "poNumber": "PO-2526-0043",
    "vendorId": "WMS-V-001",
    "orderDate": "2025-06-20",
    "items": [
      {
        "itemName": "Widget C",
        "sku": "WDG-C-001",
        "quantity": 200,
        "unitPrice": 500.00
      }
    ]
  },
  "timestamp": "2025-06-20T10:00:00Z"
}
```
- **Response** `202`:
```json
{
  "data": {
    "eventId": "we-uuid-1",
    "status": "received"
  }
}
```

### `GET /api/v1/webhooks/events`

List webhook events with status (for debugging).

- **Auth**: Bearer (user, role: owner)
- **Query**: `?page=1&limit=25&status=failed&event_type=po.created`
- **Response** `200`:
```json
{
  "data": [
    {
      "id": "we-uuid-2",
      "eventType": "grn.created",
      "source": "wms",
      "status": "failed",
      "errorMessage": "Vendor not found: WMS-V-999",
      "retries": 3,
      "maxRetries": 3,
      "createdAt": "2025-06-19T08:00:00Z",
      "processedAt": null
    }
  ],
  "meta": { "page": 1, "limit": 25, "total": 2, "totalPages": 1 }
}
```

---

## 18. Dashboard (3 routes)

### `GET /api/v1/dashboard/summary`

Get the 5 key metrics for the dashboard.

- **Auth**: Bearer (user)
- **Response** `200`:
```json
{
  "data": {
    "totalOutstandingPayables": {
      "amount": 875000.00,
      "invoiceCount": 12,
      "change": {
        "amount": -125000.00,
        "percentage": -12.5,
        "period": "vs last month"
      }
    },
    "totalOutstandingReceivables": {
      "amount": 1250000.00,
      "invoiceCount": 18,
      "change": {
        "amount": 200000.00,
        "percentage": 19.0,
        "period": "vs last month"
      }
    },
    "cashPosition": {
      "amount": 2450000.00,
      "accountCount": 3,
      "breakdown": [
        { "accountName": "HDFC Main", "balance": 1250000.00 },
        { "accountName": "ICICI Ops", "balance": 800000.00 },
        { "accountName": "SBI Salary", "balance": 400000.00 }
      ]
    },
    "overdue": {
      "payables": { "amount": 125000.00, "count": 3 },
      "receivables": { "amount": 350000.00, "count": 5 }
    },
    "upcomingPayments": {
      "next7Days": { "amount": 200000.00, "count": 4 },
      "next30Days": { "amount": 650000.00, "count": 9 }
    }
  }
}
```

### `GET /api/v1/dashboard/overdue`

Get detailed overdue payables and receivables list.

- **Auth**: Bearer (user)
- **Query**: `?type=receivables&sort=days_overdue&order=desc`
- **Response** `200`:
```json
{
  "data": {
    "type": "receivables",
    "total": 350000.00,
    "items": [
      {
        "invoiceId": "si-uuid-5",
        "invoiceNumber": "INV-2526-0008",
        "customerName": "Delta Enterprises",
        "totalAmount": 150000.00,
        "balanceDue": 150000.00,
        "dueDate": "2025-06-01",
        "daysOverdue": 19,
        "lastDunningDate": "2025-06-10"
      },
      {
        "invoiceId": "si-uuid-7",
        "invoiceNumber": "INV-2526-0012",
        "customerName": "Metro Retail",
        "totalAmount": 200000.00,
        "balanceDue": 200000.00,
        "dueDate": "2025-06-10",
        "daysOverdue": 10,
        "lastDunningDate": null
      }
    ]
  }
}
```

### `GET /api/v1/dashboard/upcoming-payments`

Get upcoming vendor payments due.

- **Auth**: Bearer (user)
- **Query**: `?days=7`
- **Response** `200`:
```json
{
  "data": {
    "period": "next 7 days",
    "total": 200000.00,
    "items": [
      {
        "invoiceId": "pi-uuid-10",
        "invoiceNumber": "VND-INV-2025-045",
        "vendorName": "Acme Supplies",
        "totalAmount": 100000.00,
        "balanceDue": 75000.00,
        "dueDate": "2025-06-22",
        "daysUntilDue": 2
      },
      {
        "invoiceId": "pi-uuid-11",
        "invoiceNumber": "VND-INV-2025-048",
        "vendorName": "Beta Corp",
        "totalAmount": 125000.00,
        "balanceDue": 125000.00,
        "dueDate": "2025-06-25",
        "daysUntilDue": 5
      }
    ]
  }
}
```

---

## Route Count Summary

| Group | Routes |
|-------|--------|
| Auth & Tenant | 4 |
| Vendors | 7 |
| Purchase Orders | 2 |
| GRNs | 2 |
| Purchase Invoices | 7 |
| Vendor Payments | 4 |
| Debit Notes | 5 |
| Customers | 5 |
| Sales Invoices | 7 |
| Payment Receipts | 3 |
| Credit Notes | 5 |
| Dunning | 3 |
| Bank Accounts | 6 |
| Bank Transactions & Reconciliation | 5 |
| Petty Cash | 6 |
| PG Reconciliation | 4 |
| Webhooks | 2 |
| Dashboard | 3 |
| **Total** | **80** |
