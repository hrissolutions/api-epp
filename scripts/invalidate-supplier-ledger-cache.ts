/**
 * Script: Invalidate supplier settlement ledger cache (admin-to-supplier SOA).
 * Use after updating ledger description logic so cached responses are refreshed.
 *
 * Ledger descriptions are computed at runtime; cached entries may show old text
 * (e.g. "Payment from Financier") until invalidation. This script clears
 * cache:supplierSettlement:ledger:* so the next API calls return fresh data
 * with corrected descriptions ("Payment to Supplier" / "Payment received from Admin").
 *
 * Usage:
 *   npx ts-node scripts/invalidate-supplier-ledger-cache.ts
 *
 * Options:
 *   --dry-run    List matching cache keys without deleting
 */

import { redisClient } from "../config/redis";
import { connectAllDatabases, disconnectAllDatabases } from "../config/database";
import { getLogger } from "../helper/logger";

const logger = getLogger();
const scriptLogger = logger.child({ module: "invalidateSupplierLedgerCache" });

const CACHE_PATTERN = "cache:supplierSettlement:ledger:*";

async function main() {
	const args = process.argv.slice(2);
	const dryRun = args.includes("--dry-run");

	scriptLogger.info("============================================================");
	scriptLogger.info("Invalidate Supplier Settlement Ledger Cache");
	scriptLogger.info("============================================================");
	scriptLogger.info(`Pattern: ${CACHE_PATTERN}`);
	if (dryRun) scriptLogger.info("Mode: DRY RUN (no keys will be deleted)");

	await connectAllDatabases();

	try {
		if (!redisClient.isClientConnected()) {
			scriptLogger.warn("Redis not connected. Ledger cache may not be in use or Redis is unavailable.");
			return;
		}

		const client = redisClient.getClient();
		const keys = await client.keys(CACHE_PATTERN);

		if (keys.length === 0) {
			scriptLogger.info("No cache keys found matching pattern.");
			return;
		}

		scriptLogger.info(`Found ${keys.length} cache key(s):`);
		for (const k of keys) {
			scriptLogger.info(`  - ${k}`);
		}

		if (!dryRun) {
			const deleted = await client.del(...keys);
			scriptLogger.info(`Invalidated ${deleted} cache key(s). Next ledger requests will use updated descriptions.`);
		} else {
			scriptLogger.info("Dry run: skipping deletion.");
		}
	} finally {
		await disconnectAllDatabases();
	}
}

main().catch((err) => {
	scriptLogger.error("Script failed:", err);
	process.exit(1);
});
