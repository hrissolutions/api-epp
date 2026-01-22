// MongoDB Sample Data for Order Approval Workflow
// Run this in MongoDB Shell or MongoDB Compass

// ============================================
// 1. INSERT APPROVAL WORKFLOWS
// ============================================

db.approvalWorkflows.insertMany([
	{
		_id: "wf_standard_001",
		name: "Standard Order Approval",
		description: "For orders under $5,000",
		isActive: true,
		minOrderAmount: 0,
		maxOrderAmount: 5000,
		requiresInstallment: false,
		createdAt: new Date(),
		updatedAt: new Date(),
	},
	{
		_id: "wf_high_value_002",
		name: "High-Value Order Approval",
		description: "For orders $5,000 - $20,000",
		isActive: true,
		minOrderAmount: 5000,
		maxOrderAmount: 20000,
		requiresInstallment: false,
		createdAt: new Date(),
		updatedAt: new Date(),
	},
	{
		_id: "wf_installment_003",
		name: "Installment Order Approval",
		description: "For all orders with installment payments",
		isActive: true,
		minOrderAmount: 0,
		maxOrderAmount: null,
		requiresInstallment: true,
		createdAt: new Date(),
		updatedAt: new Date(),
	},
]);

print("✓ Created 3 approval workflows");

// ============================================
// 2. INSERT APPROVAL LEVELS
// ============================================

db.approvalLevels.insertMany([
	// Standard Workflow Levels
	{
		_id: "level_standard_001_1",
		workflowId: "wf_standard_001",
		level: 1,
		role: "MANAGER",
		description: "Direct manager must approve order",
		isRequired: true,
		autoApproveUnder: 1000,
		timeoutDays: 2,
		createdAt: new Date(),
		updatedAt: new Date(),
	},
	{
		_id: "level_standard_001_2",
		workflowId: "wf_standard_001",
		level: 2,
		role: "HR",
		description: "HR verification for employee benefits",
		isRequired: true,
		autoApproveUnder: null,
		timeoutDays: 3,
		createdAt: new Date(),
		updatedAt: new Date(),
	},

	// High-Value Workflow Levels
	{
		_id: "level_high_value_002_1",
		workflowId: "wf_high_value_002",
		level: 1,
		role: "MANAGER",
		description: "Direct manager approval required",
		isRequired: true,
		autoApproveUnder: null,
		timeoutDays: 2,
		createdAt: new Date(),
		updatedAt: new Date(),
	},
	{
		_id: "level_high_value_002_2",
		workflowId: "wf_high_value_002",
		level: 2,
		role: "DEPARTMENT_HEAD",
		description: "Department head must review high-value orders",
		isRequired: true,
		autoApproveUnder: null,
		timeoutDays: 3,
		createdAt: new Date(),
		updatedAt: new Date(),
	},
	{
		_id: "level_high_value_002_3",
		workflowId: "wf_high_value_002",
		level: 3,
		role: "FINANCE",
		description: "Finance department final approval",
		isRequired: true,
		autoApproveUnder: null,
		timeoutDays: 5,
		createdAt: new Date(),
		updatedAt: new Date(),
	},

	// Installment Workflow Levels
	{
		_id: "level_installment_003_1",
		workflowId: "wf_installment_003",
		level: 1,
		role: "MANAGER",
		description: "Manager approval for installment request",
		isRequired: true,
		autoApproveUnder: null,
		timeoutDays: 2,
		createdAt: new Date(),
		updatedAt: new Date(),
	},
	{
		_id: "level_installment_003_2",
		workflowId: "wf_installment_003",
		level: 2,
		role: "HR",
		description: "HR verifies employee eligibility for installments",
		isRequired: true,
		autoApproveUnder: null,
		timeoutDays: 3,
		createdAt: new Date(),
		updatedAt: new Date(),
	},
	{
		_id: "level_installment_003_3",
		workflowId: "wf_installment_003",
		level: 3,
		role: "FINANCE",
		description: "Finance reviews installment terms",
		isRequired: true,
		autoApproveUnder: null,
		timeoutDays: 3,
		createdAt: new Date(),
		updatedAt: new Date(),
	},
	{
		_id: "level_installment_003_4",
		workflowId: "wf_installment_003",
		level: 4,
		role: "ADMIN",
		description: "Final administrative approval",
		isRequired: false,
		autoApproveUnder: 3000,
		timeoutDays: 5,
		createdAt: new Date(),
		updatedAt: new Date(),
	},
]);

print("✓ Created 9 approval levels across all workflows");

// ============================================
// 3. INSERT SAMPLE ORDERS
// ============================================

