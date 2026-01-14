import { PrismaClient } from "../generated/prisma";
import { getLogger } from "./logger";

const logger = getLogger();
const transactionLogger = logger.child({ module: "transactionService" });

/**
 * Create a transaction ledger for an order
 */
export async function createTransactionForOrder(
	prisma: PrismaClient,
	orderId: string,
	employeeId: string,
	totalAmount: number,
	paymentType: string,
	paymentMethod: any
) {
	try {
		const transactionNumber = `TXN-${Date.now()}`;

		const transaction = await prisma.transaction.create({
			data: {
				transactionNumber,
				employeeId,
				orderId,
				type: paymentType === "INSTALLMENT" ? "INSTALLMENT" : "PURCHASE",
				status: "PENDING",
				totalAmount,
				paidAmount: 0,
				balance: totalAmount,
				paymentMethod: paymentMethod as any,
				paymentHistory: [],
			},
		});

		transactionLogger.info(
			`Transaction ledger created for order ${orderId}: ${transactionNumber}`
		);

		return transaction;
	} catch (error) {
		transactionLogger.error(`Failed to create transaction for order ${orderId}:`, error);
		throw error;
	}
}

/**
 * Record an installment payment
 */
export async function recordInstallmentPayment(
	prisma: PrismaClient,
	orderId: string,
	installmentId: string,
	amount: number,
	paymentDetails?: {
		payrollBatchId?: string;
		payrollReference?: string;
		payrollDate?: Date;
		processedBy?: string;
		notes?: string;
	}
) {
	try {
		// Get the transaction for this order
		const transaction = await prisma.transaction.findFirst({
			where: { orderId },
		});

		if (!transaction) {
			throw new Error(`Transaction not found for order ${orderId}`);
		}

		// Get current payment history
		const paymentHistory = (transaction.paymentHistory as any[]) || [];

		// Add new payment record
		const paymentRecord = {
			installmentId,
			amount,
			paidAt: new Date(),
			payrollBatchId: paymentDetails?.payrollBatchId,
			payrollReference: paymentDetails?.payrollReference,
			payrollDate: paymentDetails?.payrollDate,
			processedBy: paymentDetails?.processedBy,
			notes: paymentDetails?.notes,
		};

		paymentHistory.push(paymentRecord);

		// Calculate new amounts
		const newPaidAmount = transaction.paidAmount + amount;
		const newBalance = transaction.totalAmount - newPaidAmount;
		const isFullyPaid = newBalance <= 0;

		// Update transaction
		const updatedTransaction = await prisma.transaction.update({
			where: { id: transaction.id },
			data: {
				paidAmount: newPaidAmount,
				balance: newBalance,
				status: isFullyPaid ? "COMPLETED" : "PROCESSING",
				paymentHistory: paymentHistory as any,
			},
		});

		transactionLogger.info(
			`Payment recorded for order ${orderId}: ` +
			`Paid ${amount}, Total Paid: ${newPaidAmount}/${transaction.totalAmount}, ` +
			`Balance: ${newBalance}, Status: ${updatedTransaction.status}`
		);

		return updatedTransaction;
	} catch (error) {
		transactionLogger.error(`Failed to record payment for order ${orderId}:`, error);
		throw error;
	}
}

/**
 * Get transaction summary for an order
 */
export async function getTransactionSummary(prisma: PrismaClient, orderId: string) {
	try {
		const transaction = await prisma.transaction.findFirst({
			where: { orderId },
		});

		if (!transaction) {
			return null;
		}

		const paymentHistory = (transaction.paymentHistory as any[]) || [];

		return {
			transactionNumber: transaction.transactionNumber,
			totalAmount: transaction.totalAmount,
			paidAmount: transaction.paidAmount,
			balance: transaction.balance,
			status: transaction.status,
			paymentCount: paymentHistory.length,
			lastPayment: paymentHistory.length > 0 
				? paymentHistory[paymentHistory.length - 1] 
				: null,
			paymentHistory,
		};
	} catch (error) {
		transactionLogger.error(`Failed to get transaction summary for order ${orderId}:`, error);
		throw error;
	}
}

/**
 * Reconcile transaction
 */
export async function reconcileTransaction(
	prisma: PrismaClient,
	orderId: string,
	reconciledBy: string,
	notes?: string
) {
	try {
		const transaction = await prisma.transaction.findFirst({
			where: { orderId },
		});

		if (!transaction) {
			throw new Error(`Transaction not found for order ${orderId}`);
		}

		if (transaction.isReconciled) {
			throw new Error(`Transaction already reconciled for order ${orderId}`);
		}

		const updatedTransaction = await prisma.transaction.update({
			where: { id: transaction.id },
			data: {
				isReconciled: true,
				reconciledAt: new Date(),
				reconciledBy,
				notes: notes || transaction.notes,
			},
		});

		transactionLogger.info(
			`Transaction reconciled for order ${orderId} by ${reconciledBy}`
		);

		return updatedTransaction;
	} catch (error) {
		transactionLogger.error(`Failed to reconcile transaction for order ${orderId}:`, error);
		throw error;
	}
}

/**
 * Get all unreconciled transactions
 */
export async function getUnreconciledTransactions(prisma: PrismaClient) {
	try {
		const transactions = await prisma.transaction.findMany({
			where: {
				isReconciled: false,
				status: "COMPLETED",
			},
			orderBy: { updatedAt: "asc" },
		});

		const summary = {
			totalUnreconciled: transactions.length,
			totalAmount: transactions.reduce((sum, t) => sum + t.totalAmount, 0),
			totalPaid: transactions.reduce((sum, t) => sum + t.paidAmount, 0),
			transactions,
		};

		transactionLogger.info(
			`Found ${transactions.length} unreconciled transactions`
		);

		return summary;
	} catch (error) {
		transactionLogger.error("Failed to get unreconciled transactions:", error);
		throw error;
	}
}
