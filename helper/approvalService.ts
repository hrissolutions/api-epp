import { PrismaClient } from "../generated/prisma";
import { getLogger } from "./logger";
import {
	sendApprovalRequestEmail,
	sendNextApprovalNotification,
	sendOrderApprovedEmail,
	sendOrderRejectedEmail,
} from "./email.helper";
import { deductStockForOrder, restoreStockForOrder, validateStockForOrder } from "./stockService";
import { invalidateCache } from "../middleware/cache";
import {
	getFinancierConfigByUserId,
	getUsedCreditForFinancierConfig,
	getRateForInstallmentCount,
} from "./financierHelper";
import {
	notifyApprovalChainCreated,
	notifyApprovalDecision,
	notifyNextApproverTurn,
	notifyOrderFullyApproved,
	notifyOrderRejected,
	notifyOrderOwnerApproved,
	notifyOrderOwnerRejected,
} from "./socketOrderApproval";
import { createOrderApprovedSupplierNotifications } from "./orderApprovedSupplierNotification";
import type { Server } from "socket.io";

const logger = getLogger();
const approvalLogger = logger.child({ module: "approvalService" });

/**
 * Create an "order approved" notification for the employee (idempotent).
 */
export const createOrderApprovedNotificationIfNeeded = async (
	prisma: PrismaClient,
	orderId: string,
) => {
	try {
		const order = await prisma.order.findUnique({
			where: { id: orderId },
			select: {
				id: true,
				orderNumber: true,
				userId: true,
				total: true,
				status: true,
				isFullyApproved: true,
				approvedAt: true,
			},
		});

		if (!order) return;
		if (!(order.status === "APPROVED" || order.isFullyApproved)) return;

		// Avoid duplicates (no unique index on Notification)
		const existing = await prisma.notification.findFirst({
			where: {
				source: order.id,
				category: "order_approved",
				isDeleted: false,
			},
			select: { id: true },
		});
		if (existing) return;

		await prisma.notification.create({
			data: {
				source: order.id,
				category: "order_approved",
				title: `Order ${order.orderNumber} approved`,
				description: `Your order ${order.orderNumber} has been approved.`,
				recipients: {
					read: [],
					unread: [{ user: order.userId, date: new Date() }],
				},
				metadata: {
					orderId: order.id,
					orderNumber: order.orderNumber,
					total: order.total,
					approvedAt: order.approvedAt,
				},
				isDeleted: false,
			},
		});

		try {
			await invalidateCache.byPattern("cache:notification:list:*");
		} catch (cacheError) {
			approvalLogger.warn("Failed to invalidate notification cache:", cacheError);
		}
	} catch (error) {
		approvalLogger.error(`Failed to create order approved notification: ${error}`);
	}
};

/**
 * Find matching workflow for an order based on amount and payment type
 */
export const findMatchingWorkflow = async (
	prisma: PrismaClient,
	orderTotal: number,
	paymentType: string,
) => {
	try {
		// Find all active workflows
		const workflowsRaw = await prisma.approvalWorkflow.findMany({
			where: { isActive: true },
			include: {
				workflowLevels: {
					include: { approvalType: true },
					orderBy: { level: "asc" },
				},
			},
		});

		// Sort so narrowest range wins: ascending by maxOrderAmount, nulls last.
		// Then for order total 1000 we try Small (max 1000) first, then Medium (max 5000), etc.
		const workflows = [...workflowsRaw].sort((a, b) => {
			if (a.maxOrderAmount == null && b.maxOrderAmount == null) return 0;
			if (a.maxOrderAmount == null) return 1;
			if (b.maxOrderAmount == null) return -1;
			return a.maxOrderAmount - b.maxOrderAmount;
		});

		// Match workflow based on conditions
		approvalLogger.info(
			`Searching for matching workflow: Order total=${orderTotal}, Payment type=${paymentType}, Active workflows=${workflows.length}`,
		);

		for (const workflow of workflows) {
			approvalLogger.debug(
				`Checking workflow "${workflow.name}": ` +
					`requiresInstallment=${workflow.requiresInstallment}, ` +
					`minAmount=${workflow.minOrderAmount}, ` +
					`maxAmount=${workflow.maxOrderAmount}, ` +
					`levels=${workflow.workflowLevels.length}`,
			);

			// Check installment requirement
			if (workflow.requiresInstallment && paymentType !== "INSTALLMENT") {
				approvalLogger.debug(
					`Workflow "${workflow.name}" requires INSTALLMENT but payment type is ${paymentType}`,
				);
				continue;
			}

			// Check amount range
			if (workflow.minOrderAmount !== null && orderTotal < workflow.minOrderAmount) {
				approvalLogger.debug(
					`Workflow "${workflow.name}" requires min ${workflow.minOrderAmount} but order total is ${orderTotal}`,
				);
				continue;
			}

			if (workflow.maxOrderAmount !== null && orderTotal > workflow.maxOrderAmount) {
				approvalLogger.debug(
					`Workflow "${workflow.name}" allows max ${workflow.maxOrderAmount} but order total is ${orderTotal}`,
				);
				continue;
			}

			// All conditions matched!
			approvalLogger.info(
				`✓ Matched workflow: "${workflow.name}" (${workflow.id}) for order total: ${orderTotal}, ` +
					`payment type: ${paymentType}, approval levels: ${workflow.workflowLevels.length}`,
			);
			return workflow;
		}

		// If no workflow matches, use default or throw error
		approvalLogger.warn(`No matching workflow found for order total: ${orderTotal}`);
		return null;
	} catch (error) {
		approvalLogger.error(`Error finding matching workflow: ${error}`);
		throw error;
	}
};

