# Feature Gap Report

**Date:** 2026-02-17  
**Branch:** feat/BillAndRecon  
**Scope:** Backend – implemented vs missing features

---

## 1. Implemented API Modules (have app code + routes)

| Module                | Mount Path                  | Has Controller Spec? | Notes                         |
| --------------------- | --------------------------- | -------------------- | ----------------------------- |
| template              | /api/template               | ✅ Yes               | CRUD + grouping               |
| category              | /api/category               | ✅ Yes               | CRUD + grouping               |
| cartItem              | /api/cartItem               | ✅ Yes               | CRUD + grouping + checkout    |
| wishlistItem          | /api/wishlistItem           | ✅ Yes               | CRUD + grouping               |
| order                 | /api/order                  | ✅ Yes               | CRUD + create-purchase-orders |
| orderItem             | /api/orderItem              | ✅ Yes               | CRUD + grouping               |
| installment           | /api/installment            | ✅ Yes               | CRUD + grouping + deduct      |
| transaction           | /api/transaction            | ✅ Yes (broken)      | Spec out of sync with API     |
| item                  | /api/items                  | ❌ No                | CRUD + import – **no tests**  |
| supplier              | /api/supplier               | ❌ No                | **No controller spec**        |
| purchaseOrder         | /api/purchaseOrder          | ❌ No                | **No controller spec**        |
| deliveryDocument      | /api/deliveryDocument       | ❌ No                | **No controller spec**        |
| financierConfig       | /api/financierConfig        | ❌ No                | **No controller spec**        |
| financingAgreement    | /api/financingAgreement     | ❌ No                | **No controller spec**        |
| financierDisbursement | /api/financier-disbursement | ❌ No                | **No controller spec**        |
| supplierSettlement    | /api/supplier-settlement    | ❌ No                | **No controller spec**        |
| notification          | /api/notification           | ❌ No                | **No controller spec**        |
| auditLogging          | /api/auditLogging           | ❌ No                | **No controller spec**        |
| approvalWorkflow      | /api/approvalWorkflow       | ❌ No                | **No controller spec**        |
| approvalType          | /api/approvalType           | ❌ No                | **No controller spec**        |
| workflowApprovalLevel | /api/workflowApprovalLevel  | ❌ No                | **No controller spec**        |
| orderApproval         | /api/orderApproval          | ❌ No                | **No controller spec**        |
| docs                  | /api/docs                   | ❌ No                | API list / Swagger – no spec  |

---

## 2. Missing or Removed Features

### 2.1 Products module (removed)

- **Status:** Module no longer exists (`app/products/` not present).
- **Impact:** `tests/products.controller.spec.ts` is excluded (renamed to `.skip`); product-related flows are not covered.
- **Action:** Reintroduce products module and re-enable spec, or remove spec and document products as out of scope.

### 2.2 Authentication & authorization on API routes

- **Status:** Not enforced. Comment in `index.ts`: _"All endpoints are public (no authentication required)"_.
- **Missing:**
    - Token verification on protected routes
    - Role/ownership checks before mutations
    - Auth/abuse tests (invalid token, wrong role, IDOR)
- **Action:** Apply auth middleware to protected routes; add auth/role tests.

### 2.3 Controller test coverage (missing specs)

The following modules have **no** controller unit tests:

| Module                | Purpose (from API matrix)        |
| --------------------- | -------------------------------- |
| item                  | Items CRUD, import               |
| supplier              | Supplier CRUD                    |
| purchaseOrder         | PO list, approve, confirm        |
| deliveryDocument      | Delivery list, receive           |
| financierConfig       | Financier config                 |
| financingAgreement    | Financing agreements             |
| financierDisbursement | Disbursements                    |
| supplierSettlement    | Supplier settlements             |
| notification          | Notifications                    |
| auditLogging          | Audit logs                       |
| approvalWorkflow      | Approval workflows               |
| approvalType          | Approval types                   |
| workflowApprovalLevel | Workflow levels                  |
| orderApproval         | Order approvals (approve/reject) |
| docs                  | API list, Swagger                |

**Action:** Add `tests/<module>.controller.spec.ts` for each (or document which are intentionally out of scope).

### 2.4 Transaction controller spec (out of sync)

- **Status:** Spec still targets generic CRUD (create, getAll, update, delete).
- **Actual API:** getUnreconciled, getByOrder, getByEmployee, reconcile, etc.
- **Action:** Rewrite `tests/transaction.controller.spec.ts` to match current transaction API.

### 2.5 Integration / API tests

- **Status:** Only unit tests with mocks; no tests against a running server.
- **Missing:** End-to-end or integration tests that hit real HTTP endpoints and (optionally) test DB.
- **Action:** Add integration/API test suite (e.g. Supertest) and run against dev server.

### 2.6 Dependency audit

- **Status:** `npm audit` not run or documented (per review checklist).
- **Action:** Run `npm audit`, fix or accept risks, document in security/release notes.

---

## 3. Summary Table: What Is Missing

| Gap                              | Type          | Priority                      |
| -------------------------------- | ------------- | ----------------------------- |
| Products module                  | Code + tests  | High if products are in scope |
| Auth on API routes               | Security      | High                          |
| Controller specs for 14+ modules | Test coverage | High                          |
| Transaction spec alignment       | Test fix      | High                          |
| Item controller spec             | Test coverage | Medium                        |
| Integration/API tests            | Test type     | Medium                        |
| npm audit                        | Security      | Low                           |

---

## 4. References

- **Test Execution Report:** `test/engineering/TEST_EXECUTION_REPORT_2026-02-17.md`
- **API Test Matrix:** `test/engineering/API_TEST_MATRIX_2026-02-17.csv`
- **QA Report:** `test/qa/QA_REPORT_2026-02-17.md`
- **Review Report:** `test/review/REVIEW_REPORT_2026-02-17.md`
- **App routes:** `index.ts` (lines 169–191)
- **Architecture:** `.orchestration/ARCHITECTURE.md`
