# Order → Financier → Admin → Vendor Flow

Flow when a **client** orders on **installment**: the **financier** pays the **admin** upfront; the **admin** then buys the product from the **vendor**.

```
┌─────────┐     1. Order (installment)      ┌─────────┐
│         │ ───────────────────────────────►│         │
│  CLIENT │                                 │  ADMIN  │
│         │◄─────────────────────────────── │         │
└─────────┘     6. Admin delivers to       └────┬────┘
     │              client (Admin DO)              │
     │                                             │
     │        2. Order approved (workflow)         │ 3. Admin buys from vendor
     │             + FINANCIER level                │    (Purchase Order)
     │                                             │
     ▼                                             ▼
┌─────────┐     2. Financier pays Admin    ┌─────────┐
│         │     (FinancingAgreement)         │         │
│FINANCIER│ ──────────────────────────────►│  ADMIN  │◄──── 4. Vendor ships
│         │     principal = order total      │         │       to Admin (Vendor DO)
└─────────┘                                 └────┬────┘
                                                  │
                                                  │ 5. Admin receives
                                                  │    (Admin DR)
                                                  ▼
                                            ┌─────────┐
                                            │ VENDOR  │
                                            │         │
                                            └─────────┘
```

## Step-by-step

| Step      | Who           | What                                                                                                                                                                         |
| --------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1**     | **Client**    | Places order (payment type: INSTALLMENT).                                                                                                                                    |
| **2a**    | **Admin**     | Order goes through approval workflow; FINANCIER level approves (if within credit limit).                                                                                     |
| **2b**    | **Financier** | Pays admin upfront for the order → **FinancingAgreement** created (principal = order total). Admin’s **FinancierConfig** credit is used (usedCredits ↑, availableCredits ↓). |
| **3**     | **Admin**     | After order is fully approved, admin creates **Purchase Order(s)** to **Vendor** (one PO per vendor, for that order’s items).                                                |
| **4**     | **Vendor**    | Ships to admin → **Delivery Document** (Vendor DO).                                                                                                                          |
| **5**     | **Admin**     | Receives goods → signs **Admin DR** (delivery receipt).                                                                                                                      |
| **6**     | **Admin**     | Delivers to client → **Admin DO**; client receives product.                                                                                                                  |
| _Ongoing_ | **Client**    | Repays in installments (to admin/financier per your business rules).                                                                                                         |

## Summary

- **Client** orders on installment.
- **Financier** pays **admin** the order total (credit ledger: FinancingAgreement).
- **Admin** uses that to buy from **vendor** (PO); vendor ships to admin; admin then delivers to client.

So: **Client (installment) → Financier pays Admin → Admin buys from Vendor** is correct.
