# Installment System - Real World Example

## Scenario

**Employee:** Juan Dela Cruz  
**Order:** ₱12,000 Samsung Galaxy Phone  
**Payment Plan:** 6-month installment via payroll deduction  
**Start Date:** January 10, 2024  

---

## Step-by-Step Process

### 1️⃣ Employee Places Order

Juan browses the company store and adds a Samsung Galaxy phone to his cart.

**Request:**
```http
POST /api/order HTTP/1.1
Content-Type: application/json

{
  "orderNumber": "ORD-2024-12345",
  "employeeId": "67890abcdef123456789",
  "subtotal": 11000.00,
  "tax": 1000.00,
  "total": 12000.00,
  "paymentType": "INSTALLMENT",
  "installmentMonths": 6,
  "paymentMethod": "PAYROLL_DEDUCTION",
  "status": "APPROVED",
  "shippingAddress": "123 Main St, Manila",
  "notes": "Please deliver between 9am-5pm"
}
```

### 2️⃣ System Automatically Generates Installments

The backend automatically:
- Calculates: 6 months × 2 cutoffs = **12 installments**
- Amount per installment: ₱12,000 ÷ 12 = **₱1,000 each**
- Generates cutoff dates (alternating 15th and end of month)
- Sets scheduled payment dates (5 days after cutoff)

**Response:**
```json
{
  "success": true,
  "message": "Order created successfully",
  "data": {
    "order": {
      "id": "507f1f77bcf86cd799439011",
      "orderNumber": "ORD-2024-12345",
      "employeeId": "67890abcdef123456789",
      "total": 12000.00,
      "paymentType": "INSTALLMENT",
      "installmentMonths": 6,
      "installmentCount": 12,
      "installmentAmount": 1000.00,
      "status": "APPROVED"
    },
    "installments": [
      {
        "id": "inst-001",
        "installmentNumber": 1,
        "amount": 1000.00,
        "status": "PENDING",
        "cutOffDate": "2024-01-15T00:00:00.000Z",
        "scheduledDate": "2024-01-20T00:00:00.000Z"
      },
      {
        "id": "inst-002",
        "installmentNumber": 2,
        "amount": 1000.00,
        "status": "PENDING",
        "cutOffDate": "2024-01-31T00:00:00.000Z",
        "scheduledDate": "2024-02-05T00:00:00.000Z"
      },
      // ... 10 more installments
    ],
    "installmentSummary": {
      "totalInstallments": 12,
      "installmentAmount": 1000.00,
      "firstPayment": "2024-01-20T00:00:00.000Z",
      "lastPayment": "2024-07-20T00:00:00.000Z"
    }
  }
}
```

### 3️⃣ Complete Payment Schedule

| # | Cutoff Date | Payment Date | Amount  | Status  |
|---|-------------|--------------|---------|---------|
| 1 | Jan 15, 2024 | Jan 20, 2024 | ₱1,000 | PENDING |
| 2 | Jan 31, 2024 | Feb 5, 2024  | ₱1,000 | PENDING |
| 3 | Feb 15, 2024 | Feb 20, 2024 | ₱1,000 | PENDING |
| 4 | Feb 29, 2024 | Mar 5, 2024  | ₱1,000 | PENDING |
| 5 | Mar 15, 2024 | Mar 20, 2024 | ₱1,000 | PENDING |
| 6 | Mar 31, 2024 | Apr 5, 2024  | ₱1,000 | PENDING |
| 7 | Apr 15, 2024 | Apr 20, 2024 | ₱1,000 | PENDING |
| 8 | Apr 30, 2024 | May 5, 2024  | ₱1,000 | PENDING |
| 9 | May 15, 2024 | May 20, 2024 | ₱1,000 | PENDING |
| 10 | May 31, 2024 | Jun 5, 2024  | ₱1,000 | PENDING |
| 11 | Jun 15, 2024 | Jun 20, 2024 | ₱1,000 | PENDING |
| 12 | Jun 30, 2024 | Jul 5, 2024  | ₱1,000 | PENDING |

