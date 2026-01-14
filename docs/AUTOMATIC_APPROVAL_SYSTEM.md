# Automatic Order Approval System with Email Notifications

## 🎯 Overview

The EPP system now includes a fully automatic approval workflow that:
- ✅ **Automatically creates approval chains** when orders are placed
- ✅ **Sends email notifications** to approvers at each level
- ✅ **Advances through levels** automatically when approved
- ✅ **Notifies employees** when orders are approved or rejected
- ✅ **Matches workflows** based on order amount and payment type

## 📁 Files Created

### Email System
- `helper/email.helper.ts` - Email sending functions with nodemailer
- `views/emails/approval-request.ejs` - Initial approval request template
- `views/emails/next-level-approval.ejs` - Next level notification template
- `views/emails/order-approved.ejs` - Order approved notification template
- `views/emails/order-rejected.ejs` - Order rejected notification template
- `views/emails/approval-reminder.ejs` - Reminder notification template

### Approval Logic
- `helper/approvalService.ts` - Automatic approval chain creation and processing
- Updated `app/order/order.controller.ts` - Creates approvals on order creation
- Updated `app/orderApproval/orderApproval.controller.ts` - Added approve/reject endpoints

## 🚀 How It Works

### Step 1: Employee Places Order

```javascript
POST /api/order
{
  "employeeId": "507f1f77bcf86cd799439012",
  "orderNumber": "ORD-2026-001",
  "total": 3500,
  "paymentType": "CASH",
  "status": "PENDING_APPROVAL",
  "notes": "Laptop for remote work"
}
```

### Step 2: System Automatically:

#### A. Matches Workflow
```javascript
// System finds matching workflow
const workflow = await findMatchingWorkflow(prisma, 3500, "CASH")
// Returns: "Standard Order Approval" (for orders < $5,000)
```

#### B. Gets Approvers for Each Level
```javascript
// Gets manager, HR, finance, etc. based on role
const manager = await getApproverForRole(prisma, "MANAGER", employeeId)
const hr = await getApproverForRole(prisma, "HR", employeeId)
```

#### C. Creates ALL Approval Records
```javascript
// Level 1: Manager
await prisma.orderApproval.create({
  orderId: order.id,
  approvalLevel: 1,
  approverRole: "MANAGER",
  approverId: manager.id,
  approverName: manager.name,
  approverEmail: manager.email,
  status: "PENDING"
})

// Level 2: HR
await prisma.orderApproval.create({
  orderId: order.id,
  approvalLevel: 2,
  approverRole: "HR",
  approverId: hr.id,
  approverName: hr.name,
  approverEmail: hr.email,
  status: "PENDING"
})
```

#### D. Sends Email to First Level Approver
```javascript
await sendApprovalRequestEmail({
  to: "manager@company.com",
  approverName: "Sarah Smith",
  employeeName: "John Doe",
  orderNumber: "ORD-2026-001",
  orderTotal: 3500,
  approvalLevel: 1,
  approverRole: "MANAGER",
  orderDate: new Date(),
  notes: "Laptop for remote work"
})
```

### Step 3: Manager Approves

#### Option A: Using Custom Endpoint (Recommended)
```javascript
POST /api/orderApproval/{approval_id}/approve
{
  "comments": "Approved. Needed for remote work."
}
```

#### Option B: Using Update Endpoint
```javascript
PATCH /api/orderApproval/{approval_id}
{
  "status": "APPROVED",
  "comments": "Approved. Needed for remote work."
}
```

### Step 4: System Automatically:

#### A. Updates Approval Record
```javascript
// Sets status to APPROVED and timestamp
await prisma.orderApproval.update({
  where: { id: approvalId },
  data: {
    status: "APPROVED",
    approvedAt: new Date(),
    comments: "Approved. Needed for remote work."
  }
})
```

#### B. Checks for Next Level
```javascript
const nextLevel = await prisma.orderApproval.findFirst({
  where: {
    orderId: order.id,
    approvalLevel: currentLevel + 1
  }
})
```

#### C. If Next Level Exists:
```javascript
// Update order to next level
await prisma.order.update({
  where: { id: order.id },
  data: { currentApprovalLevel: 2 }
})

// Send email to next approver
await sendNextApprovalNotification({
  to: "hr@company.com",
  approverName: "Mike Johnson",
  employeeName: "John Doe",
  orderNumber: "ORD-2026-001",
  orderTotal: 3500,
  previousApprover: "Sarah Smith (Manager)",
  approvalLevel: 2,
  approverRole: "HR"
})
```

