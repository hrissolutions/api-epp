# Approval System Overview

## Introduction

The EPP (Employee Purchase Program) backend uses a multi-level approval system to manage order approvals. This document explains the difference between **ApprovalLevel** and **OrderApproval**, their use cases, and how they work together.

---

## Key Concepts

### 1. **ApprovalLevel** (Template/Configuration)

**What it is:** A reusable template that defines **what type** of approval is needed.

**Purpose:** Defines the role and rules for a specific approval type that can be used across multiple workflows.

**Characteristics:**

- **Reusable** - Can be used in multiple workflows
- **Template-based** - Defines the "what" (role, rules, settings)
- **Configuration** - Not tied to any specific order
- **Static** - Created once and reused

**Fields:**

- `role` - The type of approver (MANAGER, HR, FINANCE, DEPARTMENT_HEAD, ADMIN)
- `description` - Human-readable description
- `isRequired` - Whether this level is mandatory
- `autoApproveUnder` - Auto-approve if order amount is below this threshold
- `timeoutDays` - Auto-approve after X days if no response

**Example:**

```json
{
	"id": "approval_level_1",
	"role": "MANAGER",
	"description": "Direct Manager Approval",
	"isRequired": true,
	"autoApproveUnder": 100.0,
	"timeoutDays": 3
}
```

**Use Case:**

- Create once: "Manager Approval" template
- Use in multiple workflows: "Small Order Workflow", "Large Order Workflow", etc.
- Define rules: "Auto-approve if order < $100"

---

### 2. **OrderApproval** (Instance/Record)

**What it is:** An actual approval record created for a **specific order** that needs to be completed by a **specific person**.

**Purpose:** Tracks the approval status and decision for a specific order at a specific level.

**Characteristics:**

- **Order-specific** - Created for one particular order
- **Person-specific** - Assigned to a specific approver (employee)
- **Instance-based** - Represents a real approval that needs action
- **Dynamic** - Created when an order is placed

**Fields:**

- `orderId` - The specific order this approval is for
- `approvalLevel` - The level number (1, 2, 3...) in the approval chain
- `approverRole` - The role type (MANAGER, HR, etc.)
- `approverId` - The specific employee ID who must approve
- `approverName` - Name of the approver
- `approverEmail` - Email for notifications
- `status` - Current status (PENDING, APPROVED, REJECTED, EXPIRED, SKIPPED)
- `approvedAt` / `rejectedAt` - Timestamps of decision
- `comments` - Approval/rejection comments

**Example:**

```json
{
	"id": "order_approval_123",
	"orderId": "order_456",
	"approvalLevel": 1,
	"approverRole": "MANAGER",
	"approverId": "employee_789",
	"approverName": "John Smith",
	"approverEmail": "john.smith@company.com",
	"status": "PENDING",
	"comments": null
}
```

**Use Case:**

- Created when: Order #12345 is placed
- Assigned to: John Smith (Manager)
- Status: Waiting for John to approve/reject
- Updated when: John makes a decision

---

## Relationship Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    ApprovalWorkflow                        │
│  (Defines: Which levels needed for order conditions)        │
│  Example: "Orders > $1000 need Manager + HR + Finance"   │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       │ uses
                       ▼
┌─────────────────────────────────────────────────────────────┐
│              WorkflowApprovalLevel                          │
│  (Junction: Connects workflow to levels, sets sequence)    │
│  - workflowId: Links to ApprovalWorkflow                    │
│  - approvalLevelId: Links to ApprovalLevel                 │
│  - level: Sequence number (1, 2, 3...)                     │
│  - approverEmail: Specific approver for this workflow       │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       │ references
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                   ApprovalLevel                             │
│  (Template: Defines role and rules)                         │
│  - role: MANAGER, HR, FINANCE, etc.                        │
│  - autoApproveUnder: Auto-approve threshold                 │
│  - timeoutDays: Auto-approve after X days                   │
└─────────────────────────────────────────────────────────────┘

                       When order is created:
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                    OrderApproval                            │
│  (Instance: Actual approval record for specific order)     │
│  - orderId: Links to specific Order                        │
│  - approvalLevel: Level number (1, 2, 3...)                │
│  - approverId: Specific person who must approve            │
│  - status: PENDING → APPROVED/REJECTED                      │
└─────────────────────────────────────────────────────────────┘
```

---

## Complete Flow Example

### Step 1: Setup (One-time Configuration)

**1.1 Create ApprovalLevel Templates:**

```javascript
// Create "Manager Approval" template
ApprovalLevel.create({
	role: "MANAGER",
	description: "Direct Manager Approval",
	isRequired: true,
	autoApproveUnder: 100.0,
	timeoutDays: 3,
});