/**
 * Get approver details based on role
 * This is a placeholder - you should implement actual logic to find approvers
 */
export const getApproverForRole = async (
	prisma: PrismaClient,
	role: string,
	employeeId?: string,
) => {
	// TODO: Implement actual logic to find approvers based on:
	// - Employee's manager
	// - Department
	// - HR representatives
	// - Finance team members
	// - Admin users

	// For now, return placeholder data
	// You should query your Person/User database to find the actual approver

	const roleMap: Record<string, { id: string; name: string; email: string }> = {
		MANAGER: {
			id: "manager_001",
			name: "Manager Name",
			email: "brygab528@gmail.com",
		},
		HR: {
			id: "hr_001",
			name: "HR Representative",
			email: "hris.solutions.tech@gmail.com",
		},
		FINANCE: {
			id: "finance_001",
			name: "Finance Team",
			email: "finance@company.com",
		},
		DEPARTMENT_HEAD: {
			id: "dept_head_001",
			name: "Department Head",
			email: "depthead@company.com",
		},
		ADMIN: {
			id: "admin_001",
			name: "System Admin",
			email: "admin@company.com",
		},
		FINANCIER: {
			id: "financier_001",
			name: "Financier",
			email: "financier@company.com",
		},
	};

	return roleMap[role] || roleMap["MANAGER"];
};

/**
 * Create approval chain for an order
 */
