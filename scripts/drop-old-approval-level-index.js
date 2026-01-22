// Script to drop old unique index from approvalLevels collection
// This fixes the error: "Unique constraint failed on the constraint: approvalLevels_workflowId_level_key"
//
// Usage:
//   Option 1: Run with mongosh
//     mongosh "your_connection_string" scripts/drop-old-approval-level-index.js
//
//   Option 2: Run in MongoDB Compass
//     Copy and paste the code into MongoDB Compass shell
//
//   Option 3: Run with Node.js (if you have mongodb driver)
//     node scripts/drop-old-approval-level-index.js

// Get database name from connection string or use default
const dbName = db.getName();
print(`\n🔍 Checking indexes in database: ${dbName}\n`);

// Switch to approvalLevels collection
const collection = db.approvalLevels;

// List all current indexes
print("📋 Current indexes on 'approvalLevels' collection:");
printjson(collection.getIndexes());

// Try to drop the old unique index
// MongoDB index names can vary, so we'll try common variations
const indexNamesToDrop = [
	"workflowId_1_level_1", // Default MongoDB naming
	"approvalLevels_workflowId_level_key", // Prisma naming
	"workflowId_level_unique", // Alternative naming
];

let dropped = false;

for (const indexName of indexNamesToDrop) {
	try {
		const result = collection.dropIndex(indexName);
		if (result.ok === 1) {
			print(`\n✅ Successfully dropped index: ${indexName}\n`);
			dropped = true;
			break;
		}
	} catch (error) {
		// Index doesn't exist with this name, try next
		if (error.codeName === "IndexNotFound") {
			print(`ℹ️  Index '${indexName}' not found, trying next...`);
			continue;
		} else {
			print(`⚠️  Error checking index '${indexName}': ${error.message}`);
		}
	}
}

// If none of the named indexes exist, try to find and drop by key pattern
if (!dropped) {
	print("\n🔍 Searching for index with workflowId and level fields...\n");

	const indexes = collection.getIndexes();
	for (const index of indexes) {
		const keys = index.key;
		// Check if index has both workflowId and level
		if (keys && keys.workflowId && keys.level) {
			const indexName = index.name;
			try {
				const result = collection.dropIndex(indexName);
				if (result.ok === 1) {
					print(`✅ Successfully dropped index: ${indexName}`);
					print(`   Index keys: ${JSON.stringify(keys)}\n`);
					dropped = true;
					break;
				}
			} catch (error) {
				print(`❌ Error dropping index '${indexName}': ${error.message}`);
			}
		}
	}
}

if (!dropped) {
	print("\n⚠️  No matching index found to drop.");
	print("   The index may have already been removed, or it doesn't exist.\n");
} else {
	print("\n📋 Updated indexes on 'approvalLevels' collection:");
	printjson(collection.getIndexes());
	print("\n✨ Done! You can now create ApprovalLevel records without the old constraint.\n");
}
