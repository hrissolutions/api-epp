import path from "path";
import fs from "fs";
import nodemailer from "nodemailer";
import ejs from "ejs";
import { getLogger } from "./logger";

const logger = getLogger();
const emailLogger = logger.child({ module: "email" });

const GMAIL_USER = process.env.SMTP_USER;
const GMAIL_PASS = process.env.APP_PASSWORD;

// IMPORTANT: Set SMTP_USER and APP_PASSWORD in your .env for Gmail
export const mailer = nodemailer.createTransport({
	service: "gmail",
	auth: {
		user: GMAIL_USER,
		pass: GMAIL_PASS,
	},
});

// Send approval request notification to approver
export const sendApprovalRequestEmail = async (params: {
	to: string;
	approverName: string;
	employeeName: string;
	orderNumber: string;
	orderTotal: number;
	approvalLevel: number;
	approverRole: string;
	orderDate: Date;
	notes?: string;
	approvalUrl?: string;
}): Promise<void> => {
	const templatePath = path.join(__dirname, "..", "views", "emails", "approval-request.ejs");

	try {
		const template = fs.readFileSync(templatePath, "utf-8");
		const html = ejs.render(template, {
			approverName: params.approverName,
			employeeName: params.employeeName,
			orderNumber: params.orderNumber,
			orderTotal: params.orderTotal.toFixed(2),
			approvalLevel: params.approvalLevel,
			approverRole: params.approverRole,
			orderDate: params.orderDate.toLocaleDateString(),
			notes: params.notes || "No additional notes",
			approvalUrl: params.approvalUrl || "#",
		});

		await mailer.sendMail({
			from: `"EPP System" <${GMAIL_USER}>`,
			to: params.to,
			subject: `Approval Required: Order ${params.orderNumber}`,
			html,
		});

		emailLogger.info(
			`Approval request email sent to ${params.to} for order ${params.orderNumber}`,
		);
	} catch (error: any) {
		emailLogger.error(
			`Failed to send approval request email to ${params.to}: ${error.message}`,
		);
		// Don't throw - we don't want email failures to stop the order process
	}
};

// Send approval reminder to approver
export const sendApprovalReminderEmail = async (params: {
	to: string;
	approverName: string;
	employeeName: string;
	orderNumber: string;
	orderTotal: number;
	daysPending: number;
	approvalUrl?: string;
}): Promise<void> => {
	const templatePath = path.join(__dirname, "..", "views", "emails", "approval-reminder.ejs");

	try {
		const template = fs.readFileSync(templatePath, "utf-8");
		const html = ejs.render(template, {
			approverName: params.approverName,
			employeeName: params.employeeName,
			orderNumber: params.orderNumber,
			orderTotal: params.orderTotal.toFixed(2),
			daysPending: params.daysPending,
			approvalUrl: params.approvalUrl || "#",
		});

		await mailer.sendMail({
			from: `"EPP System" <${GMAIL_USER}>`,
			to: params.to,
			subject: `Reminder: Approval Pending for Order ${params.orderNumber}`,
			html,
		});

		emailLogger.info(
			`Approval reminder email sent to ${params.to} for order ${params.orderNumber}`,
		);
	} catch (error: any) {
		emailLogger.error(
			`Failed to send approval reminder email to ${params.to}: ${error.message}`,
		);
	}
};

// Send order approved notification to employee
export const sendOrderApprovedEmail = async (params: {
	to: string;
	employeeName: string;
	orderNumber: string;
	orderTotal: number;
	approvedBy: string;
	approvedAt: Date;
	orderDetailsUrl?: string;
}): Promise<void> => {
	const templatePath = path.join(__dirname, "..", "views", "emails", "order-approved.ejs");

	try {
		const template = fs.readFileSync(templatePath, "utf-8");
		const html = ejs.render(template, {
			employeeName: params.employeeName,
			orderNumber: params.orderNumber,
			orderTotal: params.orderTotal.toFixed(2),
			approvedBy: params.approvedBy,
			approvedAt: params.approvedAt.toLocaleDateString(),
			orderDetailsUrl: params.orderDetailsUrl || "#",
		});

		await mailer.sendMail({
			from: `"EPP System" <${GMAIL_USER}>`,
			to: params.to,
			subject: `Order Approved: ${params.orderNumber}`,
			html,
		});

		emailLogger.info(
			`Order approved email sent to ${params.to} for order ${params.orderNumber}`,
		);
	} catch (error: any) {
		emailLogger.error(`Failed to send order approved email to ${params.to}: ${error.message}`);
	}
};

// Send order rejected notification to employee
export const sendOrderRejectedEmail = async (params: {
	to: string;
	employeeName: string;
	orderNumber: string;
	orderTotal: number;
	rejectedBy: string;
	rejectedAt: Date;
	rejectionReason: string;
}): Promise<void> => {
	const templatePath = path.join(__dirname, "..", "views", "emails", "order-rejected.ejs");

	try {
		const template = fs.readFileSync(templatePath, "utf-8");
		const html = ejs.render(template, {
			employeeName: params.employeeName,
			orderNumber: params.orderNumber,
			orderTotal: params.orderTotal.toFixed(2),
			rejectedBy: params.rejectedBy,
			rejectedAt: params.rejectedAt.toLocaleDateString(),
			rejectionReason: params.rejectionReason,
		});

		await mailer.sendMail({
			from: `"EPP System" <${GMAIL_USER}>`,
			to: params.to,
			subject: `Order Rejected: ${params.orderNumber}`,
			html,
		});

		emailLogger.info(
			`Order rejected email sent to ${params.to} for order ${params.orderNumber}`,
		);
	} catch (error: any) {
		emailLogger.error(`Failed to send order rejected email to ${params.to}: ${error.message}`);
	}
};

// Send next level approval notification
export const sendNextApprovalNotification = async (params: {
	to: string;
	approverName: string;
	employeeName: string;
	orderNumber: string;
	orderTotal: number;
	previousApprover: string;
	approvalLevel: number;
	approverRole: string;
	approvalUrl?: string;
}): Promise<void> => {
	const templatePath = path.join(__dirname, "..", "views", "emails", "next-level-approval.ejs");

	try {
		const template = fs.readFileSync(templatePath, "utf-8");
		const html = ejs.render(template, {
			approverName: params.approverName,
			employeeName: params.employeeName,
			orderNumber: params.orderNumber,
			orderTotal: params.orderTotal.toFixed(2),
			previousApprover: params.previousApprover,
			approvalLevel: params.approvalLevel,
			approverRole: params.approverRole,
			approvalUrl: params.approvalUrl || "#",
		});

		await mailer.sendMail({
			from: `"EPP System" <${GMAIL_USER}>`,
			to: params.to,
			subject: `Approval Required (Level ${params.approvalLevel}): Order ${params.orderNumber}`,
			html,
		});

		emailLogger.info(
			`Next level approval email sent to ${params.to} for order ${params.orderNumber}`,
		);
	} catch (error: any) {
		emailLogger.error(
			`Failed to send next level approval email to ${params.to}: ${error.message}`,
		);
	}
};
