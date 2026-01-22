# Transaction System Documentation

## Overview

The Transaction System tracks all payment transactions in the system, including cash payments, installment deductions, points redemption, refunds, and adjustments. It provides comprehensive tracking, reconciliation, and reporting capabilities.

---

## Transaction Model

### Core Fields

| Field               | Type              | Description                                |
| ------------------- | ----------------- | ------------------------------------------ |
| `id`                | String            | Unique transaction identifier              |
| `transactionNumber` | String            | Human-readable transaction number (unique) |
| `employeeId`        | String            | Reference to employee                      |
| `orderId`           | String            | Reference to order                         |
| `type`              | TransactionType   | Type of transaction                        |
| `status`            | TransactionStatus | Current status                             |
| `amount`            | Float             | Transaction amount                         |
| `paymentMethod`     | PaymentMethod     | How payment was made                       |

### Transaction Types

- **PURCHASE** - Full payment for an order
- **INSTALLMENT** - Single installment payment
- **POINTS_REDEMPTION** - Payment using points
- **REFUND** - Money returned to employee
- **ADJUSTMENT** - Manual adjustment (correction)

### Transaction Status

- **PENDING** - Created but not processed
- **PROCESSING** - Being processed
- **COMPLETED** - Successfully completed
- **FAILED** - Failed to process
- **CANCELLED** - Transaction cancelled
- **REVERSED** - Transaction reversed/refunded

### Payment Methods

- **CASH** - One-time cash payment
- **INSTALLMENT** - Salary deduction installment
- **POINTS** - Points redemption
- **MIXED** - Combination of methods

---

## API Endpoints

### 1. Create Transaction

```http
POST /api/transaction
Content-Type: application/json

{
  "transactionNumber": "TXN-2024-001",
  "employeeId": "507f1f77bcf86cd799439011",
  "orderId": "507f1f77bcf86cd799439012",
  "type": "INSTALLMENT",
  "amount": 1000.00,
  "paymentMethod": "INSTALLMENT",
  "installmentId": "507f1f77bcf86cd799439013",
  "notes": "First installment payment"
}
```

### 2. Get All Transactions

```http
GET /api/transaction?document=true&count=true&page=1&limit=10
```

**Query Parameters:**

- `page` - Page number (default: 1)
- `limit` - Items per page (default: 10)
- `order` - Sort order: asc/desc (default: desc)
- `sort` - Field to sort by (default: createdAt)
- `query` - Search query
- `filter` - JSON array of filters
- `document` - Include documents (true/false)
- `count` - Include total count (true/false)
- `pagination` - Include pagination metadata (true/false)

### 3. Get Transaction by ID

```http
GET /api/transaction/{id}
```

### 4. Update Transaction

```http
PATCH /api/transaction/{id}
Content-Type: application/json

{
  "status": "PROCESSING",
  "notes": "Transaction being processed"
}
```

### 5. Delete Transaction

```http
DELETE /api/transaction/{id}
```

### 6. Process Transaction

```http
POST /api/transaction/{id}/process
Content-Type: application/json

{
  "processedBy": "user@company.com",
  "payrollBatchId": "BATCH-2024-01-15",
  "payrollReference": "DED-2024-001",
  "notes": "Processed successfully",
  "metadata": {
    "payrollSystem": "SAP",
    "batchNumber": "12345"
  }
}
```

**Effect:**

- Sets `status` to `COMPLETED`
- Records `processedAt` timestamp
- Records `processedBy` user

### 7. Reconcile Transaction

```http
POST /api/transaction/{id}/reconcile
Content-Type: application/json

{
  "reconciledBy": "admin@company.com",
  "notes": "Reconciled with bank statement"
}
```

**Effect:**

- Sets `isReconciled` to `true`
- Records `reconciledAt` timestamp
- Records `reconciledBy` user

### 8. Get Transactions by Order

```http
GET /api/transaction/order/{orderId}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "orderId": "507f1f77bcf86cd799439012",
    "totalTransactions": 6,
    "totalAmount": 6000.00,
    "completedAmount": 2000.00,
    "pendingAmount": 4000.00,
    "transactions": [...]
  }
}
```

### 9. Get Transactions by Employee

