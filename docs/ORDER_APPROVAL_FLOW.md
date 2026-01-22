# Order Approval Flow - Complete Guide with Sample Data

## Overview

This document demonstrates the complete approval workflow system with sample data, showing how orders move through multi-level approval chains.

## System Architecture

```
Order Created → Workflow Assigned → Approval Levels Created → Approvers Notified → Sequential Approval → Order Approved/Rejected
```

## Sample Data Setup

### Step 1: Create Approval Workflows

#### Workflow 1: Standard Order Approval (Small Orders)

```json
POST /api/approvalWorkflow
{
  "name": "Standard Order Approval",
  "description": "For orders under $5,000",
  "isActive": true,
  "minOrderAmount": 0,
  "maxOrderAmount": 5000,
  "requiresInstallment": false
}
```

**Response:**

```json
{
	"success": true,
	"message": "Approval workflow created successfully",
	"data": {
		"approvalWorkflow": {
			"id": "wf_standard_001",
			"name": "Standard Order Approval",
			"description": "For orders under $5,000",
			"isActive": true,
			"minOrderAmount": 0,
			"maxOrderAmount": 5000,
			"requiresInstallment": false,
			"createdAt": "2026-01-14T10:00:00Z",
			"updatedAt": "2026-01-14T10:00:00Z"
		}
	}
}
```

#### Workflow 2: High-Value Order Approval

```json
POST /api/approvalWorkflow
{
  "name": "High-Value Order Approval",
  "description": "For orders $5,000 - $20,000",
  "isActive": true,
  "minOrderAmount": 5000,
  "maxOrderAmount": 20000,
  "requiresInstallment": false
}
```

**Response ID:** `wf_high_value_002`

#### Workflow 3: Installment Order Approval

```json
POST /api/approvalWorkflow
{
  "name": "Installment Order Approval",
  "description": "For all orders with installment payments",
  "isActive": true,
  "minOrderAmount": 0,
  "maxOrderAmount": null,
  "requiresInstallment": true
}
```

**Response ID:** `wf_installment_003`

---

### Step 2: Create Approval Levels for Each Workflow

#### Standard Order Workflow - 2 Levels

**Level 1: Manager Approval**

```json
POST /api/approvalLevel
{
  "workflowId": "wf_standard_001",
  "level": 1,
  "role": "MANAGER",
  "description": "Direct manager must approve order",
  "isRequired": true,
  "autoApproveUnder": 1000,
  "timeoutDays": 2
}
```

**Level 2: HR Approval**

```json
POST /api/approvalLevel
{
  "workflowId": "wf_standard_001",
  "level": 2,
  "role": "HR",
  "description": "HR verification for employee benefits",
  "isRequired": true,
  "autoApproveUnder": null,
  "timeoutDays": 3
}
```

#### High-Value Order Workflow - 3 Levels

**Level 1: Manager Approval**

```json
POST /api/approvalLevel
{
  "workflowId": "wf_high_value_002",
  "level": 1,
  "role": "MANAGER",
  "description": "Direct manager approval required",
  "isRequired": true,
  "autoApproveUnder": null,
  "timeoutDays": 2
}
```

**Level 2: Department Head Approval**

```json
POST /api/approvalLevel
{
  "workflowId": "wf_high_value_002",
  "level": 2,
  "role": "DEPARTMENT_HEAD",
  "description": "Department head must review high-value orders",
  "isRequired": true,
  "autoApproveUnder": null,
  "timeoutDays": 3
}
```

**Level 3: Finance Approval**

```json
POST /api/approvalLevel
{
  "workflowId": "wf_high_value_002",
  "level": 3,
  "role": "FINANCE",
  "description": "Finance department final approval",
  "isRequired": true,
  "autoApproveUnder": null,
  "timeoutDays": 5
}
```

#### Installment Order Workflow - 4 Levels

**Level 1: Manager Approval**

```json
POST /api/approvalLevel
{
  "workflowId": "wf_installment_003",
  "level": 1,
  "role": "MANAGER",
  "description": "Manager approval for installment request",
  "isRequired": true,
  "autoApproveUnder": null,
  "timeoutDays": 2
}
```

**Level 2: HR Approval**

