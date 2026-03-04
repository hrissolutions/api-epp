/**
 * Script: Fix supplierPrice hierarchy
 *
 * Business rule: supplierPrice < employeePrice < srp
 * supplierPrice is what Uzaro pays the supplier, so it must always be
 * BELOW the employee-facing price.
 *
 * This script finds all items where:
 *   - supplierPrice is null, OR
 *   - supplierPrice >= employeePrice (hierarchy violated)
 *
 * …and sets supplierPrice = employeePrice * (1 - discount)
 * where discount is a random value between 10% and 30%.
 *
 * Usage:
 *   npx ts-node scripts/fix-supplier-price-hierarchy.ts
 */

import { PrismaClient } from "../generated/prisma";
import * as dotenv from "dotenv";

dotenv.config();

const prisma = new PrismaClient();

function randomDiscount(minPct = 10, maxPct = 30): number {
	return (Math.floor(Math.random() * (maxPct - minPct + 1)) + minPct) / 100;
}

async function run() {
	console.log("=".repeat(60));
	console.log("Fix supplierPrice hierarchy");
	console.log("Rule: supplierPrice = employeePrice × (1 - 10~30%)");
	console.log("=".repeat(60) + "\n");

	// Fetch all items that need fixing:
	// - supplierPrice is null, OR
	// - employeePrice is set AND supplierPrice >= employeePrice
	const items = await prisma.item.findMany({
		where: {
			OR: [
				{ supplierPrice: null },
				// Prisma can't express "supplierPrice >= employeePrice" directly,
				// so we fetch all items with employeePrice set and filter in JS.
				{ employeePrice: { not: null } },
			],
		},
		select: {
			id: true,
			sku: true,
			name: true,
			srp: true,
			supplierPrice: true,
			employeePrice: true,
		},
	});

	// Filter to only items that actually need fixing
	const toFix = items.filter((item) => {
		if (item.supplierPrice === null) return true;
		if (item.employeePrice !== null && item.supplierPrice >= item.employeePrice) return true;
		return false;
	});

	console.log(`Total items fetched:      ${items.length}`);
	console.log(`Items needing correction: ${toFix.length}\n`);

	if (toFix.length === 0) {
		console.log("All items already have correct hierarchy. Nothing to do.");
		return;
	}

	let updated = 0;
	let errors = 0;

	for (const item of toFix) {
		try {
			// Base price to discount from: prefer employeePrice, fall back to srp
			const base = item.employeePrice ?? item.srp;
			const discount = randomDiscount(10, 30);
			const newSupplierPrice = Math.round(base * (1 - discount) * 100) / 100;

			await prisma.item.update({
				where: { id: item.id },
				data: { supplierPrice: newSupplierPrice },
			});

			console.log(`  ✓ ${item.name} (${item.sku})`);
			console.log(
				`    base (${item.employeePrice !== null ? "employeePrice" : "srp"}): ${base.toFixed(2)}`,
			);
			console.log(`    discount: ${(discount * 100).toFixed(0)}%`);
			console.log(
				`    supplierPrice: ${item.supplierPrice?.toFixed(2) ?? "null"} → ${newSupplierPrice.toFixed(2)}`,
			);
			updated++;
		} catch (err: any) {
			console.error(`  ✗ Failed for ${item.sku}: ${err.message}`);
			errors++;
		}
	}

	console.log("\n" + "=".repeat(60));
	console.log(`Updated: ${updated}  Errors: ${errors}`);

	if (errors === 0) {
		console.log("supplierPrice hierarchy fixed successfully.");
	} else {
		console.log(`WARNING: ${errors} item(s) failed.`);
		process.exitCode = 1;
	}
	console.log("=".repeat(60));
}

run()
	.catch((err) => {
		console.error("Script failed:", err);
		process.exit(1);
	})
	.finally(() => prisma.$disconnect());
