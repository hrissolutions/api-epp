# Test Execution Report

**Date:** 2026-02-17  
**Environment:** Local / branch feat/BillAndRecon  
**Runner:** Mocha + Chai (`npm test`)

## Summary

| Metric | Count |
|--------|--------|
| **Total** | 487 |
| **Passing** | 228 |
| **Failing** | 259 |
| **Pass Rate** | 46.8% |

## Scope

- **In scope:** Controller unit tests for template, category, cartItem, order, orderItem, wishlistItem, installment, transaction; security middleware tests; service-name validation.
- **Excluded:** `tests/products.controller.spec.ts` (renamed to `.skip`) – references removed module `app/products/products.controller` and invalid Prisma types.

## Results by Suite

| Suite | Passing | Failing | Notes |
|-------|---------|---------|--------|
| CartItem Controller | 12 | 35 | Query flags (groupBy/documents/pagination) cause 400 |
| Category Controller | 8 | 54 | Same pattern as CartItem |
| Installment Controller | 8 | 90 | Same pattern |
| Order Controller | 8 | 62 | Same pattern |
| OrderItem Controller | 8 | 82 | Same pattern |
| Template Controller | 8 | 72 | Same pattern |
| Transaction Controller | 0 | 22 | Specs fail (create/getAll/update/delete etc.) |
| WishlistItem Controller | 8 | 66 | Same as other CRUD suites |
| Security Middleware | 8 | 0 | All pass |
| Service-name validation | 1+ | 0 | Pass |
| Orchestration checklist (Security & Review) | 10 | 1 | JWT hardcode check may need tuning |

## Root Causes (High Level)

1. **Query/flag combination:** Controllers enforce "all flags cannot be false" and "pagination requires document to be true". Specs call `getAll` without satisfying these rules → 400.
2. **Validation:** Create/update specs often omit required fields (e.g. `userId`, `itemId` for cartItem) → 400.
3. **Response shape/status:** Some specs expect 200 where controller returns 400 (e.g. edge cases: large page/limit, missing required fields in update).
4. **Transaction controller:** Specs do not match current controller interface/behavior.
5. **Products spec:** Orphaned spec; module no longer exists.

## Artifacts

- **API Test Matrix:** `test/engineering/API_TEST_MATRIX_2026-02-17.csv`
- **Test Defects:** `test/engineering/TEST_DEFECTS_2026-02-17.csv`

## Recommendations

1. Align controller query validation with test expectations or update specs to send valid flag combinations.
2. Fix or remove `products.controller.spec.ts` (or re-enable after reintroducing products module).
3. Update transaction controller spec to match current API (getUnreconciled, getByOrder, getByEmployee, reconcile).
4. Add missing controller specs for: supplier, purchaseOrder, deliveryDocument, financierConfig, financingAgreement, financierDisbursement, supplierSettlement, notification, auditLogging, approvalWorkflow, approvalType, workflowApprovalLevel.
5. Re-run and regenerate this report after fixes.