```json
POST /api/approvalLevel
{
  "workflowId": "wf_installment_003",
  "level": 2,
  "role": "HR",
  "description": "HR verifies employee eligibility for installments",
  "isRequired": true,
  "autoApproveUnder": null,
  "timeoutDays": 3
}
```

**Level 3: Finance Approval**

```json
POST /api/approvalLevel
{
  "workflowId": "wf_installment_003",
  "level": 3,
  "role": "FINANCE",
  "description": "Finance reviews installment terms",
  "isRequired": true,
  "autoApproveUnder": null,
  "timeoutDays": 3
}
```

**Level 4: Admin Final Approval**

```json
POST /api/approvalLevel
{
  "workflowId": "wf_installment_003",
  "level": 4,
  "role": "ADMIN",
  "description": "Final administrative approval",
  "isRequired": false,
  "autoApproveUnder": 3000,
  "timeoutDays": 5
}
```

---

## Complete Order Flow Examples

### Example 1: Standard Order ($2,500) - 2 Level Approval

#### Step 1: Employee Creates Order

```json
POST /api/order
{
  "orderNumber": "ORD-2026-001",
  "employeeId": "emp_john_doe_001",
  "status": "PENDING_APPROVAL",
  "subtotal": 2500,
  "discount": 0,
  "tax": 187.50,
  "shippingCost": 50,
  "total": 2737.50,
  "paymentType": "CASH",
  "paymentMethod": "PAYROLL_DEDUCTION",
  "paymentStatus": "PENDING",
  "currentApprovalLevel": 1,
  "isFullyApproved": false,
  "shippingAddress": "123 Main St",
  "shippingCity": "New York",
  "shippingState": "NY",
  "shippingZip": "10001",
  "notes": "Laptop for remote work"
}
```

**Order Created:**

- Order ID: `order_001`
- Status: `PENDING_APPROVAL`
- Workflow: `wf_standard_001` (Standard Order Approval)

#### Step 2: System Creates Level 1 Approval

```json
POST /api/orderApproval
{
  "orderId": "order_001",
  "approvalLevel": 1,
  "approverRole": "MANAGER",
  "approverId": "emp_sarah_smith_mgr",
  "approverName": "Sarah Smith",
  "approverEmail": "sarah.smith@company.com",
  "status": "PENDING",
  "notifiedAt": "2026-01-14T10:05:00Z"
}
```

**Response:**

```json
{
	"id": "approval_001_level_1",
	"orderId": "order_001",
	"approvalLevel": 1,
	"approverRole": "MANAGER",
	"approverId": "emp_sarah_smith_mgr",
	"approverName": "Sarah Smith",
	"approverEmail": "sarah.smith@company.com",
	"status": "PENDING",
	"approvedAt": null,
	"rejectedAt": null,
	"comments": null,
	"notifiedAt": "2026-01-14T10:05:00Z",
	"reminderSentAt": null,
	"createdAt": "2026-01-14T10:05:00Z",
	"updatedAt": "2026-01-14T10:05:00Z"
}
```

#### Step 3: Manager Approves (Level 1)

```json
PATCH /api/orderApproval/approval_001_level_1
{
  "status": "APPROVED",
  "approvedAt": "2026-01-14T14:30:00Z",
  "comments": "Approved. Laptop is needed for remote work setup."
}
```

**After Level 1 Approval:**

- Order Status: Still `PENDING_APPROVAL`
- Current Approval Level: Updates to `2`
- System creates Level 2 approval automatically

#### Step 4: System Creates Level 2 Approval

```json
POST /api/orderApproval
{
  "orderId": "order_001",
  "approvalLevel": 2,
  "approverRole": "HR",
  "approverId": "emp_mike_johnson_hr",
  "approverName": "Mike Johnson",
  "approverEmail": "mike.johnson@company.com",
  "status": "PENDING",
  "notifiedAt": "2026-01-14T14:35:00Z"
}
```

#### Step 5: HR Approves (Level 2 - Final)

```json
PATCH /api/orderApproval/approval_001_level_2
{
  "status": "APPROVED",
  "approvedAt": "2026-01-15T09:15:00Z",
  "comments": "Verified employee eligibility. Approved."
}
```

#### Step 6: System Updates Order (Fully Approved)

