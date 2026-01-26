# Approval System - Sample JSON Examples

This document provides complete sample JSON examples for all approval-related entities in the EPP Backend system.

## Table of Contents

1. [ApprovalLevel](#approvallevel)
2. [ApprovalWorkflow](#approvalworkflow)
3. [WorkflowApprovalLevel](#workflowapprovallevel)
4. [OrderApproval](#orderapproval)
5. [Complete Workflow Setup Example](#complete-workflow-setup-example)

---

## ApprovalLevel

Base approval level definitions that define roles and their settings.

### Create ApprovalLevel

**POST** `/api/approvalLevel`

#### Sample Request - Manager Level

```json
{
  "role": "MANAGER",
  "description": "Direct manager approval required for employee orders",
  "isRequired": true,
  "autoApproveUnder": 1000,
  "timeoutDays": 3
}
```

#### Sample Request - HR Level

```json
{
  "role": "HR",
  "description": "HR department verification for employee benefits eligibility",
  "isRequired": true,
  "autoApproveUnder": null,
  "timeoutDays": 5
}
```

#### Sample Request - Finance Level

```json
{
  "role": "FINANCE",
  "description": "Finance department approval for budget and payment processing",
  "isRequired": true,
  "autoApproveUnder": null,
  "timeoutDays": 7
}
```

#### Sample Request - Department Head Level

```json
{
  "role": "DEPARTMENT_HEAD",
  "description": "Department head approval for high-value orders",
  "isRequired": true,
  "autoApproveUnder": 5000,
  "timeoutDays": 5
}
```

#### Sample Request - Admin Level

```json
{
  "role": "ADMIN",
  "description": "System administrator approval for special cases",
  "isRequired": false,
  "autoApproveUnder": null,
  "timeoutDays": 10
}
```

#### Sample Response

```json
{
  "success": true,
  "message": "Approval level created successfully",
  "data": {
    "approvalLevel": {
      "id": "67890abcdef1234567890123",
      "role": "MANAGER",
      "description": "Direct manager approval required for employee orders",
      "isRequired": true,
      "autoApproveUnder": 1000,
      "timeoutDays": 3,
      "createdAt": "2026-01-26T10:00:00.000Z",
      "updatedAt": "2026-01-26T10:00:00.000Z"
    }
  }
}
```

### Get All ApprovalLevels

**GET** `/api/approvalLevel`

#### Sample Response

```json
{
  "success": true,
  "data": {
    "approvalLevels": [
      {
        "id": "67890abcdef1234567890123",
        "role": "MANAGER",
        "description": "Direct manager approval required",
        "isRequired": true,
        "autoApproveUnder": 1000,
        "timeoutDays": 3,
        "createdAt": "2026-01-26T10:00:00.000Z",
        "updatedAt": "2026-01-26T10:00:00.000Z"
      },
      {
        "id": "67890abcdef1234567890124",
        "role": "HR",
        "description": "HR department verification",
        "isRequired": true,
        "autoApproveUnder": null,
        "timeoutDays": 5,
        "createdAt": "2026-01-26T10:05:00.000Z",
        "updatedAt": "2026-01-26T10:05:00.000Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 10,
      "total": 2,
      "totalPages": 1
    }
  }
}
```

---

## ApprovalWorkflow

Workflow templates that define conditions and rules for order approval.

### Create ApprovalWorkflow

**POST** `/api/approvalWorkflow`

#### Sample Request - Standard Workflow (Small Orders)

```json
{
  "name": "Standard Order Approval",
  "description": "For orders under $5,000",
  "isActive": true,
  "minOrderAmount": 0,
  "maxOrderAmount": 5000,
  "requiresInstallment": false
}
```

#### Sample Request - High-Value Workflow

```json
{
  "name": "High-Value Order Approval",
  "description": "For orders between $5,000 and $20,000",
  "isActive": true,
  "minOrderAmount": 5000,
  "maxOrderAmount": 20000,
  "requiresInstallment": false
}
```

#### Sample Request - Installment Workflow

```json
{
  "name": "Installment Order Approval",
  "description": "For all orders with installment payments",
  "isActive": true,
  "minOrderAmount": 0,
  "maxOrderAmount": null,
  "requiresInstallment": true
}
```

#### Sample Request - Premium Workflow (Very High Value)

```json
{
  "name": "Premium Order Approval",
  "description": "For orders over $20,000",
  "isActive": true,
  "minOrderAmount": 20000,
  "maxOrderAmount": null,
  "requiresInstallment": false
}
```

#### Sample Response

```json
{
  "success": true,
  "message": "Approval workflow created successfully",
  "data": {
    "approvalWorkflow": {
      "id": "67890abcdef1234567890125",
      "name": "Standard Order Approval",
      "description": "For orders under $5,000",
      "isActive": true,
      "minOrderAmount": 0,
      "maxOrderAmount": 5000,
      "requiresInstallment": false,
      "createdAt": "2026-01-26T10:10:00.000Z",
      "updatedAt": "2026-01-26T10:10:00.000Z"
    }
  }
}
```

### Get All ApprovalWorkflows

**GET** `/api/approvalWorkflow`

#### Sample Response

```json
{
  "success": true,
  "data": {
    "approvalWorkflows": [
      {
        "id": "67890abcdef1234567890125",
        "name": "Standard Order Approval",
        "description": "For orders under $5,000",
        "isActive": true,
        "minOrderAmount": 0,
        "maxOrderAmount": 5000,
        "requiresInstallment": false,
        "createdAt": "2026-01-26T10:10:00.000Z",
        "updatedAt": "2026-01-26T10:10:00.000Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 10,
      "total": 1,
      "totalPages": 1
    }
  }
}
```

---

## WorkflowApprovalLevel

Links workflows to approval levels, defining the sequence and assigning specific approvers.

### Create WorkflowApprovalLevel

**POST** `/api/workflowApprovalLevel`

#### Sample Request - Level 1 (Manager)

```json
{
  "workflowId": "67890abcdef1234567890125",
  "approvalLevelId": "67890abcdef1234567890123",
  "level": 1,
  "approverId": "67890abcdef1234567890101",
  "approverName": "John Doe",
  "approverEmail": "john.doe@company.com"
}
```

#### Sample Request - Level 2 (HR)

```json
{
  "workflowId": "67890abcdef1234567890125",
  "approvalLevelId": "67890abcdef1234567890124",
  "level": 2,
  "approverId": "67890abcdef1234567890102",
  "approverName": "Jane Smith",
  "approverEmail": "jane.smith@company.com"
}
```

#### Sample Request - Level 3 (Finance)

```json
{
  "workflowId": "67890abcdef1234567890125",
  "approvalLevelId": "67890abcdef1234567890126",
  "level": 3,
  "approverId": "67890abcdef1234567890103",
  "approverName": "Bob Johnson",
  "approverEmail": "bob.johnson@company.com"
}
```

#### Sample Request - Optional Approver (Null)

```json
{
  "workflowId": "67890abcdef1234567890125",
  "approvalLevelId": "67890abcdef1234567890123",
  "level": 1,
  "approverId": null,
  "approverName": null,
  "approverEmail": null
}
```

#### Sample Response

```json
{
  "success": true,
  "message": "Workflow approval level created successfully",
  "data": {
    "workflowApprovalLevel": {
      "id": "67890abcdef1234567890127",
      "workflowId": "67890abcdef1234567890125",
      "approvalLevelId": "67890abcdef1234567890123",
      "level": 1,
      "approverId": "67890abcdef1234567890101",
      "approverName": "John Doe",
      "approverEmail": "john.doe@company.com",
      "createdAt": "2026-01-26T10:15:00.000Z",
      "updatedAt": "2026-01-26T10:15:00.000Z"
    }
  }
}
```

### Get All WorkflowApprovalLevels

**GET** `/api/workflowApprovalLevel`

#### Sample Response

```json
{
  "success": true,
  "data": {
    "workflowApprovalLevels": [
      {
        "id": "67890abcdef1234567890127",
        "workflowId": "67890abcdef1234567890125",
        "approvalLevelId": "67890abcdef1234567890123",
        "level": 1,
        "approverId": "67890abcdef1234567890101",
        "approverName": "John Doe",
        "approverEmail": "john.doe@company.com",
        "workflow": {
          "id": "67890abcdef1234567890125",
          "name": "Standard Order Approval"
        },
        "approvalLevel": {
          "id": "67890abcdef1234567890123",
          "role": "MANAGER"
        },
        "createdAt": "2026-01-26T10:15:00.000Z",
        "updatedAt": "2026-01-26T10:15:00.000Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 10,
      "total": 1,
      "totalPages": 1
    }
  }
}
```

---

## OrderApproval

Actual approval records created for each order, tracking the approval status at each level.

### Create OrderApproval (Auto-generated when order is created)

OrderApprovals are automatically created when an order is created and a workflow is assigned. They are not typically created manually.

### Get OrderApproval by Order ID

**GET** `/api/orderApproval/order/:orderId`

#### Sample Response

```json
{
  "success": true,
  "data": {
    "orderApprovals": [
      {
        "id": "67890abcdef1234567890128",
        "orderId": "67890abcdef1234567890200",
        "approvalLevel": 1,
        "approverRole": "MANAGER",
        "approverId": "67890abcdef1234567890101",
        "approverName": "John Doe",
        "approverEmail": "john.doe@company.com",
        "status": "PENDING",
        "approvedAt": null,
        "rejectedAt": null,
        "comments": null,
        "notifiedAt": "2026-01-26T10:20:00.000Z",
        "reminderSentAt": null,
        "createdAt": "2026-01-26T10:20:00.000Z",
        "updatedAt": "2026-01-26T10:20:00.000Z"
      },
      {
        "id": "67890abcdef1234567890129",
        "orderId": "67890abcdef1234567890200",
        "approvalLevel": 2,
        "approverRole": "HR",
        "approverId": "67890abcdef1234567890102",
        "approverName": "Jane Smith",
        "approverEmail": "jane.smith@company.com",
        "status": "PENDING",
        "approvedAt": null,
        "rejectedAt": null,
        "comments": null,
        "notifiedAt": null,
        "reminderSentAt": null,
        "createdAt": "2026-01-26T10:20:00.000Z",
        "updatedAt": "2026-01-26T10:20:00.000Z"
      }
    ]
  }
}
```

### Approve Order

**PATCH** `/api/orderApproval/:id/approve`

#### Sample Request

```json
{
  "comments": "Order approved. Employee is eligible for this purchase."
}
```

#### Sample Response

```json
{
  "success": true,
  "message": "Order approval updated successfully",
  "data": {
    "orderApproval": {
      "id": "67890abcdef1234567890128",
      "orderId": "67890abcdef1234567890200",
      "approvalLevel": 1,
      "approverRole": "MANAGER",
      "approverId": "67890abcdef1234567890101",
      "approverName": "John Doe",
      "approverEmail": "john.doe@company.com",
      "status": "APPROVED",
      "approvedAt": "2026-01-26T10:25:00.000Z",
      "rejectedAt": null,
      "comments": "Order approved. Employee is eligible for this purchase.",
      "notifiedAt": "2026-01-26T10:20:00.000Z",
      "reminderSentAt": null,
      "createdAt": "2026-01-26T10:20:00.000Z",
      "updatedAt": "2026-01-26T10:25:00.000Z"
    }
  }
}
```

### Reject Order

**PATCH** `/api/orderApproval/:id/reject`

#### Sample Request

```json
{
  "comments": "Order rejected. Order amount exceeds employee's credit limit."
}
```

#### Sample Response

```json
{
  "success": true,
  "message": "Order approval rejected",
  "data": {
    "orderApproval": {
      "id": "67890abcdef1234567890128",
      "orderId": "67890abcdef1234567890200",
      "approvalLevel": 1,
      "approverRole": "MANAGER",
      "approverId": "67890abcdef1234567890101",
      "approverName": "John Doe",
      "approverEmail": "john.doe@company.com",
      "status": "REJECTED",
      "approvedAt": null,
      "rejectedAt": "2026-01-26T10:25:00.000Z",
      "comments": "Order rejected. Order amount exceeds employee's credit limit.",
      "notifiedAt": "2026-01-26T10:20:00.000Z",
      "reminderSentAt": null,
      "createdAt": "2026-01-26T10:20:00.000Z",
      "updatedAt": "2026-01-26T10:25:00.000Z"
    }
  }
}
```

### Get All OrderApprovals

**GET** `/api/orderApproval`

#### Sample Response with Filters

```json
{
  "success": true,
  "data": {
    "orderApprovals": [
      {
        "id": "67890abcdef1234567890128",
        "orderId": "67890abcdef1234567890200",
        "approvalLevel": 1,
        "approverRole": "MANAGER",
        "approverId": "67890abcdef1234567890101",
        "approverName": "John Doe",
        "approverEmail": "john.doe@company.com",
        "status": "APPROVED",
        "approvedAt": "2026-01-26T10:25:00.000Z",
        "rejectedAt": null,
        "comments": "Order approved",
        "notifiedAt": "2026-01-26T10:20:00.000Z",
        "reminderSentAt": null,
        "createdAt": "2026-01-26T10:20:00.000Z",
        "updatedAt": "2026-01-26T10:25:00.000Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 10,
      "total": 1,
      "totalPages": 1
    }
  }
}
```

---

## Complete Workflow Setup Example

This example shows the complete process of setting up a 3-level approval workflow.

### Step 1: Create Approval Levels

```json
// Level 1: Manager
POST /api/approvalLevel
{
  "role": "MANAGER",
  "description": "Direct manager approval",
  "isRequired": true,
  "autoApproveUnder": 1000,
  "timeoutDays": 3
}
// Response ID: "level_manager_001"

// Level 2: HR
POST /api/approvalLevel
{
  "role": "HR",
  "description": "HR department verification",
  "isRequired": true,
  "autoApproveUnder": null,
  "timeoutDays": 5
}
// Response ID: "level_hr_002"

// Level 3: Finance
POST /api/approvalLevel
{
  "role": "FINANCE",
  "description": "Finance department approval",
  "isRequired": true,
  "autoApproveUnder": null,
  "timeoutDays": 7
}
// Response ID: "level_finance_003"
```

### Step 2: Create Approval Workflow

```json
POST /api/approvalWorkflow
{
  "name": "High-Value Order Approval",
  "description": "For orders between $5,000 and $20,000",
  "isActive": true,
  "minOrderAmount": 5000,
  "maxOrderAmount": 20000,
  "requiresInstallment": false
}
// Response ID: "workflow_high_value_001"
```

### Step 3: Link Workflow to Approval Levels

```json
// Level 1: Manager
POST /api/workflowApprovalLevel
{
  "workflowId": "workflow_high_value_001",
  "approvalLevelId": "level_manager_001",
  "level": 1,
  "approverId": "user_manager_001",
  "approverName": "John Doe",
  "approverEmail": "john.doe@company.com"
}

// Level 2: HR
POST /api/workflowApprovalLevel
{
  "workflowId": "workflow_high_value_001",
  "approvalLevelId": "level_hr_002",
  "level": 2,
  "approverId": "user_hr_001",
  "approverName": "Jane Smith",
  "approverEmail": "jane.smith@company.com"
}

// Level 3: Finance
POST /api/workflowApprovalLevel
{
  "workflowId": "workflow_high_value_001",
  "approvalLevelId": "level_finance_003",
  "level": 3,
  "approverId": "user_finance_001",
  "approverName": "Bob Johnson",
  "approverEmail": "bob.johnson@company.com"
}
```

### Step 4: Order Creation (Auto-generates OrderApprovals)

When an order is created with a total of $10,000, the system automatically:
1. Matches the order to the "High-Value Order Approval" workflow
2. Creates 3 OrderApproval records (one for each level)
3. Sets all statuses to "PENDING"
4. Notifies the Level 1 approver

### Step 5: Approval Flow

```json
// Manager approves (Level 1)
PATCH /api/orderApproval/order_approval_001/approve
{
  "comments": "Manager approved. Employee is eligible."
}
// Status changes to APPROVED, Level 2 is notified

// HR approves (Level 2)
PATCH /api/orderApproval/order_approval_002/approve
{
  "comments": "HR verified. Employee benefits confirmed."
}
// Status changes to APPROVED, Level 3 is notified

// Finance approves (Level 3)
PATCH /api/orderApproval/order_approval_003/approve
{
  "comments": "Finance approved. Budget allocated."
}
// Status changes to APPROVED, Order is fully approved
```

---

## Enum Values Reference

### ApproverRole

- `MANAGER` - Direct manager
- `HR` - HR department
- `FINANCE` - Finance department
- `DEPARTMENT_HEAD` - Department head
- `ADMIN` - System admin

### ApprovalStatus

- `PENDING` - Waiting for approval
- `APPROVED` - Approved
- `REJECTED` - Rejected
- `EXPIRED` - Timeout expired
- `SKIPPED` - Skipped (auto-approved)

---

## Notes

1. **Creation Order**: Always create ApprovalLevels first, then ApprovalWorkflow, then WorkflowApprovalLevel
2. **Level Sequence**: The `level` field in WorkflowApprovalLevel must be sequential (1, 2, 3...)
3. **Unique Constraint**: Each workflow can only have one approval level at each level number
4. **Auto-approval**: If `autoApproveUnder` is set and order amount is below threshold, approval is automatic
5. **Timeout**: If `timeoutDays` is set and no response, approval is auto-approved after timeout
6. **OrderApproval**: Created automatically when order is created, not manually
7. **Sequential Approval**: Level N+1 cannot be approved until Level N is approved

---

## API Endpoints Summary

| Entity | Create | Get All | Get By ID | Update | Delete |
|--------|--------|---------|-----------|--------|--------|
| ApprovalLevel | POST `/api/approvalLevel` | GET `/api/approvalLevel` | GET `/api/approvalLevel/:id` | PATCH `/api/approvalLevel/:id` | DELETE `/api/approvalLevel/:id` |
| ApprovalWorkflow | POST `/api/approvalWorkflow` | GET `/api/approvalWorkflow` | GET `/api/approvalWorkflow/:id` | PATCH `/api/approvalWorkflow/:id` | DELETE `/api/approvalWorkflow/:id` |
| WorkflowApprovalLevel | POST `/api/workflowApprovalLevel` | GET `/api/workflowApprovalLevel` | GET `/api/workflowApprovalLevel/:id` | PATCH `/api/workflowApprovalLevel/:id` | DELETE `/api/workflowApprovalLevel/:id` |
| OrderApproval | Auto-created | GET `/api/orderApproval` | GET `/api/orderApproval/:id` | PATCH `/api/orderApproval/:id/approve` or `/reject` | N/A |
