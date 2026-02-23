# Installment System - Quick Start Guide

## Overview

This guide shows you how to set up installments for orders with bi-monthly salary deductions.

## Quick Example

### Step 1: Create an Order with Installments

```bash
POST /api/order
Content-Type: application/json

{
  "orderNumber": "ORD-2024-001",
  "employeeId": "507f1f77bcf86cd799439011",
  "subtotal": 5500.00,
  "tax": 500.00,
  "total": 6000.00,
  "paymentType": "INSTALLMENT",
  "installmentMonths": 3,
  "paymentMethod": "PAYROLL_DEDUCTION"
}
```

✅ **Result**: System automatically creates 6 installments (3 months × 2 cutoffs)

### Step 2: System Generates Installments Automatically

The system will create:

- 6 installment records
- Each with `amount: 1000.00` (6000 ÷ 6)
- Cutoff dates: 15th and end of month
- All with status: `PENDING`

### Step 3: View Installments for an Order

```bash
GET /api/installment/order/507f1f77bcf86cd799439011/summary
```

**Response:**

```json
{
  "totalInstallments": 6,
  "paidCount": 0,
  "pendingCount": 6,
  "remainingAmount": 6000.00,
  "installments": [...]
}
```

### Step 4: Payroll Processing (on cutoff date)

```bash
GET /api/installment/pending-payroll?cutoffDate=2024-01-15
```

This returns all installments due for deduction on Jan 15, 2024.

### Step 5: Mark as Deducted (after payroll processes)

```bash
POST /api/installment/507f1f77bcf86cd799439012/deduct
Content-Type: application/json

{
  "payrollBatchId": "BATCH-2024-01-15",
  "deductionReference": "DED-2024-001234"
}
```

## Bi-Monthly Schedule

| Month | Cutoff 1 | Cutoff 2  |
| ----- | -------- | --------- |
| Jan   | Jan 15   | Jan 31    |
| Feb   | Feb 15   | Feb 28/29 |
| Mar   | Mar 15   | Mar 31    |
| Apr   | Apr 15   | Apr 30    |
| May   | May 15   | May 31    |
| Jun   | Jun 15   | Jun 30    |

## Example: 3-Month Installment Plan

**Order Details:**

- Total: ₱6,000
- Months: 3
- Start Date: January 5, 2024

**Generated Installments:**

| #   | Amount | Cutoff Date | Scheduled Date | Status  |
| --- | ------ | ----------- | -------------- | ------- |
| 1   | ₱1,000 | Jan 15      | Jan 20         | PENDING |
| 2   | ₱1,000 | Jan 31      | Feb 5          | PENDING |
| 3   | ₱1,000 | Feb 15      | Feb 20         | PENDING |
| 4   | ₱1,000 | Feb 28      | Mar 5          | PENDING |
| 5   | ₱1,000 | Mar 15      | Mar 20         | PENDING |
| 6   | ₱1,000 | Mar 31      | Apr 5          | PENDING |

## Payment Statuses

| Status    | Description                       |
| --------- | --------------------------------- |
| PENDING   | Waiting for cutoff date           |
| SCHEDULED | Ready for payroll deduction       |
| DEDUCTED  | Successfully deducted from salary |
| FAILED    | Deduction failed (retry needed)   |
| CANCELLED | Order cancelled or modified       |

## Common Use Cases

### 1. Check Employee's Upcoming Deductions

```bash
GET /api/installment?filter=[{"order.employeeId":"507f1f77bcf86cd799439011"},{"status":"PENDING"}]&sort=cutOffDate&order=asc
```

### 2. Process Today's Payroll Deductions

```bash
# Get pending installments
GET /api/installment/pending-payroll

# For each installment, mark as deducted
POST /api/installment/{id}/deduct
{
  "payrollBatchId": "BATCH-2024-01-15"
}
```

### 3. Handle Failed Deduction

```bash
PATCH /api/installment/{id}
{
  "status": "FAILED",
  "notes": "Insufficient salary balance"
}
```

### 4. Cancel Remaining Installments

```bash
# If order is cancelled, update remaining installments
PATCH /api/installment/{id}
{
  "status": "CANCELLED",
  "notes": "Order cancelled by employee"
}
```

## Integration with Payroll System

### Recommended Workflow:

```
1. On Payroll Cutoff Date (15th or end of month)
   └─> GET /api/installment/pending-payroll

2. For Each Employee in Payroll
   ├─> Check employee active status
   ├─> Verify sufficient salary
   └─> Calculate total deductions

3. Process Payroll
   └─> Deduct installment amounts from salary

4. After Successful Payroll
   └─> POST /api/installment/{id}/deduct (for each installment)

5. Handle Failures
   └─> PATCH /api/installment/{id} with status: "FAILED"
```

## Configuration

The installment service is configured in `helper/installmentService.ts`:

```typescript
const PAYROLL_CUTOFFS = {
	FIRST: 15, // First cutoff: 15th of month
	SECOND: "END_OF_MONTH", // Second cutoff: last day
};

// Days after cutoff for scheduled payment
const DAYS_AFTER_CUTOFF = 5;
```

## Testing Your Setup

### 1. Create Test Order

```bash
curl -X POST http://localhost:3000/api/order \
  -H "Content-Type: application/json" \
  -d '{
    "orderNumber": "TEST-001",
    "employeeId": "507f1f77bcf86cd799439011",
    "total": 1200.00,
    "subtotal": 1100.00,
    "tax": 100.00,
    "paymentType": "INSTALLMENT",
    "installmentMonths": 2
  }'
```

### 2. Verify Installments Created

```bash
curl http://localhost:3000/api/installment/order/{orderId}/summary
```

Expected: 4 installments (2 months × 2 cutoffs), each ₱300

### 3. Test Payroll Query

```bash
curl "http://localhost:3000/api/installment/pending-payroll?cutoffDate=2024-01-15"
```

### 4. Test Mark as Deducted

```bash
curl -X POST http://localhost:3000/api/installment/{id}/deduct \
  -H "Content-Type: application/json" \
  -d '{
    "payrollBatchId": "TEST-BATCH-001",
    "deductionReference": "TEST-DED-001"
  }'
```

## Troubleshooting

### Issue: Installments not generated

**Solution**: Ensure `paymentType: "INSTALLMENT"` and `installmentMonths` is set

### Issue: Wrong number of installments

**Solution**: Count = installmentMonths × 2 (for bi-monthly payroll)

### Issue: Incorrect cutoff dates

**Solution**: Check system date and timezone settings

### Issue: Cannot mark as deducted

**Solution**: Verify installment exists and status is PENDING or SCHEDULED

## Need Help?

- 📖 See full documentation: `docs/INSTALLMENT_SYSTEM.md`
- 💬 Contact development team
- 🐛 Report issues on GitHub

## Next Steps

1. ✅ Set up database migrations
2. ✅ Test API endpoints
3. ✅ Integrate with payroll system
4. ✅ Set up employee notifications
5. ✅ Create admin dashboard for monitoring
