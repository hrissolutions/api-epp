# Cleanup Cart Items with Null itemId

## Problem

After migrating from `Product` to `Item` model, some cart items in the database may have `null` values for `itemId`. This causes Prisma errors when trying to query cart items because `itemId` is defined as non-nullable in the schema.

## Error Message

```
Error converting field "itemId" of expected non-nullable type "String",
found incompatible value of "null".
```

## Solution

### Option 1: Manual MongoDB Cleanup (Recommended)

Connect to your MongoDB database and run:

```javascript
db.cartItems.deleteMany({ itemId: null });
```

Or if you want to see what will be deleted first:

```javascript
// Find cart items with null itemId
db.cartItems.find({ itemId: null });

// Delete them
db.cartItems.deleteMany({ itemId: null });
```

### Option 2: Using the Cleanup Script

A cleanup script is available at `scripts/cleanup-null-itemid-cartitems.ts`.

**Note:** The script may need MongoDB native driver access. If it doesn't work, use Option 1.

### Option 3: Programmatic Cleanup via API

You can also create a temporary admin endpoint to clean up these items, or run the cleanup as part of your deployment process.

## Prevention

The checkout endpoint now includes error handling that will:

1. Catch Prisma errors related to null itemId
2. Return a helpful error message to the user
3. Log the issue for administrators

However, the corrupted data should still be cleaned up from the database.

## Verification

After cleanup, verify that all cart items have valid itemId:

```javascript
// In MongoDB shell
db.cartItems.find({ itemId: null }).count(); // Should return 0
```

## Related Files

- `app/cartItem/cartItem.controller.ts` - Checkout endpoint with error handling
- `prisma/schema/cartItem.prisma` - CartItem schema definition
- `scripts/cleanup-null-itemid-cartitems.ts` - Cleanup script