export const createApprovalChain = async (
	prisma: PrismaClient,
	orderId: string,
	orderNumber: string,
	employeeId: string,
	employeeName: string,
	orderTotal: number,
	paymentType: string,
	orderDate: Date,
	notes?: string,
	installments?: Array<{
		id: string;
		installmentNumber: number;
		amount: number;
		status: string;
		scheduledDate: Date;
		cutOffDate: Date;
	}>,
	io?: Server,
) => {
	try {
		// Find matching workflow
		const workflow = await findMatchingWorkflow(prisma, orderTotal, paymentType);

		if (!workflow) {
			approvalLogger.warn(`No workflow found for order ${orderNumber}`);
			return null;
		}

		if (!workflow.workflowLevels || workflow.workflowLevels.length === 0) {
			approvalLogger.warn(`Workflow ${workflow.name} has no approval levels`);
			return null;
		}

		approvalLogger.info(
			`Creating approval chain for order ${orderNumber} with ${workflow.workflowLevels.length} levels`,
		);

		// Create approval records for all levels
		// IMPORTANT: Approver email is retrieved from workflowApprovalLevel
		// This allows each workflow to have specific approvers assigned per level
		const approvals = [];
		for (const workflowLevel of workflow.workflowLevels) {
			// Priority 1: Use approver from workflowApprovalLevel if email is available
			// This is the preferred method as it allows workflow-specific approver assignment
			let approverId: string;
			let approverName: string;
			let approverEmail: string;
			let approverSource: string;

			// Check if approver email is specified in workflowApprovalLevel
			// Email is the key field - if it exists, use the approver from workflowApprovalLevel
			if (workflowLevel.approverEmail) {
				// Use approver from workflowApprovalLevel (has highest priority)
				// This email comes from the workflowApprovalLevel record you created
				approverId =
					workflowLevel.approverId ||
					`approver_${workflowLevel.approvalType.role.toLowerCase()}`;
				approverName = workflowLevel.approverName || workflowLevel.approvalType.role;
				approverEmail = workflowLevel.approverEmail; // ← This is the email from workflowApprovalLevel
				approverSource = "workflowApprovalLevel";

				approvalLogger.info(
					`✓ Using approver from workflowApprovalLevel for level ${workflowLevel.level}: ` +
						`${approverName} (${approverEmail})`,
				);
			} else {
				// Priority 2: Fallback to getting approver by role (backward compatibility)
				// Only used if workflowApprovalLevel doesn't have an email
				const approver = await getApproverForRole(
					prisma,
					workflowLevel.approvalType.role,
					employeeId,
				);
				approverId = approver.id;
				approverName = approver.name;
				approverEmail = approver.email;
				approverSource = "role-based";

				approvalLogger.warn(
					`⚠ Using role-based approver for level ${workflowLevel.level}: ${approverEmail} (fallback - no email in workflowApprovalLevel)`,
				);
			}

			// Validate email before creating approval
			if (!approverEmail || !approverEmail.includes("@")) {
				approvalLogger.warn(
					`Invalid or missing approver email for level ${workflowLevel.level}. Email: ${approverEmail}`,
				);
				// Continue anyway, but log the warning
			}

			// Financier level (WorkflowApprovalLevel.approverId === FinancierConfig.userId):
			// If order total <= FinancierConfig.autoApproveLimit (e.g. 5000) and within
			// maxCreditLimit (available = maxCreditLimit - used), create OrderApproval as APPROVED.
			let approvalStatus: "PENDING" | "APPROVED" = "PENDING";
			let approvedAt: Date | undefined;
			const financierConfig = await getFinancierConfigByUserId(prisma, approverId);
			if (financierConfig) {
				const usedCredit = await getUsedCreditForFinancierConfig(
					prisma,
					financierConfig.id,
				);
				const availableCredit = financierConfig.maxCreditLimit - usedCredit;
				if (
					orderTotal <= financierConfig.autoApproveLimit &&
					orderTotal <= availableCredit
				) {
					approvalStatus = "APPROVED";
					approvedAt = new Date();
					approvalLogger.info(
						`Financier auto-approve: order ${orderNumber} total ${orderTotal} <= autoApproveLimit ${financierConfig.autoApproveLimit} and within credit (available ${availableCredit})`,
					);
				} else if (orderTotal > availableCredit) {
					approvalLogger.warn(
						`Financier level ${workflowLevel.level}: order total ${orderTotal} exceeds available credit ${availableCredit} (maxCreditLimit ${financierConfig.maxCreditLimit} - used ${usedCredit}). Approval remains PENDING.`,
					);
				}
			}

			// Create approval record with approver email from workflowApprovalLevel
			const approval = await prisma.orderApproval.create({
				data: {
					orderId: orderId,
					approvalLevel: workflowLevel.level,
					approverRole: workflowLevel.approvalType.role,
					approverId: approverId,
					approverName: approverName,
					approverEmail: approverEmail, // Save the email from workflowApprovalLevel
					status: approvalStatus,
					...(approvalStatus === "APPROVED" && approvedAt && { approvedAt }),
				},
			});

			approvals.push(approval);
			approvalLogger.info(
				`Created approval level ${workflowLevel.level} (${workflowLevel.approvalType.role}) for order ${orderNumber} - ` +
					`Approver: ${approverName} (${approverEmail}) - Status: ${approvalStatus} - Source: ${approverSource}`,
			);
		}

		// Save workflowId to order
		await prisma.order.update({
			where: { id: orderId },
			data: {
				workflowId: workflow.id,
			},
		});

		approvalLogger.info(`Saved workflow ${workflow.id} to order ${orderNumber}`);

		// If all approvals are already APPROVED (e.g. financier auto-approve), finalize order
		const allApproved = approvals.every((a) => a.status === "APPROVED");
		if (allApproved && approvals.length > 0) {
			approvalLogger.info(
				`All ${approvals.length} approval level(s) already APPROVED for order ${orderNumber}; finalizing.`,
			);
			const finalized = await tryFinalizeOrderWhenAllApproved(prisma, orderId, io);
			if (finalized) {
				const order = await prisma.order.findUnique({
					where: { id: orderId },
					select: { total: true, userId: true },
				});
				const orderTotal = order?.total ?? 0;
				notifyOrderFullyApproved(
					io,
					orderId,
					orderNumber,
					orderTotal,
					approvals.map((a) => a.approverId),
				);
				if (order?.userId) {
					notifyOrderOwnerApproved(io, orderId, orderNumber, orderTotal, order.userId);
				}
				approvalLogger.info(
					`Order ${orderNumber} finalized (all approvals were auto-approved).`,
				);
			}
		} else {
			// Send email to first PENDING approver (skip any auto-approved financier levels)
			const firstPendingApproval = approvals.find((a) => a.status === "PENDING");
			if (firstPendingApproval) {
				await sendApprovalRequestEmail({
					to: firstPendingApproval.approverEmail,
					approverName: firstPendingApproval.approverName,
					approverEmail: firstPendingApproval.approverEmail,
					employeeName: employeeName,
					orderNumber: orderNumber,
					orderTotal: orderTotal,
					approvalLevel: firstPendingApproval.approvalLevel,
					approverRole: firstPendingApproval.approverRole,
					orderDate: orderDate,
					notes: notes,
					installments: installments,
				});

				approvalLogger.info(
					`Sent approval request email to ${firstPendingApproval.approverEmail} ` +
						`(from workflowApprovalLevel for order ${orderNumber})`,
				);
			}
		}

		// Socket.IO: notify all approvers (recipients) that they are in the approval chain
		notifyApprovalChainCreated(io, orderId, orderNumber, orderTotal, approvals);

		return {
			workflow,
			approvals,
		};
	} catch (error) {
		approvalLogger.error(`Error creating approval chain: ${error}`);
		throw error;
	}
};

