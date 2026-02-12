# Financier Payment Reconciliation Design

This document defines a clean structure for tracking and reconciling financing payments across:

- Employee order
- Financier disbursement
- Supplier settlement
- Reconciliation and audit trail

It is designed to fit your current modules (`order`, `financingAgreement`, `transaction`, `purchaseOrder`).

---

## Goals

- Track actual money movement, not only financing obligations.
- Link financed orders to supplier payments.
- Provide a reconciliation lifecycle (pending, matched, disputed, settled).
- Keep snapshots for reporting and audit.
- Support financing **Terms** as immutable snapshots per approved order.
- Support accounting visibility for **Accounts Payable (AP)** and **Accounts Receivable (AR)**.

---

## Proposed Data Model

### 0) Terms Snapshot (use existing `FinancingAgreement`)

You already have `FinancingAgreement`, so terms should be captured there as a snapshot at approval time.

Recommended additions to `FinancingAgreement`:

```prisma
// suggested additional fields on FinancingAgreement
termLabel            String?   // e.g. "90 days PDC", "6 months installment"
termDays             Int?      // e.g. 90
gracePeriodDays      Int?      // e.g. 5
lateFeeType          String?   // FIXED | PERCENTAGE
lateFeeValue         Float?    // amount or percent
penaltyRatePercent   Float?    // optional
interestModel        String?   // FLAT | REDUCING
```

Why this is needed:

- Financier terms can change over time.
- Historical orders must keep the exact approved terms (snapshot), not dynamic config.

---

### 1) `FinancierDisbursement`

Represents money paid by a financier for an approved financed order.

```prisma
model FinancierDisbursement {
  id                   String   @id @default(auto()) @map("_id") @db.ObjectId
  organizationId       String?  @db.ObjectId
  orderId              String   @db.ObjectId
  financingAgreementId String   @db.ObjectId
  financierConfigId    String   @db.ObjectId

  referenceNo          String?  // bank reference / remittance no
  amount               Float
  currency             String   @default("PHP")
  disbursedAt          DateTime?
  expectedAt           DateTime?

  status               DisbursementStatus @default(PENDING)
  reconciliationStatus ReconciliationStatus @default(PENDING)

  reconciledAt         DateTime?
  reconciledBy         String?  @db.ObjectId
  notes                String?
  metadata             Json?

  createdAt            DateTime @default(now())
  updatedAt            DateTime @updatedAt

  order                Order              @relation(fields: [orderId], references: [id], onDelete: Cascade)
  financingAgreement   FinancingAgreement @relation(fields: [financingAgreementId], references: [id], onDelete: Cascade)

  @@index([orderId])
  @@index([financingAgreementId])
  @@index([financierConfigId])
  @@index([status])
  @@index([reconciliationStatus])
  @@map("financierDisbursements")
}

enum DisbursementStatus {
  PENDING
  DISBURSED
  FAILED
  CANCELLED
}
```

---

### 2) `SupplierSettlement`

Represents money paid to supplier, typically based on PO.

```prisma
model SupplierSettlement {
  id                      String   @id @default(auto()) @map("_id") @db.ObjectId
  organizationId          String?  @db.ObjectId
  orderId                 String   @db.ObjectId
  purchaseOrderId         String   @db.ObjectId
  supplierId              String   @db.ObjectId
  financierDisbursementId String?  @db.ObjectId

  referenceNo             String?
  amount                  Float
  currency                String   @default("PHP")
  paidAt                  DateTime?
  dueAt                   DateTime?

  status                  SettlementStatus @default(PENDING)
  reconciliationStatus    ReconciliationStatus @default(PENDING)

  reconciledAt            DateTime?
  reconciledBy            String? @db.ObjectId
  notes                   String?
  metadata                Json?

  createdAt               DateTime @default(now())
  updatedAt               DateTime @updatedAt

  purchaseOrder           PurchaseOrder @relation(fields: [purchaseOrderId], references: [id], onDelete: Cascade)

  @@index([orderId])
  @@index([purchaseOrderId])
  @@index([supplierId])
  @@index([financierDisbursementId])
  @@index([status])
  @@index([reconciliationStatus])
  @@map("supplierSettlements")
}

enum SettlementStatus {
  PENDING
  PAID
  PARTIAL
  FAILED
  CANCELLED
}
```

---

### 3) Shared enum for reconciliation

```prisma
enum ReconciliationStatus {
  PENDING
  MATCHED
  PARTIAL
  DISPUTED
  SETTLED
}
```

