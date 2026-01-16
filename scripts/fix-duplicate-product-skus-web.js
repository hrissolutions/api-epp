// ============================================
// Script to Fix Duplicate Product SKUs (MongoDB Web/Atlas)
// ============================================
// 
// INSTRUCTIONS FOR MONGODB ATLAS/WEB:
// 
// 1. Go to your MongoDB Atlas/Web dashboard
// 2. Click on "Database" → "Browse Collections"
// 3. Click on "..." menu → "Open MongoDB Shell" or "Shell"
// 4. Copy and paste this entire script into the shell
// 5. Press Enter to execute
//
// ============================================

print("\n🚀 Starting duplicate SKU fix process...\n");

// Step 1: Find all products
print("🔍 Finding all products...\n");
const allProducts = db.products.find({}).sort({ createdAt: 1 }).toArray();
print(`   Found ${allProducts.length} total products\n`);

// Step 2: Group by SKU to find duplicates
print("📊 Analyzing SKUs for duplicates...\n");
const skuMap = {};

allProducts.forEach(function(product) {
  const sku = product.sku ? product.sku.trim() : "";
  if (!sku) {
    print(`   ⚠️  Warning: Product ${product._id} has empty SKU\n`);
    return;
  }
  
  if (!skuMap[sku]) {
    skuMap[sku] = [];
  }
  skuMap[sku].push({
    id: product._id,
    sku: product.sku,
    name: product.name || "Unknown"
  });
});

// Step 3: Find duplicates
const duplicates = [];
for (const sku in skuMap) {
  if (skuMap[sku].length > 1) {
    duplicates.push({
      sku: sku,
      products: skuMap[sku]
    });
  }
}

if (duplicates.length === 0) {
  print("✅ No duplicate SKUs found! All SKUs are unique.\n");
  quit();
}

print(`📊 Found ${duplicates.length} duplicate SKU group(s):\n`);

// Display duplicates
duplicates.forEach(function(group) {
  print(`   SKU: "${group.sku}" - ${group.products.length} products`);
  group.products.forEach(function(product) {
    print(`      - ${product.name} (ID: ${product.id})`);
  });
  print("");
});

// Step 4: Fix duplicates
print("🔧 Fixing duplicate SKUs...\n");

let totalFixed = 0;
const updates = [];

duplicates.forEach(function(group) {
  // Keep the first product (oldest) with original SKU
  // Update the rest with unique suffixes
  for (let i = 1; i < group.products.length; i++) {
    const product = group.products[i];
    const baseSKU = group.sku.trim();
    let suffix = i;
    let newSKU = baseSKU + "-" + suffix;
    
    // Make sure the new SKU is unique
    let attempts = 0;
    while (db.products.findOne({ sku: newSKU }) && attempts < 1000) {
      suffix++;
      newSKU = baseSKU + "-" + suffix;
      attempts++;
    }
    
    if (attempts >= 1000) {
      // Fallback to timestamp-based SKU
      const timestamp = new Date().getTime();
      newSKU = baseSKU + "-" + timestamp;
    }
    
    try {
      const result = db.products.updateOne(
        { _id: product.id },
        { $set: { sku: newSKU, updatedAt: new Date() } }
      );
      
      if (result.modifiedCount === 1) {
        updates.push({
          id: product.id,
          oldSKU: product.sku,
          newSKU: newSKU,
          name: product.name
        });
        totalFixed++;
        
        print(`   ✅ Updated: ${product.name}`);
        print(`      Old SKU: ${product.sku}`);
        print(`      New SKU: ${newSKU}\n`);
      } else {
        print(`   ⚠️  No changes made to: ${product.name} (ID: ${product.id})\n`);
      }
    } catch (error) {
      print(`   ❌ Failed to update product ${product.id}: ${error.message}\n`);
    }
  }
});

// Step 5: Summary
print("\n" + "=".repeat(60));
print("📊 SUMMARY");
print("=".repeat(60));
print(`   Duplicate groups found: ${duplicates.length}`);
print(`   Products updated: ${totalFixed}`);
print(`   Products kept with original SKU: ${duplicates.length}`);

if (updates.length > 0) {
  print("\n📝 Updated Products:");
  updates.forEach(function(update) {
    print(`   - ${update.name}`);
    print(`     ${update.oldSKU} → ${update.newSKU}`);
  });
}

print("\n✅ All duplicate SKUs have been fixed!\n");

// Verification: Check if there are still duplicates
print("\n🔍 Verifying no duplicates remain...\n");
const verification = db.products.aggregate([
  {
    $group: {
      _id: "$sku",
      count: { $sum: 1 },
      products: { $push: { id: "$_id", name: "$name" } }
    }
  },
  {
    $match: { count: { $gt: 1 } }
  }
]).toArray();

if (verification.length === 0) {
  print("✅ Verification passed! No duplicate SKUs found.\n");
} else {
  print(`⚠️  Warning: Still found ${verification.length} duplicate SKU group(s):\n`);
  verification.forEach(function(group) {
    print(`   SKU: "${group._id}" - ${group.count} products`);
  });
  print("\n   You may need to run this script again.\n");
}

print("✨ Done!\n");