#### D. If No More Levels (Fully Approved):
```javascript
// Update order to APPROVED
await prisma.order.update({
  where: { id: order.id },
  data: {
    status: "APPROVED",
    isFullyApproved: true,
    approvedAt: new Date()
  }
})

// Send email to employee
await sendOrderApprovedEmail({
  to: "employee@company.com",
  employeeName: "John Doe",
  orderNumber: "ORD-2026-001",
  orderTotal: 3500,
  approvedBy: "Mike Johnson (HR)",
  approvedAt: new Date()
})
```

### Step 5: If Rejected

```javascript
POST /api/orderApproval/{approval_id}/reject
{
  "comments": "Budget not available for this period."
}
```

System automatically:
```javascript
// Update approval
await prisma.orderApproval.update({
  where: { id: approvalId },
  data: {
    status: "REJECTED",
    rejectedAt: new Date(),
    comments: "Budget not available for this period."
  }
})

// Update order
await prisma.order.update({
  where: { id: order.id },
  data: {
    status: "REJECTED",
    rejectedAt: new Date(),
    rejectedBy: "Sarah Smith (Manager)",
    rejectionReason: "Budget not available for this period."
  }
})

// Send rejection email to employee
await sendOrderRejectedEmail({
  to: "employee@company.com",
  employeeName: "John Doe",
  orderNumber: "ORD-2026-001",
  orderTotal: 3500,
  rejectedBy: "Sarah Smith (Manager)",
  rejectedAt: new Date(),
  rejectionReason: "Budget not available for this period."
})
```

## 📊 Complete Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                   AUTOMATIC APPROVAL FLOW                        │
└─────────────────────────────────────────────────────────────────┘

1. Employee Places Order
         ↓
2. System Matches Workflow
   (Based on amount & payment type)
         ↓
3. System Creates ALL Approval Records
   • Level 1: Manager (PENDING)
   • Level 2: HR (PENDING)
   • Level 3: Finance (PENDING - if needed)
         ↓
4. System Sends Email to Level 1 Approver
   📧 "manager@company.com"
         ↓
5. Manager Approves ✓
   POST /api/orderApproval/{id}/approve
         ↓
6. System Automatically:
   • Updates Level 1 to APPROVED
   • Advances order to Level 2
   • Sends Email to Level 2 Approver
   📧 "hr@company.com"
         ↓
7. HR Approves ✓
   POST /api/orderApproval/{id}/approve
         ↓
8. System Checks: More Levels?
         ↓
   ┌─── YES ───→ Continue to Next Level
   └─── NO  ───→ Order Fully Approved! 🎉
                 • Update order: status="APPROVED"
                 • Send email to employee
                 📧 "employee@company.com"

OR

5. Manager Rejects ✗
   POST /api/orderApproval/{id}/reject
         ↓
6. System Automatically:
   • Updates approval to REJECTED
   • Updates order to REJECTED
   • Stops approval chain
   • Sends email to employee
   📧 "employee@company.com" (rejection notice)
```

## 🔧 API Endpoints

### Approve Order Approval
```http
POST /api/orderApproval/{approvalId}/approve
Content-Type: application/json

{
  "comments": "Approved for processing"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Order approval approved successfully",
  "data": {
    "orderApproval": {
      "id": "approval_id",
      "orderId": "order_id",
      "status": "APPROVED",
      "approvedAt": "2026-01-14T15:30:00Z",
      "comments": "Approved for processing"
    }
  }
}
```

### Reject Order Approval
```http
POST /api/orderApproval/{approvalId}/reject
Content-Type: application/json

