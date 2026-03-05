import { controller } from "../app/installment/installment.controller";
import { groupDataByField } from "../helper/dataGrouping";
import { expect } from "chai";
import { Request, Response, NextFunction } from "express";
import { PrismaClient, Prisma } from "../generated/prisma";

const TEST_TIMEOUT = 5000;

describe("Installment Controller", () => {
	let installmentController: any;
	let req: Partial<Request>;
	let res: Response;
	let next: NextFunction;
	let prisma: any;
	let sentData: any;
	let statusCode: number;
	const mockInstallment = {
		id: "507f1f77bcf86cd799439026",
		orderId: "507f1f77bcf86cd799439040",
		financingAgreementId: null,
		installmentNumber: 1,
		amount: 500.0,
		principalAmount: 450.0,
		interestAmount: 50.0,
		status: "PENDING",
		cutOffDate: new Date("2025-01-15"),
		scheduledDate: new Date("2025-01-31"),
		deductedDate: null,
		payrollBatchId: null,
		deductionReference: null,
		notes: null,
		type: "email",
		createdAt: new Date(),
		updatedAt: new Date(),
	};

	const mockInstallments = [
		{
			id: "507f1f77bcf86cd799439026",
			orderId: "507f1f77bcf86cd799439040",
			installmentNumber: 1,
			amount: 500.0,
			status: "PENDING",
			cutOffDate: new Date("2025-01-15"),
			scheduledDate: new Date("2025-01-31"),
			type: "email",
			createdAt: new Date(),
			updatedAt: new Date(),
		},
		{
			id: "507f1f77bcf86cd799439027",
			orderId: "507f1f77bcf86cd799439040",
			installmentNumber: 2,
			amount: 500.0,
			status: "SCHEDULED",
			cutOffDate: new Date("2025-02-15"),
			scheduledDate: new Date("2025-02-28"),
			type: "sms",
			createdAt: new Date(),
			updatedAt: new Date(),
		},
		{
			id: "507f1f77bcf86cd799439028",
			orderId: "507f1f77bcf86cd799439041",
			installmentNumber: 1,
			amount: 750.0,
			status: "DEDUCTED",
			cutOffDate: new Date("2025-01-15"),
			scheduledDate: new Date("2025-01-31"),
			type: "email",
			createdAt: new Date(),
			updatedAt: new Date(),
		},
		{
			id: "507f1f77bcf86cd799439029",
			orderId: "507f1f77bcf86cd799439042",
			installmentNumber: 1,
			amount: 300.0,
			status: "PENDING",
			cutOffDate: new Date("2025-03-15"),
			scheduledDate: new Date("2025-03-31"),
			type: null,
			createdAt: new Date(),
			updatedAt: new Date(),
		},
	];

	beforeEach(() => {
		prisma = {
			installment: {
				findMany: async (_params: Prisma.InstallmentFindManyArgs) => {
					if (req.query?.groupBy) {
						return mockInstallments;
					}
					return [mockInstallment];
				},
				count: async (_params: Prisma.InstallmentCountArgs) => {
					if (req.query?.groupBy) {
						return mockInstallments.length;
					}
					return 1;
				},
				findFirst: async (params: Prisma.InstallmentFindFirstArgs) =>
					params.where?.id === mockInstallment.id ? mockInstallment : null,
				findUnique: async (params: Prisma.InstallmentFindUniqueArgs) =>
					params.where?.id === mockInstallment.id ? mockInstallment : null,
				create: async (params: Prisma.InstallmentCreateArgs) => ({
					...mockInstallment,
					...params.data,
				}),
				update: async (params: Prisma.InstallmentUpdateArgs) => ({
					...mockInstallment,
					...params.data,
				}),
				delete: async (params: Prisma.InstallmentDeleteArgs) => ({
					...mockInstallment,
					id: params.where.id,
				}),
			},
			$transaction: async (operations: any) => {
				if (typeof operations === "function") {
					return operations(prisma);
				}
				return await Promise.all(operations);
			},
		};

		installmentController = controller(prisma as PrismaClient);
		sentData = undefined;
		statusCode = 200;
		req = {
			query: {},
			params: {},
			body: {},
			get: (header: string) => {
				if (header === "Content-Type") {
					return "application/json";
				}
				return undefined;
			},
			originalUrl: "/api/installment",
		} as Request;
		res = {
			send: (data: any) => {
				sentData = data;
				return res;
			},
			status: (code: number) => {
				statusCode = code;
				return res;
			},
			json: (data: any) => {
				sentData = data;
				return res;
			},
			end: () => res,
		} as Response;
		next = () => {};
	});

	describe(".getAll()", () => {
		it("should return paginated installments", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = {
				page: "1",
				limit: "10",
				document: "true",
				count: "true",
				pagination: "true",
			};
			await installmentController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
			expect(sentData).to.have.property("data");
		});

		it("should group installments by type field", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { groupBy: "type", document: "true", count: "true", pagination: "true" };
			await installmentController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
			expect(sentData.data).to.have.property("installments");
			expect(sentData.data).to.have.property("groupedBy", "type");
			expect(sentData.data.installments).to.have.property("email");
			expect(sentData.data.installments).to.have.property("sms");
			expect(sentData.data.installments).to.have.property("unassigned");
		});

		it("should group installments by status field", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { groupBy: "status", document: "true", count: "true", pagination: "true" };
			await installmentController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
			expect(sentData.data).to.have.property("installments");
			expect(sentData.data).to.have.property("groupedBy", "status");
		});

		it("should handle installments with null values in grouping field", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { groupBy: "type", document: "true", count: "true", pagination: "true" };
			await installmentController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData.data.installments).to.have.property("unassigned");
			expect(sentData.data.installments.unassigned).to.be.an("array");
			expect(sentData.data.installments.unassigned.length).to.be.greaterThan(0);
		});

		it("should return normal response when groupBy is not provided", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = {
				page: "1",
				limit: "10",
				document: "true",
				count: "true",
				pagination: "true",
			};
			await installmentController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
			expect(sentData.data).to.have.property("installments");
			expect(sentData.data.installments).to.be.an("array");
			expect(sentData.data).to.not.have.property("groupedBy");
		});

		it("should handle empty groupBy parameter", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { groupBy: "", document: "true", count: "true", pagination: "true" };
			await installmentController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should combine grouping with other query parameters", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = {
				groupBy: "type",
				page: "1",
				limit: "10",
				sort: "installmentNumber",
				document: "true",
				count: "true",
				pagination: "true",
			};
			await installmentController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
			expect(sentData.data).to.have.property("installments");
			expect(sentData.data).to.have.property("groupedBy", "type");
		});

		it("should handle query validation failure", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { page: "invalid", document: "true", count: "true", pagination: "true" };
			await installmentController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle Prisma errors", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = {
				page: "1",
				limit: "10",
				document: "true",
				count: "true",
				pagination: "true",
			};

			prisma.installment.findMany = async () => {
				const error = new Error("Database connection failed") as any;
				error.name = "PrismaClientKnownRequestError";
				error.code = "P1001";
				throw error;
			};

			await installmentController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(500);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle internal errors", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = {
				page: "1",
				limit: "10",
				document: "true",
				count: "true",
				pagination: "true",
			};

			prisma.installment.findMany = async () => {
				throw new Error("Internal server error");
			};

			await installmentController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(500);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle advanced filtering", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = {
				page: "1",
				limit: "10",
				document: "true",
				count: "true",
				pagination: "true",
				filter: "status:PENDING",
			};
			await installmentController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle pagination parameters", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = {
				page: "2",
				limit: "5",
				sort: "installmentNumber",
				order: "asc",
				document: "true",
				count: "true",
				pagination: "true",
			};
			await installmentController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle field selection", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = {
				fields: "orderId,amount,status",
				document: "true",
				count: "true",
				pagination: "true",
			};
			await installmentController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle documents parameter", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { document: "true", count: "true", pagination: "true" };
			await installmentController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle count parameter", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { document: "true", count: "true", pagination: "true" };
			await installmentController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle pagination parameter", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { document: "true", count: "true", pagination: "true" };
			await installmentController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
		});
	});

	describe(".getById()", () => {
		it("should return an installment", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: mockInstallment.id };
			await installmentController.getById(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
			expect(sentData).to.have.property("data");
			expect(sentData.data).to.deep.include({ id: mockInstallment.id });
		});

		it("should handle invalid ID format", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: "invalid-id" };
			await installmentController.getById(req as Request, res, next);
			expect(statusCode).to.equal(404);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle non-existent installment", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: "507f1f77bcf86cd799439099" };
			await installmentController.getById(req as Request, res, next);
			expect(statusCode).to.equal(404);
			expect(sentData).to.have.property("status", "error");
			expect(sentData).to.have.property("code", 404);
		});

		it("should handle Prisma errors", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: mockInstallment.id };

			prisma.installment.findFirst = async () => {
				const error = new Error("Database connection failed") as any;
				error.name = "PrismaClientKnownRequestError";
				error.code = "P1001";
				throw error;
			};

			await installmentController.getById(req as Request, res, next);
			expect(statusCode).to.equal(500);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle internal errors", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: mockInstallment.id };

			prisma.installment.findFirst = async () => {
				throw new Error("Internal server error");
			};

			await installmentController.getById(req as Request, res, next);
			expect(statusCode).to.equal(500);
			expect(sentData).to.have.property("status", "error");
		});
	});

	describe(".create()", () => {
		it("should create a new installment", async function () {
			this.timeout(TEST_TIMEOUT);
			const createData = {
				orderId: "507f1f77bcf86cd799439040",
				installmentNumber: 1,
				amount: 500.0,
				cutOffDate: "2025-06-15",
				scheduledDate: "2025-06-30",
			};
			req.body = createData;
			await installmentController.create(req as Request, res, next);
			expect(statusCode).to.equal(201);
			expect(sentData).to.have.property("status", "success");
			expect(sentData).to.have.property("data");
			expect(sentData.data).to.have.property("id");
		});

		it("should create a new installment with optional fields", async function () {
			this.timeout(TEST_TIMEOUT);
			const createData = {
				orderId: "507f1f77bcf86cd799439040",
				installmentNumber: 2,
				amount: 750.0,
				cutOffDate: "2025-07-15",
				scheduledDate: "2025-07-31",
				status: "SCHEDULED",
				notes: "Second installment",
			};
			req.body = createData;
			await installmentController.create(req as Request, res, next);
			expect(statusCode).to.equal(201);
			expect(sentData).to.have.property("status", "success");
			expect(sentData).to.have.property("data");
			expect(sentData.data).to.have.property("id");
		});

		it("should create a new installment without optional fields", async function () {
			this.timeout(TEST_TIMEOUT);
			const createData = {
				orderId: "507f1f77bcf86cd799439040",
				installmentNumber: 3,
				amount: 250.0,
				cutOffDate: "2025-08-15",
				scheduledDate: "2025-08-31",
			};
			req.body = createData;
			await installmentController.create(req as Request, res, next);
			expect(statusCode).to.equal(201);
			expect(sentData).to.have.property("status", "success");
			expect(sentData).to.have.property("data");
			expect(sentData.data).to.have.property("id");
		});

		it("should handle form data (multipart/form-data)", async function () {
			this.timeout(TEST_TIMEOUT);
			const createData = {
				orderId: "507f1f77bcf86cd799439040",
				installmentNumber: 1,
				amount: 500.0,
				cutOffDate: "2025-06-15",
				scheduledDate: "2025-06-30",
			};
			req.body = createData;
			(req as any).get = (header: string) => {
				if (header === "Content-Type") {
					return "multipart/form-data";
				}
				return undefined;
			};
			await installmentController.create(req as Request, res, next);
			expect(statusCode).to.equal(201);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle form data (application/x-www-form-urlencoded)", async function () {
			this.timeout(TEST_TIMEOUT);
			const createData = {
				orderId: "507f1f77bcf86cd799439040",
				installmentNumber: 1,
				amount: 300.0,
				cutOffDate: "2025-09-15",
				scheduledDate: "2025-09-30",
			};
			req.body = createData;
			(req as any).get = (header: string) => {
				if (header === "Content-Type") {
					return "application/x-www-form-urlencoded";
				}
				return undefined;
			};
			await installmentController.create(req as Request, res, next);
			expect(statusCode).to.equal(201);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle validation errors", async function () {
			this.timeout(TEST_TIMEOUT);
			const createData = {
				orderId: "not-a-valid-objectid",
			};
			req.body = createData;
			await installmentController.create(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle Prisma errors", async function () {
			this.timeout(TEST_TIMEOUT);
			const createData = {
				orderId: "507f1f77bcf86cd799439040",
				installmentNumber: 1,
				amount: 500.0,
				cutOffDate: "2025-06-15",
				scheduledDate: "2025-06-30",
			};
			req.body = createData;

			prisma.installment.create = async () => {
				const error = new Error("Database connection failed") as any;
				error.name = "PrismaClientKnownRequestError";
				error.code = "P1001";
				throw error;
			};

			await installmentController.create(req as Request, res, next);
			expect(statusCode).to.equal(500);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle internal errors", async function () {
			this.timeout(TEST_TIMEOUT);
			const createData = {
				orderId: "507f1f77bcf86cd799439040",
				installmentNumber: 1,
				amount: 500.0,
				cutOffDate: "2025-06-15",
				scheduledDate: "2025-06-30",
			};
			req.body = createData;

			prisma.installment.create = async () => {
				throw new Error("Internal server error");
			};

			await installmentController.create(req as Request, res, next);
			expect(statusCode).to.equal(500);
			expect(sentData).to.have.property("status", "error");
		});
	});

	describe(".update()", () => {
		it("should update installment details", async function () {
			this.timeout(TEST_TIMEOUT);
			const updateData = {
				amount: 600.0,
				status: "SCHEDULED",
			};
			req.params = { id: mockInstallment.id };
			req.body = updateData;
			await installmentController.update(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
			expect(sentData).to.have.property("data");
			expect(sentData.data).to.have.property("installment");
			expect(sentData.data.installment).to.have.property("id");
		});

		it("should update installment status field", async function () {
			this.timeout(TEST_TIMEOUT);
			const updateData = {
				status: "DEDUCTED",
			};
			req.params = { id: mockInstallment.id };
			req.body = updateData;
			await installmentController.update(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
			expect(sentData).to.have.property("data");
			expect(sentData.data).to.have.property("installment");
			expect(sentData.data.installment).to.have.property("id");
		});

		it("should update multiple installment fields", async function () {
			this.timeout(TEST_TIMEOUT);
			const updateData = {
				amount: 800.0,
				status: "SCHEDULED",
				notes: "Updated installment",
				payrollBatchId: "BATCH-001",
			};
			req.params = { id: mockInstallment.id };
			req.body = updateData;
			await installmentController.update(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
			expect(sentData).to.have.property("data");
			expect(sentData.data).to.have.property("installment");
			expect(sentData.data.installment).to.have.property("id");
		});

		it("should handle form data (multipart/form-data)", async function () {
			this.timeout(TEST_TIMEOUT);
			const updateData = {
				amount: 550.0,
			};
			req.params = { id: mockInstallment.id };
			req.body = updateData;
			(req as any).get = (header: string) => {
				if (header === "Content-Type") {
					return "multipart/form-data";
				}
				return undefined;
			};
			await installmentController.update(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle form data (application/x-www-form-urlencoded)", async function () {
			this.timeout(TEST_TIMEOUT);
			const updateData = {
				status: "CANCELLED",
			};
			req.params = { id: mockInstallment.id };
			req.body = updateData;
			(req as any).get = (header: string) => {
				if (header === "Content-Type") {
					return "application/x-www-form-urlencoded";
				}
				return undefined;
			};
			await installmentController.update(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle invalid ID format", async function () {
			this.timeout(TEST_TIMEOUT);
			const updateData = {
				status: "SCHEDULED",
			};
			req.params = { id: "invalid-id" };
			req.body = updateData;
			await installmentController.update(req as Request, res, next);
			expect(statusCode).to.equal(404);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle validation errors", async function () {
			this.timeout(TEST_TIMEOUT);
			const updateData = {
				installmentNumber: 0,
			};
			req.params = { id: mockInstallment.id };
			req.body = updateData;
			await installmentController.update(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle non-existent installment update", async function () {
			this.timeout(TEST_TIMEOUT);
			const updateData = {
				status: "SCHEDULED",
			};
			req.params = { id: "507f1f77bcf86cd799439099" };
			req.body = updateData;
			await installmentController.update(req as Request, res, next);
			expect(statusCode).to.equal(404);
			expect(sentData).to.have.property("status", "error");
			expect(sentData).to.have.property("code", 404);
		});

		it("should handle Prisma errors", async function () {
			this.timeout(TEST_TIMEOUT);
			const updateData = {
				amount: 600.0,
			};
			req.params = { id: mockInstallment.id };
			req.body = updateData;

			prisma.installment.update = async () => {
				const error = new Error("Database connection failed") as any;
				error.name = "PrismaClientKnownRequestError";
				error.code = "P1001";
				throw error;
			};

			await installmentController.update(req as Request, res, next);
			expect(statusCode).to.equal(500);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle internal errors", async function () {
			this.timeout(TEST_TIMEOUT);
			const updateData = {
				amount: 600.0,
			};
			req.params = { id: mockInstallment.id };
			req.body = updateData;

			prisma.installment.update = async () => {
				throw new Error("Internal server error");
			};

			await installmentController.update(req as Request, res, next);
			expect(statusCode).to.equal(500);
			expect(sentData).to.have.property("status", "error");
		});
	});

	describe(".remove()", () => {
		it("should delete an installment", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: mockInstallment.id };
			await installmentController.remove(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle invalid ID format", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: "invalid-id" };
			await installmentController.remove(req as Request, res, next);
			expect(statusCode).to.equal(404);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle non-existent installment deletion", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: "507f1f77bcf86cd799439099" };
			await installmentController.remove(req as Request, res, next);
			expect(statusCode).to.equal(404);
			expect(sentData).to.have.property("status", "error");
			expect(sentData).to.have.property("code", 404);
		});

		it("should handle Prisma errors", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: mockInstallment.id };

			prisma.installment.delete = async () => {
				const error = new Error("Database connection failed") as any;
				error.name = "PrismaClientKnownRequestError";
				error.code = "P1001";
				throw error;
			};

			await installmentController.remove(req as Request, res, next);
			expect(statusCode).to.equal(500);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle internal errors", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: mockInstallment.id };

			prisma.installment.delete = async () => {
				throw new Error("Internal server error");
			};

			await installmentController.remove(req as Request, res, next);
			expect(statusCode).to.equal(500);
			expect(sentData).to.have.property("status", "error");
		});
	});

	describe("Edge Cases and Integration", () => {
		it("should handle empty request body", async function () {
			this.timeout(TEST_TIMEOUT);
			req.body = {};
			await installmentController.create(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle null request body", async function () {
			this.timeout(TEST_TIMEOUT);
			req.body = null;
			await installmentController.create(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle undefined request body", async function () {
			this.timeout(TEST_TIMEOUT);
			req.body = undefined;
			await installmentController.create(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle valid installment with all fields", async function () {
			this.timeout(TEST_TIMEOUT);
			const createData = {
				orderId: "507f1f77bcf86cd799439040",
				installmentNumber: 1,
				amount: 1000.0,
				cutOffDate: "2025-10-15",
				scheduledDate: "2025-10-31",
				status: "SCHEDULED",
				notes: "Full installment data",
				principalAmount: 900.0,
				interestAmount: 100.0,
			};
			req.body = createData;
			await installmentController.create(req as Request, res, next);
			expect(statusCode).to.equal(201);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle concurrent requests", async function () {
			this.timeout(TEST_TIMEOUT);
			const createData = {
				orderId: "507f1f77bcf86cd799439040",
				installmentNumber: 1,
				amount: 500.0,
				cutOffDate: "2025-06-15",
				scheduledDate: "2025-06-30",
			};
			req.body = createData;

			const promises = Array(5)
				.fill(null)
				.map(() => installmentController.create(req as Request, res, next));

			const results = await Promise.all(promises);
			expect(results).to.have.length(5);
		});

		it("should handle malformed JSON in filter", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = {
				page: "1",
				limit: "10",
				document: "true",
				count: "true",
				pagination: "true",
				filter: "invalid-json",
			};
			await installmentController.getAll(req as Request, res, next);
			// Filter parser silently ignores malformed entries (no : or = delimiter)
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle very large page numbers", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = {
				page: "999999",
				limit: "10",
				document: "true",
				count: "true",
				pagination: "true",
			};
			await installmentController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle very large limit values", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = {
				page: "1",
				limit: "999999",
				document: "true",
				count: "true",
				pagination: "true",
			};
			await installmentController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle negative page numbers", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = {
				page: "-1",
				limit: "10",
				document: "true",
				count: "true",
				pagination: "true",
			};
			await installmentController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle negative limit values", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = {
				page: "1",
				limit: "-10",
				document: "true",
				count: "true",
				pagination: "true",
			};
			await installmentController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle empty string values", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { page: "", limit: "", sort: "", order: "" };
			await installmentController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle whitespace-only values", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { page: "   ", limit: "   ", sort: "   " };
			await installmentController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle missing required fields in update", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: mockInstallment.id };
			req.body = {};
			await installmentController.update(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle partial updates correctly", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: mockInstallment.id };
			req.body = { notes: "Partially updated" };
			await installmentController.update(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
		});
	});
});

describe("Data Grouping Helper", () => {
	const testData = [
		{ id: 1, name: "Installment 1", type: "email", category: "marketing" },
		{ id: 2, name: "Installment 2", type: "sms", category: "notification" },
		{ id: 3, name: "Installment 3", type: "email", category: "marketing" },
		{ id: 4, name: "Installment 4", type: null, category: "general" },
		{ id: 5, name: "Installment 5", type: "push", category: "notification" },
	];

	describe("groupDataByField()", () => {
		it("should group data by type field", () => {
			const result = groupDataByField(testData, "type");
			expect(result).to.have.property("email");
			expect(result).to.have.property("sms");
			expect(result).to.have.property("push");
			expect(result).to.have.property("unassigned");
			expect(result.email).to.have.length(2);
			expect(result.sms).to.have.length(1);
			expect(result.push).to.have.length(1);
			expect(result.unassigned).to.have.length(1);
		});

		it("should group data by category field", () => {
			const result = groupDataByField(testData, "category");
			expect(result).to.have.property("marketing");
			expect(result).to.have.property("notification");
			expect(result).to.have.property("general");
			expect(result.marketing).to.have.length(2);
			expect(result.notification).to.have.length(2);
			expect(result.general).to.have.length(1);
		});

		it("should handle null values by placing them in unassigned group", () => {
			const result = groupDataByField(testData, "type");
			expect(result.unassigned).to.have.length(1);
			expect(result.unassigned[0]).to.deep.include({ id: 4, type: null });
		});

		it("should handle undefined values by placing them in unassigned group", () => {
			const dataWithUndefined = [
				{ id: 1, name: "Installment 1", type: "email" },
				{ id: 2, name: "Installment 2" },
			];
			const result = groupDataByField(dataWithUndefined, "type");
			expect(result).to.have.property("email");
			expect(result).to.have.property("unassigned");
			expect(result.email).to.have.length(1);
			expect(result.unassigned).to.have.length(1);
		});

		it("should return empty object for empty array", () => {
			const result = groupDataByField([], "type");
			expect(result).to.be.an("object");
			expect(Object.keys(result)).to.have.length(0);
		});

		it("should group by string values correctly", () => {
			const result = groupDataByField(testData, "name");
			expect(result).to.have.property("Installment 1");
			expect(result).to.have.property("Installment 2");
			expect(result).to.have.property("Installment 3");
			expect(result).to.have.property("Installment 4");
			expect(result).to.have.property("Installment 5");
			expect(result["Installment 1"]).to.have.length(1);
		});
	});
});
