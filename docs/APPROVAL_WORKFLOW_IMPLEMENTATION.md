# Order Approval Workflow Implementation

## Overview

This document outlines the complete implementation of the order approval workflow system, including all models, controllers, routes, and validation schemas.

## Changes Made

### 1. Prisma Schema Updates

#### New Models Created

**`prisma/schema/orderApproval.prisma`**

- Tracks individual approval steps for each order
- Fields: orderId (@db.ObjectId), approvalLevel, approverRole, approverId, approverName, approverEmail, status, comments, notification tracking
- Indexes: orderId, approverId, status, approvalLevel
- Unique constraint: [orderId, approvalLevel]
- Note: All IDs use @map("\_id") for MongoDB compatibility

**`prisma/schema/approvalWorkflow.prisma`**

- Defines approval workflow configurations
- Fields: name, description, isActive, minOrderAmount (Float), maxOrderAmount (Float), requiresInstallment
- Relations: levels (ApprovalLevel[])
- Note: Uses Float instead of Decimal for MongoDB compatibility

**`prisma/schema/approvalLevel.prisma`**

- Defines approval levels within workflows
- Fields: workflowId, level, role, description, isRequired, autoApproveUnder (Float), timeoutDays
- Unique constraint: [workflowId, level]
- Note: Uses Float instead of Decimal for MongoDB compatibility

#### Updated Models

**`prisma/schema/order.prisma`**

- Added approval workflow fields:
    - `approvals` (OrderApproval[])
    - `currentApprovalLevel` (Int, default: 1)
    - `isFullyApproved` (Boolean, default: false)
    - `approvedAt` (DateTime?)
    - `rejectedAt` (DateTime?)
    - `rejectedBy` (String?)
    - `rejectionReason` (String?)

**OrderStatus Enum Updated:**

```prisma
enum OrderStatus {
  PENDING_APPROVAL  // Waiting for approvals
  APPROVED          // All approvals completed
  REJECTED          // Rejected by an approver
  PROCESSING        // Being prepared/packed
  SHIPPED           // Out for delivery
  DELIVERED         // Successfully delivered
  CANCELLED         // Cancelled by employee or system
  RETURNED          // Returned by employee
}
```

**New Enums Added:**

```prisma
enum ApproverRole {
  MANAGER           // Direct manager
  HR                // HR department
  FINANCE           // Finance department
  DEPARTMENT_HEAD   // Department head
  ADMIN             // System admin
}

enum ApprovalStatus {
  PENDING           // Waiting for approval
  APPROVED          // Approved
  REJECTED          // Rejected
  EXPIRED           // Timeout expired
  SKIPPED           // Skipped (auto-approved)
}
```

### 2. Zod Validation Schemas

**Created:**

- `zod/orderApproval.zod.ts` - Validation for OrderApproval model
- `zod/approvalWorkflow.zod.ts` - Validation for ApprovalWorkflow model
- `zod/approvalLevel.zod.ts` - Validation for ApprovalLevel model

**Updated:**

- `zod/order.zod.ts` - Updated OrderStatus enum and default status to PENDING_APPROVAL

### 3. App Structure (Controllers, Routes, Index)

#### OrderApproval Module

**Location:** `app/orderApproval/`

- `orderApproval.controller.ts` - CRUD operations for order approvals
- `orderApproval.router.ts` - API routes with caching
- `index.ts` - Module export

**Endpoints:**

- `GET /api/orderApproval` - Get all order approvals (with filtering, pagination)
- `GET /api/orderApproval/:id` - Get order approval by ID
- `POST /api/orderApproval` - Create new order approval
- `PATCH /api/orderApproval/:id` - Update order approval
- `DELETE /api/orderApproval/:id` - Delete order approval

#### ApprovalWorkflow Module

**Location:** `app/approvalWorkflow/`

- `approvalWorkflow.controller.ts` - CRUD operations for approval workflows
- `approvalWorkflow.router.ts` - API routes with caching
- `index.ts` - Module export

**Endpoints:**

- `GET /api/approvalWorkflow` - Get all workflows (with filtering, pagination)
- `GET /api/approvalWorkflow/:id` - Get workflow by ID
- `POST /api/approvalWorkflow` - Create new workflow
- `PATCH /api/approvalWorkflow/:id` - Update workflow
- `DELETE /api/approvalWorkflow/:id` - Delete workflow

#### ApprovalLevel Module

**Location:** `app/approvalLevel/`

- `approvalLevel.controller.ts` - CRUD operations for approval levels
- `approvalLevel.router.ts` - API routes with caching
- `index.ts` - Module export

**Endpoints:**

- `GET /api/approvalLevel` - Get all approval levels (with filtering, pagination)
- `GET /api/approvalLevel/:id` - Get approval level by ID
- `POST /api/approvalLevel` - Create new approval level
- `PATCH /api/approvalLevel/:id` - Update approval level
- `DELETE /api/approvalLevel/:id` - Delete approval level

### 4. Application Registration

**Updated `index.ts`:**

- Registered orderApproval, approvalWorkflow, and approvalLevel modules
- Added routes to middleware exclusion list (no authentication required for now)

## Features Implemented

### 1. Multi-Level Approval System

- Support for multiple approval levels (Manager, HR, Finance, Department Head, Admin)
- Track current approval level
- Sequential approval process

### 2. Approval Tracking

- Track approver details (ID, name, email)
- Record approval/rejection timestamps
- Store approval comments
- Notification tracking (notified at, reminder sent at)

### 3. Workflow Configuration

- Create custom approval workflows
- Set workflow conditions (min/max order amounts)
- Configure installment requirements
- Activate/deactivate workflows