{
  "comments": "Budget not available" // REQUIRED
}
```

**Response:**
```json
{
  "success": true,
  "message": "Order approval rejected successfully",
  "data": {
    "orderApproval": {
      "id": "approval_id",
      "orderId": "order_id",
      "status": "REJECTED",
      "rejectedAt": "2026-01-14T15:30:00Z",
      "comments": "Budget not available"
    }
  }
}
```

### Get Pending Approvals for Approver
```http
GET /api/orderApproval?filter=[{"approverId":"emp_123"},{"status":"PENDING"}]&document=true
```

### Get All Approvals for an Order
```http
GET /api/orderApproval?filter=[{"orderId":"order_id"}]&document=true&sort=approvalLevel&order=asc
```

## 📧 Email Configuration

### Setup .env File
```env
SMTP_USER=your-email@gmail.com
APP_PASSWORD=your-gmail-app-password
```

### Generate Gmail App Password
1. Go to Google Account settings
2. Security → 2-Step Verification
3. App Passwords
4. Generate password for "Mail"
5. Copy to `.env` as `APP_PASSWORD`

## 🎨 Email Templates

All email templates are in `views/emails/` with beautiful, responsive designs:
- Professional gradient headers
- Order details in clean tables
- Action buttons
- Mobile-responsive
- Company branding

### Customizing Templates
Edit the `.ejs` files in `views/emails/`:
- Change colors in `<style>` tags
- Update company name
- Modify button styles
- Add logo images

## 🔄 Customizing Approver Logic

Currently using placeholder approvers. Update `getApproverForRole()` in `helper/approvalService.ts`:

```typescript
export const getApproverForRole = async (
  prisma: PrismaClient,
  role: string,
  employeeId?: string,
) => {
  // Get employee details
  const employee = await prisma.person.findUnique({
    where: { id: employeeId }
  });
  
  if (role === "MANAGER") {
    // Find employee's manager
    return await prisma.person.findUnique({
      where: { id: employee.managerId }
    });
  }
  
  if (role === "HR") {
    // Find HR representative for department
    return await prisma.person.findFirst({
      where: {
        department: employee.department,
        role: "HR"
      }
    });
  }
  
  if (role === "FINANCE") {
    // Find finance team member
    return await prisma.person.findFirst({
      where: { role: "FINANCE" }
    });
  }
  
  // ... etc
};
```

## 🎯 Testing the System

### 1. Create Workflows
```bash
# Import the Postman collection from:
docs/ORDER_APPROVAL_FLOW.postman_collection.json

# Or run MongoDB seed:
mongo your_database < docs/SAMPLE_DATA_MONGODB.js
```

### 2. Place Test Order
```javascript
POST /api/order
{
  "orderNumber": "TEST-001",
  "employeeId": "507f1f77bcf86cd799439012",
  "total": 2500,
  "paymentType": "CASH",
  "status": "PENDING_APPROVAL",
  "subtotal": 2500,
  "discount": 0,
  "tax": 187.50,
  "shippingCost": 50,
  "notes": "Test order"
}
```

### 3. Check Email
- Email sent to first level approver
- Check spam folder if not in inbox

### 4. Get Pending Approvals
```javascript
GET /api/orderApproval?filter=[{"status":"PENDING"}]&document=true
```

### 5. Approve First Level
```javascript
POST /api/orderApproval/{approval_id}/approve
{
  "comments": "Test approval"
}
```

### 6. Verify Next Level Email
- Check that next level approver received email

### 7. Continue Through Levels
- Approve each level
- Verify email at each step
- Check final approval email to employee

## 📝 Response Example

When creating an order, you now get:

```json
{
  "success": true,
  "message": "Order created successfully",
  "data": {
    "order": {
      "id": "order_id",
      "orderNumber": "ORD-2026-001",
      "status": "PENDING_APPROVAL",
      "total": 3500,
      "currentApprovalLevel": 1
    },
    "approvalWorkflow": {
      "name": "Standard Order Approval",
      "totalLevels": 2,
      "currentLevel": 1,
      "approvalChain": [
        {
          "level": 1,
          "role": "MANAGER",
          "approverName": "Sarah Smith",
          "status": "PENDING"
        },
        {
          "level": 2,
          "role": "HR",
          "approverName": "Mike Johnson",
          "status": "PENDING"
        }
      ]
    }
  }
}
```

## ⚡ Benefits

1. **No Manual Work**: Approvals created automatically
2. **Email Notifications**: Approvers notified immediately
3. **Sequential Processing**: Each level processed in order
4. **Audit Trail**: Complete history of approvals
5. **Employee Updates**: Employees notified of status changes
6. **Flexible Workflows**: Easy to configure different approval chains

## 🎓 Next Steps

1. **Update `getApproverForRole()`** with your actual employee/user logic
2. **Configure email templates** with your company branding
3. **Test with real email addresses**
4. **Add reminder scheduler** for pending approvals
5. **Create approval dashboard** for frontend

## 🚀 Production Checklist

- [ ] Set up SMTP credentials in `.env`
- [ ] Update `getApproverForRole()` with real employee logic
- [ ] Customize email templates with company branding
- [ ] Test email delivery
- [ ] Create workflows in database
- [ ] Set up approval levels for each workflow
- [ ] Test full approval flow
- [ ] Monitor email logs
- [ ] Set up error alerts
- [ ] Train approvers on new system

---

**Everything is automated! No manual approval creation needed!** 🎉
