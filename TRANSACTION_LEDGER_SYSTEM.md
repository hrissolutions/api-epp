# 💰 Transaction Ledger System - Complete Guide

## ✅ Updated Approach: ONE Transaction Per Order

Your Transaction system now works as a **payment ledger** that tracks the total paid and balance for each order.

---

## 📊 How It Works

### When Order is Created (3-month installment, ₱6,000)

```
✅ 1 Order record (total: ₱6,000, 3 months)
✅ 6 Installment records (payment schedule)
✅ 1 Transaction record (payment ledger)
   {
     transactionNumber: "TXN-1736758219913",
     totalAmount: 6000.00,
     paidAmount: 0.00,
     balance: 6000.00,
     status: PENDING,
     paymentHistory: []
   }
```

### When Each Installment is Paid

**Cut-off 1 (Jan 15 - ₱1,000 deducted):**
```typescript
// 1. Mark installment as deducted
POST /api/installment/{id}/deduct
{
  "payrollBatchId": "BATCH-2024-01-15",
  "deductionReference": "DED-001"
}

// 2. System automatically updates transaction:
{
  totalAmount: 6000.00,
  paidAmount: 1000.00,     // 0 + 1000
  balance: 5000.00,         // 6000 - 1000
  status: PROCESSING,
  paymentHistory: [
    {
      installmentId: "inst_1",
      amount: 1000.00,
      paidAt: "2024-01-20T10:00:00Z",
      payrollBatchId: "BATCH-2024-01-15"
    }
  ]
}
```

**Cut-off 2 (Jan 31 - ₱1,000 deducted):**
```typescript
{
  totalAmount: 6000.00,
  paidAmount: 2000.00,     // 1000 + 1000
  balance: 4000.00,         // 6000 - 2000
  status: PROCESSING,
  paymentHistory: [
    {
      installmentId: "inst_1",
      amount: 1000.00,
      paidAt: "2024-01-20T10:00:00Z"
    },
    {
      installmentId: "inst_2",
      amount: 1000.00,
      paidAt: "2024-02-05T10:00:00Z"
    }
  ]
}
```

**After All 6 Installments:**
```typescript
{
  totalAmount: 6000.00,
  paidAmount: 6000.00,     // Fully paid!
  balance: 0.00,
  status: COMPLETED,       // ✅ Auto-updated when balance = 0
  paymentHistory: [...6 payments]
}
```

---

## 🎯 Key Benefits

### 1. **Single Source of Truth**
- ONE transaction per order
- All payment activity tracked in one place
- Easy to query: "How much has been paid?"

### 2. **Real-time Balance**
```typescript
// Get current balance for an order
const transaction = await prisma.transaction.findFirst({
  where: { orderId: 'order_123' }
});

console.log(`Paid: ₱${transaction.paidAmount}`);
console.log(`Balance: ₱${transaction.balance}`);
console.log(`Progress: ${(transaction.paidAmount / transaction.totalAmount * 100).toFixed(1)}%`);
```

### 3. **Complete Payment History**
Every installment payment is recorded in `paymentHistory`:
```json
{
  "paymentHistory": [
    {
      "installmentId": "inst_1",
      "amount": 1000.00,
      "paidAt": "2024-01-20T10:00:00Z",
      "payrollBatchId": "BATCH-2024-01-15",
      "payrollReference": "DED-001",
      "processedBy": "SYSTEM"
    },
    ...
  ]
}
```

### 4. **Automatic Status Updates**
- `PENDING` - No payments yet
- `PROCESSING` - Some payments made (balance > 0)
- `COMPLETED` - Fully paid (balance = 0)

---

## 📋 Database Schema

### Transaction Model

```prisma
model Transaction {
  id                String @id @default(auto()) @map("_id") @db.ObjectId
  transactionNumber String @unique

  // Links
  employeeId String @db.ObjectId
  orderId    String @db.ObjectId @unique // ONE per order

  // Details
  type   TransactionType
  status TransactionStatus @default(PENDING)
  
  // Ledger (the important part!)
  totalAmount Float        // Total order amount
  paidAmount  Float @default(0)  // Amount paid so far
  balance     Float        // Remaining balance

  // Payment method
  paymentMethod PaymentMethod

  // Payment history
  paymentHistory Json? // Array of payment records

  // Reconciliation
  isReconciled Boolean @default(false)
  reconciledAt DateTime?
  reconciledBy String?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@map("transactions")
}
```

---

## 🚀 API Usage

### 1. Get Transaction for Order

```http
GET /api/transaction/order/{orderId}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "orderId": "6965fa33e5c8e3f211870959",
    "totalTransactions": 1,
    "totalAmount": 6000.00,
    "paidAmount": 2000.00,
    "balance": 4000.00,
    "transactions": [
      {
        "id": "...",
        "transactionNumber": "TXN-1736758219913",
        "totalAmount": 6000.00,
        "paidAmount": 2000.00,
        "balance": 4000.00,
        "status": "PROCESSING",
        "paymentHistory": [...]
      }
    ]
  }
}
```

