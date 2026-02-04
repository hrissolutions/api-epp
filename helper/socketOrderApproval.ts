import { Server } from "socket.io";
import { getLogger } from "./logger";

const logger = getLogger();
const socketLogger = logger.child({ module: "socketOrderApproval" });

const USER_ROOM_PREFIX = "user:";

/** Emit to a user room (all sockets that joined with this userId receive the event) */
function emitToUser(io: Server, userId: string, event: string, payload: unknown): void {
	const room = `${USER_ROOM_PREFIX}${userId}`;
	io.to(room).emit(event, payload);
	socketLogger.debug(`Emitted ${event} to room ${room}`);
}

export type ApprovalRecord = {
	id: string;
	orderId: string;
	approvalLevel: number;
	approverRole: string;
	approverId: string;
	approverName: string;
	approverEmail: string;
	status: string;
};

/**
 * Notify all approvers in the chain that they are recipients for an order approval.
 * Each approverId receives a real-time notification so they know they are in the approval chain.
 */
export function notifyApprovalChainCreated(
	io: Server | undefined,
	orderId: string,
	orderNumber: string,
	orderTotal: number,
	approvals: ApprovalRecord[],
): void {
	if (!io) return;
	for (const approval of approvals) {
		emitToUser(io, approval.approverId, "order:approval:assigned", {
			approvalId: approval.id,
			orderId,
			orderNumber,
			orderTotal,
			approvalLevel: approval.approvalLevel,
			approverRole: approval.approverRole,
			approverName: approval.approverName,
			approverEmail: approval.approverEmail,
			status: approval.status,
			message:
				approval.status === "PENDING"
					? "You are a recipient for this order approval."
					: "You were auto-approved for this level.",
			createdAt: new Date().toISOString(),
		});
	}
	socketLogger.info(
		`Notified ${approvals.length} approver(s) for order ${orderNumber} (assigned as recipients)`,
	);
}

/**
 * Notify the approver who just made a decision (approved/rejected).
 */
export function notifyApprovalDecision(
	io: Server | undefined,
	approval: ApprovalRecord,
	orderNumber: string,
	orderTotal: number,
	status: "APPROVED" | "REJECTED",
	comments?: string,
): void {
	if (!io) return;
	emitToUser(io, approval.approverId, "order:approval:decision", {
		approvalId: approval.id,
		orderId: approval.orderId,
		orderNumber,
		orderTotal,
		approvalLevel: approval.approvalLevel,
		approverRole: approval.approverRole,
		status,
		comments,
		message:
			status === "APPROVED" ? "Your approval was recorded." : "Your rejection was recorded.",
		at: new Date().toISOString(),
	});
}

/**
 * Notify the next-level approver(s) that it is their turn to approve.
 */
export function notifyNextApproverTurn(
	io: Server | undefined,
	nextApproval: ApprovalRecord,
	orderNumber: string,
	orderTotal: number,
	previousApproverName: string,
): void {
	if (!io) return;
	emitToUser(io, nextApproval.approverId, "order:approval:your_turn", {
		approvalId: nextApproval.id,
		orderId: nextApproval.orderId,
		orderNumber,
		orderTotal,
		approvalLevel: nextApproval.approvalLevel,
		approverRole: nextApproval.approverRole,
		approverName: nextApproval.approverName,
		previousApproverName,
		message: `Order ${orderNumber} is now pending your approval (level ${nextApproval.approvalLevel}).`,
		at: new Date().toISOString(),
	});
	socketLogger.info(`Notified next approver ${nextApproval.approverId} for order ${orderNumber}`);
}

/**
 * Notify all approvers (recipients) that the order was fully approved.
 */
export function notifyOrderFullyApproved(
	io: Server | undefined,
	orderId: string,
	orderNumber: string,
	orderTotal: number,
	approverIds: string[],
): void {
	if (!io) return;
	const payload = {
		orderId,
		orderNumber,
		orderTotal,
		message: `Order ${orderNumber} has been fully approved.`,
		at: new Date().toISOString(),
	};
	for (const approverId of approverIds) {
		emitToUser(io, approverId, "order:approval:fully_approved", payload);
	}
	socketLogger.info(
		`Notified ${approverIds.length} approver(s) that order ${orderNumber} is fully approved`,
	);
}

/**
 * Notify all approvers (recipients) that the order was rejected.
 */
export function notifyOrderRejected(
	io: Server | undefined,
	orderId: string,
	orderNumber: string,
	orderTotal: number,
	approverIds: string[],
	rejectedBy: string,
	rejectionReason?: string,
): void {
	if (!io) return;
	const payload = {
		orderId,
		orderNumber,
		orderTotal,
		rejectedBy,
		rejectionReason,
		message: `Order ${orderNumber} was rejected.`,
		at: new Date().toISOString(),
	};
	for (const approverId of approverIds) {
		emitToUser(io, approverId, "order:approval:rejected", payload);
	}
	socketLogger.info(
		`Notified ${approverIds.length} approver(s) that order ${orderNumber} was rejected`,
	);
}