```http
GET /api/transaction/employee/{employeeId}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "employeeId": "507f1f77bcf86cd799439011",
    "totalTransactions": 15,
    "totalAmount": 12000.00,
    "completedAmount": 8000.00,
    "pendingAmount": 4000.00,
    "byType": {
      "PURCHASE": 3,
      "INSTALLMENT": 10,
      "POINTS_REDEMPTION": 2,
      "REFUND": 0,
      "ADJUSTMENT": 0
    },
    "transactions": [...]
  }
}
```

### 10. Get Unreconciled Transactions

```http
GET /api/transaction/unreconciled
```

**Response:**

```json
{
  "success": true,
  "data": {
    "totalUnreconciled": 25,
    "totalAmount": 45000.00,
    "byPaymentMethod": {
      "CASH": 10,
      "INSTALLMENT": 12,
      "POINTS": 3,
      "MIXED": 0
    },
    "transactions": [...]
  }
}
```

---

## Use Cases

### 1. Recording an Installment Payment

When an installment is deducted from payroll:

```javascript
// Create transaction record
POST /api/transaction
{
  "transactionNumber": "TXN-2024-INS-001",
  "employeeId": "emp123",
  "orderId": "ord456",
  "type": "INSTALLMENT",
  "amount": 1000.00,
  "paymentMethod": "INSTALLMENT",
  "installmentId": "inst789",
  "status": "PENDING"
}

// Process after payroll runs
POST /api/transaction/{id}/process
{
  "processedBy": "payroll@company.com",
  "payrollBatchId": "BATCH-2024-01-15",
  "payrollReference": "DED-2024-001"
}

// Reconcile after verification
POST /api/transaction/{id}/reconcile
{
  "reconciledBy": "accounting@company.com",
  "notes": "Verified against payroll report"
}
```

### 2. Cash Payment

```javascript
POST /api/transaction
{
  "transactionNumber": "TXN-2024-CASH-001",
  "employeeId": "emp123",
  "orderId": "ord456",
  "type": "PURCHASE",
  "amount": 5000.00,
  "paymentMethod": "CASH",
  "cashAmount": 5000.00,
  "receiptNumber": "RCP-2024-001",
  "status": "COMPLETED",
  "processedBy": "cashier@company.com"
}
```

### 3. Points Redemption

```javascript
POST /api/transaction
{
  "transactionNumber": "TXN-2024-PTS-001",
  "employeeId": "emp123",
  "orderId": "ord456",
  "type": "POINTS_REDEMPTION",
  "amount": 500.00,
  "paymentMethod": "POINTS",
  "pointsUsed": 5000,
  "pointsTransactionId": "PTS-2024-001",
  "status": "COMPLETED"
}
```

### 4. Refund Processing

```javascript
POST /api/transaction
{
  "transactionNumber": "TXN-2024-REF-001",
  "employeeId": "emp123",
  "orderId": "ord456",
  "type": "REFUND",
  "amount": -1500.00,  // Negative amount for refund
  "paymentMethod": "CASH",
  "cashAmount": 1500.00,
  "receiptNumber": "REFUND-2024-001",
  "status": "COMPLETED",
  "notes": "Order cancelled - full refund"
}
```

---

## Integration Examples

### Installment Payment Integration

```typescript
import { PrismaClient } from "./generated/prisma";

async function recordInstallmentPayment(
	prisma: PrismaClient,
	installmentId: string,
	payrollBatchId: string,
) {
	// Get installment details
	const installment = await prisma.installment.findUnique({
		where: { id: installmentId },
		include: { order: true },
	});

	if (!installment) throw new Error("Installment not found");

	// Create transaction record
	const transaction = await prisma.transaction.create({
		data: {
			transactionNumber: `TXN-${Date.now()}`,
			employeeId: installment.order.employeeId,
			orderId: installment.orderId,
			type: "INSTALLMENT",
			amount: installment.amount,
			paymentMethod: "INSTALLMENT",
			installmentId: installment.id,
			status: "COMPLETED",
			payrollBatchId: payrollBatchId,
			processedBy: "SYSTEM",
			processedAt: new Date(),
		},
	});

	// Update installment status
	await prisma.installment.update({
		where: { id: installmentId },
		data: {
			status: "DEDUCTED",
			deductedDate: new Date(),
			payrollBatchId: payrollBatchId,
		},
	});

	return transaction;
}
```