---

## Payroll Processing Timeline

### 📅 January 15, 2024 - First Cutoff

**Morning - HR Department:**

Payroll administrator queries pending installments:

```http
GET /api/installment/pending-payroll?cutoffDate=2024-01-15
```

**Response:**
```json
{
  "success": true,
  "data": {
    "cutoffDate": "2024-01-15T00:00:00.000Z",
    "totalPending": 156,
    "totalAmount": 437500.00,
    "installments": [
      {
        "id": "inst-001",
        "installmentNumber": 1,
        "amount": 1000.00,
        "status": "PENDING",
        "cutOffDate": "2024-01-15T00:00:00.000Z",
        "scheduledDate": "2024-01-20T00:00:00.000Z",
        "order": {
          "orderNumber": "ORD-2024-12345",
          "employeeId": "67890abcdef123456789",
          "total": 12000.00
        }
      },
      // ... 155 more installments from other employees
    ]
  }
}
```

**Afternoon - Payroll Processing:**

For Juan Dela Cruz:
- Gross Salary: ₱25,000
- Deductions:
  - SSS: ₱1,000
  - PhilHealth: ₱500
  - Pag-IBIG: ₱100
  - Tax: ₱2,000
  - **Installment: ₱1,000** ← First installment deducted
- Net Salary: ₱20,400

**After Successful Deduction:**

```http
POST /api/installment/inst-001/deduct HTTP/1.1
Content-Type: application/json

{
  "payrollBatchId": "BATCH-2024-01-15-001",
  "deductionReference": "DED-JAN15-JUANDC-001"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Installment marked as deducted",
  "data": {
    "installment": {
      "id": "inst-001",
      "installmentNumber": 1,
      "amount": 1000.00,
      "status": "DEDUCTED",
      "cutOffDate": "2024-01-15T00:00:00.000Z",
      "scheduledDate": "2024-01-20T00:00:00.000Z",
      "deductedDate": "2024-01-20T14:30:00.000Z",
      "payrollBatchId": "BATCH-2024-01-15-001",
      "deductionReference": "DED-JAN15-JUANDC-001"
    }
  }
}
```

**✅ Status Update:**
- Installment 1: ~~PENDING~~ → **DEDUCTED** ✓
- 11 installments remaining

---

### 📅 January 31, 2024 - Second Cutoff

Same process repeats:

1. Query pending installments
2. Process payroll for all employees
3. Deduct ₱1,000 from Juan's salary
4. Mark installment #2 as DEDUCTED

**Juan's Progress:**
- Paid: ₱2,000 (2 installments)
- Remaining: ₱10,000 (10 installments)

---

### 📅 February 15, 2024 - Third Cutoff

**Problem Scenario:** Juan took unpaid leave, salary is only ₱5,000

Payroll system checks:
- Gross Salary: ₱5,000
- Regular Deductions: ₱3,600
- Available: ₱1,400
- Installment Due: ₱1,000

**Decision:** Insufficient salary, skip installment

```http
PATCH /api/installment/inst-003 HTTP/1.1
Content-Type: application/json

{
  "status": "FAILED",
  "notes": "Insufficient salary due to unpaid leave"
}
```

**Status Update:**
- Installment 3: ~~PENDING~~ → **FAILED** ⚠️

**Follow-up Action:**
- HR notifies Juan
- Installment will be retried next cutoff
- Or can be rescheduled

---

## Employee Self-Service Portal View

### Juan's Dashboard

**Order Status:**
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Order: Samsung Galaxy Phone
Order #: ORD-2024-12345
Total: ₱12,000.00
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Payment Plan: 6 months (12 installments)
Monthly Deduction: ₱2,000.00 (₱1,000 × 2)

Progress: ████████░░░░░░░░░░░░░░░░ 16% (2/12)

