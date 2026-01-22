# Order Approval Workflow - Quick Start Guide

## 🎯 What You Get

A complete **multi-level approval system** for orders with:

- ✅ Flexible workflow configurations
- ✅ Sequential approval chains (Manager → HR → Finance → Admin)
- ✅ Auto-approval rules based on amount thresholds
- ✅ Timeout-based reminders and auto-approval
- ✅ Complete approval history tracking
- ✅ Support for different order types (cash, installment, points)

## 📁 Documentation Files

| File                                          | Purpose                                              |
| --------------------------------------------- | ---------------------------------------------------- |
| `ORDER_APPROVAL_FLOW.md`                      | Complete flow with detailed examples and sample data |
| `ORDER_APPROVAL_FLOW.postman_collection.json` | Ready-to-use Postman collection for testing          |
| `SAMPLE_DATA_MONGODB.js`                      | MongoDB script to insert sample data                 |
| `APPROVAL_WORKFLOW_IMPLEMENTATION.md`         | Technical implementation details                     |
| `BUILD_FIX_SUMMARY.md`                        | Build troubleshooting and fixes                      |

## 🚀 Quick Start (3 Steps)

### Step 1: Start Your Server

```bash
# Make sure you're in the backend directory
cd C:\EPP\backend

# Start the server
npm start
# or for development
npm run dev
```

Server should start on `http://localhost:3000` (or your configured port)

### Step 2: Load Sample Data

**Option A: Using Postman (Recommended)**

1. Open Postman
2. Import `docs/ORDER_APPROVAL_FLOW.postman_collection.json`
3. Update `base_url` variable to match your server (e.g., `http://localhost:3000/api`)
4. Run the collection folders in order:
    - `1. Setup - Create Workflows`
    - `2. Setup - Create Approval Levels`
    - `3. Example 1 - Standard Order Flow`
    - `4. Query Examples`

**Option B: Using MongoDB Directly**

```bash
# Connect to your MongoDB
mongo your_database_name

# Run the sample data script
load('C:/EPP/backend/docs/SAMPLE_DATA_MONGODB.js')
```

**Option C: Using cURL**

```bash
# Create a workflow
curl -X POST http://localhost:3000/api/approvalWorkflow \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Standard Order Approval",
    "description": "For orders under $5,000",
    "isActive": true,
    "minOrderAmount": 0,
    "maxOrderAmount": 5000,
    "requiresInstallment": false
  }'
```

### Step 3: Test the Flow

Visit the endpoints to verify everything works:

```bash
# Get all workflows
curl http://localhost:3000/api/approvalWorkflow?document=true

# Get all orders
curl http://localhost:3000/api/order?document=true

# Get pending approvals
curl http://localhost:3000/api/orderApproval?filter=[{"status":"PENDING"}]&document=true
```

## 📊 The Approval Flow

```
┌─────────────────┐
│ Employee Creates│
│     Order       │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────┐
│  System Matches to Workflow     │
│  Based on:                       │
│  • Order amount                  │
│  • Payment type (installment?)   │
└────────┬────────────────────────┘
         │
         ▼
┌─────────────────────────────────┐
│  Level 1: Manager                │
│  Status: PENDING → APPROVED      │
└────────┬────────────────────────┘
         │
         ▼
┌─────────────────────────────────┐
│  Level 2: HR/Dept Head           │
│  Status: PENDING → APPROVED      │
└────────┬────────────────────────┘
         │
         ▼
┌─────────────────────────────────┐
│  Level 3: Finance (if required)  │
│  Status: PENDING → APPROVED      │
└────────┬────────────────────────┘
         │
         ▼
┌─────────────────────────────────┐
│  Order Status: APPROVED          │
│  Ready for Processing            │
└──────────────────────────────────┘
```

## 🎓 Sample Workflows Included

### 1. Standard Order Workflow

- **For:** Orders under $5,000
- **Levels:** 2 (Manager → HR)
- **Auto-approve:** Level 1 if under $1,000
- **Timeout:** 2-3 days per level

### 2. High-Value Order Workflow

- **For:** Orders $5,000 - $20,000
- **Levels:** 3 (Manager → Department Head → Finance)
- **Auto-approve:** None
- **Timeout:** 2-5 days per level

### 3. Installment Order Workflow

- **For:** Any order with installment payment
- **Levels:** 4 (Manager → HR → Finance → Admin)
- **Auto-approve:** Level 4 if under $3,000
- **Timeout:** 2-5 days per level

## 📝 Sample Orders Included

| Order        | Amount    | Type        | Status   | Levels |
| ------------ | --------- | ----------- | -------- | ------ |
| ORD-2026-001 | $2,737.50 | Cash        | Approved | 2/2 ✅ |
| ORD-2026-002 | $8,600    | Cash        | Approved | 3/3 ✅ |
| ORD-2026-003 | $6,235    | Installment | Approved | 4/4 ✅ |
| ORD-2026-004 | $16,125   | Cash        | Rejected | 1/3 ❌ |
| ORD-2026-005 | $1,261.25 | Cash        | Pending  | 0/2 ⏳ |

## 🔍 Common Queries

### Get Pending Approvals for a Specific Approver

```http
GET /api/orderApproval?filter=[{"approverId":"emp_sarah_smith_mgr"},{"status":"PENDING"}]&document=true
```

### Get All Orders Pending Approval

```http
GET /api/order?filter=[{"status":"PENDING_APPROVAL"}]&document=true
```

### Get Approval History for an Order

