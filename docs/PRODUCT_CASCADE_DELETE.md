# Product Cascade Delete Configuration

## Overview

When a Product is deleted, all related data will be automatically deleted (CASCADE).

## Cascade Delete Relations

### ✅ Will Be Deleted Automatically

When you delete a Product, these related records are automatically deleted:

1. **CartItem** 🛒
   - User shopping cart items containing this product
   - **Impact**: Users lose this product from their carts
   - **Risk Level**: ⚠️ Low - Expected behavior

2. **WishlistItem** ❤️
   - User wishlist items for this product
   - **Impact**: Users lose this product from their wishlists
   - **Risk Level**: ⚠️ Low - Expected behavior

3. **OrderItem** 📦
   - Order line items for this product
   - **Impact**: Historical order data is deleted
   - **Risk Level**: ⚠️⚠️⚠️ **HIGH** - Loses order history!

4. **Purchase** 💰
   - Employee purchase records (payroll loans, etc.)
   - **Impact**: Financial/purchase history is deleted
   - **Risk Level**: ⚠️⚠️⚠️ **HIGH** - Loses financial records!

## ⚠️ Important Warnings

### Deleting Products Will:

1. **Delete Order History**
   - All OrderItems referencing this product will be deleted
   - Orders may have incomplete data
   - Historical sales reports will be affected
   - **Solution**: Consider soft delete instead

2. **Delete Purchase Records**
   - Employee purchase history will be lost
   - Payroll loan records will be deleted
   - Financial auditing may be impacted
   - **Solution**: Consider soft delete instead

3. **Cannot Be Undone**
   - Once deleted, data cannot be recovered
   - No backup/restore mechanism
   - **Solution**: Always backup before bulk deletions

## Recommended: Soft Delete Instead

Instead of hard deleting products, consider using the `isActive` flag for soft delete:

### Soft Delete (Recommended)
```typescript
// Soft delete - product still exists but hidden
await prisma.product.update({
  where: { id: productId },
  data: { 
    isActive: false,
    isAvailable: false,
    isFeatured: false
  }
});
```

**Benefits:**
- ✅ Preserves order history
- ✅ Preserves purchase records
- ✅ Can be restored later
- ✅ Historical reports remain accurate
- ✅ Audit trail maintained

**Filtering in Queries:**
```typescript
// Get only active products
const products = await prisma.product.findMany({
  where: { isActive: true }
});
```

### Hard Delete (Current Implementation)
```typescript
// Hard delete - deletes product and ALL related data
await prisma.product.delete({
  where: { id: productId }
});
```

**Consequences:**
- ❌ Deletes order items
- ❌ Deletes purchase records
- ❌ Loses historical data
- ❌ Cannot be undone
- ❌ May break reports

## Schema Configuration

### Current Configuration

```prisma
// orderItem.prisma
model OrderItem {
  product   Product @relation(fields: [productId], references: [id], onDelete: Cascade, onUpdate: Cascade)
}

// cartItem.prisma
model CartItem {
  product    Product @relation(fields: [productId], references: [id], onDelete: Cascade, onUpdate: Cascade)
}

// wishlistItem.prisma
model WishlistItem {
  product    Product @relation(fields: [productId], references: [id], onDelete: Cascade, onUpdate: Cascade)
}

// purchase.prisma
model Purchase {
  product Product @relation(fields: [productId], references: [id], onDelete: Cascade, onUpdate: Cascade)
}
```

### Alternative: Restrict Historical Data

If you want to protect historical data, change OrderItem and Purchase to:

```prisma
// Protect historical data
model OrderItem {
  product   Product @relation(fields: [productId], references: [id], onDelete: Restrict, onUpdate: Cascade)
}

model Purchase {
  product Product @relation(fields: [productId], references: [id], onDelete: Restrict, onUpdate: Cascade)
}
```

This will prevent deletion if orders or purchases exist for the product.

## Migration

After updating the schema, run:

```bash
# Generate Prisma client
npm run prisma-generate

# Create and apply migration
npx prisma migrate dev --name add_product_cascade_delete

# Or for production
npx prisma migrate deploy
```

## Usage Examples

### Check Before Deleting

```typescript
// Check what will be deleted
const productData = await prisma.product.findUnique({
  where: { id: productId },
  include: {
    orderItems: { take: 1 },
    purchases: { take: 1 },
    cartItems: { take: 1 },
    wishlistItems: { take: 1 }
  }
});

console.log(`Will delete:
  - ${productData.orderItems.length > 0 ? 'Has order history' : 'No orders'}
  - ${productData.purchases.length > 0 ? 'Has purchase history' : 'No purchases'}
  - ${productData.cartItems.length > 0 ? 'In shopping carts' : 'Not in carts'}
  - ${productData.wishlistItems.length > 0 ? 'In wishlists' : 'Not in wishlists'}
`);
```

### Safe Delete with Confirmation

```typescript
async function safeDeleteProduct(productId: string) {
  // Count related records
  const [orderCount, purchaseCount] = await Promise.all([
    prisma.orderItem.count({ where: { productId } }),
    prisma.purchase.count({ where: { productId } })
  ]);

  if (orderCount > 0 || purchaseCount > 0) {
    throw new Error(
      `Cannot delete product: ${orderCount} orders and ${purchaseCount} purchases will be lost. Use soft delete instead.`
    );
  }

  // Safe to delete
  await prisma.product.delete({ where: { id: productId } });
}
```

### Bulk Soft Delete

```typescript
// Soft delete all inactive/old products
await prisma.product.updateMany({
  where: {
    updatedAt: { lt: new Date('2020-01-01') },
    stockQuantity: 0
  },
  data: {
    isActive: false,
    isAvailable: false
  }
});
```

## Best Practices

1. **Always Use Soft Delete for Products with History**
   - If product has orders or purchases, use soft delete
   - Hard delete only for newly created products with no history

2. **Implement Deletion Checks**
   - Check for related data before deletion
   - Warn users about data loss
   - Require confirmation for products with history

3. **Backup Before Bulk Operations**
   - Always backup database before bulk deletions
   - Test deletions on staging environment first

4. **Use Transaction for Related Deletions**
   ```typescript
   await prisma.$transaction([
     prisma.product.delete({ where: { id: productId } })
   ]);
   ```

5. **Log Deletion Events**
   - Log what was deleted for audit trail
   - Include user who performed deletion
   - Track deleted product IDs

## Monitoring

Keep track of deletions:

```typescript
// Count products by status
const stats = await prisma.product.groupBy({
  by: ['isActive'],
  _count: true
});

console.log('Active products:', stats.find(s => s.isActive)?._count);
console.log('Inactive products:', stats.find(s => !s.isActive)?._count);
```

## Rollback

If you need to revert to Restrict mode:

1. Update schemas back to `onDelete: Restrict`
2. Run: `npx prisma migrate dev --name revert_cascade_delete`
3. Handle deletion attempts with proper error messages

## Support

For questions about cascade delete behavior:
- See Prisma documentation: https://www.prisma.io/docs/concepts/components/prisma-schema/relations/referential-actions
- Check your specific business requirements
- Consider implementing soft delete for most use cases
