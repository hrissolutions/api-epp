import { PrismaClient } from "../generated/prisma";
import { getLogger } from "./logger";
import {
	sendApprovalRequestEmail,
	sendNextApprovalNotification,
	sendOrderApprovedEmail,
	sendOrderRejectedEmail,
} from "./email.helper";

const logger = getLogger();
const approvalLogger = logger.child({ module: "approvalService" });

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
		const workflows = await prisma.approvalWorkflow.findMany({
			where: { isActive: true },
			include: { levels: { orderBy: { level: "asc" } } },
		});

		// Match workflow based on conditions
		for (const workflow of workflows) {
			// Check installment requirement
			if (workflow.requiresInstallment && paymentType !== "INSTALLMENT") {
				continue;
			}

			// Check amount range
			if (workflow.minOrderAmount !== null && orderTotal < workflow.minOrderAmount) {
				continue;
			}

			if (workflow.maxOrderAmount !== null && orderTotal > workflow.maxOrderAmount) {
				continue;
			}

			approvalLogger.info(
				`Matched workflow: ${workflow.name} for order total: ${orderTotal}`,
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
) => {
	try {
		// Find matching workflow
		const workflow = await findMatchingWorkflow(prisma, orderTotal, paymentType);

		if (!workflow) {
			approvalLogger.warn(`No workflow found for order ${orderNumber}`);
			return null;
		}

		if (!workflow.levels || workflow.levels.length === 0) {
			approvalLogger.warn(`Workflow ${workflow.name} has no approval levels`);
			return null;
		}

		approvalLogger.info(
			`Creating approval chain for order ${orderNumber} with ${workflow.levels.length} levels`,
		);

		// Create approval records for all levels
		const approvals = [];
		for (const level of workflow.levels) {
			// Get approver for this role
			const approver = await getApproverForRole(prisma, level.role, employeeId);

			// Create approval record
			const approval = await prisma.orderApproval.create({
				data: {
					orderId: orderId,
					approvalLevel: level.level,
					approverRole: level.role,
					approverId: approver.id,
					approverName: approver.name,
					approverEmail: approver.email,
					status: "PENDING",
				},
			});

			approvals.push(approval);
			approvalLogger.info(
				`Created approval level ${level.level} (${level.role}) for order ${orderNumber}`,
			);
		}

		// Send email to first level approver
		if (approvals.length > 0) {
			const firstApproval = approvals[0];
			await sendApprovalRequestEmail({
				to: firstApproval.approverEmail,
				approverName: firstApproval.approverName,
				employeeName: employeeName,
				orderNumber: orderNumber,
				orderTotal: orderTotal,
				approvalLevel: firstApproval.approvalLevel,
				approverRole: firstApproval.approverRole,
				orderDate: orderDate,
				notes: notes,
			});

			approvalLogger.info(`Sent approval request email to ${firstApproval.approverEmail}`);
		}

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
 * Process approval (approve or reject)
 */
export const processApproval = async (
	prisma: PrismaClient,
	approvalId: string,
	status: "APPROVED" | "REJECTED",
	comments?: string,
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

			approvalLogger.info(`Order ${approval.order.orderNumber} rejected`);
		} else {
			// Check if there are more levels
			const nextLevelApproval = await prisma.orderApproval.findFirst({
				where: {
					orderId: approval.orderId,
					approvalLevel: approval.approvalLevel + 1,
				},
			});

			if (nextLevelApproval) {
				// There's a next level - send notification
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

				approvalLogger.info(
					`Sent next level approval notification for order ${approval.order.orderNumber}`,
				);
			} else {
				// No more levels - order is fully approved
				await prisma.order.update({
					where: { id: approval.orderId },
					data: {
						status: "APPROVED",
						isFullyApproved: true,
						approvedAt: new Date(),
					},
				});

				// Send approval email to employee
				// TODO: Get employee email from database
				await sendOrderApprovedEmail({
					to: "employee@company.com", // TODO: Get from employee record
					employeeName: "Employee Name", // TODO: Get from employee record
					orderNumber: approval.order.orderNumber,
					orderTotal: approval.order.total,
					approvedBy: approval.approverName,
					approvedAt: new Date(),
				});

				approvalLogger.info(`Order ${approval.order.orderNumber} fully approved`);
			}
		}

		return updatedApproval;
	} catch (error) {
		approvalLogger.error(`Error processing approval: ${error}`);
		throw error;
	}
};