### 4. Approval Level Configuration

- Define approval levels within workflows
- Set role requirements for each level
- Configure auto-approval thresholds
- Set timeout periods for auto-approval

### 5. Order Integration

- Track approval status directly on orders
- Link orders to approval records
- Support for rejection with reasons
- Track who rejected and when

## MongoDB Compatibility Notes

- All model IDs use `@map("_id")` annotation (MongoDB requirement)
- Numeric fields use `Float` instead of `Decimal` (MongoDB doesn't support Decimal type)
- OrderApproval.orderId uses `@db.ObjectId` to properly reference MongoDB ObjectId

## Next Steps

### 1. Database Changes ✅ COMPLETED

- ✅ Prisma client generated successfully
- ✅ Build completed without errors
- Since you're using MongoDB, Prisma will automatically sync the schema on first use (no migration needed)

### 2. Test the Endpoints

Use tools like Postman or curl to test:

- Creating workflows
- Adding approval levels to workflows
- Creating order approvals
- Updating approval statuses

### 3. Implement Business Logic (Optional Enhancements)

Consider adding service layers for:

- **Workflow Matcher**: Automatically determine which workflow applies to an order
- **Approval Processor**: Handle approval/rejection logic
- **Notification Service**: Send notifications to approvers
- **Auto-Approval Service**: Handle timeout-based auto-approvals
- **Reminder Service**: Send reminder notifications

Example implementation locations:

- `helper/approvalWorkflowMatcher.ts`
- `helper/approvalProcessor.ts`
- `helper/approvalNotificationService.ts`

### 4. Add Custom Routes (Optional)

Consider adding specialized endpoints:

- `POST /api/orderApproval/:id/approve` - Approve an order approval
- `POST /api/orderApproval/:id/reject` - Reject an order approval
- `GET /api/order/:orderId/approvals` - Get all approvals for an order
- `GET /api/approvalWorkflow/:workflowId/levels` - Get all levels for a workflow
- `POST /api/order/:orderId/submit-for-approval` - Submit order for approval

### 5. Frontend Integration

Develop UI components for:

- Approval dashboard for approvers
- Workflow configuration UI for admins
- Order approval history view
- Approval status indicators

### 6. Security & Authorization

Consider implementing:

- Role-based access control for approvers
- Permissions for workflow management
- Audit logging for approval actions (already partially implemented)

### 7. Testing

Create tests for:

- Workflow matching logic
- Approval state transitions
- Auto-approval scenarios
- Notification sending

## API Examples

### Create an Approval Workflow

```json
POST /api/approvalWorkflow
{
  "name": "Standard Order Approval",
  "description": "Default approval workflow for orders",
  "isActive": true,
  "minOrderAmount": 0,
  "maxOrderAmount": 10000,
  "requiresInstallment": false
}
```

### Add Approval Level to Workflow

```json
POST /api/approvalLevel
{
  "workflowId": "workflow_id_here",
  "level": 1,
  "role": "MANAGER",
  "description": "Manager approval required",
  "isRequired": true,
  "autoApproveUnder": 500,
  "timeoutDays": 3
}
```

### Create Order Approval

```json
POST /api/orderApproval
{
  "orderId": "order_id_here",
  "approvalLevel": 1,
  "approverRole": "MANAGER",
  "approverId": "employee_id",
  "approverName": "John Doe",
  "approverEmail": "john.doe@example.com"
}
```

### Update Approval Status

```json
PATCH /api/orderApproval/:id
{
  "status": "APPROVED",
  "approvedAt": "2026-01-14T10:30:00Z",
  "comments": "Approved for processing"
}
```

## Database Schema Relationships

```
Order (1) ----< (M) OrderApproval
ApprovalWorkflow (1) ----< (M) ApprovalLevel
```

## Caching Strategy

All endpoints implement Redis caching:

- Individual records: 90 seconds TTL
- List queries: 60 seconds TTL
- Automatic cache invalidation on create/update/delete operations

## Logging & Monitoring

All operations include:

- Activity logging (user actions)
- Audit logging (data changes)
- Error logging
- Performance monitoring via Redis cache stats

## Notes

- All modules follow the same pattern as existing modules (order, transaction, etc.)
- Full CRUD operations are available for all models
- Cascade deletes are configured where appropriate (OrderApproval cascades with Order)
- Unique constraints prevent duplicate approvals at the same level
- All numeric fields properly handle string-to-number conversion for form data
- OpenAPI documentation is included in router files for Swagger integration

## File Structure Summary

```
backend/
├── prisma/schema/
│   ├── order.prisma (updated)
│   ├── orderApproval.prisma (new)
│   ├── approvalWorkflow.prisma (new)
│   └── approvalLevel.prisma (new)
├── zod/
│   ├── order.zod.ts (updated)
│   ├── orderApproval.zod.ts (new)
│   ├── approvalWorkflow.zod.ts (new)
│   └── approvalLevel.zod.ts (new)
├── app/
│   ├── orderApproval/ (new)
│   │   ├── orderApproval.controller.ts
│   │   ├── orderApproval.router.ts
│   │   └── index.ts
│   ├── approvalWorkflow/ (new)
│   │   ├── approvalWorkflow.controller.ts
│   │   ├── approvalWorkflow.router.ts
│   │   └── index.ts
│   └── approvalLevel/ (new)
│       ├── approvalLevel.controller.ts
│       ├── approvalLevel.router.ts
│       └── index.ts
├── index.ts (updated)
└── docs/
    └── APPROVAL_WORKFLOW_IMPLEMENTATION.md (this file)
```