```json
PATCH /api/order/order_001
{
  "status": "APPROVED",
  "isFullyApproved": true,
  "approvedAt": "2026-01-15T09:15:00Z"
}
```

**Final Order Status:**

```json
{
	"id": "order_001",
	"orderNumber": "ORD-2026-001",
	"status": "APPROVED",
	"currentApprovalLevel": 2,
	"isFullyApproved": true,
	"approvedAt": "2026-01-15T09:15:00Z",
	"approvals": [
		{
			"approvalLevel": 1,
			"approverRole": "MANAGER",
			"approverName": "Sarah Smith",
			"status": "APPROVED",
			"approvedAt": "2026-01-14T14:30:00Z",
			"comments": "Approved. Laptop is needed for remote work setup."
		},
		{
			"approvalLevel": 2,
			"approverRole": "HR",
			"approverName": "Mike Johnson",
			"status": "APPROVED",
			"approvedAt": "2026-01-15T09:15:00Z",
			"comments": "Verified employee eligibility. Approved."
		}
	]
}
```

---

### Example 2: High-Value Order ($8,500) - 3 Level Approval

#### Step 1: Employee Creates Order

```json
POST /api/order
{
  "orderNumber": "ORD-2026-002",
  "employeeId": "emp_jane_wilson_002",
  "status": "PENDING_APPROVAL",
  "subtotal": 8500,
  "discount": 500,
  "tax": 600,
  "shippingCost": 0,
  "total": 8600,
  "paymentType": "CASH",
  "paymentMethod": "PAYROLL_DEDUCTION",
  "paymentStatus": "PENDING",
  "currentApprovalLevel": 1,
  "isFullyApproved": false,
  "notes": "High-end workstation for 3D design work"
}
```

**Order Created:** `order_002`
**Workflow:** `wf_high_value_002` (High-Value Order Approval - 3 levels)

#### Approval Chain:

**Level 1: Manager → APPROVED** (2026-01-14 15:00)

```json
{
	"approverRole": "MANAGER",
	"approverName": "David Brown",
	"status": "APPROVED",
	"comments": "Justified for 3D design requirements. Approved."
}
```

**Level 2: Department Head → APPROVED** (2026-01-15 11:30)

```json
{
	"approverRole": "DEPARTMENT_HEAD",
	"approverName": "Lisa Anderson",
	"status": "APPROVED",
	"comments": "Budget available. Approved for design department."
}
```

**Level 3: Finance → APPROVED** (2026-01-16 10:00)

```json
{
	"approverRole": "FINANCE",
	"approverName": "Robert Taylor",
	"status": "APPROVED",
	"comments": "Financially reviewed and approved. Within budget limits."
}
```

**Final Status:**

- Order Status: `APPROVED`
- Fully Approved: `true`
- Approved At: `2026-01-16T10:00:00Z`
- Ready for processing

---

### Example 3: Installment Order ($6,000) - 4 Level Approval

#### Step 1: Employee Creates Installment Order

```json
POST /api/order
{
  "orderNumber": "ORD-2026-003",
  "employeeId": "emp_carlos_martinez_003",
  "status": "PENDING_APPROVAL",
  "subtotal": 6000,
  "discount": 200,
  "tax": 435,
  "shippingCost": 0,
  "total": 6235,
  "paymentType": "INSTALLMENT",
  "installmentMonths": 12,
  "paymentMethod": "PAYROLL_DEDUCTION",
  "paymentStatus": "PENDING",
  "currentApprovalLevel": 1,
  "isFullyApproved": false,
  "notes": "MacBook Pro with 12-month installment plan"
}
```

**Order Created:** `order_003`
**Workflow:** `wf_installment_003` (Installment Order Approval - 4 levels)

#### Approval Chain:

**Level 1: Manager → APPROVED** (2026-01-14 16:00)

```json
{
	"approverRole": "MANAGER",
	"approverName": "Emily Davis",
	"status": "APPROVED",
	"comments": "Employee qualifies for installment plan. Approved."
}
```

**Level 2: HR → APPROVED** (2026-01-15 10:30)

```json
{
	"approverRole": "HR",
	"approverName": "James Wilson",
	"status": "APPROVED",
	"comments": "Employment tenure verified. Credit check passed. Approved."
}
```

**Level 3: Finance → APPROVED** (2026-01-15 14:00)