### Daily Reconciliation Report

```typescript
async function generateReconciliationReport(prisma: PrismaClient, date: Date) {
	const startOfDay = new Date(date.setHours(0, 0, 0, 0));
	const endOfDay = new Date(date.setHours(23, 59, 59, 999));

	const transactions = await prisma.transaction.findMany({
		where: {
			processedAt: {
				gte: startOfDay,
				lte: endOfDay,
			},
			isReconciled: false,
		},
		orderBy: { processedAt: "asc" },
	});

	const summary = {
		date: date,
		totalTransactions: transactions.length,
		totalAmount: transactions.reduce((sum, t) => sum + Number(t.amount), 0),
		byPaymentMethod: {
			CASH: transactions.filter((t) => t.paymentMethod === "CASH").length,
			INSTALLMENT: transactions.filter((t) => t.paymentMethod === "INSTALLMENT").length,
			POINTS: transactions.filter((t) => t.paymentMethod === "POINTS").length,
		},
		transactions,
	};

	return summary;
}
```

---

## Best Practices

### 1. Transaction Numbers

- Use a clear, sequential format: `TXN-YYYY-TYPE-###`
- Examples:
    - `TXN-2024-INS-001` - Installment
    - `TXN-2024-CASH-001` - Cash payment
    - `TXN-2024-PTS-001` - Points redemption
    - `TXN-2024-REF-001` - Refund

### 2. Status Management

Always follow the proper status flow:

```
PENDING → PROCESSING → COMPLETED → RECONCILED

Alternative flows:
PENDING → FAILED (then retry or cancel)
PENDING → CANCELLED
COMPLETED → REVERSED (for refunds)
```

### 3. Reconciliation

- Reconcile transactions daily
- Match with external systems (payroll, banking)
- Keep detailed notes during reconciliation
- Track who reconciled and when

### 4. Metadata Usage

Store additional context in the `metadata` field:

```json
{
	"metadata": {
		"payrollSystem": "SAP",
		"batchNumber": "12345",
		"bankReference": "BNK-REF-001",
		"approvedBy": "manager@company.com",
		"deviceId": "POS-001"
	}
}
```

### 5. Error Handling

- Always validate transaction before processing
- Check for duplicate transaction numbers
- Verify employee and order exist
- Ensure sufficient points/balance for redemptions

---

## Reports & Analytics

### Daily Transaction Summary

```http
GET /api/transaction?document=true&filter=[
  {"processedAt":{"gte":"2024-01-15T00:00:00Z","lte":"2024-01-15T23:59:59Z"}}
]
```

### Monthly Reconciliation Report

```http
GET /api/transaction?document=true&filter=[
  {"isReconciled":false},
  {"status":"COMPLETED"},
  {"processedAt":{"gte":"2024-01-01T00:00:00Z"}}
]
```

### Employee Transaction History

```http
GET /api/transaction/employee/{employeeId}
```

### Order Payment Tracking

```http
GET /api/transaction/order/{orderId}
```

---

## Testing

Run tests:

```bash
npm test -- transaction.controller.spec.ts
```

Test coverage includes:

- Create transaction
- Get all transactions
- Get by ID
- Update transaction
- Process transaction
- Reconcile transaction
- Get by order
- Get by employee
- Get unreconciled
- Delete transaction

---

## Security Considerations

1. **Access Control**: Implement role-based access
    - Employees: View own transactions
    - Managers: View team transactions
    - Admins: Full access

2. **Audit Trail**: All changes are logged
    - Who processed
    - Who reconciled
    - When changes occurred

3. **Data Integrity**:
    - Transaction numbers are unique
    - Amounts cannot be negative (except refunds)
    - Status transitions are validated

---

## Future Enhancements

- [ ] Automated reconciliation with payroll system
- [ ] Email notifications for failed transactions
- [ ] Batch processing for multiple transactions
- [ ] Export to accounting software (QuickBooks, Xero)
- [ ] Transaction reversal workflow
- [ ] Scheduled reports
- [ ] Dashboard with real-time analytics

---

## Support

For questions or issues:

- Review API documentation
- Check error logs
- Contact development team
