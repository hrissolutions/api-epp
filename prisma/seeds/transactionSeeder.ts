import { PrismaClient } from "../../generated/prisma";

export async function seedTransactions(prisma: PrismaClient) {
	console.log("Seeding transactions...");

	const transactions = [
		{
			transactionNumber: "TXN-2024-001",
			employeeId: "507f1f77bcf86cd799439011",
			orderId: "507f1f77bcf86cd799439012",
			type: "INSTALLMENT",
			status: "COMPLETED",
			amount: 1000.00,
			paymentMethod: "INSTALLMENT",
			installmentId: "507f1f77bcf86cd799439013",
			payrollBatchId: "BATCH-2024-01-15",
			payrollReference: "DED-2024-001",
			payrollDate: new Date("2024-01-20"),
			processedBy: "SYSTEM",
			processedAt: new Date("2024-01-20T10:00:00Z"),
			isReconciled: true,
			reconciledAt: new Date("2024-01-21T09:00:00Z"),
			reconciledBy: "admin@company.com",
			notes: "First installment payment",
		},
		{
			transactionNumber: "TXN-2024-002",
			employeeId: "507f1f77bcf86cd799439011",
			orderId: "507f1f77bcf86cd799439014",
			type: "CASH",
			status: "COMPLETED",
			amount: 5000.00,
			paymentMethod: "CASH",
			cashAmount: 5000.00,
			receiptNumber: "RCP-2024-001",
			processedBy: "cashier@company.com",
			processedAt: new Date("2024-01-15T14:30:00Z"),
			isReconciled: false,
			notes: "Cash payment for laptop",
		},
		{
			transactionNumber: "TXN-2024-003",
			employeeId: "507f1f77bcf86cd799439015",
			orderId: "507f1f77bcf86cd799439016",
			type: "POINTS_REDEMPTION",
			status: "COMPLETED",
			amount: 500.00,
			paymentMethod: "POINTS",
			pointsUsed: 5000,
			pointsTransactionId: "PTS-2024-001",
			processedBy: "SYSTEM",
			processedAt: new Date("2024-01-10T11:00:00Z"),
			isReconciled: true,
			reconciledAt: new Date("2024-01-11T09:00:00Z"),
			reconciledBy: "admin@company.com",
			notes: "Points redeemed for merchandise",
		},
		{
			transactionNumber: "TXN-2024-004",
			employeeId: "507f1f77bcf86cd799439011",
			orderId: "507f1f77bcf86cd799439012",
			type: "INSTALLMENT",
			status: "PENDING",
			amount: 1000.00,
			paymentMethod: "INSTALLMENT",
			installmentId: "507f1f77bcf86cd799439017",
			notes: "Second installment - pending payroll",
		},
		{
			transactionNumber: "TXN-2024-005",
			employeeId: "507f1f77bcf86cd799439018",
			orderId: "507f1f77bcf86cd799439019",
			type: "REFUND",
			status: "COMPLETED",
			amount: -1500.00,
			paymentMethod: "CASH",
			cashAmount: 1500.00,
			receiptNumber: "REFUND-2024-001",
			processedBy: "manager@company.com",
			processedAt: new Date("2024-01-18T16:00:00Z"),
			isReconciled: false,
			notes: "Order cancelled - refund issued",
		},
	];

	for (const transaction of transactions) {
		await prisma.transaction.upsert({
			where: { transactionNumber: transaction.transactionNumber },
			update: {},
			create: transaction as any,
		});
	}

	console.log(`Seeded ${transactions.length} transactions`);
}