---

## AP / AR Mapping (use existing `Transaction`)

You already have `transaction` and `financingAgreement`. Keep them and extend usage:

- **AR (Accounts Receivable)**:
  - Employee receivable under financed order (installments due from employee).
  - Optional financier receivable if financier has not yet disbursed to EPP.
- **AP (Accounts Payable)**:
  - Amount EPP owes supplier for PO settlement.

Recommended approach:

1. Keep current transaction flow.
2. Add transaction categories/types for finance-side ledger entries (if not yet present):
   - `AR_EMPLOYEE_INSTALLMENT`
   - `AR_FINANCIER_DISBURSEMENT`
   - `AP_SUPPLIER_SETTLEMENT`
3. Link these entries to:
   - `orderId`
   - `financingAgreementId` (for financing side)
   - `purchaseOrderId` / `supplierSettlementId` (for supplier payable side)

This allows reporting without replacing your current transaction module.

---

## Minimal Link Additions to Existing Models

To keep traceability simple:

- `FinancingAgreement`:
  - optional `disbursements FinancierDisbursement[]`
  - terms snapshot fields (see section 0)
- `PurchaseOrder`:
  - optional `settlements SupplierSettlement[]`
- `Order`:
  - optional `disbursements FinancierDisbursement[]`
  - optional `supplierSettlements SupplierSettlement[]`
- `Transaction`:
  - optional relation keys for `financingAgreementId`, `purchaseOrderId`, `supplierSettlementId`
  - keep existing order payment logic intact

---

## Recommended Process Flow

1. Order gets fully approved and has financing agreement.
2. Create `FinancierDisbursement` with status `PENDING`.
3. When bank/remittance confirms payout:
   - set status `DISBURSED`
   - set `disbursedAt`, `referenceNo`
4. For each related PO, create `SupplierSettlement` record.
5. When supplier payment is made:
   - set settlement status to `PAID`/`PARTIAL`
   - set `paidAt`, `referenceNo`
6. Post AP/AR ledger entries in `Transaction`:
   - AR for employee installment schedule
   - AR for financier disbursement (until received)
   - AP for supplier settlement
7. Reconcile both records:
   - update `reconciliationStatus`
   - set `reconciledAt`, `reconciledBy`
8. Emit socket + notification on key events.

---

## API Structure (Suggested)

### Financier Disbursement

- `POST /api/financier-disbursement`
- `GET /api/financier-disbursement`
- `GET /api/financier-disbursement/:id`
- `PATCH /api/financier-disbursement/:id`
- `POST /api/financier-disbursement/:id/reconcile`

### Supplier Settlement

- `POST /api/supplier-settlement`
- `GET /api/supplier-settlement`
- `GET /api/supplier-settlement/:id`
- `PATCH /api/supplier-settlement/:id`
- `POST /api/supplier-settlement/:id/reconcile`

### Reconciliation Snapshot

- `GET /api/order/:id/financing-snapshot`
  - Returns:
    - order summary
    - financing agreement + terms snapshot
    - disbursement records
    - PO and settlement records
    - AR summary (employee, financier)
    - AP summary (supplier)
    - reconciliation status summary

---

## Socket and Notification Events (Suggested)

- `finance:disbursement:created`
- `finance:disbursement:updated`
- `finance:disbursement:reconciled`
- `finance:settlement:paid`
- `finance:settlement:reconciled`

Recipients:

- Financier user(s)
- Supplier user(s)
- Finance/admin user(s)

---

## Suggested Folder Structure

```text
app/
  financierDisbursement/
    financierDisbursement.controller.ts
    financierDisbursement.router.ts
    index.ts
  supplierSettlement/
    supplierSettlement.controller.ts
    supplierSettlement.router.ts
    index.ts

helper/
  financierDisbursementService.ts
  supplierSettlementService.ts
  financeReconciliationService.ts

zod/
  financierDisbursement.zod.ts
  supplierSettlement.zod.ts

prisma/schema/
  financierDisbursement.prisma
  supplierSettlement.prisma
```

---

## Phased Implementation Plan

### Phase 1 (Core)

- Add schema/models and CRUD endpoints.
- Link to order/agreement/PO.
- Add reconciliation fields and basic reconcile endpoint.
- Add financing terms snapshot fields to `FinancingAgreement`.

### Phase 2 (Automation)

- Auto-create disbursement when financed order is approved.
- Auto-create settlement when PO is created/approved.
- Auto-post AP/AR transaction entries for each finance event.

