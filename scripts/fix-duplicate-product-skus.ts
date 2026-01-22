/**
 * Script to find and fix duplicate product SKUs
 *
 * This script:
 * 1. Finds all products with duplicate SKUs
 * 2. Updates each duplicate SKU to make it unique by appending a suffix (-1, -2, etc.)
 *
 * Usage:
 *   npx ts-node scripts/fix-duplicate-product-skus.ts
 *
 * Or compile and run:
 *   npx tsc scripts/fix-duplicate-product-skus.ts
 *   node scripts/fix-duplicate-product-skus.js
 */

import { PrismaClient } from "../generated/prisma";
import * as dotenv from "dotenv";

// Load environment variables
dotenv.config();

const prisma = new PrismaClient();

interface DuplicateGroup {
	sku: string;
	products: Array<{ id: string; sku: string; name: string }>;
}

async function findDuplicateSKUs(): Promise<DuplicateGroup[]> {
	console.log("\n🔍 Finding duplicate SKUs...\n");

	// Get all products
	const allProducts = await prisma.product.findMany({
		select: {
			id: true,
			sku: true,
			name: true,
		},
		orderBy: {
			createdAt: "asc", // Keep the oldest product with original SKU
		},
	});

	// Group by SKU
	const skuMap = new Map<string, Array<{ id: string; sku: string; name: string }>>();

	for (const product of allProducts) {
		const sku = product.sku.trim(); // Normalize SKU
		if (!skuMap.has(sku)) {
			skuMap.set(sku, []);
		}
		skuMap.get(sku)!.push(product);
	}

	// Find duplicates (SKUs with more than 1 product)
	const duplicates: DuplicateGroup[] = [];

	for (const [sku, products] of skuMap.entries()) {
		if (products.length > 1) {
			duplicates.push({ sku, products });
		}
	}

	return duplicates;
}

async function generateUniqueSKU(
	baseSKU: string,
	existingSKUs: Set<string>,
	suffix: number,
): Promise<string> {
	let newSKU = `${baseSKU}-${suffix}`;
	let attempts = 0;
	const maxAttempts = 1000;

	// Keep trying until we find a unique SKU
	while (existingSKUs.has(newSKU) && attempts < maxAttempts) {
		suffix++;
		newSKU = `${baseSKU}-${suffix}`;
		attempts++;
	}

	if (attempts >= maxAttempts) {
		// Fallback to timestamp-based SKU
		const timestamp = Date.now();
		newSKU = `${baseSKU}-${timestamp}`;
	}

	return newSKU;
}

async function fixDuplicateSKUs() {
	try {
		console.log("🚀 Starting duplicate SKU fix process...\n");

		// Step 1: Find duplicates
		const duplicates = await findDuplicateSKUs();

		if (duplicates.length === 0) {
			console.log("✅ No duplicate SKUs found! All SKUs are unique.\n");
			return;
		}

		console.log(`📊 Found ${duplicates.length} duplicate SKU group(s):\n`);

		// Display duplicates
		for (const group of duplicates) {
			console.log(`   SKU: "${group.sku}" - ${group.products.length} products`);
			for (const product of group.products) {
				console.log(`      - ${product.name} (ID: ${product.id})`);
			}
			console.log();
		}

		// Step 2: Get all existing SKUs to check uniqueness
		const allProducts = await prisma.product.findMany({
			select: { sku: true },
		});
		const existingSKUs = new Set(allProducts.map((p) => p.sku));

		// Step 3: Fix duplicates
		console.log("🔧 Fixing duplicate SKUs...\n");

		let totalFixed = 0;
		const updates: Array<{ id: string; oldSKU: string; newSKU: string; name: string }> = [];

		for (const group of duplicates) {
			// Keep the first product (oldest) with original SKU
			// Update the rest with unique suffixes
			for (let i = 1; i < group.products.length; i++) {
				const product = group.products[i];
				const baseSKU = group.sku.trim();
				const newSKU = await generateUniqueSKU(baseSKU, existingSKUs, i);

				try {
					await prisma.product.update({
						where: { id: product.id },
						data: { sku: newSKU },
					});

					updates.push({
						id: product.id,
						oldSKU: product.sku,
						newSKU: newSKU,
						name: product.name,
					});

					// Add new SKU to existing set
					existingSKUs.add(newSKU);
					totalFixed++;

					console.log(`   ✅ Updated: ${product.name}`);
					console.log(`      Old SKU: ${product.sku}`);
					console.log(`      New SKU: ${newSKU}\n`);
				} catch (error: any) {
					console.error(
						`   ❌ Failed to update product ${product.id}: ${error.message}\n`,
					);
				}
			}
		}

		// Step 4: Summary
		console.log("\n" + "=".repeat(60));
		console.log("📊 SUMMARY");
		console.log("=".repeat(60));
		console.log(`   Duplicate groups found: ${duplicates.length}`);
		console.log(`   Products updated: ${totalFixed}`);
		console.log(`   Products kept with original SKU: ${duplicates.length}`);

		if (updates.length > 0) {
			console.log("\n📝 Updated Products:");
			for (const update of updates) {
				console.log(`   - ${update.name}`);
				console.log(`     ${update.oldSKU} → ${update.newSKU}`);
			}
		}

		console.log("\n✅ All duplicate SKUs have been fixed!\n");
	} catch (error) {
		console.error("\n❌ Error fixing duplicate SKUs:", error);
		process.exit(1);
	} finally {
		await prisma.$disconnect();
	}
}

// Run the script
fixDuplicateSKUs().catch(console.error);