Paid:      ₱2,000.00
Remaining: ₱10,000.00
Failed:    ₱1,000.00 (1 installment)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**Get Summary via API:**
```http
GET /api/installment/order/507f1f77bcf86cd799439011/summary
```

**Response:**
```json
{
  "success": true,
  "data": {
    "totalInstallments": 12,
    "paidCount": 2,
    "pendingCount": 9,
    "failedCount": 1,
    "totalAmount": 12000.00,
    "paidAmount": 2000.00,
    "remainingAmount": 10000.00,
    "installments": [
      {
        "installmentNumber": 1,
        "amount": 1000.00,
        "status": "DEDUCTED",
        "deductedDate": "2024-01-20T14:30:00.000Z"
      },
      {
        "installmentNumber": 2,
        "amount": 1000.00,
        "status": "DEDUCTED",
        "deductedDate": "2024-02-05T15:00:00.000Z"
      },
      {
        "installmentNumber": 3,
        "amount": 1000.00,
        "status": "FAILED"
      },
      {
        "installmentNumber": 4,
        "amount": 1000.00,
        "status": "PENDING",
        "cutOffDate": "2024-02-29T00:00:00.000Z"
      }
      // ... more installments
    ]
  }
}
```

---

## Admin Dashboard View

### Payroll Administrator Dashboard

**Query Today's Pending Installments:**
```http
GET /api/installment/pending-payroll
```

**Dashboard Metrics:**
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Payroll Cutoff: January 15, 2024
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Total Employees:        450
Pending Installments:   156
Total Amount:           ₱437,500.00
Average per Employee:   ₱2,804.49

Status Breakdown:
  ✓ Ready to Process:   156
  ⚠ Flagged:           3 (insufficient salary)
  ✕ Failed Previous:   2 (need review)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**Export for Payroll System:**
```csv
Employee ID,Employee Name,Order Number,Installment,Amount,Status
67890abcdef123456789,Juan Dela Cruz,ORD-2024-12345,1,1000.00,READY
12345678901234567890,Maria Santos,ORD-2024-12346,3,1500.00,READY
...
```

---

## Timeline Summary

### 6-Month Journey

```
JAN 10  │ Order placed
        │
JAN 15  │ ✓ Installment 1 deducted (₱1,000)
        │
JAN 31  │ ✓ Installment 2 deducted (₱1,000)
        │
FEB 15  │ ✗ Installment 3 failed (insufficient salary)
        │
FEB 29  │ ✓ Installment 4 deducted (₱1,000)
        │
MAR 15  │ ✓ Installment 3 retried & deducted (₱1,000)
        │
MAR 31  │ ✓ Installment 5 deducted (₱1,000)
        │
APR 15  │ ✓ Installment 6 deducted (₱1,000)
        │
APR 30  │ ✓ Installment 7 deducted (₱1,000)
        │
MAY 15  │ ✓ Installment 8 deducted (₱1,000)
        │
MAY 31  │ ✓ Installment 9 deducted (₱1,000)
        │
JUN 15  │ ✓ Installment 10 deducted (₱1,000)
        │
JUN 30  │ ✓ Installment 11 deducted (₱1,000)
        │
JUL 05  │ ✓ Installment 12 deducted (₱1,000)
        │
        │ ✅ FULLY PAID - Order Complete!
```

---

## Key Takeaways

✅ **Automatic Generation** - Installments created when order is placed  
✅ **Bi-Monthly Schedule** - Deductions on 15th and end of month  
✅ **Flexible Handling** - Can handle failed deductions gracefully  
✅ **Complete Tracking** - Full audit trail from start to finish  
✅ **Payroll Integration** - Easy to integrate with existing payroll system  
✅ **Employee Transparency** - Clear visibility of payment schedule  

---

## Next: Start Using the System

Ready to implement? See:
- `INSTALLMENT_QUICK_START.md` for API examples
- `INSTALLMENT_SYSTEM.md` for full documentation
- `INSTALLMENT_SETUP_SUMMARY.md` for implementation checklist
