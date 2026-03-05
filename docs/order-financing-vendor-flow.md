# Order → Financier → Admin → Supplier Flow

Flow when a **client** orders on **installment**: the **financier** pays the **admin** upfront; the **admin** then buys the product from the **supplier**.

## Detailed end-to-end flow (with triggers)

```text
sequenceDiagram
  autonumber
  actor C as Client
  participant O as Order Service (API)
  participant A as Approval Workflow
  actor F as Financier
  participant FC as FinancierConfig (credits)
  participant FA as FinancingAgreement (ledger)
  participant PO as PurchaseOrder (Admin→Supplier)
  actor V as Supplier
  participant DD as DeliveryDocument (DO/DR)

  C->>O: Create Order (paymentType=INSTALLMENT)
  Note over O: Order.status = PENDING_APPROVAL
  Note over O: Transaction + Installments created (if applicable)

  O->>A: Create approval chain (includes FINANCIER level when required)
  A-->>O: Approvers approve/reject

  alt Any approver rejects
    A-->>O: Reject
    Note over O: Order.status = REJECTED
    Note over PO: No PO created; no financing agreement created
  else All required approvers approve (last approval)
    A-->>O: Approve (last required approver)
    Note over O: Trigger: finalize order approval
    Note over O: Order.status = APPROVED, isFullyApproved=true, approvedAt set

    opt Installment order with financier involved
      O->>FA: Create FinancingAgreement (status=APPROVED)
      Note over FA: principalAmount = order.total
      O->>FC: Update credit
      Note over FC: usedCredits += order.total\navailableCredits -= order.total
    end

    O->>PO: Trigger: createPurchaseOrdersForApprovedOrder(orderId)
    Note over PO: Creates 1 PO per supplier\nPO.status = PENDING

    Note over PO: Admin action: approve PO (PATCH /api/purchaseOrder/:id/approve)\nPO.status -> APPROVED
    Note over PO: Admin action: confirm PO (PATCH /api/purchaseOrder/:id/confirm OR update status=CONFIRMED)\nPO.status -> CONFIRMED\nTrigger: createSupplierDOForPO()

    PO->>DD: Create Supplier DO
    Note over DD: documentType=DELIVERY_ORDER\ntransferStage=VENDOR_TO_ADMIN\npurchaseOrderId=PO.id

    V->>DD: Supplier ships (updates carrierInfo/tracking if used)
    Note over PO: (Optional) PO.status -> SENT/SHIPPED (via update)

    O->>DD: Admin receives shipment (create Admin DR)
    Note over DD: documentType=DELIVERY_RECEIPT\ntransferStage=VENDOR_TO_ADMIN\ncorrespondingDocumentId = Supplier DO id
    Note over PO: PO.status -> RECEIVED (via update)

    O->>DD: Admin delivers to client (create Admin DO)
    Note over DD: documentType=DELIVERY_ORDER\ntransferStage=ADMIN_TO_CLIENT\norderId=Order.id
    Note over O: Order.status -> PROCESSING/SHIPPED (as you implement)

    C->>DD: Client signs (create Client DR)
    Note over DD: documentType=DELIVERY_RECEIPT\ntransferStage=ADMIN_TO_CLIENT\ncorrespondingDocumentId = Admin DO id
    Note over O: Order.status -> DELIVERED (as you implement)
  end
```

```
┌─────────┐     1. Order (installment)      ┌─────────┐
│         │ ───────────────────────────────►│         │
│  CLIENT │                                 │  ADMIN  │
│         │◄─────────────────────────────── │         │
└─────────┘     6. Admin delivers to       └────┬────┘
     │              client (Admin DO)              │
     │                                             │
     │        2. Order approved (workflow)         │ 3. Admin buys from supplier
     │             + FINANCIER level                │    (Purchase Order)
     │                                             │
     ▼                                             ▼
┌─────────┐     2. Financier pays Admin    ┌─────────┐
│         │     (FinancingAgreement)         │         │
│FINANCIER│ ──────────────────────────────►│  ADMIN  │◄──── 4. Supplier ships
│         │     principal = order total      │         │       to Admin (Supplier DO)
└─────────┘                                 └────┬────┘
                                                  │
                                                  │ 5. Admin receives
                                                  │    (Admin DR)
                                                  ▼
                                            ┌─────────┐
                                            │SUPPLIER │
                                            │         │
                                            └─────────┘
```

