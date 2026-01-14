# Installment System Documentation

## Overview

The Installment System automatically manages bi-monthly salary deductions for orders. It tracks each deduction through the payroll cycle, from pending status to completion.

## System Architecture

### 1. Order Model
Tracks high-level installment information:
- `installmentMonths`: Number of months for the installment plan (e.g., 3 months)
- `installmentCount`: Total number of deductions (e.g., 6 = 3 months × 2 cut-offs)
- `installmentAmount`: Amount per deduction
- `paymentType`: Must be set to `INSTALLMENT` to trigger auto-generation

### 2. Installment Model
Creates individual records for each deduction:
- `installmentNumber`: Sequence number (1, 2, 3, ...)
- `amount`: Deduction amount for this installment
- `status`: Current status (PENDING, SCHEDULED, DEDUCTED, FAILED, CANCELLED)
- `cutOffDate`: Payroll cutoff date (15th or end of month)
- `scheduledDate`: When payment will be processed (typically 5 days after cutoff)
- `deductedDate`: Actual date when deducted from salary
- `payrollBatchId`: Links to payroll batch for tracking
- `deductionReference`: Reference number for the deduction

## How It Works

### Automatic Installment Generation

When an order is created with `paymentType: "INSTALLMENT"`:

1. **System calculates installment count**: `installmentMonths × 2` (for bi-monthly payroll)
2. **Generates cutoff dates**: Alternates between 15th and end of month
3. **Creates installment records**: One for each cutoff period
4. **Sets scheduled dates**: Typically 5 days after cutoff date
5. **Initializes status**: All installments start as PENDING

### Bi-Monthly Payroll Schedule

The system uses a bi-monthly payroll schedule:
- **First cutoff**: 15th of each month
- **Second cutoff**: Last day of each month (28th, 30th, or 31st)

**Example for 3-month plan starting January 5:**
```
Installment 1: Cutoff Jan 15, Scheduled Jan 20
Installment 2: Cutoff Jan 31, Scheduled Feb 5
Installment 3: Cutoff Feb 15, Scheduled Feb 20
Installment 4: Cutoff Feb 28/29, Scheduled Mar 5
Installment 5: Cutoff Mar 15, Scheduled Mar 20
Installment 6: Cutoff Mar 31, Scheduled Apr 5
```

## API Endpoints

### 1. Create Order with Installments

**POST** `/api/order`

```json
{
  "orderNumber": "ORD-2024-001",
  "employeeId": "507f1f77bcf86cd799439011",
  "total": 6000.00,
  "subtotal": 5500.00,
  "tax": 500.00,
  "paymentType": "INSTALLMENT",
  "installmentMonths": 3,
  "paymentMethod": "PAYROLL_DEDUCTION",
  "status": "APPROVED"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Order created successfully",
  "data": {
    "order": {
      "id": "507f1f77bcf86cd799439011",
      "orderNumber": "ORD-2024-001",
      "total": 6000.00,
      "installmentMonths": 3,
      "installmentCount": 6,
      "installmentAmount": 1000.00,
      ...
    },
    "installments": [
      {
        "id": "507f1f77bcf86cd799439012",
        "installmentNumber": 1,
        "amount": 1000.00,
        "status": "PENDING",
        "cutOffDate": "2024-01-15T00:00:00.000Z",
        "scheduledDate": "2024-01-20T00:00:00.000Z"
      },
      ...
    ],
    "installmentSummary": {
      "totalInstallments": 6,
      "installmentAmount": 1000.00,
      "firstPayment": "2024-01-20T00:00:00.000Z",
      "lastPayment": "2024-04-05T00:00:00.000Z"
    }
  }
}
```

### 2. Get Pending Installments for Payroll

**GET** `/api/installment/pending-payroll?cutoffDate=2024-01-15`

Returns all installments that should be deducted for the specified cutoff date.

**Response:**
```json
{
  "success": true,
  "data": {
    "cutoffDate": "2024-01-15T00:00:00.000Z",
    "totalPending": 25,
    "totalAmount": 125000.00,
    "installments": [
      {
        "id": "507f1f77bcf86cd799439012",
        "installmentNumber": 1,
        "amount": 1000.00,
        "status": "PENDING",
        "cutOffDate": "2024-01-15T00:00:00.000Z",
        "scheduledDate": "2024-01-20T00:00:00.000Z",
        "order": {
          "id": "507f1f77bcf86cd799439011",
          "orderNumber": "ORD-2024-001",
          "employeeId": "507f1f77bcf86cd799439013",
          "total": 6000.00
        }
      },
      ...
    ]
  }
}
```

### 3. Mark Installment as Deducted

**POST** `/api/installment/{installmentId}/deduct`

```json
{
  "payrollBatchId": "BATCH-2024-01-15",
  "deductionReference": "DED-2024-001234"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Installment marked as deducted",
  "data": {
    "installment": {
      "id": "507f1f77bcf86cd799439012",
      "status": "DEDUCTED",
      "deductedDate": "2024-01-20T10:30:00.000Z",
      "payrollBatchId": "BATCH-2024-01-15",
      "deductionReference": "DED-2024-001234"
    }
  }
}
```

### 4. Get Order Installment Summary

**GET** `/api/installment/order/{orderId}/summary`

Returns a comprehensive summary of all installments for a specific order.

