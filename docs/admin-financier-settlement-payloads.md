# Admin Financier Settlement – Sample Payloads

Base URL: `{{EPP_BASEURL}}/api/admin-financier-settlement`

---

## 1. Create (POST) – JSON

**Endpoint:** `POST /api/admin-financier-settlement`  
**Content-Type:** `application/json`

```json
{
  "financierDisbursementId": "698ec09c87f8dbe6891b70a7",
  "financierConfigId": "69800d19ea1001dce5d58adb",
  "amount": 8277,
  "currency": "PHP",
  "remittedAt": "2026-03-31T00:00:00.000Z",
  "dueAt": "2026-03-14T00:00:00.000Z",
  "referenceNo": "BANK-REF-001",
  "receiptType": "OR",
  "receiptNumber": "OR-2024-002",
  "createdBy": "65f1a1b2c3d4e5f678901234",
  "notes": "March remittance"
}
```

**Minimal (required only):**

```json
{
  "financierDisbursementId": "698ec09c87f8dbe6891b70a7",
  "financierConfigId": "69800d19ea1001dce5d58adb",
  "amount": 8277
}
```

**cURL (JSON):**

```bash
curl -X POST "{{EPP_BASEURL}}/api/admin-financier-settlement" \
  -H "Content-Type: application/json" \
  -d '{
    "financierDisbursementId": "698ec09c87f8dbe6891b70a7",
    "financierConfigId": "69800d19ea1001dce5d58adb",
    "amount": 8277,
    "referenceNo": "BANK-REF-001",
    "notes": "March remittance"
  }'
```

---

## 2. Create (POST) – With receipt file (multipart)

**Endpoint:** `POST /api/admin-financier-settlement`  
**Content-Type:** `multipart/form-data`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| financierDisbursementId | string | Yes | Disbursement ID (ObjectId) |
| financierConfigId | string | Yes | Financier config ID (ObjectId) |
| amount | number (string in form) | Yes | Remittance amount |
| receipt | file | No | Image or PDF; uploaded to Cloudinary, URL stored in receiptAttachmentUrl |
| receiptType | string | No | `OR` or `BANK_RECEIPT` (use when sending receipt) |
| receiptNumber | string | No | OR number or bank reference |
| currency | string | No | Default PHP |
| remittedAt | string (ISO date) | No | |
| dueAt | string (ISO date) | No | |
| referenceNo | string | No | |
| createdBy | string | No | User ID (ObjectId) |
| notes | string | No | |

**cURL (with file upload to Cloudinary):**

```bash
curl -X POST "{{EPP_BASEURL}}/api/admin-financier-settlement" \
  -F "financierDisbursementId=698ec09c87f8dbe6891b70a7" \
  -F "financierConfigId=69800d19ea1001dce5d58adb" \
  -F "amount=8277" \
  -F "referenceNo=BANK-REF-001" \
  -F "receiptType=OR" \
  -F "receiptNumber=OR-2024-002" \
  -F "notes=March remittance" \
  -F "receipt=@/path/to/receipt.pdf"
```

---

## 3. Update (PATCH)

**Endpoint:** `PATCH /api/admin-financier-settlement/:id`  
**Content-Type:** `application/json`

All fields optional (partial update).

```json
{
  "amount": 8500,
  "remittedAt": "2026-04-01T00:00:00.000Z",
  "referenceNo": "BANK-REF-002",
  "receiptType": "BANK_RECEIPT",
  "receiptNumber": "TRN-12345",
  "receiptAttachmentUrl": "https://res.cloudinary.com/your-cloud/remittance-receipts/abc123.pdf",
  "notes": "Updated with correct amount"
}
```

**Set receipt URL only (no file upload):**

```json
{
  "receiptType": "OR",
  "receiptNumber": "OR-2024-003",
  "receiptAttachmentUrl": "https://example.com/receipts/or-2024-003.pdf"
}
```

**cURL:**

```bash
curl -X PATCH "{{EPP_BASEURL}}/api/admin-financier-settlement/698d386fdaec2462b941ee5e" \
  -H "Content-Type: application/json" \
  -d '{"referenceNo": "BANK-REF-002", "notes": "Updated"}'
```