db.orders.insertMany([
	// Order 1: Standard Order - Fully Approved
	{
		_id: ObjectId("507f1f77bcf86cd799439011"),
		orderNumber: "ORD-2026-001",
		employeeId: ObjectId("507f1f77bcf86cd799439012"),
		status: "APPROVED",
		subtotal: 2500,
		discount: 0,
		tax: 187.5,
		shippingCost: 50,
		total: 2737.5,
		paymentType: "CASH",
		installmentMonths: null,
		installmentCount: null,
		installmentAmount: null,
		pointsUsed: null,
		shippingAddress: "123 Main St",
		shippingCity: "New York",
		shippingState: "NY",
		shippingZip: "10001",
		shippingCountry: "USA",
		trackingNumber: null,
		paymentMethod: "PAYROLL_DEDUCTION",
		paymentStatus: "PENDING",
		currentApprovalLevel: 2,
		isFullyApproved: true,
		approvedAt: new Date("2026-01-15T09:15:00Z"),
		rejectedAt: null,
		rejectedBy: null,
		rejectionReason: null,
		orderDate: new Date("2026-01-14T10:00:00Z"),
		shippedDate: null,
		deliveredDate: null,
		cancelledDate: null,
		notes: "Laptop for remote work",
		createdAt: new Date("2026-01-14T10:00:00Z"),
		updatedAt: new Date("2026-01-15T09:15:00Z"),
	},

	// Order 2: High-Value Order - Fully Approved
	{
		_id: ObjectId("507f1f77bcf86cd799439013"),
		orderNumber: "ORD-2026-002",
		employeeId: ObjectId("507f1f77bcf86cd799439014"),
		status: "APPROVED",
		subtotal: 8500,
		discount: 500,
		tax: 600,
		shippingCost: 0,
		total: 8600,
		paymentType: "CASH",
		installmentMonths: null,
		installmentCount: null,
		installmentAmount: null,
		pointsUsed: null,
		shippingAddress: "456 Tech Ave",
		shippingCity: "San Francisco",
		shippingState: "CA",
		shippingZip: "94102",
		shippingCountry: "USA",
		trackingNumber: null,
		paymentMethod: "PAYROLL_DEDUCTION",
		paymentStatus: "PENDING",
		currentApprovalLevel: 3,
		isFullyApproved: true,
		approvedAt: new Date("2026-01-16T10:00:00Z"),
		rejectedAt: null,
		rejectedBy: null,
		rejectionReason: null,
		orderDate: new Date("2026-01-14T11:00:00Z"),
		shippedDate: null,
		deliveredDate: null,
		cancelledDate: null,
		notes: "High-end workstation for 3D design work",
		createdAt: new Date("2026-01-14T11:00:00Z"),
		updatedAt: new Date("2026-01-16T10:00:00Z"),
	},

	// Order 3: Installment Order - Fully Approved
	{
		_id: ObjectId("507f1f77bcf86cd799439015"),
		orderNumber: "ORD-2026-003",
		employeeId: ObjectId("507f1f77bcf86cd799439016"),
		status: "APPROVED",
		subtotal: 6000,
		discount: 200,
		tax: 435,
		shippingCost: 0,
		total: 6235,
		paymentType: "INSTALLMENT",
		installmentMonths: 12,
		installmentCount: 12,
		installmentAmount: 519.58,
		pointsUsed: null,
		shippingAddress: "789 Business Blvd",
		shippingCity: "Chicago",
		shippingState: "IL",
		shippingZip: "60601",
		shippingCountry: "USA",
		trackingNumber: null,
		paymentMethod: "PAYROLL_DEDUCTION",
		paymentStatus: "PENDING",
		currentApprovalLevel: 4,
		isFullyApproved: true,
		approvedAt: new Date("2026-01-15T14:00:00Z"),
		rejectedAt: null,
		rejectedBy: null,
		rejectionReason: null,
		orderDate: new Date("2026-01-14T12:00:00Z"),
		shippedDate: null,
		deliveredDate: null,
		cancelledDate: null,
		notes: "MacBook Pro with 12-month installment plan",
		createdAt: new Date("2026-01-14T12:00:00Z"),
		updatedAt: new Date("2026-01-15T14:00:00Z"),
	},

	// Order 4: Rejected Order
	{
		_id: ObjectId("507f1f77bcf86cd799439017"),
		orderNumber: "ORD-2026-004",
		employeeId: ObjectId("507f1f77bcf86cd799439018"),
		status: "REJECTED",
		subtotal: 15000,
		discount: 0,
		tax: 1125,
		shippingCost: 0,
		total: 16125,
		paymentType: "CASH",
		installmentMonths: null,
		installmentCount: null,
		installmentAmount: null,
		pointsUsed: null,
		shippingAddress: "321 Office Dr",
		shippingCity: "Austin",
		shippingState: "TX",
		shippingZip: "73301",
		shippingCountry: "USA",
		trackingNumber: null,
		paymentMethod: "PAYROLL_DEDUCTION",
		paymentStatus: "PENDING",
		currentApprovalLevel: 2,
		isFullyApproved: false,
		approvedAt: null,
		rejectedAt: new Date("2026-01-15T13:00:00Z"),
		rejectedBy: "Richard White (Department Head)",
		rejectionReason: "Gaming equipment not justified for business use. Request denied.",
		orderDate: new Date("2026-01-14T13:00:00Z"),
		shippedDate: null,
		deliveredDate: null,
		cancelledDate: null,
		notes: "Gaming equipment for office",
		createdAt: new Date("2026-01-14T13:00:00Z"),
		updatedAt: new Date("2026-01-15T13:00:00Z"),
	},

	// Order 5: Pending Approval (Level 1)
	{
		_id: ObjectId("507f1f77bcf86cd799439019"),
		orderNumber: "ORD-2026-005",
		employeeId: ObjectId("507f1f77bcf86cd799439020"),
		status: "PENDING_APPROVAL",
		subtotal: 1200,
		discount: 50,
		tax: 86.25,
		shippingCost: 25,
		total: 1261.25,
		paymentType: "CASH",
		installmentMonths: null,
		installmentCount: null,
		installmentAmount: null,
		pointsUsed: null,
		shippingAddress: "555 Commerce St",
		shippingCity: "Seattle",
		shippingState: "WA",
		shippingZip: "98101",
		shippingCountry: "USA",
		trackingNumber: null,
		paymentMethod: "PAYROLL_DEDUCTION",
		paymentStatus: "PENDING",
		currentApprovalLevel: 1,
		isFullyApproved: false,
		approvedAt: null,
		rejectedAt: null,
		rejectedBy: null,
		rejectionReason: null,
		orderDate: new Date(),
		shippedDate: null,
		deliveredDate: null,
		cancelledDate: null,
		notes: "Office supplies and equipment",
		createdAt: new Date(),
		updatedAt: new Date(),
	},
]);