// Create "HR Approval" template
ApprovalLevel.create({
	role: "HR",
	description: "HR Department Approval",
	isRequired: true,
	autoApproveUnder: null,
	timeoutDays: 5,
});
```

**1.2 Create ApprovalWorkflow:**

```javascript
// Create workflow for large orders
ApprovalWorkflow.create({
	name: "Large Order Workflow",
	minOrderAmount: 1000.0,
	maxOrderAmount: 10000.0,
	requiresInstallment: false,
});
```

**1.3 Link Levels to Workflow:**

```javascript
// Link Manager (Level 1) to workflow
WorkflowApprovalLevel.create({
	workflowId: "large_order_workflow",
	approvalLevelId: "manager_approval_level",
	level: 1,
	approverEmail: "manager@company.com",
});

// Link HR (Level 2) to workflow
WorkflowApprovalLevel.create({
	workflowId: "large_order_workflow",
	approvalLevelId: "hr_approval_level",
	level: 2,
	approverEmail: "hr@company.com",
});
```

### Step 2: Order Creation (Dynamic)

**2.1 Employee places order:**

```javascript
// Order created: $1,500 laptop
Order.create({
	orderNumber: "ORDER-12345",
	employeeId: "employee_001",
	total: 1500.0,
	// ... other fields
});
```

**2.2 System finds matching workflow:**

- Order total: $1,500
- Matches: "Large Order Workflow" (min: $1000, max: $10000)
- Workflow has 2 levels: Manager (Level 1) → HR (Level 2)

**2.3 System creates OrderApproval records:**

```javascript
// Create Level 1 approval (Manager)
OrderApproval.create({
	orderId: "order_12345",
	approvalLevel: 1,
	approverRole: "MANAGER",
	approverId: "manager_001",
	approverName: "John Smith",
	approverEmail: "john.smith@company.com",
	status: "PENDING",
});

// Create Level 2 approval (HR) - will be notified after Level 1 approves
OrderApproval.create({
	orderId: "order_12345",
	approvalLevel: 2,
	approverRole: "HR",
	approverId: "hr_001",
	approverName: "Jane Doe",
	approverEmail: "jane.doe@company.com",
	status: "PENDING",
});
```

### Step 3: Approval Process (Dynamic)

**3.1 Manager approves (Level 1):**

```javascript
// Manager John Smith approves
OrderApproval.update({
	where: { id: "order_approval_level_1" },
	data: {
		status: "APPROVED",
		approvedAt: new Date(),
		comments: "Looks good, approved",
	},
});

// System automatically notifies HR (Level 2) to review
```

**3.2 HR approves (Level 2):**

```javascript
// HR Jane Doe approves
OrderApproval.update({
	where: { id: "order_approval_level_2" },
	data: {
		status: "APPROVED",
		approvedAt: new Date(),
		comments: "Approved for payroll deduction",
	},
});

