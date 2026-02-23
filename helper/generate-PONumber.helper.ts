import { PrismaClient } from "../generated/prisma";
import { getLogger } from "./logger";

const logger = getLogger();
const poLogger = logger.child({ module: "generatePONumber" });

/**
 * Generates a unique PO number in the format: PO-YYYYMMDD-A0001
 */
export const generatePONumber = async (prisma: PrismaClient, date?: Date): Promise<string> => {
	try {
		const today = date || new Date();
		const dateStr = today.toISOString().slice(0, 10).replace(/-/g, "");
		const prefix = `PO-${dateStr}-`;

		const todayStart = new Date(today);
		todayStart.setHours(0, 0, 0, 0);
		const todayEnd = new Date(today);
		todayEnd.setHours(23, 59, 59, 999);

		const todayPOs = await prisma.purchaseOrder.findMany({
			where: {
				poNumber: { startsWith: prefix },
				createdAt: { gte: todayStart, lte: todayEnd },
			},
			select: { poNumber: true },
			orderBy: { createdAt: "desc" },
		});

		const sequences = todayPOs
			.map((po) => {
				const match = po.poNumber.match(new RegExp(`^${prefix}([A-Z])(\\d{4})$`));
				if (match) return { letter: match[1], number: parseInt(match[2], 10) };
				return null;
			})
			.filter((s): s is { letter: string; number: number } => s !== null);

		if (sequences.length === 0) {
			const poNumber = `${prefix}A0001`;
			poLogger.info(`Generated PO number: ${poNumber}`);
			return poNumber;
		}

		const highest = sequences.reduce((max, s) => {
			const maxV = (max.letter.charCodeAt(0) - 65) * 10000 + max.number;
			const sV = (s.letter.charCodeAt(0) - 65) * 10000 + s.number;
			return sV > maxV ? s : max;
		}, sequences[0]);

		const nextNumber = highest.number >= 9999 ? 1 : highest.number + 1;
		const nextLetter =
			highest.number >= 9999
				? String.fromCharCode(highest.letter.charCodeAt(0) + 1)
				: highest.letter;
		const poNumber = `${prefix}${nextLetter}${String(nextNumber).padStart(4, "0")}`;
		poLogger.info(`Generated PO number: ${poNumber}`);
		return poNumber;
	} catch (error) {
		poLogger.error(`Error generating PO number: ${error}`);
		return `PO-${Date.now()}-${Math.random().toString(36).substring(2, 9).toUpperCase()}`;
	}
};