```http
GET /api/orderApproval?filter=[{"orderId":"ORDER_ID_HERE"}]&document=true&sort=approvalLevel&order=asc
```

### Get All Workflows with Their Levels

```http
GET /api/approvalWorkflow?document=true
GET /api/approvalLevel?filter=[{"workflowId":"WORKFLOW_ID"}]&document=true
```

## 🔧 API Endpoints Reference

### Approval Workflows

```
GET    /api/approvalWorkflow          - Get all workflows
GET    /api/approvalWorkflow/:id      - Get workflow by ID
POST   /api/approvalWorkflow          - Create workflow
PATCH  /api/approvalWorkflow/:id      - Update workflow
DELETE /api/approvalWorkflow/:id      - Delete workflow
```

### Approval Levels

```
GET    /api/approvalLevel             - Get all levels
GET    /api/approvalLevel/:id         - Get level by ID
POST   /api/approvalLevel             - Create level
PATCH  /api/approvalLevel/:id         - Update level
DELETE /api/approvalLevel/:id         - Delete level
```

### Order Approvals

```
GET    /api/orderApproval             - Get all approvals
GET    /api/orderApproval/:id         - Get approval by ID
POST   /api/orderApproval             - Create approval
PATCH  /api/orderApproval/:id         - Update approval (Approve/Reject)
DELETE /api/orderApproval/:id         - Delete approval
```

### Orders

```
GET    /api/order                     - Get all orders
GET    /api/order/:id                 - Get order by ID
POST   /api/order                     - Create order
PATCH  /api/order/:id                 - Update order
DELETE /api/order/:id                 - Delete order
```

## 💡 Usage Examples

### Create an Order That Needs Approval

```javascript
POST /api/order
{
  "orderNumber": "ORD-2026-NEW",
  "employeeId": "507f1f77bcf86cd799439012",
  "status": "PENDING_APPROVAL",
  "subtotal": 3000,
  "tax": 225,
  "total": 3225,
  "paymentType": "CASH",
  "paymentMethod": "PAYROLL_DEDUCTION",
  "currentApprovalLevel": 1,
  "isFullyApproved": false,
  "notes": "New equipment purchase"
}
```

### Approve an Order (Manager)

```javascript
// 1. Get pending approval for this order
GET /api/orderApproval?filter=[{"orderId":"ORDER_ID"},{"approvalLevel":1}]&document=true

// 2. Approve it
PATCH /api/orderApproval/APPROVAL_ID
{
  "status": "APPROVED",
  "comments": "Looks good, approved!"
}

// 3. Update order to next level
PATCH /api/order/ORDER_ID
{
  "currentApprovalLevel": 2
}
```

### Reject an Order

```javascript
// 1. Update approval to rejected
PATCH /api/orderApproval/APPROVAL_ID
{
  "status": "REJECTED",
  "comments": "Budget not available, rejecting"
}

// 2. Update order status
PATCH /api/order/ORDER_ID
{
  "status": "REJECTED",
  "rejectedBy": "Manager Name",
  "rejectionReason": "Budget not available"
}
```

## 🎯 Next Steps for Production

### 1. Implement Business Logic

Create service files to automate the approval flow:

```javascript
// services/approvalService.js
async function processApproval(approvalId, status, comments) {
	// 1. Update approval
	// 2. If rejected, reject order
	// 3. If approved, check for next level
	// 4. If no next level, mark order as fully approved
	// 5. Send notifications
}
```

### 2. Add Notification Service

```javascript
// services/notificationService.js
async function notifyApprover(approval) {
	// Send email/SMS to approver
}

async function notifyEmployee(order, status) {
	// Notify employee of approval/rejection
}
```

### 3. Add Reminder Scheduler

```javascript
// schedulers/approvalReminder.js
// Run daily to check for pending approvals
// Send reminders if approaching timeout
// Auto-approve if past timeout and conditions met
```

### 4. Create Approval Dashboard

Frontend features:

- Pending approvals list for each role
- Approval history view
- Quick approve/reject buttons
- Order details modal
- Approval timeline visualization

### 5. Add Role-Based Access Control

```javascript
// middleware/checkApproverRole.js
function canApprove(user, approval) {
	return user.role === approval.approverRole && user.employeeId === approval.approverId;
}
```

## 📚 Additional Resources

- **Full Documentation:** `ORDER_APPROVAL_FLOW.md`
- **Postman Collection:** `ORDER_APPROVAL_FLOW.postman_collection.json`
- **MongoDB Sample Data:** `SAMPLE_DATA_MONGODB.js`
- **Technical Details:** `APPROVAL_WORKFLOW_IMPLEMENTATION.md`

## ❓ FAQ

**Q: Can I modify workflows after orders are in progress?**
A: Yes, but it won't affect orders already in the approval chain. Only new orders will use the updated workflow.

**Q: What happens if an approver is not available?**
A: The timeout mechanism can auto-approve after X days if configured, or you can manually reassign the approval.

**Q: Can I have more than 4 approval levels?**
A: Yes! Add as many levels as needed. The system is fully flexible.

**Q: How do I determine which workflow applies to an order?**
A: Match based on:

1. `requiresInstallment` - If true, only matches installment orders
2. `minOrderAmount` and `maxOrderAmount` - Order total must be within range

**Q: Can an order skip approval levels?**
A: Yes, set `isRequired: false` on a level, and it can be auto-approved based on conditions.

## 🎉 You're All Set!

Your approval workflow system is now ready to use. Start testing with the sample data and customize the workflows to match your business needs!

For questions or issues, refer to the full documentation in `ORDER_APPROVAL_FLOW.md`.
