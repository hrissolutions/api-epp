import { describe, it } from "mocha";
import { expect } from "chai";
import supertest from "supertest";

describe("Transaction Controller", () => {
	const baseUrl = process.env.BASE_URL || "http://localhost:3000";
	const request = supertest(baseUrl);

	describe("POST /api/transaction", () => {
		it("should create a new transaction", async () => {
			const newTransaction = {
				transactionNumber: `TXN-TEST-${Date.now()}`,
				employeeId: "507f1f77bcf86cd799439011",
				orderId: "507f1f77bcf86cd799439012",
				type: "INSTALLMENT",
				amount: 1000.00,
				paymentMethod: "INSTALLMENT",
				notes: "Test transaction",
			};

			const response = await request
				.post("/api/transaction")
				.send(newTransaction)
				.expect(201);

			expect(response.body).to.have.property("success", true);
			expect(response.body.data).to.have.property("transactionNumber", newTransaction.transactionNumber);
		});
	});

	describe("GET /api/transaction", () => {
		it("should retrieve all transactions", async () => {
			const response = await request
				.get("/api/transaction?document=true&count=true")
				.expect(200);

			expect(response.body).to.have.property("success", true);
			expect(response.body.data).to.have.property("transactions");
			expect(response.body.data).to.have.property("count");
		});

		it("should filter transactions by status", async () => {
			const response = await request
				.get('/api/transaction?document=true&filter=[{"status":"COMPLETED"}]')
				.expect(200);

			expect(response.body).to.have.property("success", true);
			expect(response.body.data.transactions).to.be.an("array");
		});
	});

	describe("GET /api/transaction/:id", () => {
		it("should retrieve a transaction by ID", async () => {
			// First, create a transaction
			const newTransaction = {
				transactionNumber: `TXN-TEST-${Date.now()}`,
				employeeId: "507f1f77bcf86cd799439011",
				orderId: "507f1f77bcf86cd799439012",
				type: "CASH",
				amount: 500.00,
				paymentMethod: "CASH",
			};

			const createResponse = await request
				.post("/api/transaction")
				.send(newTransaction)
				.expect(201);

			const transactionId = createResponse.body.data.id;

			// Then retrieve it
			const response = await request
				.get(`/api/transaction/${transactionId}`)
				.expect(200);

			expect(response.body).to.have.property("success", true);
			expect(response.body.data).to.have.property("id", transactionId);
		});
	});

	describe("PATCH /api/transaction/:id", () => {
		it("should update a transaction", async () => {
			// First, create a transaction
			const newTransaction = {
				transactionNumber: `TXN-TEST-${Date.now()}`,
				employeeId: "507f1f77bcf86cd799439011",
				orderId: "507f1f77bcf86cd799439012",
				type: "INSTALLMENT",
				amount: 1000.00,
				paymentMethod: "INSTALLMENT",
			};

			const createResponse = await request
				.post("/api/transaction")
				.send(newTransaction)
				.expect(201);

			const transactionId = createResponse.body.data.id;

			// Then update it
			const updateData = {
				status: "PROCESSING",
				notes: "Transaction being processed",
			};

			const response = await request
				.patch(`/api/transaction/${transactionId}`)
				.send(updateData)
				.expect(200);

			expect(response.body).to.have.property("success", true);
			expect(response.body.data.transaction).to.have.property("status", "PROCESSING");
		});
	});

	describe("POST /api/transaction/:id/process", () => {
		it("should process a transaction", async () => {
			// First, create a pending transaction
			const newTransaction = {
				transactionNumber: `TXN-TEST-${Date.now()}`,
				employeeId: "507f1f77bcf86cd799439011",
				orderId: "507f1f77bcf86cd799439012",
				type: "INSTALLMENT",
				amount: 1000.00,
				paymentMethod: "INSTALLMENT",
				status: "PENDING",
			};

			const createResponse = await request
				.post("/api/transaction")
				.send(newTransaction)
				.expect(201);

			const transactionId = createResponse.body.data.id;

			// Then process it
			const processData = {
				processedBy: "test@company.com",
				payrollBatchId: "BATCH-TEST-001",
				notes: "Processed in test",
			};

			const response = await request
				.post(`/api/transaction/${transactionId}/process`)
				.send(processData)
				.expect(200);

			expect(response.body).to.have.property("success", true);
			expect(response.body.data.transaction).to.have.property("status", "COMPLETED");
			expect(response.body.data.transaction).to.have.property("processedAt");
		});
	});

	describe("POST /api/transaction/:id/reconcile", () => {
		it("should reconcile a transaction", async () => {
			// First, create a completed transaction
			const newTransaction = {
				transactionNumber: `TXN-TEST-${Date.now()}`,
				employeeId: "507f1f77bcf86cd799439011",
				orderId: "507f1f77bcf86cd799439012",
				type: "CASH",
				amount: 500.00,
				paymentMethod: "CASH",
				status: "COMPLETED",
			};

			const createResponse = await request
				.post("/api/transaction")
				.send(newTransaction)
				.expect(201);

			const transactionId = createResponse.body.data.id;

			// Then reconcile it
			const reconcileData = {
				reconciledBy: "admin@company.com",
				notes: "Reconciled in test",
			};

			const response = await request
				.post(`/api/transaction/${transactionId}/reconcile`)
				.send(reconcileData)
				.expect(200);

			expect(response.body).to.have.property("success", true);
			expect(response.body.data.transaction).to.have.property("isReconciled", true);
			expect(response.body.data.transaction).to.have.property("reconciledAt");
		});
	});

	describe("GET /api/transaction/order/:orderId", () => {
		it("should retrieve transactions by order ID", async () => {
			const orderId = "507f1f77bcf86cd799439012";

			const response = await request
				.get(`/api/transaction/order/${orderId}`)
				.expect(200);

			expect(response.body).to.have.property("success", true);
			expect(response.body.data).to.have.property("orderId", orderId);
			expect(response.body.data).to.have.property("transactions");
			expect(response.body.data.transactions).to.be.an("array");
		});
	});

	describe("GET /api/transaction/employee/:employeeId", () => {
		it("should retrieve transactions by employee ID", async () => {
			const employeeId = "507f1f77bcf86cd799439011";

			const response = await request
				.get(`/api/transaction/employee/${employeeId}`)
				.expect(200);

			expect(response.body).to.have.property("success", true);
			expect(response.body.data).to.have.property("employeeId", employeeId);
			expect(response.body.data).to.have.property("transactions");
			expect(response.body.data).to.have.property("byType");
		});
	});

	describe("GET /api/transaction/unreconciled", () => {
		it("should retrieve unreconciled transactions", async () => {
			const response = await request
				.get("/api/transaction/unreconciled")
				.expect(200);

			expect(response.body).to.have.property("success", true);
			expect(response.body.data).to.have.property("totalUnreconciled");
			expect(response.body.data).to.have.property("transactions");
			expect(response.body.data).to.have.property("byPaymentMethod");
		});
	});

	describe("DELETE /api/transaction/:id", () => {
		it("should delete a transaction", async () => {
			// First, create a transaction
			const newTransaction = {
				transactionNumber: `TXN-TEST-DELETE-${Date.now()}`,
				employeeId: "507f1f77bcf86cd799439011",
				orderId: "507f1f77bcf86cd799439012",
				type: "ADJUSTMENT",
				amount: 100.00,
				paymentMethod: "CASH",
			};

			const createResponse = await request
				.post("/api/transaction")
				.send(newTransaction)
				.expect(201);

			const transactionId = createResponse.body.data.id;

			// Then delete it
			const response = await request
				.delete(`/api/transaction/${transactionId}`)
				.expect(200);

			expect(response.body).to.have.property("success", true);

			// Verify it's deleted
			await request
				.get(`/api/transaction/${transactionId}`)
				.expect(404);
		});
	});
});