## Step-by-step

| Step      | Who           | What                                                                                                                                                                         |
| --------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1**     | **Client**    | Places order (payment type: INSTALLMENT).                                                                                                                                    |
| **2a**    | **Admin**     | Order goes through approval workflow; FINANCIER level approves (if within credit limit).                                                                                     |
| **2b**    | **Financier** | Pays admin upfront for the order → **FinancingAgreement** created (principal = order total). Admin’s **FinancierConfig** credit is used (usedCredits ↑, availableCredits ↓). |
| **3**     | **Admin**     | After order is fully approved, admin creates **Purchase Order(s)** to **Supplier** (one PO per supplier, for that order’s items).                                            |
| **4**     | **Supplier**  | Ships to admin → **Delivery Document** (Supplier DO).                                                                                                                        |
| **5**     | **Admin**     | Receives goods → signs **Admin DR** (delivery receipt).                                                                                                                      |
| **6**     | **Admin**     | Delivers to client → **Admin DO**; client receives product.                                                                                                                  |
| _Ongoing_ | **Client**    | Repays in installments (to admin/financier per your business rules).                                                                                                         |

## PurchaseOrder status diagram (Admin → Supplier)

PurchaseOrder statuses come from `PurchaseOrderStatus` in `prisma/schema/purchaseOrder.prisma`.

```text
stateDiagram-v2
  [*] --> PENDING: PO created automatically\n(when Order becomes APPROVED)

  PENDING --> APPROVED: Admin approves PO\nPATCH /api/purchaseOrder/:id/approve\n(sets sentToSupplierAt)
  APPROVED --> CONFIRMED: Admin confirms PO\nPATCH /api/purchaseOrder/:id/confirm\n(or update status=CONFIRMED)
  CONFIRMED --> SENT: Optional (manual update)
  SENT --> SHIPPED: Optional (manual update)
  SHIPPED --> RECEIVED: Optional (manual update)\n(Admin received shipment)

  PENDING --> CANCELLED: cancel
  APPROVED --> CANCELLED: cancel
  CONFIRMED --> CANCELLED: cancel

  note right of CONFIRMED
    Trigger in code:
    createSupplierDOForPO(prisma, poId)
    creates Supplier DO (DeliveryDocument)
  end note
```

## DeliveryDocument (DO/DR) diagram (both stages)

Delivery documents use a **single table** with:

- `documentType`: `DELIVERY_ORDER` | `DELIVERY_RECEIPT`
- `transferStage`: `VENDOR_TO_ADMIN` | `ADMIN_TO_CLIENT`

```text
flowchart LR
  subgraph Stage1["Stage 1: Supplier → Admin"]
    VDO["Supplier DO\n(documentType=DELIVERY_ORDER,\ntransferStage=VENDOR_TO_ADMIN,\npurchaseOrderId=PO)"]
    ADR["Admin DR\n(documentType=DELIVERY_RECEIPT,\ntransferStage=VENDOR_TO_ADMIN,\ncorrespondingDocumentId=Supplier DO)"]
    VDO -->|Admin receives & signs| ADR
  end

  subgraph Stage2["Stage 2: Admin → Client"]
    ADO["Admin DO\n(documentType=DELIVERY_ORDER,\ntransferStage=ADMIN_TO_CLIENT,\norderId=Order)"]
    CDR["Client DR\n(documentType=DELIVERY_RECEIPT,\ntransferStage=ADMIN_TO_CLIENT,\ncorrespondingDocumentId=Admin DO)"]
    ADO -->|Client receives & signs| CDR
  end
```

## Summary

- **Client** orders on installment.
- **Financier** pays **admin** the order total (credit ledger: FinancingAgreement).
- **Admin** uses that to buy from **supplier** (PO); supplier ships to admin; admin then delivers to client.

So: **Client (installment) → Financier pays Admin → Admin buys from Supplier** is correct.
