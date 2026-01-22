import { PrismaClient } from "../generated/prisma";
import { getLogger } from "./logger";
import { recordInstallmentPayment } from "./transactionService";

const logger = getLogger();
const installmentLogger = logger.child({ module: "installmentService" });

/**
 * Configuration for payroll cutoff dates
 * Bi-monthly payroll: 15th and end of month
 */
const PAYROLL_CUTOFFS = {
	FIRST: 15, // First cutoff: 15th of the month
	SECOND: "END_OF_MONTH", // Second cutoff: last day of the month
};

/**
 * Calculate the cutoff dates for bi-monthly payroll
 * Returns array of dates representing each cutoff period
 */
export function calculateCutoffDates(startDate: Date, installmentCount: number): Date[] {
	const cutoffDates: Date[] = [];
	let currentDate = new Date(startDate);

	// Start from the next available cutoff
	const day = currentDate.getDate();

	for (let i = 0; i < installmentCount; i++) {
		let cutoffDate: Date;

		// Determine if this should be 15th or end of month
		if (i % 2 === 0) {
			// First cutoff of the month (15th)
			if (day <= PAYROLL_CUTOFFS.FIRST) {
				// If before or on 15th of current month, use this month's 15th
				cutoffDate = new Date(
					currentDate.getFullYear(),
					currentDate.getMonth(),
					PAYROLL_CUTOFFS.FIRST,
				);
			} else {
				// If after 15th, move to next month's 15th
				cutoffDate = new Date(
					currentDate.getFullYear(),
					currentDate.getMonth() + 1,
					PAYROLL_CUTOFFS.FIRST,
				);
			}
		} else {
			// Second cutoff of the month (end of month)
			const month = currentDate.getMonth();
			const year = currentDate.getFullYear();
			// Get last day of current month
			cutoffDate = new Date(year, month + 1, 0); // Day 0 of next month = last day of current month
		}

		cutoffDates.push(cutoffDate);

		// Move to the next cutoff period
		if (i % 2 === 0) {
			// After 15th, stay in same month for end-of-month
			currentDate = new Date(cutoffDate);
		} else {
			// After end of month, move to next month's 15th
			currentDate = new Date(cutoffDate.getFullYear(), cutoffDate.getMonth() + 1, 1);
		}
	}

	return cutoffDates;
}

/**
 * Calculate scheduled payment date (typically 3-5 days after cutoff)
 */
export function calculateScheduledDate(cutoffDate: Date, daysAfter: number = 5): Date {
	const scheduledDate = new Date(cutoffDate);
	scheduledDate.setDate(scheduledDate.getDate() + daysAfter);
	return scheduledDate;
}

/**
 * Generate installment records for an order
 * @param prisma - PrismaClient instance
 * @param orderId - The order ID
 * @param installmentMonths - Number of months for installment plan
 * @param totalAmount - Total amount to be paid
 * @param startDate - Start date for installment calculation (defaults to now)
 */
export async function generateInstallments(
	prisma: PrismaClient,
	orderId: string,
	installmentMonths: number,
	totalAmount: number,
	startDate: Date = new Date(),
) {
	try {
		// Calculate installment count (2 per month for bi-monthly payroll)
		const installmentCount = installmentMonths * 2;

		// Calculate amount per installment
		const installmentAmount = parseFloat((totalAmount / installmentCount).toFixed(2));

		// Adjust last installment to account for rounding
		const lastInstallmentAmount = parseFloat(
			(totalAmount - installmentAmount * (installmentCount - 1)).toFixed(2),
		);

		installmentLogger.info(
			`Generating ${installmentCount} installments for order ${orderId}: ` +
				`${installmentMonths} months × 2 cutoffs = ${installmentCount} installments`,
		);

		// Calculate cutoff dates
		const cutoffDates = calculateCutoffDates(startDate, installmentCount);

		// Create installment records
		const installments = [];
		for (let i = 0; i < installmentCount; i++) {
			const cutoffDate = cutoffDates[i];
			const scheduledDate = calculateScheduledDate(cutoffDate);
			const amount = i === installmentCount - 1 ? lastInstallmentAmount : installmentAmount;

			const installment = await prisma.installment.create({
				data: {
					orderId,
					installmentNumber: i + 1,
					amount,
					status: "PENDING",
					cutOffDate: cutoffDate,
					scheduledDate: scheduledDate,
					notes: `Installment ${i + 1} of ${installmentCount} for ${installmentMonths}-month plan`,
				},
			});

			installments.push(installment);

			installmentLogger.info(
				`Created installment ${i + 1}/${installmentCount}: ` +
					`Amount=${amount}, CutOff=${cutoffDate.toISOString().split("T")[0]}, ` +
					`Scheduled=${scheduledDate.toISOString().split("T")[0]}`,
			);
		}

		installmentLogger.info(
			`Successfully generated ${installments.length} installments for order ${orderId}`,
		);

		return installments;
	} catch (error) {
		installmentLogger.error(`Failed to generate installments for order ${orderId}:`, error);
		throw error;
	}
}