print("✓ Created 5 sample orders");

// ============================================
// 4. INSERT ORDER APPROVALS
// ============================================

db.orderApprovals.insertMany([
	// Order 1 Approvals (Fully Approved)
	{
		_id: "approval_001_level_1",
		orderId: ObjectId("507f1f77bcf86cd799439011"),
		approvalLevel: 1,
		approverRole: "MANAGER",
		approverId: "emp_sarah_smith_mgr",
		approverName: "Sarah Smith",
		approverEmail: "sarah.smith@company.com",
		status: "APPROVED",
		approvedAt: new Date("2026-01-14T14:30:00Z"),
		rejectedAt: null,
		comments: "Approved. Laptop is needed for remote work setup.",
		notifiedAt: new Date("2026-01-14T10:05:00Z"),
		reminderSentAt: null,
		createdAt: new Date("2026-01-14T10:05:00Z"),
		updatedAt: new Date("2026-01-14T14:30:00Z"),
	},
	{
		_id: "approval_001_level_2",
		orderId: ObjectId("507f1f77bcf86cd799439011"),
		approvalLevel: 2,
		approverRole: "HR",
		approverId: "emp_mike_johnson_hr",
		approverName: "Mike Johnson",
		approverEmail: "mike.johnson@company.com",
		status: "APPROVED",
		approvedAt: new Date("2026-01-15T09:15:00Z"),
		rejectedAt: null,
		comments: "Verified employee eligibility. Approved.",
		notifiedAt: new Date("2026-01-14T14:35:00Z"),
		reminderSentAt: null,
		createdAt: new Date("2026-01-14T14:35:00Z"),
		updatedAt: new Date("2026-01-15T09:15:00Z"),
	},

	// Order 2 Approvals (Fully Approved - 3 Levels)
	{
		_id: "approval_002_level_1",
		orderId: ObjectId("507f1f77bcf86cd799439013"),
		approvalLevel: 1,
		approverRole: "MANAGER",
		approverId: "emp_david_brown_mgr",
		approverName: "David Brown",
		approverEmail: "david.brown@company.com",
		status: "APPROVED",
		approvedAt: new Date("2026-01-14T15:00:00Z"),
		rejectedAt: null,
		comments: "Justified for 3D design requirements. Approved.",
		notifiedAt: new Date("2026-01-14T11:05:00Z"),
		reminderSentAt: null,
		createdAt: new Date("2026-01-14T11:05:00Z"),
		updatedAt: new Date("2026-01-14T15:00:00Z"),
	},
	{
		_id: "approval_002_level_2",
		orderId: ObjectId("507f1f77bcf86cd799439013"),
		approvalLevel: 2,
		approverRole: "DEPARTMENT_HEAD",
		approverId: "emp_lisa_anderson_dept",
		approverName: "Lisa Anderson",
		approverEmail: "lisa.anderson@company.com",
		status: "APPROVED",
		approvedAt: new Date("2026-01-15T11:30:00Z"),
		rejectedAt: null,
		comments: "Budget available. Approved for design department.",
		notifiedAt: new Date("2026-01-14T15:05:00Z"),
		reminderSentAt: null,
		createdAt: new Date("2026-01-14T15:05:00Z"),
		updatedAt: new Date("2026-01-15T11:30:00Z"),
	},
	{
		_id: "approval_002_level_3",
		orderId: ObjectId("507f1f77bcf86cd799439013"),
		approvalLevel: 3,
		approverRole: "FINANCE",
		approverId: "emp_robert_taylor_fin",
		approverName: "Robert Taylor",
		approverEmail: "robert.taylor@company.com",
		status: "APPROVED",
		approvedAt: new Date("2026-01-16T10:00:00Z"),
		rejectedAt: null,
		comments: "Financially reviewed and approved. Within budget limits.",
		notifiedAt: new Date("2026-01-15T11:35:00Z"),
		reminderSentAt: null,
		createdAt: new Date("2026-01-15T11:35:00Z"),
		updatedAt: new Date("2026-01-16T10:00:00Z"),
	},

	// Order 4 Approvals (Rejected at Level 2)
	{
		_id: "approval_004_level_1",
		orderId: ObjectId("507f1f77bcf86cd799439017"),
		approvalLevel: 1,
		approverRole: "MANAGER",
		approverId: "emp_susan_clark_mgr",
		approverName: "Susan Clark",
		approverEmail: "susan.clark@company.com",
		status: "APPROVED",
		approvedAt: new Date("2026-01-14T17:00:00Z"),
		rejectedAt: null,
		comments: "Approved pending higher level review.",
		notifiedAt: new Date("2026-01-14T13:05:00Z"),
		reminderSentAt: null,
		createdAt: new Date("2026-01-14T13:05:00Z"),
		updatedAt: new Date("2026-01-14T17:00:00Z"),
	},
	{
		_id: "approval_004_level_2",
		orderId: ObjectId("507f1f77bcf86cd799439017"),
		approvalLevel: 2,
		approverRole: "DEPARTMENT_HEAD",
		approverId: "emp_richard_white_dept",
		approverName: "Richard White",
		approverEmail: "richard.white@company.com",
		status: "REJECTED",
		approvedAt: null,
		rejectedAt: new Date("2026-01-15T13:00:00Z"),
		comments: "Gaming equipment not justified for business use. Request denied.",
		notifiedAt: new Date("2026-01-14T17:05:00Z"),
		reminderSentAt: null,
		createdAt: new Date("2026-01-14T17:05:00Z"),
		updatedAt: new Date("2026-01-15T13:00:00Z"),
	},

	// Order 5 Approvals (Pending at Level 1)
	{
		_id: "approval_005_level_1",
		orderId: ObjectId("507f1f77bcf86cd799439019"),
		approvalLevel: 1,
		approverRole: "MANAGER",
		approverId: "emp_jennifer_lee_mgr",
		approverName: "Jennifer Lee",
		approverEmail: "jennifer.lee@company.com",
		status: "PENDING",
		approvedAt: null,
		rejectedAt: null,
		comments: null,
		notifiedAt: new Date(),
		reminderSentAt: null,
		createdAt: new Date(),
		updatedAt: new Date(),
	},
]);

print("✓ Created approval records for all orders");

// ============================================
// 5. VERIFICATION QUERIES
// ============================================

print("\n========================================");
print("VERIFICATION QUERIES");
print("========================================\n");

print("Total Workflows:");
print(db.approvalWorkflows.countDocuments());

print("\nTotal Approval Levels:");
print(db.approvalLevels.countDocuments());

print("\nTotal Orders:");
print(db.orders.countDocuments());

print("\nTotal Order Approvals:");
print(db.orderApprovals.countDocuments());

print("\nOrders by Status:");
printjson(
	db.orders
		.aggregate([
			{
				$group: {
					_id: "$status",
					count: { $sum: 1 },
				},
			},
		])
		.toArray(),
);

print("\nApprovals by Status:");
printjson(
	db.orderApprovals
		.aggregate([
			{
				$group: {
					_id: "$status",
					count: { $sum: 1 },
				},
			},
		])
		.toArray(),
);

print("\n✅ Sample data setup complete!");
print("\nNext Steps:");
print("1. Start your backend server");
print("2. Use the API endpoints to interact with the data");
print("3. Or continue testing with MongoDB queries");
