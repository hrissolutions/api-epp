import { controller } from "../app/orderItem/orderItem.controller";
import { groupDataByField } from "../helper/dataGrouping";
import { expect } from "chai";
import { Request, Response, NextFunction } from "express";
import { PrismaClient, Prisma } from "../generated/prisma";

const TEST_TIMEOUT = 5000;

describe("OrderItem Controller", () => {
	let orderItemController: any;
	let req: Partial<Request>;
	let res: Response;
	let next: NextFunction;
	let prisma: any;
	let sentData: any;
	let statusCode: number;
	const mockOrderItem = {
		id: "507f1f77bcf86cd799439026",
		orderId: "507f1f77bcf86cd799439040",
		itemId: "507f1f77bcf86cd799439041",
		quantity: 2,
		unitPrice: 50.0,
		subtotal: 100.0,
		discount: 0,
		type: "email",
		createdAt: new Date(),
	};

	const mockOrderItems = [
		{
			id: "507f1f77bcf86cd799439026",
			orderId: "507f1f77bcf86cd799439040",
			itemId: "507f1f77bcf86cd799439041",
			quantity: 2,
			unitPrice: 50.0,
			subtotal: 100.0,
			discount: 0,
			type: "email",
			createdAt: new Date(),
		},
		{
			id: "507f1f77bcf86cd799439027",
			orderId: "507f1f77bcf86cd799439040",
			itemId: "507f1f77bcf86cd799439042",
			quantity: 1,
			unitPrice: 75.0,
			subtotal: 75.0,
			discount: 5,
			type: "sms",
			createdAt: new Date(),
		},
		{
			id: "507f1f77bcf86cd799439028",
			orderId: "507f1f77bcf86cd799439043",
			itemId: "507f1f77bcf86cd799439044",
			quantity: 3,
			unitPrice: 25.0,
			subtotal: 75.0,
			discount: 0,
			type: "email",
			createdAt: new Date(),
		},
		{
			id: "507f1f77bcf86cd799439029",
			orderId: "507f1f77bcf86cd799439045",
			itemId: "507f1f77bcf86cd799439046",
			quantity: 1,
			unitPrice: 200.0,
			subtotal: 200.0,
			discount: 10,
			type: null,
			createdAt: new Date(),
		},
	];

	beforeEach(() => {
		prisma = {
			orderItem: {
				findMany: async (_params: Prisma.OrderItemFindManyArgs) => {
					if (req.query?.groupBy) {
						return mockOrderItems;
					}
					return [mockOrderItem];
				},
				count: async (_params: Prisma.OrderItemCountArgs) => {
					if (req.query?.groupBy) {
						return mockOrderItems.length;
					}
					return 1;
				},
				findFirst: async (params: Prisma.OrderItemFindFirstArgs) =>
					params.where?.id === mockOrderItem.id ? mockOrderItem : null,
				findUnique: async (params: Prisma.OrderItemFindUniqueArgs) =>
					params.where?.id === mockOrderItem.id ? mockOrderItem : null,
				create: async (params: Prisma.OrderItemCreateArgs) => ({
					...mockOrderItem,
					...params.data,
				}),
				update: async (params: Prisma.OrderItemUpdateArgs) => ({
					...mockOrderItem,
					...params.data,
				}),
				delete: async (params: Prisma.OrderItemDeleteArgs) => ({
					...mockOrderItem,
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

		orderItemController = controller(prisma as PrismaClient);
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
			originalUrl: "/api/orderItem",
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
		it("should return paginated orderItems", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = {
				page: "1",
				limit: "10",
				document: "true",
				count: "true",
				pagination: "true",
			};
			await orderItemController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
			expect(sentData).to.have.property("data");
		});

		it("should group orderItems by type field", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { groupBy: "type", document: "true", count: "true", pagination: "true" };
			await orderItemController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
			expect(sentData.data).to.have.property("orderItems");
			expect(sentData.data).to.have.property("groupedBy", "type");
			expect(sentData.data.orderItems).to.have.property("email");
			expect(sentData.data.orderItems).to.have.property("sms");
			expect(sentData.data.orderItems).to.have.property("unassigned");
		});

		it("should group orderItems by orderId field", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { groupBy: "orderId", document: "true", count: "true", pagination: "true" };
			await orderItemController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
			expect(sentData.data).to.have.property("orderItems");
			expect(sentData.data).to.have.property("groupedBy", "orderId");
		});

		it("should handle orderItems with null values in grouping field", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { groupBy: "type", document: "true", count: "true", pagination: "true" };
			await orderItemController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData.data.orderItems).to.have.property("unassigned");
			expect(sentData.data.orderItems.unassigned).to.be.an("array");
			expect(sentData.data.orderItems.unassigned.length).to.be.greaterThan(0);
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
			await orderItemController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
			expect(sentData.data).to.have.property("orderItems");
			expect(sentData.data.orderItems).to.be.an("array");
			expect(sentData.data).to.not.have.property("groupedBy");
		});

		it("should handle empty groupBy parameter", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { groupBy: "", document: "true", count: "true", pagination: "true" };
			await orderItemController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should combine grouping with other query parameters", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = {
				groupBy: "type",
				page: "1",
				limit: "10",
				sort: "quantity",
				document: "true",
				count: "true",
				pagination: "true",
			};
			await orderItemController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
			expect(sentData.data).to.have.property("orderItems");
			expect(sentData.data).to.have.property("groupedBy", "type");
		});

		it("should handle query validation failure", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { page: "invalid", document: "true", count: "true", pagination: "true" };
			await orderItemController.getAll(req as Request, res, next);
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

			prisma.orderItem.findMany = async () => {
				const error = new Error("Database connection failed") as any;
				error.name = "PrismaClientKnownRequestError";
				error.code = "P1001";
				throw error;
			};

			await orderItemController.getAll(req as Request, res, next);
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

			prisma.orderItem.findMany = async () => {
				throw new Error("Internal server error");
			};

			await orderItemController.getAll(req as Request, res, next);
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
				filter: "orderId:507f1f77bcf86cd799439040",
			};
			await orderItemController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle pagination parameters", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = {
				page: "2",
				limit: "5",
				sort: "quantity",
				order: "asc",
				document: "true",
				count: "true",
				pagination: "true",
			};
			await orderItemController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle field selection", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = {
				fields: "orderId,quantity",
				document: "true",
				count: "true",
				pagination: "true",
			};
			await orderItemController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle documents parameter", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { document: "true", count: "true", pagination: "true" };
			await orderItemController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle count parameter", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { document: "true", count: "true", pagination: "true" };
			await orderItemController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle pagination parameter", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { document: "true", count: "true", pagination: "true" };
			await orderItemController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
		});
	});

	describe(".getById()", () => {
		it("should return a orderItem", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: mockOrderItem.id };
			await orderItemController.getById(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
			expect(sentData).to.have.property("data");
			expect(sentData.data).to.deep.include({ id: mockOrderItem.id });
		});

		it("should handle invalid ID format", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: "invalid-id" };
			await orderItemController.getById(req as Request, res, next);
			// No ObjectId validation - findFirst returns null → 404
			expect(statusCode).to.equal(404);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle non-existent orderItem", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: "507f1f77bcf86cd799439099" };
			await orderItemController.getById(req as Request, res, next);
			expect(statusCode).to.equal(404);
			expect(sentData).to.have.property("status", "error");
			expect(sentData).to.have.property("code", 404);
		});

		it("should handle Prisma errors", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: mockOrderItem.id };

			prisma.orderItem.findFirst = async () => {
				const error = new Error("Database connection failed") as any;
				error.name = "PrismaClientKnownRequestError";
				error.code = "P1001";
				throw error;
			};

			await orderItemController.getById(req as Request, res, next);
			expect(statusCode).to.equal(500);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle internal errors", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: mockOrderItem.id };

			prisma.orderItem.findFirst = async () => {
				throw new Error("Internal server error");
			};

			await orderItemController.getById(req as Request, res, next);
			expect(statusCode).to.equal(500);
			expect(sentData).to.have.property("status", "error");
		});
	});

	describe(".create()", () => {
		it("should create a new orderItem", async function () {
			this.timeout(TEST_TIMEOUT);
			const createData = {
				orderId: "507f1f77bcf86cd799439040",
				itemId: "507f1f77bcf86cd799439041",
				quantity: 3,
				unitPrice: 45.0,
				subtotal: 135.0,
			};
			req.body = createData;
			await orderItemController.create(req as Request, res, next);
			expect(statusCode).to.equal(201);
			expect(sentData).to.have.property("status", "success");
			expect(sentData).to.have.property("data");
			expect(sentData.data).to.have.property("id");
		});

		it("should create a new orderItem with discount", async function () {
			this.timeout(TEST_TIMEOUT);
			const createData = {
				orderId: "507f1f77bcf86cd799439040",
				itemId: "507f1f77bcf86cd799439041",
				quantity: 2,
				unitPrice: 50.0,
				subtotal: 90.0,
				discount: 10.0,
			};
			req.body = createData;
			await orderItemController.create(req as Request, res, next);
			expect(statusCode).to.equal(201);
			expect(sentData).to.have.property("status", "success");
			expect(sentData).to.have.property("data");
			expect(sentData.data).to.have.property("id");
		});

		it("should create a new orderItem without optional fields", async function () {
			this.timeout(TEST_TIMEOUT);
			const createData = {
				orderId: "507f1f77bcf86cd799439040",
				itemId: "507f1f77bcf86cd799439041",
				quantity: 1,
				unitPrice: 100.0,
				subtotal: 100.0,
			};
			req.body = createData;
			await orderItemController.create(req as Request, res, next);
			expect(statusCode).to.equal(201);
			expect(sentData).to.have.property("status", "success");
			expect(sentData).to.have.property("data");
			expect(sentData.data).to.have.property("id");
		});

		it("should handle form data (multipart/form-data)", async function () {
			this.timeout(TEST_TIMEOUT);
			const createData = {
				orderId: "507f1f77bcf86cd799439040",
				itemId: "507f1f77bcf86cd799439041",
				quantity: 1,
				unitPrice: 75.0,
				subtotal: 75.0,
			};
			req.body = createData;
			(req as any).get = (header: string) => {
				if (header === "Content-Type") {
					return "multipart/form-data";
				}
				return undefined;
			};
			await orderItemController.create(req as Request, res, next);
			expect(statusCode).to.equal(201);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle form data (application/x-www-form-urlencoded)", async function () {
			this.timeout(TEST_TIMEOUT);
			const createData = {
				orderId: "507f1f77bcf86cd799439040",
				itemId: "507f1f77bcf86cd799439041",
				quantity: 1,
				unitPrice: 60.0,
				subtotal: 60.0,
			};
			req.body = createData;
			(req as any).get = (header: string) => {
				if (header === "Content-Type") {
					return "application/x-www-form-urlencoded";
				}
				return undefined;
			};
			await orderItemController.create(req as Request, res, next);
			expect(statusCode).to.equal(201);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle validation errors", async function () {
			this.timeout(TEST_TIMEOUT);
			// Missing required fields
			const createData = {
				orderId: "not-a-valid-objectid",
			};
			req.body = createData;
			await orderItemController.create(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle Prisma errors", async function () {
			this.timeout(TEST_TIMEOUT);
			const createData = {
				orderId: "507f1f77bcf86cd799439040",
				itemId: "507f1f77bcf86cd799439041",
				quantity: 1,
				unitPrice: 50.0,
				subtotal: 50.0,
			};
			req.body = createData;

			prisma.orderItem.create = async () => {
				const error = new Error("Database connection failed") as any;
				error.name = "PrismaClientKnownRequestError";
				error.code = "P1001";
				throw error;
			};

			await orderItemController.create(req as Request, res, next);
			expect(statusCode).to.equal(500);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle internal errors", async function () {
			this.timeout(TEST_TIMEOUT);
			const createData = {
				orderId: "507f1f77bcf86cd799439040",
				itemId: "507f1f77bcf86cd799439041",
				quantity: 1,
				unitPrice: 50.0,
				subtotal: 50.0,
			};
			req.body = createData;

			prisma.orderItem.create = async () => {
				throw new Error("Internal server error");
			};

			await orderItemController.create(req as Request, res, next);
			expect(statusCode).to.equal(500);
			expect(sentData).to.have.property("status", "error");
		});
	});

	describe(".update()", () => {
		it("should update orderItem details", async function () {
			this.timeout(TEST_TIMEOUT);
			const updateData = {
				quantity: 5,
				unitPrice: 40.0,
				subtotal: 200.0,
			};
			req.params = { id: mockOrderItem.id };
			req.body = updateData;
			await orderItemController.update(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
			expect(sentData).to.have.property("data");
			expect(sentData.data).to.have.property("orderItem");
			expect(sentData.data.orderItem).to.have.property("id");
		});

		it("should update orderItem quantity field", async function () {
			this.timeout(TEST_TIMEOUT);
			const updateData = {
				quantity: 10,
			};
			req.params = { id: mockOrderItem.id };
			req.body = updateData;
			await orderItemController.update(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
			expect(sentData).to.have.property("data");
			expect(sentData.data).to.have.property("orderItem");
			expect(sentData.data.orderItem).to.have.property("id");
		});

		it("should update multiple orderItem fields", async function () {
			this.timeout(TEST_TIMEOUT);
			const updateData = {
				quantity: 3,
				unitPrice: 30.0,
				subtotal: 90.0,
				discount: 5.0,
			};
			req.params = { id: mockOrderItem.id };
			req.body = updateData;
			await orderItemController.update(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
			expect(sentData).to.have.property("data");
			expect(sentData.data).to.have.property("orderItem");
			expect(sentData.data.orderItem).to.have.property("id");
		});

		it("should handle form data (multipart/form-data)", async function () {
			this.timeout(TEST_TIMEOUT);
			const updateData = {
				quantity: 4,
				unitPrice: 35.0,
				subtotal: 140.0,
			};
			req.params = { id: mockOrderItem.id };
			req.body = updateData;
			(req as any).get = (header: string) => {
				if (header === "Content-Type") {
					return "multipart/form-data";
				}
				return undefined;
			};
			await orderItemController.update(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle form data (application/x-www-form-urlencoded)", async function () {
			this.timeout(TEST_TIMEOUT);
			const updateData = {
				quantity: 2,
				subtotal: 100.0,
			};
			req.params = { id: mockOrderItem.id };
			req.body = updateData;
			(req as any).get = (header: string) => {
				if (header === "Content-Type") {
					return "application/x-www-form-urlencoded";
				}
				return undefined;
			};
			await orderItemController.update(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle invalid ID format", async function () {
			this.timeout(TEST_TIMEOUT);
			const updateData = {
				quantity: 5,
			};
			req.params = { id: "invalid-id" };
			req.body = updateData;
			await orderItemController.update(req as Request, res, next);
			// No ObjectId validation - findFirst returns null → 404
			expect(statusCode).to.equal(404);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle validation errors", async function () {
			this.timeout(TEST_TIMEOUT);
			const updateData = {
				quantity: -1,
			};
			req.params = { id: mockOrderItem.id };
			req.body = updateData;
			await orderItemController.update(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle non-existent orderItem update", async function () {
			this.timeout(TEST_TIMEOUT);
			const updateData = {
				quantity: 5,
			};
			req.params = { id: "507f1f77bcf86cd799439099" };
			req.body = updateData;
			await orderItemController.update(req as Request, res, next);
			expect(statusCode).to.equal(404);
			expect(sentData).to.have.property("status", "error");
			expect(sentData).to.have.property("code", 404);
		});

		it("should handle Prisma errors", async function () {
			this.timeout(TEST_TIMEOUT);
			const updateData = {
				quantity: 5,
				unitPrice: 40.0,
				subtotal: 200.0,
			};
			req.params = { id: mockOrderItem.id };
			req.body = updateData;

			prisma.orderItem.update = async () => {
				const error = new Error("Database connection failed") as any;
				error.name = "PrismaClientKnownRequestError";
				error.code = "P1001";
				throw error;
			};

			await orderItemController.update(req as Request, res, next);
			expect(statusCode).to.equal(500);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle internal errors", async function () {
			this.timeout(TEST_TIMEOUT);
			const updateData = {
				quantity: 5,
				unitPrice: 40.0,
				subtotal: 200.0,
			};
			req.params = { id: mockOrderItem.id };
			req.body = updateData;

			prisma.orderItem.update = async () => {
				throw new Error("Internal server error");
			};

			await orderItemController.update(req as Request, res, next);
			expect(statusCode).to.equal(500);
			expect(sentData).to.have.property("status", "error");
		});
	});

	describe(".remove()", () => {
		it("should delete a orderItem", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: mockOrderItem.id };
			await orderItemController.remove(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle invalid ID format", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: "invalid-id" };
			await orderItemController.remove(req as Request, res, next);
			// No ObjectId validation - findFirst returns null → 404
			expect(statusCode).to.equal(404);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle non-existent orderItem deletion", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: "507f1f77bcf86cd799439099" };
			await orderItemController.remove(req as Request, res, next);
			expect(statusCode).to.equal(404);
			expect(sentData).to.have.property("status", "error");
			expect(sentData).to.have.property("code", 404);
		});

		it("should handle Prisma errors", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: mockOrderItem.id };

			prisma.orderItem.delete = async () => {
				const error = new Error("Database connection failed") as any;
				error.name = "PrismaClientKnownRequestError";
				error.code = "P1001";
				throw error;
			};

			await orderItemController.remove(req as Request, res, next);
			expect(statusCode).to.equal(500);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle internal errors", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: mockOrderItem.id };

			prisma.orderItem.delete = async () => {
				throw new Error("Internal server error");
			};

			await orderItemController.remove(req as Request, res, next);
			expect(statusCode).to.equal(500);
			expect(sentData).to.have.property("status", "error");
		});
	});

	describe("Edge Cases and Integration", () => {
		it("should handle empty request body", async function () {
			this.timeout(TEST_TIMEOUT);
			req.body = {};
			await orderItemController.create(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle null request body", async function () {
			this.timeout(TEST_TIMEOUT);
			req.body = null;
			await orderItemController.create(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle undefined request body", async function () {
			this.timeout(TEST_TIMEOUT);
			req.body = undefined;
			await orderItemController.create(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle large quantity values", async function () {
			this.timeout(TEST_TIMEOUT);
			const createData = {
				orderId: "507f1f77bcf86cd799439040",
				itemId: "507f1f77bcf86cd799439041",
				quantity: 9999,
				unitPrice: 1.0,
				subtotal: 9999.0,
			};
			req.body = createData;
			await orderItemController.create(req as Request, res, next);
			expect(statusCode).to.equal(201);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle valid orderItem with all fields", async function () {
			this.timeout(TEST_TIMEOUT);
			const createData = {
				orderId: "507f1f77bcf86cd799439040",
				itemId: "507f1f77bcf86cd799439041",
				quantity: 5,
				unitPrice: 25.5,
				subtotal: 127.5,
				discount: 10.0,
			};
			req.body = createData;
			await orderItemController.create(req as Request, res, next);
			expect(statusCode).to.equal(201);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle concurrent requests", async function () {
			this.timeout(TEST_TIMEOUT);
			const createData = {
				orderId: "507f1f77bcf86cd799439040",
				itemId: "507f1f77bcf86cd799439041",
				quantity: 1,
				unitPrice: 50.0,
				subtotal: 50.0,
			};
			req.body = createData;

			const promises = Array(5)
				.fill(null)
				.map(() => orderItemController.create(req as Request, res, next));

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
			await orderItemController.getAll(req as Request, res, next);
			// Filter parser silently ignores malformed entries
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
			await orderItemController.getAll(req as Request, res, next);
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
			await orderItemController.getAll(req as Request, res, next);
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
			await orderItemController.getAll(req as Request, res, next);
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
			await orderItemController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle empty string values", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { page: "", limit: "", sort: "", order: "" };
			await orderItemController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle whitespace-only values", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { page: "   ", limit: "   ", sort: "   " };
			await orderItemController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle missing required fields in update", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: mockOrderItem.id };
			req.body = {};
			await orderItemController.update(req as Request, res, next);
			// Empty body → "No update fields provided" → 400
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle partial updates correctly", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: mockOrderItem.id };
			req.body = { quantity: 7 };
			await orderItemController.update(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
		});
	});
});

describe("Data Grouping Helper", () => {
	const testData = [
		{ id: 1, name: "OrderItem 1", type: "email", category: "marketing" },
		{ id: 2, name: "OrderItem 2", type: "sms", category: "notification" },
		{ id: 3, name: "OrderItem 3", type: "email", category: "marketing" },
		{ id: 4, name: "OrderItem 4", type: null, category: "general" },
		{ id: 5, name: "OrderItem 5", type: "push", category: "notification" },
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
				{ id: 1, name: "OrderItem 1", type: "email" },
				{ id: 2, name: "OrderItem 2" },
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
			expect(result).to.have.property("OrderItem 1");
			expect(result).to.have.property("OrderItem 2");
			expect(result).to.have.property("OrderItem 3");
			expect(result).to.have.property("OrderItem 4");
			expect(result).to.have.property("OrderItem 5");
			expect(result["OrderItem 1"]).to.have.length(1);
		});
	});
});