```json
{
	"approverRole": "FINANCE",
	"approverName": "Patricia Moore",
	"status": "APPROVED",
	"comments": "Installment terms reviewed. Monthly deduction: $519.58. Approved."
}
```

**Level 4: Admin → SKIPPED (Auto-approved)**

```json
{
	"approverRole": "ADMIN",
	"approverName": "System Auto-Approval",
	"status": "SKIPPED",
	"comments": "Auto-approved: Order amount $6,235 is under threshold of $10,000"
}
```

**Final Status:**

- Order Status: `APPROVED`
- Fully Approved: `true`
- Approved At: `2026-01-15T14:00:00Z`
- Installments generated: 12 payments of $519.58

---

### Example 4: Rejected Order ($15,000) - Rejected at Level 2

#### Step 1: Employee Creates Order

```json
POST /api/order
{
  "orderNumber": "ORD-2026-004",
  "employeeId": "emp_alex_thompson_004",
  "status": "PENDING_APPROVAL",
  "subtotal": 15000,
  "discount": 0,
  "tax": 1125,
  "shippingCost": 0,
  "total": 16125,
  "paymentType": "CASH",
  "paymentMethod": "PAYROLL_DEDUCTION",
  "paymentStatus": "PENDING",
  "currentApprovalLevel": 1,
  "isFullyApproved": false,
  "notes": "Gaming equipment for office"
}
```

**Order Created:** `order_004`
**Workflow:** `wf_high_value_002` (High-Value Order Approval)

#### Approval Chain:

**Level 1: Manager → APPROVED** (2026-01-14 17:00)

```json
{
	"approverRole": "MANAGER",
	"approverName": "Susan Clark",
	"status": "APPROVED",
	"comments": "Approved pending higher level review."
}
```

**Level 2: Department Head → REJECTED** (2026-01-15 13:00)

```json
{
	"approverRole": "DEPARTMENT_HEAD",
	"approverName": "Richard White",
	"status": "REJECTED",
	"comments": "Gaming equipment not justified for business use. Request denied."
}
```

#### Step 2: System Updates Order (Rejected)

```json
PATCH /api/order/order_004
{
  "status": "REJECTED",
  "isFullyApproved": false,
  "rejectedAt": "2026-01-15T13:00:00Z",
  "rejectedBy": "Richard White (Department Head)",
  "rejectionReason": "Gaming equipment not justified for business use. Request denied."
}
```

**Final Status:**

- Order Status: `REJECTED`
- Fully Approved: `false`
- Rejected At: `2026-01-15T13:00:00Z`
- Rejected By: `Richard White (Department Head)`
- No further processing

---

## Approval Status State Machine

```
PENDING_APPROVAL
    ├─> APPROVED (all levels approved) ──> PROCESSING ──> SHIPPED ──> DELIVERED
    └─> REJECTED (any level rejected) ──> [End State]
```

## Query Examples

### Get All Approvals for an Order

```http
GET /api/orderApproval?filter=[{"orderId":"order_001"}]&document=true
```

### Get Pending Approvals for a Specific Approver

```http
GET /api/orderApproval?filter=[{"approverId":"emp_sarah_smith_mgr"},{"status":"PENDING"}]&document=true
```

### Get All Orders in Approval Status

```http
GET /api/order?filter=[{"status":"PENDING_APPROVAL"}]&document=true&pagination=true
```

### Get Approved Orders

```http
GET /api/order?filter=[{"isFullyApproved":true}]&document=true
```

### Get Active Workflows

```http
GET /api/approvalWorkflow?filter=[{"isActive":true}]&document=true
```

### Get All Approval Levels for a Workflow

```http
GET /api/approvalLevel?filter=[{"workflowId":"wf_standard_001"}]&document=true&sort=level&order=asc
```

---

## Notification Flow (Recommended Implementation)

### When Order is Created:

1. System determines applicable workflow based on order amount and payment type
2. Creates first approval level record
3. Sends email/notification to Level 1 approver
4. Sets `notifiedAt` timestamp

### When Level is Approved:

1. Update approval record with `APPROVED` status and timestamp
2. Check if more levels exist
3. If yes: Create next level approval and notify next approver
4. If no: Update order to `APPROVED` status and set `isFullyApproved` to true