/**
 * Check if all required approvals for an order are completed
 */
export const checkAllApprovalsComplete = async (
	prisma: PrismaClient,
	orderId: string,
): Promise<boolean> => {
	try {
		// Get the order with workflow
		const order = await prisma.order.findUnique({
			where: { id: orderId },
			include: {
				workflow: {
					include: {
						workflowLevels: {
							orderBy: { level: "asc" },
						},
					},
				},
				approvals: {
					orderBy: { approvalLevel: "asc" },
				},
			},
		});

		if (!order) {
			approvalLogger.warn(`Order ${orderId} not found when checking approvals`);
			return false;
		}

		// Count how many approvals are APPROVED
		const approvedCount = order.approvals.filter(
			(approval) => approval.status === "APPROVED",
		).length;

		// Total required = number of approval records for this order (not workflow level count).
		// When all existing OrderApproval records are APPROVED, the order is fully approved.
		const totalRequired = order.approvals.length;
		if (totalRequired === 0) {
			approvalLogger.warn(`Order ${orderId} has no approval records`);
			return false;
		}

		approvalLogger.info(
			`Order ${order.orderNumber}: ${approvedCount}/${totalRequired} approvals completed`,
		);

		// Order is fully approved when every approval record for this order is APPROVED
		const allApproved = approvedCount >= totalRequired;

		if (allApproved) {
			approvalLogger.info(
				`All ${totalRequired} required approvals completed for order ${order.orderNumber}`,
			);
		}

		return allApproved;
	} catch (error) {
		approvalLogger.error(`Error checking approvals for order ${orderId}: ${error}`);
		return false;
	}
};

/**
 * If all order approvals are APPROVED and order is still PENDING_APPROVAL,
 * update order to APPROVED and run notification, PO creation, stock deduction.
 * Call this after approving an approval (e.g. from approve endpoint or PATCH update).
 * Returns true if order was finalized, false otherwise.
 */