### Phase 3 (Visibility)

- Add snapshot endpoint and dashboard summary.
- Add socket + notifications for finance, supplier, admin.
- Add AR aging and AP aging reports.

---

## Notes for Current Codebase

- Existing `Transaction` currently reflects client-side order payments.
- Keep it and extend with AP/AR finance categories to avoid breaking changes.
- Keep `FinancingAgreement` as the source of approved financing terms snapshot.
- Use new modules (`FinancierDisbursement`, `SupplierSettlement`) for payout/settlement lifecycle.
- Later, if needed, unify under a general ledger model.

---

## EPP Applied Flow (Your Scenario)

This section applies your exact scenario to current EPP modules.

### Scenario mapping (Step-by-step)

1. **User places order**  
   - Current app: `order` / `cartItem.checkout`
   - Data: `Order`, `OrderItem`

2. **Payment method = installment**  
   - Current app: `paymentType = INSTALLMENT`
   - Data: `Order.paymentType`, installment generation

3. **Approver + financier checks user credibility (existing installment obligations, limits)**  
   - Current app: approval workflow exists, financier checks partially exist
   - Needed enhancement:
     - Add explicit user credit/obligation snapshot at decision time (`UserFinanceSnapshot`)
     - Evaluate active installment balances before final approval

4. **Order approved**  
   - Current app: `approvalService` finalization
   - Data: order status `APPROVED`, notification/socket

5. **Create installment data**  
   - Current app: already exists (`Installment` generation)

6. **Create transaction**  
   - Current app: already exists (`Transaction`)
   - Needed enhancement:
     - Add AP/AR finance transaction categories (employee AR, financier AR, supplier AP)

7. **Create billing and reconciliation records**  
   - Current app: transaction-level reconciliation exists only
   - Needed enhancement:
     - Add `FinancierDisbursement` and `SupplierSettlement`
     - Add reconciliation endpoints for both

8. **Financier lends money to EPP-admin + financing agreement terms**  
   - Current app: `FinancingAgreement` + financier credit update already exist
   - Needed enhancement:
     - Capture disbursement event (`FinancierDisbursement`)
     - Extend terms snapshot fields in `FinancingAgreement`

9. **Deduct available credit from financier**  
   - Current app: already implemented (`FinancierConfig.usedCredits/availableCredits`)

10. **EPP-admin creates PO to supplier**  
    - Current app: already implemented (`create-purchase-orders`, `PurchaseOrder`)

11. **Supplier confirms PO then DO is created**  
    - Current app: already implemented (PO confirm -> supplier DO auto-create)

12. **Billing and reconciliation after PO/DO**  
    - Needed enhancement:
      - Create `SupplierSettlement` from PO
      - Reconcile AP against disbursement/settlement

13. **Deliver to EPP-admin, then EPP-admin to HR/user**  
    - Current app: delivery document flow exists
    - Needed enhancement:
      - Optional milestone-based billing/recon snapshots per delivery stage

---

## Implementation Plan for This Scenario

### Phase A (Use current app + add minimal finance controls)

- Keep current order/approval/installment/transaction flow.
- Add terms snapshot fields to `FinancingAgreement`.
- Add user finance decision snapshot (`UserFinanceSnapshot`).

### Phase B (Add missing finance entities)

- Add `FinancierDisbursement` (financier -> EPP).
- Add `SupplierSettlement` (EPP -> supplier).
- Add AP/AR transaction categories in `Transaction`.

### Phase C (Reconciliation and billing)

- Add reconcile endpoints:
  - `/api/financier-disbursement/:id/reconcile`
  - `/api/supplier-settlement/:id/reconcile`
- Add order finance snapshot endpoint:
  - `/api/order/:id/financing-snapshot`
- Add summary:
  - AR (employee + financier outstanding)
  - AP (supplier outstanding)

### Phase D (Operational visibility)

- Socket/notification events for:
  - disbursement created/updated/reconciled
  - settlement paid/reconciled
- Aging dashboards:
  - AR aging by user/financier
  - AP aging by supplier

---

## Final Answer to "Can we apply this to current app?"

**Yes.** Your scenario is compatible with current EPP architecture.

- **Already covered:** order -> approval -> installment -> transaction -> PO -> DO
- **Needs to be added:** formal billing/reconciliation entities and AP/AR posting model

Use this doc as the target blueprint, then implement in phases to avoid breaking existing modules.

