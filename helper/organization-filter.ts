import { Request } from "express";
import { AuthRequest } from "../middleware/verifyToken";

/**
 * Get organizationId from authenticated user's request
 * @param req Express request object
 * @returns organizationId string or undefined
 */
export function getOrganizationId(req: Request): string | undefined {
	const authReq = req as AuthRequest;
	return authReq.organizationId;
}

/**
 * Add organizationId filter to where clause
 * Only adds filter if organizationId exists in request
 * @param req Express request object
 * @param whereClause Existing where clause
 * @returns Updated where clause with organizationId filter
 */
export function addOrganizationFilter<T extends Record<string, any>>(
	req: Request,
	whereClause: T,
): T {
	const organizationId = getOrganizationId(req);
	
	if (!organizationId) {
		// If no organizationId in token, don't filter (for backward compatibility or admin users)
		return whereClause;
	}

	// Add organizationId to existing AND conditions or create new AND
	if (whereClause.AND && Array.isArray(whereClause.AND)) {
		return {
			...whereClause,
			AND: [
				...whereClause.AND,
				{ organizationId: organizationId },
			],
		} as T;
	} else if (whereClause.AND && typeof whereClause.AND === "object") {
		return {
			...whereClause,
			AND: [
				whereClause.AND,
				{ organizationId: organizationId },
			],
		} as T;
	} else if (Object.keys(whereClause).length > 0) {
		// If whereClause has other conditions, wrap in AND
		return {
			...whereClause,
			AND: [
				{ ...whereClause },
				{ organizationId: organizationId },
			],
		} as T;
	} else {
		// Empty whereClause, just add organizationId
		return {
			...whereClause,
			organizationId: organizationId,
		} as T;
	}
}
