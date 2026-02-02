# Financier & Financing Agreement

## Overview

**Financier** pays Admin upfront for an order; the Client repays in installments. The Financier earns a percentage per installment (interest) and can set credit limits and auto-approval thresholds. This is integrated into the existing approval workflow.

## Flow

- **Client** places Order (e.g. INSTALLMENT).
- **Admin** runs approval workflow (Manager → HR → … → **Financier**).
- **Financier** (or system using `financier.autoApproveLimit`):
    - If `order.total <= financier.autoApproveLimit` and rules pass → auto-approve.
    - Else → manual approval.
- When financing is approved:
    - **FinancingAgreement** is created (Order ↔ Financier, principal, interest rate, schedule).
    - **Installments** are created; each can have `principalAmount` and `interestAmount` (percentage income per installment).
- **Financier** pays Admin (full amount); **Client** repays Financier in installments.

## Schema Summary

| Entity                    | Purpose                                                                                                                                                               |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Financier**             | Master: name, `maxCreditLimit`, `autoApproveLimit`, optional `interestRate` (fallback), `installmentRateConfig` (tiered rate by installment count), `installmentFee`. |
| **FinancingAgreement**    | One per financed Order: `orderId`, `financierId`, principal, totalPayable, installmentCount, interestRate snapshot, status.                                           |
| **Installment**           | Per-installment: optional `financingAgreementId`, `principalAmount`, `interestAmount` (amount = principal + interest when financed).                                  |
| **WorkflowApprovalLevel** | Optional `financierId`: when this level is Financier, use that financier’s rules.                                                                                     |
| **OrderApproval**         | `ApproverRole` includes **FINANCIER**.                                                                                                                                |

## Auto-approval (service layer)

This logic does **not** live in the schema; implement it in your approval/financing service, e.g.:

```ts
// Pseudocode: when evaluating approval for a level that has financierId
const level = workflowLevels.find((l) => l.level === currentLevel);
if (level?.financierId) {
	const financier = await prisma.financier.findUnique({ where: { id: level.financierId } });
	if (financier && order.total <= financier.autoApproveLimit) {
		// Check: client credit, financier available credit, etc.
		// Then auto-approve this level (e.g. create OrderApproval with status APPROVED / SKIPPED).
	}
}
```

- **Threshold:** `financier.autoApproveLimit`
- **Percentage income:** Use `installmentRateConfig` for tiered rates (e.g. 3 installments → 1.5%, 6 → 2%, 12 → 3%). Resolve with `getRateForInstallmentCount(installmentCount, financier)` from `helper/financierHelper.ts`; fallback to `financier.interestRate` when no tier matches. Store the chosen rate in `FinancingAgreement.interestRate` (snapshot) and per-installment as `Installment.interestAmount`.

## Money flow

- **Financier → Admin:** full order amount (principal).
- **Client → Financier:** installments (principal + interest).
- **Financier income:** sum of `Installment.interestAmount` (and optional `installmentFee`).
- **Admin → Vendor:** unchanged (PurchaseOrder / Delivery).

No changes to Delivery or PurchaseOrder models; financing is attached to **Order** and **Installments** only.