---

## 4. Upload receipt (PATCH) – multipart

**Endpoint:** `PATCH /api/admin-financier-settlement/:id/upload-receipt`  
**Content-Type:** `multipart/form-data`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| receipt | file | Yes | Image or PDF; uploaded to Cloudinary |
| receiptType | string | Yes | `OR` or `BANK_RECEIPT` |
| receiptNumber | string | No | OR number or bank reference |

**cURL:**

```bash
curl -X PATCH "{{EPP_BASEURL}}/api/admin-financier-settlement/698d386fdaec2462b941ee5e/upload-receipt" \
  -F "receipt=@/path/to/or-receipt.jpg" \
  -F "receiptType=OR" \
  -F "receiptNumber=OR-2024-001"
```

**Bank receipt example:**

```bash
curl -X PATCH "{{EPP_BASEURL}}/api/admin-financier-settlement/698d386fdaec2462b941ee5e/upload-receipt" \
  -F "receipt=@/path/to/bank-transfer.pdf" \
  -F "receiptType=BANK_RECEIPT" \
  -F "receiptNumber=TRN-2024-001"
```

---

## 5. Get all (GET) – query params

**Endpoint:** `GET /api/admin-financier-settlement`

At least one of `document`, `pagination`, or `count` must be `true`. Pagination requires `document=true`.

**With documents and pagination:**

```
GET /api/admin-financier-settlement?document=true&pagination=true&page=1&limit=10
```

**With count only:**

```
GET /api/admin-financier-settlement?count=true
```

**With filter and sort:**

```
GET /api/admin-financier-settlement?document=true&filter=financierConfigId:69800d19ea1001dce5d58adb&sort=remittedAt&order=desc&page=1&limit=20
```

**Search (referenceNo, notes, receiptNumber):**

```
GET /api/admin-financier-settlement?document=true&query=BANK-REF
```

**cURL (list with pagination):**

```bash
curl -X GET "{{EPP_BASEURL}}/api/admin-financier-settlement?document=true&pagination=true&page=1&limit=10"
```

---

## 6. Get by ID (GET)

**Endpoint:** `GET /api/admin-financier-settlement/:id`

**cURL:**

```bash
curl -X GET "{{EPP_BASEURL}}/api/admin-financier-settlement/698d386fdaec2462b941ee5e"
```

---

## 7. Delete (DELETE)

**Endpoint:** `DELETE /api/admin-financier-settlement/:id`

**cURL:**

```bash
curl -X DELETE "{{EPP_BASEURL}}/api/admin-financier-settlement/698d386fdaec2462b941ee5e"
```

---

## Sample response (create with summary)

```json
{
  "status": "success",
  "message": "Admin financier settlement created",
  "data": {
    "adminFinancierSettlement": {
      "id": "698d386fdaec2462b941ee5e",
      "financierDisbursementId": "698ec09c87f8dbe6891b70a7",
      "financierConfigId": "69800d19ea1001dce5d58adb",
      "amount": 8277,
      "currency": "PHP",
      "remittedAt": "2026-03-31T00:00:00.000Z",
      "dueAt": "2026-03-14T02:15:41.977Z",
      "referenceNo": "BANK-REF-001",
      "receiptType": "OR",
      "receiptNumber": "OR-2024-002",
      "receiptAttachmentUrl": "https://res.cloudinary.com/.../remittance-receipts/xxx.jpg",
      "createdBy": "65f1a1b2c3d4e5f678901234",
      "notes": "March remittance",
      "createdAt": "2026-02-12T02:18:23.206Z",
      "updatedAt": "2026-02-12T02:18:23.206Z"
    },
    "summary": {
      "disbursementId": "698ec09c87f8dbe6891b70a7",
      "disbursementAmount": 24831,
      "totalRemitted": 8277,
      "outstanding": 16554,
      "reconciliationStatus": "PARTIAL"
    }
  },
  "code": 201,
  "timestamp": "2026-02-23T12:00:00.000Z"
}
```
