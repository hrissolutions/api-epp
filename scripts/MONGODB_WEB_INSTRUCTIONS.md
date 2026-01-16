# How to Drop Old Index in MongoDB Atlas/Web

## Method 1: Using MongoDB Shell (Recommended)

### Step-by-Step Instructions:

1. **Open MongoDB Atlas Dashboard**
   - Go to https://cloud.mongodb.com
   - Log in to your account
   - Select your project/cluster

2. **Open MongoDB Shell**
   - Click on **"Database"** in the left sidebar
   - Click on **"Browse Collections"**
   - Click on the **"..."** menu (three dots) next to your database
   - Select **"Open MongoDB Shell"** or **"Shell"**

3. **Run the Script**
   - Copy the entire contents of `scripts/drop-old-approval-level-index-web.js`
   - Paste it into the MongoDB Shell
   - Press **Enter** to execute

4. **Verify**
   - The script will show you all indexes before and after
   - You should see a success message if the index was dropped

---

## Method 2: Using Atlas UI (Visual Method)

### Step-by-Step Instructions:

1. **Navigate to Collections**
   - Go to MongoDB Atlas dashboard
   - Click **"Database"** → **"Browse Collections"**
   - Select your database

2. **Find the Collection**
   - Click on the **"approvalLevels"** collection

3. **View Indexes**
   - Click on the **"Indexes"** tab at the top

4. **Identify the Old Index**
   - Look for an index that contains:
     - `workflowId` field
     - `level` field
   - It might be named something like:
     - `workflowId_1_level_1`
     - `approvalLevels_workflowId_level_key`

5. **Drop the Index**
   - Click the **"Drop"** button (trash icon) next to that index
   - Confirm the deletion

---

## Method 3: Quick Command (Copy & Paste)

If you just want a quick command to run in the shell:

```javascript
// Check indexes
db.approvalLevels.getIndexes()

// Drop the index (try this first)
db.approvalLevels.dropIndex("workflowId_1_level_1")

// If that doesn't work, try:
db.approvalLevels.dropIndex("approvalLevels_workflowId_level_key")

// Or drop by finding it first:
db.approvalLevels.getIndexes().forEach(function(index) {
  if (index.key.workflowId && index.key.level && index.name !== "_id_") {
    print("Found index: " + index.name);
    db.approvalLevels.dropIndex(index.name);
  }
})
```

---

## Verification

After dropping the index, verify it's gone:

```javascript
// This should NOT show an index with workflowId and level
db.approvalLevels.getIndexes()
```

You should only see the `_id_` index (and any other indexes you want to keep).

---

## Troubleshooting

### Error: "Index not found"
- The index may have already been dropped
- Check the current indexes: `db.approvalLevels.getIndexes()`

### Error: "Not authorized"
- Make sure you have the correct permissions
- You need `dropIndex` permission on the collection

### Can't find the index
- Run `db.approvalLevels.getIndexes()` to see all indexes
- Look for any index that has both `workflowId` and `level` in its keys

---

## After Dropping the Index

Once the index is dropped, you should be able to:
- ✅ Create new `ApprovalLevel` records without errors
- ✅ The constraint error will no longer appear
- ✅ Your application should work normally