### 2. Mark Installment as Deducted (Auto-updates Transaction)

```http
POST /api/installment/{installmentId}/deduct
{
  "payrollBatchId": "BATCH-2024-01-15",
  "deductionReference": "DED-001"
}
```

**What Happens:**
1. ✅ Installment status: PENDING → DEDUCTED
2. ✅ Transaction updated automatically:
   - `paidAmount` += installment amount
   - `balance` -= installment amount
   - Payment added to `paymentHistory`
   - Status updated if fully paid

### 3. Get Order Transaction Summary

```http
GET /api/transaction/order/{orderId}
```

---

## 💡 Real-World Example

### Scenario: Juan orders ₱12,000 laptop (6-month installment)

**Day 1 - Order Created:**
```json
{
  "order": { "total": 12000, "months": 6 },
  "installments": 12,  // 6 months × 2 cutoffs
  "transaction": {
    "totalAmount": 12000.00,
    "paidAmount": 0.00,
    "balance": 12000.00,
    "status": "PENDING"
  }
}
```

**Jan 15 - First Deduction (₱1,000):**
```json
{
  "transaction": {
    "totalAmount": 12000.00,
    "paidAmount": 1000.00,    // ✅ Updated
    "balance": 11000.00,       // ✅ Updated
    "status": "PROCESSING",    // ✅ Changed
    "paymentHistory": [
      {
        "installmentId": "inst_1",
        "amount": 1000.00,
        "paidAt": "2024-01-20",
        "payrollBatchId": "BATCH-2024-01-15"
      }
    ]
  }
}
```

**Jan 31 - Second Deduction (₱1,000):**
```json
{
  "transaction": {
    "totalAmount": 12000.00,
    "paidAmount": 2000.00,    // ✅ 1000 + 1000
    "balance": 10000.00,       // ✅ 12000 - 2000
    "status": "PROCESSING",
    "paymentHistory": [...2 payments]
  }
}
```

**After 12 Installments - Fully Paid:**
```json
{
  "transaction": {
    "totalAmount": 12000.00,
    "paidAmount": 12000.00,    // ✅ Fully paid!
    "balance": 0.00,
    "status": "COMPLETED",     // ✅ Auto-completed
    "paymentHistory": [...12 payments]
  }
}
```

---

## 📊 Reporting & Analytics

### Get All Pending Payments
```typescript
const pendingTransactions = await prisma.transaction.findMany({
  where: {
    balance: { gt: 0 },
    status: { in: ['PENDING', 'PROCESSING'] }
  }
});
```

### Get Unreconciled Transactions
```http
GET /api/transaction/unreconciled
```

### Employee Payment History
```http
GET /api/transaction/employee/{employeeId}
```

**Response:**
```json
{
  "employeeId": "507f1f77bcf86cd799439011",
  "totalTransactions": 3,
  "totalAmount": 18000.00,
  "totalPaid": 12000.00,
  "totalBalance": 6000.00,
  "transactions": [...]
}
```

---

## 🔄 Workflow Integration

### Payroll Processing

**On Cutoff Date (15th or End of Month):**

```typescript
// 1. Get pending installments
const pendingInstallments = await getPendingInstallmentsForPayroll(
  prisma,
  new Date('2024-01-15')
);

// 2. Process each deduction
for (const installment of pendingInstallments) {
  // Deduct from employee salary in payroll system
  
  // 3. Mark as deducted (this auto-updates the transaction ledger)
  await markInstallmentAsDeducted(
    prisma,
    installment.id,
    "BATCH-2024-01-15",
    `DED-${installment.id}`
  );
}

// 4. Transaction ledger automatically updated!
// - paidAmount increased
// - balance decreased
// - paymentHistory updated
// - status changed if fully paid
```

---

## ✅ Summary

### The Flow:

```
1. Order Created
   └─> Transaction created with balance = total

2. Each Installment Deducted
   └─> Transaction updated:
       - paidAmount += installment
       - balance -= installment
       - paymentHistory.push(payment)
       - status updated if balance = 0

3. Query Anytime
   └─> Get current paid/balance from Transaction
```

### Key Points:

- ✅ **ONE Transaction per Order** (payment ledger)
- ✅ **Real-time Balance** tracking
- ✅ **Complete Payment History** in one place
- ✅ **Automatic Status Updates**
- ✅ **Simple Queries** for reporting

---

## 🎯 Next Steps

1. **Restart your server:**
   ```bash
   npm run dev
   ```

2. **Test the flow:**
   - Create order with installments
   - Mark installment as deducted
   - Check transaction updated automatically

3. **Query transaction:**
   ```http
   GET /api/transaction/order/{orderId}
   ```

---

**Your Transaction Ledger system is ready! 🎉**