export const tryFinalizeOrderWhenAllApproved = async (
	prisma: PrismaClient,
	orderId: string,
	io?: Server,
): Promise<boolean> => {
	try {
		const order = await prisma.order.findUnique({
			where: { id: orderId },
			include: {
				approvals: { orderBy: { approvalLevel: "asc" } },
			},
		});
		if (!order || order.status !== "PENDING_APPROVAL" || order.isFullyApproved) {
			return false;
		}
		const total = order.approvals.length;
		if (total === 0) return false;
		const approvedCount = order.approvals.filter((a) => a.status === "APPROVED").length;
		if (approvedCount < total) return false;

		const insufficientStock = await validateStockForOrder(prisma, orderId);
		if (insufficientStock.length > 0) {
			approvalLogger.warn(
				`Cannot finalize order ${order.orderNumber}: insufficient stock for ${insufficientStock.length} item(s)`,
			);
			await prisma.order.update({
				where: { id: orderId },
				data: {
					notes: `Order cannot be approved due to insufficient stock. ${insufficientStock.map((i) => `${i.itemName}: Available ${i.availableStock}, Need ${i.requestedQuantity}`).join("; ")}`,
				},
			});
			return false;
		}

		await prisma.order.update({
			where: { id: orderId },
			data: {
				status: "APPROVED",
				isFullyApproved: true,
				approvedAt: new Date(),
			},
		});
		await createOrderApprovedNotificationIfNeeded(prisma, orderId);
		await createOrderApprovedSupplierNotifications(prisma, orderId, io);

		// Create FinancingAgreement when order had a financier in the approval chain (so used credit increases)
		try {
			let financierConfigId: string | null = null;
			for (const a of order.approvals) {
				const config = await getFinancierConfigByUserId(prisma, a.approverId);
				if (config) {
					financierConfigId = config.id;
					break;
				}
			}
			if (financierConfigId) {
				const installments = await prisma.installment.findMany({
					where: { orderId },
					orderBy: { installmentNumber: "asc" },
				});
				const installmentCount = installments.length || 1;
				const totalPayable =
					installments.length > 0
						? installments.reduce((sum, i) => sum + i.amount, 0)
						: order.total;
				const installmentAmount =
					installmentCount > 0
						? parseFloat((totalPayable / installmentCount).toFixed(2))
						: order.total;
				const financierConfig = await prisma.financierConfig.findFirst({
					where: { id: financierConfigId },
					select: { installmentRateConfig: true },
				});
				const interestRate = financierConfig
					? getRateForInstallmentCount(installmentCount, financierConfig as any)
					: 0;

				const agreement = await prisma.financingAgreement.create({
					data: {
						orderId,
						financierConfigId,
						organizationId: order.organizationId ?? null,
						principalAmount: order.total,
						totalPayable,
						installmentCount,
						installmentAmount,
						interestRate,
						status: "APPROVED",
						approvedAt: new Date(),
					},
				});
				approvalLogger.info(
					`Created FinancingAgreement ${agreement.id} for order ${order.orderNumber} (principal ${order.total}, used credit updated)`,
				);
				// Update FinancierConfig: increment usedCredits, decrement availableCredits
				await prisma.financierConfig.update({
					where: { id: financierConfigId },
					data: {
						usedCredits: { increment: order.total },
						availableCredits: { decrement: order.total },
					},
				});
				if (installments.length > 0) {
					await prisma.installment.updateMany({
						where: { orderId },
						data: { financingAgreementId: agreement.id },
					});
				}
			}
		} catch (faError) {
			approvalLogger.error(
				`Failed to create FinancingAgreement for order ${order.orderNumber}:`,
				faError,
			);
		}

		try {
			await deductStockForOrder(prisma, orderId, io);
			approvalLogger.info(`Stock deducted for order ${order.orderNumber}`);
		} catch (stockError) {
			approvalLogger.error(
				`Failed to deduct stock for order ${order.orderNumber}:`,
				stockError,
			);
		}
		approvalLogger.info(`Order ${order.orderNumber} finalized (all approvals approved).`);
		return true;
	} catch (error) {
		approvalLogger.error(`Error finalizing order ${orderId}: ${error}`);
		return false;
	}
};

/**
 * Process approval (approve or reject)
 */
