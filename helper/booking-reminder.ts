import type { PrismaClient } from "../generated/prisma";
import { getLogger } from "./logger";

const logger = getLogger();
const bookingReminderLogger = logger.child({ module: "bookingReminder" });

/**
 * Placeholder implementation.
 *
 * Called by `GET /api/notification/test-reminder`.
 * Update this later to scan bookings/dropoffs and create notifications.
 */
export async function runBookingDropoffReminder(
	_prisma: PrismaClient,
	testTime: Date = new Date(),
): Promise<void> {
	bookingReminderLogger.info(
		`runBookingDropoffReminder invoked at ${testTime.toISOString()} (no-op)`,
	);
}

