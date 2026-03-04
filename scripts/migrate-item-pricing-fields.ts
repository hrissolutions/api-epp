/**
 * Migration: Rename item pricing fields to new semantic names
 *
 * Old field  →  New field        Meaning
 * ──────────────────────────────────────────────────────────────
 * retailPrice  →  srp            Market reference / SRP price
 * costPrice    →  supplierPrice  Price supplier sells to Uzaro
 * sellingPrice →  employeePrice  EPP employee customer price
 *
 * Existing documents in MongoDB still carry the old field names.
 * This script copies each old value into the new field (using $ifNull
 * so already-migrated items are never overwritten), then unsets the
 * old fields.
 *
 * Usage:
 *   npx ts-node scripts/migrate-item-pricing-fields.ts
 */

import { PrismaClient } from "../generated/prisma";
import * as dotenv from "dotenv";

dotenv.config();

const prisma = new PrismaClient();

async function run() {
	console.log("=".repeat(60));
	console.log("Item pricing field migration");
	console.log("=".repeat(60));
	console.log("  retailPrice  → srp");
	console.log("  costPrice    → supplierPrice");
	console.log("  sellingPrice → employeePrice");
	console.log("=".repeat(60) + "\n");

	// ── Step 1: Count items that still have old fields ──────────────
	const beforeCounts = (await prisma.$runCommandRaw({
		aggregate: "items",
		pipeline: [
			{
				$facet: {
					hasRetailPrice: [{ $match: { retailPrice: { $exists: true } } }, { $count: "n" }],
					hasSellingPrice: [{ $match: { sellingPrice: { $exists: true } } }, { $count: "n" }],
					hasCostPrice: [{ $match: { costPrice: { $exists: true } } }, { $count: "n" }],
					hasSrp: [{ $match: { srp: { $exists: true } } }, { $count: "n" }],
					hasSupplierPrice: [{ $match: { supplierPrice: { $exists: true } } }, { $count: "n" }],
					hasEmployeePrice: [{ $match: { employeePrice: { $exists: true } } }, { $count: "n" }],
				},
			},
		],
		cursor: {},
	})) as any;

	const counts = beforeCounts?.cursor?.firstBatch?.[0] ?? {};
	console.log("Before migration:");
	console.log(`  Items with retailPrice:  ${counts.hasRetailPrice?.[0]?.n ?? 0}`);
	console.log(`  Items with sellingPrice: ${counts.hasSellingPrice?.[0]?.n ?? 0}`);
	console.log(`  Items with costPrice:    ${counts.hasCostPrice?.[0]?.n ?? 0}`);
	console.log(`  Items with srp:          ${counts.hasSrp?.[0]?.n ?? 0}`);
	console.log(`  Items with supplierPrice:${counts.hasSupplierPrice?.[0]?.n ?? 0}`);
	console.log(`  Items with employeePrice:${counts.hasEmployeePrice?.[0]?.n ?? 0}\n`);

	// ── Step 2: Copy old values into new fields ──────────────────────
	// Uses aggregation pipeline update ($ifNull = don't overwrite if new field already set)
	console.log("Copying old fields → new fields...");
	const copyResult = (await prisma.$runCommandRaw({
		update: "items",
		updates: [
			{
				q: {},
				u: [
					{
						$set: {
							srp: { $ifNull: ["$srp", "$retailPrice"] },
							supplierPrice: { $ifNull: ["$supplierPrice", "$costPrice"] },
							employeePrice: { $ifNull: ["$employeePrice", "$sellingPrice"] },
						},
					},
				],
				multi: true,
			},
		],
	})) as any;
	console.log(`  Matched: ${copyResult.n ?? 0}  Modified: ${copyResult.nModified ?? 0}\n`);

	// ── Step 2b: Fallback — set supplierPrice = srp for items where costPrice was null ──
	// Items that never had costPrice set will have supplierPrice = null after the copy.
	// Fall back to srp so these items still have a valid supplier price.
	console.log("Setting supplierPrice = srp for items where supplierPrice is still null...");
	const fallbackResult = (await prisma.$runCommandRaw({
		update: "items",
		updates: [
			{
				q: { supplierPrice: null },
				u: [{ $set: { supplierPrice: "$srp" } }],
				multi: true,
			},
		],
	})) as any;
	console.log(`  Matched: ${fallbackResult.n ?? 0}  Modified: ${fallbackResult.nModified ?? 0}\n`);

	// ── Step 3: Remove old fields ────────────────────────────────────
	console.log("Removing old fields...");
	const unsetResult = (await prisma.$runCommandRaw({
		update: "items",
		updates: [
			{
				q: {
					$or: [
						{ retailPrice: { $exists: true } },
						{ sellingPrice: { $exists: true } },
						{ costPrice: { $exists: true } },
					],
				},
				u: {
					$unset: {
						retailPrice: "",
						sellingPrice: "",
						costPrice: "",
					},
				},
				multi: true,
			},
		],
	})) as any;
	console.log(`  Matched: ${unsetResult.n ?? 0}  Modified: ${unsetResult.nModified ?? 0}\n`);

	// ── Step 4: Verify ───────────────────────────────────────────────
	const afterCounts = (await prisma.$runCommandRaw({
		aggregate: "items",
		pipeline: [
			{
				$facet: {
					hasRetailPrice: [{ $match: { retailPrice: { $exists: true } } }, { $count: "n" }],
					hasSellingPrice: [{ $match: { sellingPrice: { $exists: true } } }, { $count: "n" }],
					hasCostPrice: [{ $match: { costPrice: { $exists: true } } }, { $count: "n" }],
					hasSrp: [{ $match: { srp: { $exists: true } } }, { $count: "n" }],
					hasSupplierPrice: [{ $match: { supplierPrice: { $exists: true } } }, { $count: "n" }],
					hasEmployeePrice: [{ $match: { employeePrice: { $exists: true } } }, { $count: "n" }],
				},
			},
		],
		cursor: {},
	})) as any;

	const after = afterCounts?.cursor?.firstBatch?.[0] ?? {};
	console.log("After migration:");
	console.log(`  Items with retailPrice:  ${after.hasRetailPrice?.[0]?.n ?? 0}  (should be 0)`);
	console.log(`  Items with sellingPrice: ${after.hasSellingPrice?.[0]?.n ?? 0}  (should be 0)`);
	console.log(`  Items with costPrice:    ${after.hasCostPrice?.[0]?.n ?? 0}  (should be 0)`);
	console.log(`  Items with srp:          ${after.hasSrp?.[0]?.n ?? 0}`);
	console.log(`  Items with supplierPrice:${after.hasSupplierPrice?.[0]?.n ?? 0}`);
	console.log(`  Items with employeePrice:${after.hasEmployeePrice?.[0]?.n ?? 0}`);

	const oldFieldsRemaining =
		(after.hasRetailPrice?.[0]?.n ?? 0) +
		(after.hasSellingPrice?.[0]?.n ?? 0) +
		(after.hasCostPrice?.[0]?.n ?? 0);

	console.log("\n" + "=".repeat(60));
	if (oldFieldsRemaining === 0) {
		console.log("Migration completed successfully.");
	} else {
		console.log(`WARNING: ${oldFieldsRemaining} item(s) still have old fields.`);
		process.exitCode = 1;
	}
	console.log("=".repeat(60));
}

run()
	.catch((err) => {
		console.error("Migration failed:", err);
		process.exit(1);
	})
	.finally(() => prisma.$disconnect());