### When Level is Rejected:

1. Update approval record with `REJECTED` status
2. Update order status to `REJECTED`
3. Set rejection details (rejectedBy, rejectionReason, rejectedAt)
4. Notify employee that order was rejected
5. Stop approval chain

### Reminder System:

1. Check for approvals with `PENDING` status
2. Compare current date with `notifiedAt` + (`timeoutDays` - 1)
3. Send reminder if within reminder window
4. Update `reminderSentAt` timestamp
5. Auto-approve if past `timeoutDays` and `autoApproveUnder` conditions met

---

## Database Collections After Sample Data

### approvalWorkflows Collection

```json
[
	{ "id": "wf_standard_001", "name": "Standard Order Approval", "maxOrderAmount": 5000 },
	{ "id": "wf_high_value_002", "name": "High-Value Order Approval", "maxOrderAmount": 20000 },
	{
		"id": "wf_installment_003",
		"name": "Installment Order Approval",
		"requiresInstallment": true
	}
]
```

### approvalLevels Collection

```json
[
	{ "workflowId": "wf_standard_001", "level": 1, "role": "MANAGER" },
	{ "workflowId": "wf_standard_001", "level": 2, "role": "HR" },
	{ "workflowId": "wf_high_value_002", "level": 1, "role": "MANAGER" },
	{ "workflowId": "wf_high_value_002", "level": 2, "role": "DEPARTMENT_HEAD" },
	{ "workflowId": "wf_high_value_002", "level": 3, "role": "FINANCE" },
	{ "workflowId": "wf_installment_003", "level": 1, "role": "MANAGER" },
	{ "workflowId": "wf_installment_003", "level": 2, "role": "HR" },
	{ "workflowId": "wf_installment_003", "level": 3, "role": "FINANCE" },
	{ "workflowId": "wf_installment_003", "level": 4, "role": "ADMIN" }
]
```

### orders Collection

```json
[
	{
		"id": "order_001",
		"orderNumber": "ORD-2026-001",
		"status": "APPROVED",
		"total": 2737.5,
		"isFullyApproved": true
	},
	{
		"id": "order_002",
		"orderNumber": "ORD-2026-002",
		"status": "APPROVED",
		"total": 8600,
		"isFullyApproved": true
	},
	{
		"id": "order_003",
		"orderNumber": "ORD-2026-003",
		"status": "APPROVED",
		"total": 6235,
		"isFullyApproved": true
	},
	{
		"id": "order_004",
		"orderNumber": "ORD-2026-004",
		"status": "REJECTED",
		"total": 16125,
		"isFullyApproved": false
	}
]
```

### orderApprovals Collection

```json
[
	{ "orderId": "order_001", "approvalLevel": 1, "approverRole": "MANAGER", "status": "APPROVED" },
	{ "orderId": "order_001", "approvalLevel": 2, "approverRole": "HR", "status": "APPROVED" },
	{ "orderId": "order_002", "approvalLevel": 1, "approverRole": "MANAGER", "status": "APPROVED" },
	{
		"orderId": "order_002",
		"approvalLevel": 2,
		"approverRole": "DEPARTMENT_HEAD",
		"status": "APPROVED"
	},
	{ "orderId": "order_002", "approvalLevel": 3, "approverRole": "FINANCE", "status": "APPROVED" },
	{ "orderId": "order_004", "approvalLevel": 1, "approverRole": "MANAGER", "status": "APPROVED" },
	{
		"orderId": "order_004",
		"approvalLevel": 2,
		"approverRole": "DEPARTMENT_HEAD",
		"status": "REJECTED"
	}
]
```

---

## Visual Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                    ORDER APPROVAL WORKFLOW                          │
└─────────────────────────────────────────────────────────────────────┘

┌──────────────┐
│   Employee   │
│ Creates Order│
└──────┬───────┘
       │
       ▼