/**
 * Update installment status when payment is deducted
 */
export async function markInstallmentAsDeducted(
	prisma: PrismaClient,
	installmentId: string,
	payrollBatchId?: string,
	deductionReference?: string,
) {
	try {
		// Get the installment details
		const installment = await prisma.installment.findUnique({
			where: { id: installmentId },
		});

		if (!installment) {
			throw new Error(`Installment ${installmentId} not found`);
		}

		// Update installment status
		const updatedInstallment = await prisma.installment.update({
			where: { id: installmentId },
			data: {
				status: "DEDUCTED",
				deductedDate: new Date(),
				payrollBatchId,
				deductionReference,
			},
		});

		installmentLogger.info(
			`Installment ${installmentId} marked as DEDUCTED ` +
				`(batch: ${payrollBatchId}, ref: ${deductionReference})`,
		);

		// Record payment in transaction ledger
		try {
			await recordInstallmentPayment(
				prisma,
				installment.orderId,
				installmentId,
				installment.amount,
				{
					payrollBatchId,
					payrollReference: deductionReference,
					payrollDate: new Date(),
					processedBy: "SYSTEM",
					notes: `Installment ${installment.installmentNumber} deducted`,
				},
			);
			installmentLogger.info(
				`Payment recorded in transaction ledger for installment ${installmentId}`,
			);
		} catch (transactionError) {
			installmentLogger.error(
				`Failed to record payment in transaction ledger:`,
				transactionError,
			);
			// Don't fail the entire operation if transaction update fails
		}

		return updatedInstallment;
	} catch (error) {
		installmentLogger.error(`Failed to mark installment ${installmentId} as deducted:`, error);
		throw error;
	}
}

/**
 * Get pending installments for payroll processing
 * Returns installments that are due (cutoff date has passed but not yet deducted)
 */
export async function getPendingInstallmentsForPayroll(
	prisma: PrismaClient,
	cutoffDate: Date = new Date(),
) {
	try {
		const pendingInstallments = await prisma.installment.findMany({
			where: {
				status: "PENDING",
				cutOffDate: {
					lte: cutoffDate,
				},
			},
			include: {
				order: {
					select: {
						id: true,
						orderNumber: true,
						employeeId: true,
						total: true,
					},
				},
			},
			orderBy: {
				cutOffDate: "asc",
			},
		});

		installmentLogger.info(
			`Found ${pendingInstallments.length} pending installments for cutoff date ${cutoffDate.toISOString().split("T")[0]}`,
		);

		return pendingInstallments;
	} catch (error) {
		installmentLogger.error("Failed to get pending installments:", error);
		throw error;
	}
}

/**
 * Get installment summary for an order
 */
export async function getOrderInstallmentSummary(prisma: PrismaClient, orderId: string) {
	try {
		const installments = await prisma.installment.findMany({
			where: { orderId },
			orderBy: { installmentNumber: "asc" },
		});

		const summary = {
			totalInstallments: installments.length,
			paidCount: installments.filter((i) => i.status === "DEDUCTED").length,
			pendingCount: installments.filter((i) => i.status === "PENDING").length,
			failedCount: installments.filter((i) => i.status === "FAILED").length,
			totalAmount: installments.reduce((sum, i) => sum + i.amount, 0),
			paidAmount: installments
				.filter((i) => i.status === "DEDUCTED")
				.reduce((sum, i) => sum + i.amount, 0),
			remainingAmount: installments
				.filter((i) => i.status === "PENDING" || i.status === "FAILED")
				.reduce((sum, i) => sum + i.amount, 0),
			installments,
		};

		return summary;
	} catch (error) {
		installmentLogger.error(`Failed to get installment summary for order ${orderId}:`, error);
		throw error;
	}
}
