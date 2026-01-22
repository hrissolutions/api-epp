// ============================================
// Script to Drop Old Unique Index from MongoDB Web/Atlas
// ============================================
//
// INSTRUCTIONS FOR MONGODB ATLAS/WEB:
//
// 1. Go to your MongoDB Atlas/Web dashboard
// 2. Click on "Browse Collections" or "Collections"
// 3. Select your database
// 4. Click on the "approvalLevels" collection
// 5. Click on the "Indexes" tab
// 6. Look for an index with "workflowId" and "level" fields
// 7. Click the "Drop" button next to that index
//
// OR use the Shell/Query interface:
// 1. Go to MongoDB Atlas dashboard
// 2. Click on "Database" → "Browse Collections"
// 3. Click on "..." menu → "Open MongoDB Shell" or "Shell"
// 4. Copy and paste the code below into the shell
// 5. Press Enter to execute
//
// ============================================

// Step 1: Check current database
print("\n🔍 Current database: " + db.getName() + "\n");

// Step 2: List all indexes on approvalLevels collection
print("📋 Current indexes on 'approvalLevels' collection:\n");
const indexes = db.approvalLevels.getIndexes();
printjson(indexes);
print("\n");

// Step 3: Try to drop the old unique index
print("🔧 Attempting to drop old unique index...\n");

// Common index name patterns to try
const indexNamesToTry = [
	"workflowId_1_level_1", // Default MongoDB naming
	"approvalLevels_workflowId_level_key", // Prisma naming
	"workflowId_level_unique", // Alternative naming
];

let dropped = false;
let droppedIndexName = null;

// Try dropping by name first
for (const indexName of indexNamesToTry) {
	try {
		const result = db.approvalLevels.dropIndex(indexName);
		if (result.ok === 1) {
			print("✅ Successfully dropped index: " + indexName + "\n");
			dropped = true;
			droppedIndexName = indexName;
			break;
		}
	} catch (error) {
		// Index doesn't exist with this name, continue
		if (error.codeName === "IndexNotFound" || error.message.includes("index not found")) {
			print("ℹ️  Index '" + indexName + "' not found, trying next...\n");
		} else {
			print("⚠️  Error checking index '" + indexName + "': " + error.message + "\n");
		}
	}
}

// If not found by name, search by key pattern
if (!dropped) {
	print("🔍 Searching for index with 'workflowId' and 'level' fields...\n");

	for (let i = 0; i < indexes.length; i++) {
		const index = indexes[i];
		const keys = index.key;

		// Check if this index has both workflowId and level
		if (keys && keys.workflowId !== undefined && keys.level !== undefined) {
			const indexName = index.name;

			// Skip the default _id index
			if (indexName === "_id_") {
				continue;
			}

			try {
				const result = db.approvalLevels.dropIndex(indexName);
				if (result.ok === 1) {
					print("✅ Successfully dropped index: " + indexName);
					print("   Index keys: " + JSON.stringify(keys) + "\n");
					dropped = true;
					droppedIndexName = indexName;
					break;
				}
			} catch (error) {
				print("❌ Error dropping index '" + indexName + "': " + error.message + "\n");
			}
		}
	}
}

// Step 4: Show results
if (dropped) {
	print("✨ Index dropped successfully!\n");
	print("📋 Updated indexes on 'approvalLevels' collection:\n");
	const updatedIndexes = db.approvalLevels.getIndexes();
	printjson(updatedIndexes);
	print("\n✅ You can now create ApprovalLevel records without the constraint error!\n");
} else {
	print("⚠️  No matching index found to drop.\n");
	print("   Possible reasons:");
	print("   1. The index was already removed");
	print("   2. The index doesn't exist");
	print("   3. The index has a different name\n");
	print("   Current indexes are shown above. If you see an index with");
	print("   'workflowId' and 'level', you can drop it manually using:");
	print("   db.approvalLevels.dropIndex('index_name_here')\n");
}

// ============================================
// ALTERNATIVE: Manual drop command
// ============================================
// If the script above doesn't work, you can manually run:
//
// db.approvalLevels.dropIndex("workflowId_1_level_1")
//
// Or to see all indexes first:
// db.approvalLevels.getIndexes()
//
// Then drop the specific one:
// db.approvalLevels.dropIndex("name_of_the_index")
// ============================================
