import { PrismaClient } from "../generated/prisma";
import { getLogger } from "./logger";

const logger = getLogger();
const orderNumberLogger = logger.child({ module: "generateOrderNumber" });

/**
 * Generates a unique order number in the format: ORD-YYYYMMDD-A0001
 * Sequence format: A0001, A0002, ..., A9999, B0001, B0002, ..., B9999, C0001, etc.
 *
 * @param prisma - Prisma client instance
 * @param date - Optional date to use (defaults to today)
 * @returns Promise<string> - Generated order number
 */
export const generateOrderNumber = async (prisma: PrismaClient, date?: Date): Promise<string> => {
	try {
		const today = date || new Date();
		const dateStr = today.toISOString().slice(0, 10).replace(/-/g, ""); // YYYYMMDD
		const prefix = `ORD-${dateStr}-`;

		// Find the last order number for today
		const todayStart = new Date(today);
		todayStart.setHours(0, 0, 0, 0);
		const todayEnd = new Date(today);
		todayEnd.setHours(23, 59, 59, 999);

		// Get all orders created today that match the pattern
		const todayOrders = await prisma.order.findMany({
			where: {
				orderNumber: {
					startsWith: prefix,
				},
				createdAt: {
					gte: todayStart,
					lte: todayEnd,
				},
			},
			select: {
				orderNumber: true,
			},
			orderBy: {
				createdAt: "desc",
			},
		});

		// Extract sequence numbers from today's orders
		const sequences = todayOrders
			.map((order) => {
				const match = order.orderNumber.match(new RegExp(`^${prefix}([A-Z])(\\d{4})$`));
				if (match) {
					const letter = match[1];
					const number = parseInt(match[2], 10);
					return { letter, number };
				}
				return null;
			})
			.filter((seq): seq is { letter: string; number: number } => seq !== null);

		// If no orders found for today, start with A0001
		if (sequences.length === 0) {
			const orderNumber = `${prefix}A0001`;
			orderNumberLogger.info(`Generated new order number: ${orderNumber} (first of the day)`);
			return orderNumber;
		}

		// Find the highest sequence
		const highestSequence = sequences.reduce((max, seq) => {
			const maxValue = getSequenceValue(max.letter, max.number);
			const seqValue = getSequenceValue(seq.letter, seq.number);
			return seqValue > maxValue ? seq : max;
		}, sequences[0]);

		// Increment the sequence
		const nextSequence = incrementSequence(highestSequence.letter, highestSequence.number);

		const orderNumber = `${prefix}${nextSequence.letter}${String(nextSequence.number).padStart(4, "0")}`;
		orderNumberLogger.info(
			`Generated new order number: ${orderNumber} (previous: ${highestSequence.letter}${String(highestSequence.number).padStart(4, "0")})`,
		);
		return orderNumber;
	} catch (error) {
		orderNumberLogger.error(`Error generating order number: ${error}`);
		// Fallback to timestamp-based order number if database query fails
		const fallbackNumber = `ORD-${Date.now()}-${Math.random().toString(36).substring(2, 9).toUpperCase()}`;
		orderNumberLogger.warn(`Using fallback order number: ${fallbackNumber}`);
		return fallbackNumber;
	}
};

/**
 * Gets the numeric value of a sequence for comparison
 * A0001 = 1, A0002 = 2, ..., A9999 = 9999, B0001 = 10000, etc.
 */
function getSequenceValue(letter: string, number: number): number {
	const letterValue = letter.charCodeAt(0) - 65; // A=0, B=1, C=2, etc.
	return letterValue * 10000 + number;
}

/**
 * Increments a sequence (letter + number)
 * A0001 -> A0002, A9999 -> B0001, B9999 -> C0001, etc.
 */
function incrementSequence(letter: string, number: number): { letter: string; number: number } {
	if (number < 9999) {
		// Simple increment: A0001 -> A0002
		return { letter, number: number + 1 };
	} else {
		// Reached 9999, move to next letter: A9999 -> B0001
		const nextLetter = String.fromCharCode(letter.charCodeAt(0) + 1);
		return { letter: nextLetter, number: 1 };
	}
}