┌──────────────────────┐
│ Order Status:        │
│ PENDING_APPROVAL     │
│ currentLevel: 1      │
└──────┬───────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────────┐
│          System Determines Workflow                         │
│  • Check order amount                                       │
│  • Check payment type (installment?)                        │
│  • Match to workflow conditions                             │
└──────┬──────────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────────────┐
│          Create Level 1 Approval Record                      │
│  • Assign to appropriate approver                            │
│  • Send notification                                         │
│  • Status: PENDING                                           │
└──────┬───────────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────┐
│  Level 1 Approver        │
│  Reviews Order           │
└──────┬───────────────────┘
       │
       ├──── APPROVED ────┐
       │                  │
       │                  ▼
       │           ┌─────────────────────┐
       │           │ More levels?        │
       │           └──┬──────────────┬───┘
       │              │              │
       │             YES            NO
       │              │              │
       │              ▼              ▼
       │        ┌──────────┐   ┌──────────────┐
       │        │ Create   │   │ Order Status:│
       │        │ Next     │   │   APPROVED   │
       │        │ Level    │   │ isFullyAppr: │
       │        │ Approval │   │   true       │
       │        └────┬─────┘   └──────────────┘
       │             │
       │             └──────[Repeat for each level]
       │
       └──── REJECTED ────┐
                          │
                          ▼
                   ┌──────────────┐
                   │ Order Status:│
                   │   REJECTED   │
                   │              │
                   │ Chain Stops  │
                   └──────────────┘
```

---

## Implementation Tips

### 1. Workflow Matching Logic

```javascript
function determineWorkflow(order) {
	const workflows = getActiveWorkflows();

	for (const workflow of workflows) {
		// Check installment requirement
		if (workflow.requiresInstallment && order.paymentType !== "INSTALLMENT") {
			continue;
		}

		// Check amount range
		if (workflow.minOrderAmount && order.total < workflow.minOrderAmount) {
			continue;
		}

		if (workflow.maxOrderAmount && order.total > workflow.maxOrderAmount) {
			continue;
		}

		return workflow;
	}

	throw new Error("No matching workflow found for order");
}
```

### 2. Sequential Approval Processing

```javascript
async function processApproval(approvalId, status, comments) {
	const approval = await getApprovalById(approvalId);

	// Update current approval
	await updateApproval(approvalId, {
		status,
		[status === "APPROVED" ? "approvedAt" : "rejectedAt"]: new Date(),
		comments,
	});

	if (status === "REJECTED") {
		// Reject the entire order
		await updateOrder(approval.orderId, {
			status: "REJECTED",
			rejectedAt: new Date(),
			rejectedBy: approval.approverName,
			rejectionReason: comments,
		});
		return;
	}

	// Check for next level
	const nextLevel = approval.approvalLevel + 1;
	const hasNextLevel = await checkApprovalLevelExists(approval.workflowId, nextLevel);

	if (hasNextLevel) {
		// Create next level approval
		await createNextLevelApproval(approval.orderId, nextLevel);
		await updateOrder(approval.orderId, {
			currentApprovalLevel: nextLevel,
		});
	} else {
		// All levels approved
		await updateOrder(approval.orderId, {
			status: "APPROVED",
			isFullyApproved: true,
			approvedAt: new Date(),
		});
	}
}
```

### 3. Auto-Approval Logic

```javascript
async function checkAutoApprovals() {
	const pendingApprovals = await getPendingApprovals();

	for (const approval of pendingApprovals) {
		const level = await getApprovalLevel(approval.workflowId, approval.approvalLevel);
		const order = await getOrder(approval.orderId);

		// Check timeout
		const daysPending = daysSince(approval.notifiedAt);
		if (level.timeoutDays && daysPending >= level.timeoutDays) {
			// Check auto-approve conditions
			if (
				!level.isRequired ||
				(level.autoApproveUnder && order.total < level.autoApproveUnder)
			) {
				await processApproval(approval.id, "SKIPPED", "Auto-approved due to timeout");
			}
		}
	}
}
```

---

## Testing Checklist

- [ ] Create all three workflows
- [ ] Add approval levels to each workflow
- [ ] Create standard order ($2,500) and verify 2-level approval
- [ ] Create high-value order ($8,500) and verify 3-level approval
- [ ] Create installment order ($6,000) and verify 4-level approval
- [ ] Test rejection at different levels
- [ ] Verify order status updates correctly
- [ ] Check notification timestamps
- [ ] Test auto-approval with timeout
- [ ] Query pending approvals for specific approvers
- [ ] Verify approval history is maintained

---

This flow provides a complete, production-ready approval system with flexibility for different order types and amounts!