// All approvals complete → Order status changes to "APPROVED"
// Stock is deducted
// Order can proceed to fulfillment
```

---

## Key Differences Summary

| Aspect           | ApprovalLevel                    | OrderApproval                                   |
| ---------------- | -------------------------------- | ----------------------------------------------- |
| **Type**         | Template/Configuration           | Instance/Record                                 |
| **Scope**        | Reusable across workflows        | Specific to one order                           |
| **Purpose**      | Define "what" approval is needed | Track "who" approved "which" order              |
| **Created When** | One-time setup                   | When order is created                           |
| **Tied To**      | Workflows (many-to-many)         | Specific Order                                  |
| **Contains**     | Role, rules, thresholds          | Approver details, status, decision              |
| **Example**      | "Manager Approval Template"      | "John Smith approved Order #12345"              |
| **Lifecycle**    | Static (rarely changes)          | Dynamic (created → pending → approved/rejected) |

---

## Use Cases

### Use Case 1: Creating a New Approval Type

**Scenario:** Company wants to add "Department Head" approval for certain orders.

**Steps:**

1. Create new `ApprovalLevel` with role "DEPARTMENT_HEAD"
2. Add it to relevant `ApprovalWorkflow` via `WorkflowApprovalLevel`
3. System automatically uses it for new orders matching that workflow

**No need to modify existing orders** - they continue with their original approval chain.

---

### Use Case 2: Changing Approval Rules

**Scenario:** Company wants to auto-approve manager approvals for orders under $50.

**Steps:**

1. Update `ApprovalLevel` template: Set `autoApproveUnder: 50.00`
2. All future orders using this level will auto-approve if < $50
3. Existing `OrderApproval` records remain unchanged

**Template change affects future orders, not existing ones.**

---

### Use Case 3: Tracking Approval Status

**Scenario:** Need to see which orders are waiting for approval and by whom.

**Query:**

```javascript
// Find all pending approvals
OrderApproval.findMany({
	where: { status: "PENDING" },
	include: { order: true },
});

// Find all approvals for a specific order
OrderApproval.findMany({
	where: { orderId: "order_12345" },
	orderBy: { approvalLevel: "asc" },
});
```

**This queries `OrderApproval` instances, not templates.**

---

### Use Case 4: Approval History

**Scenario:** Need audit trail of who approved what and when.

**Query:**

```javascript
// Get approval history for an order
OrderApproval.findMany({
	where: {
		orderId: "order_12345",
		status: { in: ["APPROVED", "REJECTED"] },
	},
	orderBy: { approvedAt: "asc" },
});
```

**`OrderApproval` stores the actual approval decisions and timestamps.**

---

## Best Practices

### 1. **ApprovalLevel (Templates)**

- ✅ Create templates once during system setup
- ✅ Use descriptive names and roles
- ✅ Set appropriate auto-approval thresholds
- ✅ Define timeout rules for better UX
- ❌ Don't delete templates that are in use
- ❌ Don't modify templates frequently (affects all workflows)

### 2. **OrderApproval (Instances)**

- ✅ Create instances when orders are placed
- ✅ Assign specific approvers (not just roles)
- ✅ Track all status changes and timestamps
- ✅ Store comments for audit trail
- ✅ Send notifications when status changes
- ❌ Don't modify historical approval records
- ❌ Don't create duplicates (use unique constraint)

### 3. **Workflow Design**

- ✅ Design workflows based on business rules
- ✅ Use ApprovalLevel templates (don't duplicate)
- ✅ Set clear level sequences (1, 2, 3...)
- ✅ Assign specific approvers per workflow
- ✅ Test workflows before production use

---

## API Endpoints

### ApprovalLevel Endpoints

- `GET /api/approvalLevel` - List all approval level templates
- `POST /api/approvalLevel` - Create new approval level template
- `PUT /api/approvalLevel/:id` - Update approval level template
- `DELETE /api/approvalLevel/:id` - Delete approval level template

### OrderApproval Endpoints

- `GET /api/orderApproval` - List all order approvals
- `GET /api/orderApproval/:id` - Get specific order approval
- `GET /api/orderApproval/summary/:orderId` - Get approval summary for order
- `POST /api/orderApproval/:id/approve` - Approve an order approval
- `POST /api/orderApproval/:id/reject` - Reject an order approval

---

## Summary

- **ApprovalLevel** = "What type of approval is needed?" (Template)
- **OrderApproval** = "Who approved which order?" (Instance)

Think of it like:

- **ApprovalLevel** = A job description template ("Manager Position")
- **OrderApproval** = A specific job application ("John applied for Manager role at Company X")

The template defines the requirements, but the instance tracks the actual process and outcome.