**Response:**
```json
{
  "success": true,
  "data": {
    "totalInstallments": 6,
    "paidCount": 2,
    "pendingCount": 4,
    "failedCount": 0,
    "totalAmount": 6000.00,
    "paidAmount": 2000.00,
    "remainingAmount": 4000.00,
    "installments": [
      {
        "id": "507f1f77bcf86cd799439012",
        "installmentNumber": 1,
        "amount": 1000.00,
        "status": "DEDUCTED",
        "cutOffDate": "2024-01-15T00:00:00.000Z",
        "scheduledDate": "2024-01-20T00:00:00.000Z",
        "deductedDate": "2024-01-20T10:30:00.000Z"
      },
      ...
    ]
  }
}
```

## Installment Status Flow

```
PENDING → SCHEDULED → DEDUCTED
    ↓          ↓
  FAILED   CANCELLED
    ↓
PENDING (retry)
```

### Status Definitions

- **PENDING**: Installment created, waiting for cutoff date
- **SCHEDULED**: Cutoff date passed, scheduled for next payroll
- **DEDUCTED**: Successfully deducted from employee salary
- **FAILED**: Deduction failed (insufficient funds, employee terminated, etc.)
- **CANCELLED**: Order cancelled or installment plan modified
- **REFUNDED**: Amount refunded to employee

## Payroll Integration Workflow

### For Payroll Administrators

1. **Before Each Payroll Run** (on cutoff date):
   ```
   GET /api/installment/pending-payroll?cutoffDate=2024-01-15
   ```

2. **Process Each Installment**:
   - Verify employee is active
   - Check salary is sufficient for deduction
   - Deduct from employee salary

3. **After Successful Deduction**:
   ```
   POST /api/installment/{installmentId}/deduct
   {
     "payrollBatchId": "BATCH-2024-01-15",
     "deductionReference": "DED-2024-001234"
   }
   ```

4. **Handle Failed Deductions**:
   ```
   PATCH /api/installment/{installmentId}
   {
     "status": "FAILED",
     "notes": "Insufficient salary balance"
   }
   ```

## Code Examples

### Service Layer Usage

```typescript
import { generateInstallments, markInstallmentAsDeducted } from './helper/installmentService';

// Generate installments for an order
const installments = await generateInstallments(
  prisma,
  orderId,
  3,        // 3 months
  6000.00,  // total amount
  new Date() // start date
);

// Mark as deducted
const updated = await markInstallmentAsDeducted(
  prisma,
  installmentId,
  "BATCH-2024-01-15",
  "DED-2024-001234"
);
```

### Query Installments by Employee

```typescript
const employeeInstallments = await prisma.installment.findMany({
  where: {
    order: {
      employeeId: "507f1f77bcf86cd799439013"
    },
    status: "PENDING"
  },
  include: {
    order: {
      select: {
        orderNumber: true,
        total: true
      }
    }
  },
  orderBy: {
    cutOffDate: 'asc'
  }
});
```

## Database Schema

### Order Table
```prisma
model Order {
  id                String        @id @default(auto()) @map("_id") @db.ObjectId
  orderNumber       String        @unique
  employeeId        String        @db.ObjectId
  total             Float
  paymentType       PaymentType   @default(INSTALLMENT)
  installmentMonths Int?
  installmentCount  Int?
  installmentAmount Float?
  installments      Installment[]
  ...
}
```

### Installment Table
```prisma
model Installment {
  id                 String            @id @default(auto()) @map("_id") @db.ObjectId
  orderId            String            @db.ObjectId
  order              Order             @relation(fields: [orderId], references: [id], onDelete: Cascade)
  installmentNumber  Int
  amount             Float
  status             InstallmentStatus @default(PENDING)
  cutOffDate         DateTime
  scheduledDate      DateTime
  deductedDate       DateTime?
  payrollBatchId     String?
  deductionReference String?
  notes              String?
  ...
}
```

## Best Practices

1. **Always validate employee status** before deducting installments
2. **Keep audit logs** of all installment status changes
3. **Send notifications** to employees about upcoming deductions
4. **Handle edge cases**: employee termination, salary changes, order cancellations
5. **Reconcile regularly**: Compare deducted amounts with payroll records
6. **Provide employee portal**: Let employees view their installment schedule

## Error Handling

### Common Scenarios

1. **Insufficient Salary**: Mark as FAILED, notify employee and admin
2. **Employee Terminated**: Mark remaining as CANCELLED
3. **Order Cancelled**: Cancel all PENDING installments, handle refunds
4. **Payroll System Failure**: Retry with exponential backoff

## Testing

### Test Scenarios

1. Create order with 3-month installment plan
2. Verify 6 installments generated with correct dates
3. Test cutoff date calculation across month boundaries
4. Verify amount distribution (handle rounding in last installment)
5. Test marking installments as deducted
6. Query pending installments for payroll processing

## Future Enhancements

- [ ] Automated notifications before deductions
- [ ] Employee self-service portal
- [ ] Flexible cutoff date configuration
- [ ] Support for weekly/monthly payroll schedules
- [ ] Installment modification (skip, postpone)
- [ ] Integration with HR system for employee validation
- [ ] Automated reconciliation with payroll system
- [ ] Payment plan renegotiation workflow

## Support

For questions or issues, contact the development team or refer to the API documentation.
