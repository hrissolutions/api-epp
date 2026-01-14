import { Request } from "express";

const AUDIT_LOG_URL = process.env.AUDIT_LOG_URL || "http://localhost:3001/api/auditLog";

/**
 * Logs audit events to the Audit Log microservice.
 */
export async function logAudit(
	req: Request,
	payload: {
		userId: string;
		action: string;
		resource: string;
		severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
		entityType: string;
		entityId: string;
		changesBefore: any | null;
		changesAfter: any | null;
		description: string;
		organizationId?: string;
	},
) {
	try {
		const auditData = {
			userId: payload.userId,
			action: payload.action,
			resource: payload.resource,
			severity: payload.severity,
			entityType: payload.entityType,
			entityId: payload.entityId,
			changesBefore: payload.changesBefore,
			changesAfter: payload.changesAfter,
			description: payload.description,
			organizationId: payload.organizationId,
			userAgent: req.get("User-Agent"),
			ip: req.ip || req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown",
			path: req.originalUrl,
			method: req.method,
		};

		// Fire-and-forget logging
		fetch(AUDIT_LOG_URL, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Cookie: req.headers.cookie || "",
			},
			body: JSON.stringify(auditData),
		}).catch((err) => console.error("Audit log request failed:", err.message));
	} catch (error: any) {
		console.error("Failed to log audit event:", error.message);
	}
}
