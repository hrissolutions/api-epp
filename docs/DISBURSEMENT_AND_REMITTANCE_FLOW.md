# Disbursement and Remittance Flow

## 1. Financier approves order → Disbursement created

When the **financier** approves an order (and that’s the last approval), the system automatically:

- Creates a **FinancierDisbursement** (financier lent money to admin for that order).
- Saves it in the **financierDisbursements** table.

So: **one disbursement = one “financier lent to admin” record**, linked to one order.

---

## 2. Where does “Remittance” save?

**POST** `{{EPP_BASEURL}}/api/financier-disbursement/:id/remittance`

- **`:id`** = **disbursement id** (the loan from financier to admin).
- This creates one row in the **adminFinancierSettlements** table (model **AdminFinancierSettlement**).
- Each row = one payment from **admin back to financier** (a “remit”).

So when you “click remittance” you are creating a **remittance record** that means: “Admin paid this amount to the financier for this disbursement.” It is saved in **adminFinancierSettlements**, linked to the disbursement by `financierDisbursementId`.

---

## 3. Receipt = confirmation

- **Disbursement receipt** (financier → admin): proof that the financier transferred money to admin.  
  Upload: **PATCH** `/api/financier-disbursement/:id/upload-receipt` (disbursement id).

- **Remittance receipt** (admin → financier): proof that the admin paid the financier.  
  You can:
  - **Add it in the same request** when creating the remittance: send **multipart/form-data** to **POST** `.../financier-disbursement/:id/remittance` with body fields `amount`, optional `receiptType`, `receiptNumber`, and optional file **`receipt`**. The remittance is saved and the receipt is attached in one call.
  - Or add it later: **PATCH** `/api/financier-disbursement/remittances/:remittanceId/upload-receipt` (remittance id from the ledger or from the create response).

---

## 4. Summary

| Action | Endpoint | What is saved | Table |
|--------|----------|----------------|-------|
| Financier approves order | (automatic) | FinancierDisbursement | financierDisbursements |
| Create remittance (admin pays financier) | POST .../financier-disbursement/**disbursementId**/remittance | AdminFinancierSettlement | adminFinancierSettlements |
| Add receipt when creating remittance | Same POST with multipart: `amount`, optional `receipt`, `receiptType`, `receiptNumber` | Same row gets receipt fields set | adminFinancierSettlements |
| Add receipt later for a remittance | PATCH .../remittances/**remittanceId**/upload-receipt | Updates that remittance row with receiptType, receiptNumber, receiptAttachmentUrl | adminFinancierSettlements |

So: **remittance is saved in `adminFinancierSettlements`**. When you remit, you can attach the receipt in the same call (multipart with optional `receipt` file) or later using the remittance id.