export const processApproval = async (
	prisma: PrismaClient,
	approvalId: string,
	status: "APPROVED" | "REJECTED",
	comments?: string,
	io?: Server,
) => {
	try {
		// Get the approval record
		const approval = await prisma.orderApproval.findUnique({
			where: { id: approvalId },
			include: {
				order: true,
			},
		});

		if (!approval) {
			throw new Error("Approval not found");
		}

		if (approval.status !== "PENDING") {
			throw new Error("Approval has already been processed");
		}

		// Update approval record
		const updatedApproval = await prisma.orderApproval.update({
			where: { id: approvalId },
			data: {
				status: status,
				[status === "APPROVED" ? "approvedAt" : "rejectedAt"]: new Date(),
				comments: comments,
			},
		});

		approvalLogger.info(
			`Approval ${approvalId} ${status.toLowerCase()} for order ${approval.order.orderNumber}`,
		);

		if (status === "REJECTED") {
			// Check if order was already approved (stock was deducted)
			// If so, restore stock when rejecting
			const wasApproved =
				approval.order.status === "APPROVED" || approval.order.isFullyApproved;

			// Update order to rejected
			await prisma.order.update({
				where: { id: approval.orderId },
				data: {
					status: "REJECTED",
					rejectedAt: new Date(),
					rejectedBy: approval.approverName,
					rejectionReason: comments || "Order rejected",
				},
			});

			// Restore stock if order was previously approved
			if (wasApproved) {
				try {
					await restoreStockForOrder(prisma, approval.orderId, undefined);
					approvalLogger.info(
						`Stock restored for order ${approval.order.orderNumber} after rejection`,
					);
				} catch (stockError) {
					approvalLogger.error(
						`Failed to restore stock for rejected order ${approval.order.orderNumber}:`,
						stockError,
					);
					// Don't fail the rejection if stock restoration fails
				}
			}

			// Send rejection email to employee
			// TODO: Get employee email from database
			await sendOrderRejectedEmail({
				to: "employee@company.com", // TODO: Get from employee record
				employeeName: "Employee Name", // TODO: Get from employee record
				orderNumber: approval.order.orderNumber,
				orderTotal: approval.order.total,
				rejectedBy: approval.approverName,
				rejectedAt: new Date(),
				rejectionReason: comments || "Order rejected",
			});

			// Socket.IO: notify approver who rejected and all recipients that order was rejected
			notifyApprovalDecision(
				io,
				approval,
				approval.order.orderNumber,
				approval.order.total,
				"REJECTED",
				comments,
			);
			const allApprovalsForOrder = await prisma.orderApproval.findMany({
				where: { orderId: approval.orderId },
				select: { approverId: true },
			});
			const approverIds = [...new Set(allApprovalsForOrder.map((a) => a.approverId))];
			notifyOrderRejected(
				io,
				approval.orderId,
				approval.order.orderNumber,
				approval.order.total,
				approverIds,
				approval.approverName,
				comments,
			);
			notifyOrderOwnerRejected(
				io,
				approval.orderId,
				approval.order.orderNumber,
				approval.order.total,
				approval.order.userId,
				approval.approverName,
				comments,
			);

			approvalLogger.info(`Order ${approval.order.orderNumber} rejected`);
		} else {
			// Socket.IO: notify approver who approved
			notifyApprovalDecision(
				io,
				updatedApproval,
				approval.order.orderNumber,
				approval.order.total,
				"APPROVED",
				comments,
			);
			// Approval was approved - check if all approvals are complete
			const allApprovalsComplete = await checkAllApprovalsComplete(prisma, approval.orderId);

			if (allApprovalsComplete) {
				// Validate stock availability before approving
				const insufficientStock = await validateStockForOrder(prisma, approval.orderId);

				if (insufficientStock.length > 0) {
					// Stock is insufficient - cannot approve order
					const stockErrorDetails = insufficientStock.map((item) => ({
						field: `item.${item.itemId}`,
						message: `${item.itemName}: Insufficient stock - Available ${item.availableStock}, Requested ${item.requestedQuantity}, Shortage: ${item.shortage}`,
					}));

					approvalLogger.error(
						`Cannot approve order ${approval.order.orderNumber}: Insufficient stock for ${insufficientStock.length} item(s)`,
					);

					// Revert the approval status back to PENDING
					await prisma.orderApproval.update({
						where: { id: approvalId },
						data: {
							status: "PENDING",
							comments: `Approval blocked: Insufficient stock. ${insufficientStock.map((i) => `${i.itemName}: Need ${i.shortage} more`).join(", ")}`,
						},
					});

					// Update order with stock issue information
					await prisma.order.update({
						where: { id: approval.orderId },
						data: {
							notes: `Order cannot be approved due to insufficient stock. ${insufficientStock.map((i) => `${i.itemName}: Available ${i.availableStock}, Need ${i.requestedQuantity}`).join("; ")}`,
						},
					});

					// Throw error with details to prevent approval
					const error = new Error(
						`Cannot approve order: Insufficient stock for ${insufficientStock.length} item(s)`,
					) as any;
					error.statusCode = 400;
					error.errors = stockErrorDetails;
					throw error;
				}

				// All required approvals are complete and stock is available - order is fully approved
				await prisma.order.update({
					where: { id: approval.orderId },
					data: {
						status: "APPROVED",
						isFullyApproved: true,
						approvedAt: new Date(),
					},
				});

				// Create "order approved" notification for the employee
				await createOrderApprovedNotificationIfNeeded(prisma, approval.orderId);
				// Notify each supplier that has items in this order
				await createOrderApprovedSupplierNotifications(prisma, approval.orderId, io);

				// Deduct stock for all products in the order
				try {
					await deductStockForOrder(prisma, approval.orderId, io);
					approvalLogger.info(
						`Stock deducted for all products in order ${approval.order.orderNumber}`,
					);
				} catch (stockError) {
					approvalLogger.error(
						`Failed to deduct stock for order ${approval.order.orderNumber}:`,
						stockError,
					);
					// Don't fail the approval if stock deduction fails - log and continue
				}

				// Get all approvers who approved for the email
				const allApprovals = await prisma.orderApproval.findMany({
					where: {
						orderId: approval.orderId,
						status: "APPROVED",
					},
					orderBy: { approvalLevel: "asc" },
				});

				const approversList = allApprovals
					.map((a) => `${a.approverName} (${a.approverRole})`)
					.join(", ");

				// Send approval email to employee
				// TODO: Get employee email from database
				await sendOrderApprovedEmail({
					to: "employee@company.com", // TODO: Get from employee record
					employeeName: "Employee Name", // TODO: Get from employee record
					orderNumber: approval.order.orderNumber,
					orderTotal: approval.order.total,
					approvedBy: approversList,
					approvedAt: new Date(),
				});

				// Socket.IO: notify all approvers (recipients) that order is fully approved
				const approverIds = [...new Set(allApprovals.map((a) => a.approverId))];
				notifyOrderFullyApproved(
					io,
					approval.orderId,
					approval.order.orderNumber,
					approval.order.total,
					approverIds,
				);
				notifyOrderOwnerApproved(
					io,
					approval.orderId,
					approval.order.orderNumber,
					approval.order.total,
					approval.order.userId,
				);

				approvalLogger.info(
					`Order ${approval.order.orderNumber} fully approved by all ${allApprovals.length} required approvers`,
				);
			} else {
				// Not all approvals are complete - check if there's a next level to notify
				const nextLevelApproval = await prisma.orderApproval.findFirst({
					where: {
						orderId: approval.orderId,
						approvalLevel: approval.approvalLevel + 1,
						status: "PENDING",
					},
				});

				if (nextLevelApproval) {
					// There's a next level pending - send notification
					await prisma.order.update({
						where: { id: approval.orderId },
						data: {
							currentApprovalLevel: approval.approvalLevel + 1,
						},
					});

					await sendNextApprovalNotification({
						to: nextLevelApproval.approverEmail,
						approverName: nextLevelApproval.approverName,
						employeeName: "Employee Name", // TODO: Get from employee record
						orderNumber: approval.order.orderNumber,
						orderTotal: approval.order.total,
						previousApprover: approval.approverName,
						approvalLevel: nextLevelApproval.approvalLevel,
						approverRole: nextLevelApproval.approverRole,
					});

					// Socket.IO: notify next approver it's their turn
					notifyNextApproverTurn(
						io,
						nextLevelApproval,
						approval.order.orderNumber,
						approval.order.total,
						approval.approverName,
					);

					approvalLogger.info(
						`Sent next level approval notification for order ${approval.order.orderNumber}`,
					);
				} else {
					// No next level found, but not all approvals are complete
					// This might happen if approvals are processed out of order
					approvalLogger.warn(
						`Approval ${approvalId} approved, but order ${approval.order.orderNumber} ` +
							`is not fully approved yet. Waiting for remaining approvals.`,
					);
				}
			}
		}

		return updatedApproval;
	} catch (error) {
		approvalLogger.error(`Error processing approval: ${error}`);
		throw error;
	}
};
