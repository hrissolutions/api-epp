# Socket events for orders

All Socket.IO events related to orders, approval flow, and supplier/order notifications.

---

## Client → Server (subscribe)

Clients **emit** these to join rooms and receive server events.

| Event                 | Payload     | Room joined   | Use case                                      |
|-----------------------|------------|---------------|-----------------------------------------------|
| `subscribe:user`      | `userId`   | `user:{userId}`   | Order-approval notifications for that user (approver/employee). |
| `subscribe:supplier`  | `supplierId` | `supplier:{supplierId}` | Order-approved and low-stock notifications for that supplier.     |

**Example (client):**
```js
socket.emit("subscribe:user", "507f1f77bcf86cd799439011");
socket.emit("subscribe:supplier", "6967254808c11f871550ffe0");
```

---

## Server → Client (order approval)

Emitted to **user rooms** (`user:{userId}`). Client must have called `subscribe:user` with that `userId`.

| Event                         | When emitted                         | Payload (summary) |
|--------------------------------|--------------------------------------|-------------------|
| `order:approval:assigned`      | Approval chain created for an order | `approvalId`, `orderId`, `orderNumber`, `orderTotal`, `approvalLevel`, `approverRole`, `approverName`, `approverEmail`, `status`, `message`, `createdAt` |
| `order:approval:decision`      | Current approver approved/rejected  | `approvalId`, `orderId`, `orderNumber`, `orderTotal`, `approvalLevel`, `approverRole`, `status`, `comments`, `message`, `at` |
| `order:approval:your_turn`     | Next approver’s turn                  | `approvalId`, `orderId`, `orderNumber`, `orderTotal`, `approvalLevel`, `approverRole`, `approverName`, `previousApproverName`, `message`, `at` |
| `order:approval:fully_approved` | Order fully approved                | `orderId`, `orderNumber`, `orderTotal`, `message`, `at` |
| `order:approval:rejected`      | Order rejected                      | `orderId`, `orderNumber`, `orderTotal`, `rejectedBy`, `rejectionReason`, `message`, `at` |
| `order:approved`               | Order fully approved (for **order owner** only) | `orderId`, `orderNumber`, `orderTotal`, `message`, `at` |
| `order:rejected`               | Order rejected (for **order owner** only)       | `orderId`, `orderNumber`, `orderTotal`, `rejectedBy`, `rejectionReason`, `message`, `at` |

**Source:** `helper/socketOrderApproval.ts` (used from `helper/approvalService.ts`).

**Note:** `order:approved` and `order:rejected` are sent to the **employee who placed the order** (`user:{order.userId}`). The approval events above are sent to **approvers**.

---

## Server → Client (notifications)

Emitted to **supplier rooms** (`supplier:{supplierId}`). Client must have called `subscribe:supplier` with that `supplierId`.

| Event          | When emitted                    | Payload (summary) |
|----------------|---------------------------------|-------------------|
| `notification` | Order approved (items from supplier) | `category: "ORDER_APPROVED_SUPPLIER"`, `notificationId`, `title`, `description`, `metadata` (e.g. `orderId`, `orderNumber`, `supplierId`, `itemCount`, `approvedAt`, `itemIds`), `recipients`, `createdAt` |
| `notification` | Item low stock (supplier’s item)     | `category: "LOW_STOCK"`, `notificationId`, `title`, `description`, `metadata` (e.g. `itemId`, `sku`, `name`, `stockQuantity`, `lowStockThreshold`, `supplierId`), `recipients`, `createdAt` |

**Sources:**
- Order approved → `helper/orderApprovedSupplierNotification.ts`
- Low stock → `helper/lowStockNotificationService.ts`

**Client:** Distinguish by `payload.category` (`ORDER_APPROVED_SUPPLIER` vs `LOW_STOCK`).

---

## Quick reference

| Direction   | Event                          | Room / target      |
|------------|--------------------------------|--------------------|
| Client → Server | `subscribe:user`           | join `user:{userId}`   |
| Client → Server | `subscribe:supplier`      | join `supplier:{supplierId}` |
| Server → Client | `order:approval:assigned`  | `user:{approverId}`   |
| Server → Client | `order:approval:decision`  | `user:{approverId}`   |
| Server → Client | `order:approval:your_turn` | `user:{nextApproverId}` |
| Server → Client | `order:approval:fully_approved` | `user:{each approverId}` |
| Server → Client | `order:approval:rejected`   | `user:{each approverId}` |
| Server → Client | `order:approved`            | `user:{orderOwnerUserId}` (employee who placed the order) |
| Server → Client | `order:rejected`            | `user:{orderOwnerUserId}` (employee who placed the order) |
| Server → Client | `notification` (order approved) | `supplier:{supplierId}` |
| Server → Client | `notification` (low stock)  | `supplier:{supplierId}` |

---

## Order cycle – socket coverage

| Step in order cycle | Who is notified (socket) |
|---------------------|---------------------------|
| Order created | — (no socket today; optional: `order:created` to order owner) |
| Approval chain created | Approvers: `order:approval:assigned`; first approver: `order:approval:your_turn` |
| One approver approves | That approver: `order:approval:decision`; next approver: `order:approval:your_turn` |
| One approver rejects | That approver: `order:approval:decision`; all approvers + **order owner**: `order:approval:rejected` / `order:rejected` |
| Order fully approved | All approvers: `order:approval:fully_approved`; **order owner**: `order:approved`; suppliers: `notification` (ORDER_APPROVED_SUPPLIER) |
| Stock low after deduct | Supplier: `notification` (LOW_STOCK) |
| PO created / PO confirmed | — (no socket today; optional: notify supplier or admin) |
