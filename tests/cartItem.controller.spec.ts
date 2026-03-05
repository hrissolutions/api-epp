import { controller } from "../app/cartItem/cartItem.controller";
import { groupDataByField } from "../helper/dataGrouping";
import { expect } from "chai";
import { Request, Response, NextFunction } from "express";
import { PrismaClient, Prisma } from "../generated/prisma";

const TEST_TIMEOUT = 5000;

describe("CartItem Controller", () => {
	let cartItemController: any;
	let req: Partial<Request>;
	let res: Response;
	let next: NextFunction;
	let prisma: any;
	let sentData: any;
	let statusCode: number;

	const mockCartItem = {
		id: "507f1f77bcf86cd799439026",
		userId: "507f1f77bcf86cd799439001",
		itemId: "507f1f77bcf86cd799439002",
		quantity: 1,
		installmentCount: null,
		rate: null,
		organizationId: null,
		createdAt: new Date(),
		updatedAt: new Date(),
	};

	const mockItem = {
		id: "507f1f77bcf86cd799439002",
		name: "Test Item",
		status: "APPROVED",
		isAvailable: true,
		isActive: true,
		stockQuantity: 100,
	};

	const mockCartItems = [
		{
			id: "507f1f77bcf86cd799439026",
			userId: "507f1f77bcf86cd799439001",
			itemId: "507f1f77bcf86cd799439002",
			quantity: 1,
			createdAt: new Date(),
			updatedAt: new Date(),
		},
		{
			id: "507f1f77bcf86cd799439027",
			userId: "507f1f77bcf86cd799439003",
			itemId: "507f1f77bcf86cd799439004",
			quantity: 2,
			createdAt: new Date(),
			updatedAt: new Date(),
		},
		{
			id: "507f1f77bcf86cd799439028",
			userId: "507f1f77bcf86cd799439005",
			itemId: "507f1f77bcf86cd799439002",
			quantity: 3,
			createdAt: new Date(),
			updatedAt: new Date(),
		},
		{
			id: "507f1f77bcf86cd799439029",
			userId: "507f1f77bcf86cd799439006",
			itemId: null as any,
			quantity: 1,
			createdAt: new Date(),
			updatedAt: new Date(),
		},
	];

	beforeEach(() => {
		prisma = {
			cartItem: {
				findMany: async (_params: Prisma.CartItemFindManyArgs) => {
					if (req.query?.groupBy) {
						return mockCartItems;
					}
					return [mockCartItem];
				},
				count: async (_params: Prisma.CartItemCountArgs) => {
					if (req.query?.groupBy) {
						return mockCartItems.length;
					}
					return 1;
				},
				findFirst: async (params: Prisma.CartItemFindFirstArgs) =>
					params.where?.id === mockCartItem.id ? mockCartItem : null,
				findUnique: async (params: Prisma.CartItemFindUniqueArgs) =>
					params.where?.id === mockCartItem.id ? mockCartItem : null,
				create: async (params: Prisma.CartItemCreateArgs) => ({
					...mockCartItem,
					...params.data,
					id: "507f1f77bcf86cd799439030",
				}),
				update: async (params: Prisma.CartItemUpdateArgs) => ({
					...mockCartItem,
					...params.data,
				}),
				delete: async (params: Prisma.CartItemDeleteArgs) => ({
					...mockCartItem,
					id: params.where.id,
				}),
			},
			item: {
				findUnique: async (params: any) =>
					params.where?.id === mockItem.id ? mockItem : null,
			},
			$transaction: async (operations: any) => {
				if (typeof operations === "function") {
					return operations(prisma);
				}
				return await Promise.all(operations);
			},
		};

		cartItemController = controller(prisma as PrismaClient);
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
			originalUrl: "/api/cartItem",
		} as any;
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
		it("should return paginated cartItems", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = {
				page: "1",
				limit: "10",
				document: "true",
				count: "true",
				pagination: "true",
			};
			await cartItemController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
			expect(sentData).to.have.property("data");
		});

		it("should group cartItems by itemId field", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { groupBy: "itemId", document: "true", count: "true", pagination: "true" };
			await cartItemController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
			expect(sentData.data).to.have.property("cartItems");
			expect(sentData.data).to.have.property("groupedBy", "itemId");
		});

		it("should group cartItems by userId field", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { groupBy: "userId", document: "true", count: "true", pagination: "true" };
			await cartItemController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
			expect(sentData.data).to.have.property("cartItems");
			expect(sentData.data).to.have.property("groupedBy", "userId");
		});

		it("should handle cartItems with null values in grouping field", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { groupBy: "itemId", document: "true", count: "true", pagination: "true" };
			await cartItemController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData.data.cartItems).to.have.property("unassigned");
			expect(sentData.data.cartItems.unassigned).to.be.an("array");
			expect(sentData.data.cartItems.unassigned.length).to.be.greaterThan(0);
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
			await cartItemController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
			expect(sentData.data).to.have.property("cartItems");
			expect(sentData.data.cartItems).to.be.an("array");
		});

		it("should handle empty groupBy parameter", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { groupBy: "", document: "true", count: "true", pagination: "true" };
			await cartItemController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should combine grouping with other query parameters", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = {
				groupBy: "itemId",
				page: "1",
				limit: "10",
				sort: "quantity",
				document: "true",
				count: "true",
				pagination: "true",
			};
			await cartItemController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
			expect(sentData.data).to.have.property("cartItems");
			expect(sentData.data).to.have.property("groupedBy", "itemId");
		});

		it("should handle query validation failure", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { page: "invalid", document: "true", count: "true", pagination: "true" };
			await cartItemController.getAll(req as Request, res, next);
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
			prisma.cartItem.findMany = async () => {
				throw new Error("Database connection failed");
			};
			await cartItemController.getAll(req as Request, res, next);
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
			prisma.cartItem.findMany = async () => {
				throw new Error("Internal server error");
			};
			await cartItemController.getAll(req as Request, res, next);
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
				query: "507f1f77bcf86cd799439001",
				filter: "userId:507f1f77bcf86cd799439001",
			};
			await cartItemController.getAll(req as Request, res, next);
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
			await cartItemController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle field selection", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = {
				fields: "userId,itemId",
				document: "true",
				count: "true",
				pagination: "true",
			};
			await cartItemController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle documents parameter", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { document: "true", count: "true", pagination: "true" };
			await cartItemController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle count parameter", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { document: "true", count: "true", pagination: "true" };
			await cartItemController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle pagination parameter", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { document: "true", count: "true", pagination: "true" };
			await cartItemController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
		});
	});

	describe(".getById()", () => {
		it("should return a cartItem", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: mockCartItem.id };
			await cartItemController.getById(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
			expect(sentData).to.have.property("data");
			expect(sentData.data).to.deep.include({ id: mockCartItem.id });
		});

		it("should handle invalid ID format", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: "invalid-id" };
			await cartItemController.getById(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle non-existent cartItem", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: "507f1f77bcf86cd799439099" };
			await cartItemController.getById(req as Request, res, next);
			expect(statusCode).to.equal(404);
			expect(sentData).to.have.property("status", "error");
			expect(sentData).to.have.property("code", 404);
		});

		it("should handle Prisma errors", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: mockCartItem.id };
			prisma.cartItem.findFirst = async () => {
				throw new Error("Database connection failed");
			};
			await cartItemController.getById(req as Request, res, next);
			expect(statusCode).to.equal(500);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle internal errors", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: mockCartItem.id };
			prisma.cartItem.findFirst = async () => {
				throw new Error("Internal server error");
			};
			await cartItemController.getById(req as Request, res, next);
			expect(statusCode).to.equal(500);
			expect(sentData).to.have.property("status", "error");
		});
	});

	describe(".create()", () => {
		it("should create a new cartItem", async function () {
			this.timeout(TEST_TIMEOUT);
			req.body = {
				userId: "507f1f77bcf86cd799439001",
				itemId: "507f1f77bcf86cd799439002",
				quantity: 1,
			};
			await cartItemController.create(req as Request, res, next);
			expect(statusCode).to.equal(201);
			expect(sentData).to.have.property("status", "success");
			expect(sentData).to.have.property("data");
		});

		it("should create a new cartItem with installmentCount", async function () {
			this.timeout(TEST_TIMEOUT);
			req.body = {
				userId: "507f1f77bcf86cd799439001",
				itemId: "507f1f77bcf86cd799439002",
				quantity: 2,
				installmentCount: 6,
			};
			await cartItemController.create(req as Request, res, next);
			expect(statusCode).to.equal(201);
			expect(sentData).to.have.property("status", "success");
		});

		it("should create a new cartItem with default quantity", async function () {
			this.timeout(TEST_TIMEOUT);
			req.body = { userId: "507f1f77bcf86cd799439001", itemId: "507f1f77bcf86cd799439002" };
			await cartItemController.create(req as Request, res, next);
			expect(statusCode).to.equal(201);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle form data (multipart/form-data)", async function () {
			this.timeout(TEST_TIMEOUT);
			req.body = {
				userId: "507f1f77bcf86cd799439001",
				itemId: "507f1f77bcf86cd799439002",
				quantity: "1",
			};
			(req as any).get = (header: string) =>
				header === "Content-Type" ? "multipart/form-data" : undefined;
			await cartItemController.create(req as Request, res, next);
			expect(statusCode).to.equal(201);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle form data (application/x-www-form-urlencoded)", async function () {
			this.timeout(TEST_TIMEOUT);
			req.body = {
				userId: "507f1f77bcf86cd799439001",
				itemId: "507f1f77bcf86cd799439002",
				quantity: "1",
			};
			(req as any).get = (header: string) =>
				header === "Content-Type" ? "application/x-www-form-urlencoded" : undefined;
			await cartItemController.create(req as Request, res, next);
			expect(statusCode).to.equal(201);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle validation errors (missing required fields)", async function () {
			this.timeout(TEST_TIMEOUT);
			req.body = { quantity: 1 };
			await cartItemController.create(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle Prisma errors", async function () {
			this.timeout(TEST_TIMEOUT);
			req.body = {
				userId: "507f1f77bcf86cd799439001",
				itemId: "507f1f77bcf86cd799439002",
				quantity: 1,
			};
			prisma.cartItem.create = async () => {
				throw new Error("Database connection failed");
			};
			await cartItemController.create(req as Request, res, next);
			expect(statusCode).to.equal(500);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle internal errors", async function () {
			this.timeout(TEST_TIMEOUT);
			req.body = {
				userId: "507f1f77bcf86cd799439001",
				itemId: "507f1f77bcf86cd799439002",
				quantity: 1,
			};
			prisma.cartItem.create = async () => {
				throw new Error("Internal server error");
			};
			await cartItemController.create(req as Request, res, next);
			expect(statusCode).to.equal(500);
			expect(sentData).to.have.property("status", "error");
		});
	});

	describe(".update()", () => {
		it("should update cartItem details", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: mockCartItem.id };
			req.body = { quantity: 5 };
			await cartItemController.update(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
			expect(sentData).to.have.property("data");
			expect(sentData.data).to.have.property("cartItem");
		});

		it("should update cartItem installmentCount field", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: mockCartItem.id };
			req.body = { installmentCount: 12 };
			await cartItemController.update(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
			expect(sentData.data).to.have.property("cartItem");
		});

		it("should update multiple cartItem fields", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: mockCartItem.id };
			req.body = { quantity: 3, installmentCount: 6, rate: 2.5 };
			await cartItemController.update(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
			expect(sentData.data).to.have.property("cartItem");
		});

		it("should handle form data (multipart/form-data)", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: mockCartItem.id };
			req.body = { quantity: "3" };
			(req as any).get = (header: string) =>
				header === "Content-Type" ? "multipart/form-data" : undefined;
			await cartItemController.update(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle form data (application/x-www-form-urlencoded)", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: mockCartItem.id };
			req.body = { quantity: "5" };
			(req as any).get = (header: string) =>
				header === "Content-Type" ? "application/x-www-form-urlencoded" : undefined;
			await cartItemController.update(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle invalid ID format", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: "invalid-id" };
			req.body = { quantity: 5 };
			await cartItemController.update(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle validation errors", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: mockCartItem.id };
			req.body = { quantity: -5 };
			await cartItemController.update(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle non-existent cartItem update", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: "507f1f77bcf86cd799439099" };
			req.body = { quantity: 5 };
			await cartItemController.update(req as Request, res, next);
			expect(statusCode).to.equal(404);
			expect(sentData).to.have.property("status", "error");
			expect(sentData).to.have.property("code", 404);
		});

		it("should handle Prisma errors", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: mockCartItem.id };
			req.body = { quantity: 5 };
			prisma.cartItem.update = async () => {
				throw new Error("Database connection failed");
			};
			await cartItemController.update(req as Request, res, next);
			expect(statusCode).to.equal(500);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle internal errors", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: mockCartItem.id };
			req.body = { quantity: 5 };
			prisma.cartItem.update = async () => {
				throw new Error("Internal server error");
			};
			await cartItemController.update(req as Request, res, next);
			expect(statusCode).to.equal(500);
			expect(sentData).to.have.property("status", "error");
		});
	});

	describe(".remove()", () => {
		it("should delete a cartItem", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: mockCartItem.id };
			await cartItemController.remove(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle invalid ID format", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: "invalid-id" };
			await cartItemController.remove(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle non-existent cartItem deletion", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: "507f1f77bcf86cd799439099" };
			await cartItemController.remove(req as Request, res, next);
			expect(statusCode).to.equal(404);
			expect(sentData).to.have.property("status", "error");
			expect(sentData).to.have.property("code", 404);
		});

		it("should handle Prisma errors", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: mockCartItem.id };
			prisma.cartItem.delete = async () => {
				throw new Error("Database connection failed");
			};
			await cartItemController.remove(req as Request, res, next);
			expect(statusCode).to.equal(500);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle internal errors", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: mockCartItem.id };
			prisma.cartItem.delete = async () => {
				throw new Error("Internal server error");
			};
			await cartItemController.remove(req as Request, res, next);
			expect(statusCode).to.equal(500);
			expect(sentData).to.have.property("status", "error");
		});
	});

	describe("Edge Cases and Integration", () => {
		it("should handle empty request body", async function () {
			this.timeout(TEST_TIMEOUT);
			req.body = {};
			await cartItemController.create(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle null request body", async function () {
			this.timeout(TEST_TIMEOUT);
			req.body = null;
			await cartItemController.create(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle undefined request body", async function () {
			this.timeout(TEST_TIMEOUT);
			req.body = undefined;
			await cartItemController.create(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle valid cartItem with large quantity", async function () {
			this.timeout(TEST_TIMEOUT);
			req.body = {
				userId: "507f1f77bcf86cd799439001",
				itemId: "507f1f77bcf86cd799439002",
				quantity: 50,
			};
			await cartItemController.create(req as Request, res, next);
			expect(statusCode).to.equal(201);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle invalid ObjectId in create data", async function () {
			this.timeout(TEST_TIMEOUT);
			req.body = {
				userId: "not-a-valid-objectid",
				itemId: "507f1f77bcf86cd799439002",
				quantity: 1,
			};
			await cartItemController.create(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle concurrent requests", async function () {
			this.timeout(TEST_TIMEOUT);
			req.body = {
				userId: "507f1f77bcf86cd799439001",
				itemId: "507f1f77bcf86cd799439002",
				quantity: 1,
			};
			const promises = Array(5)
				.fill(null)
				.map(() => cartItemController.create(req as Request, res, next));
			const results = await Promise.all(promises);
			expect(results).to.have.length(5);
		});

		it("should handle filter string in getAll", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = {
				page: "1",
				limit: "10",
				document: "true",
				count: "true",
				pagination: "true",
				filter: "userId:507f1f77bcf86cd799439001",
			};
			await cartItemController.getAll(req as Request, res, next);
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
			await cartItemController.getAll(req as Request, res, next);
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
			await cartItemController.getAll(req as Request, res, next);
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
			await cartItemController.getAll(req as Request, res, next);
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
			await cartItemController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle empty string values", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { page: "", limit: "", sort: "", order: "" };
			await cartItemController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle whitespace-only values", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { page: "   ", limit: "   ", sort: "   " };
			await cartItemController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle empty body update (no update fields)", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: mockCartItem.id };
			req.body = {};
			await cartItemController.update(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle partial updates correctly", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: mockCartItem.id };
			req.body = { quantity: 10 };
			await cartItemController.update(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
		});
	});
});

describe("Data Grouping Helper", () => {
	const testData = [
		{ id: 1, name: "CartItem 1", type: "email", category: "marketing" },
		{ id: 2, name: "CartItem 2", type: "sms", category: "notification" },
		{ id: 3, name: "CartItem 3", type: "email", category: "marketing" },
		{ id: 4, name: "CartItem 4", type: null, category: "general" },
		{ id: 5, name: "CartItem 5", type: "push", category: "notification" },
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
				{ id: 1, name: "CartItem 1", type: "email" },
				{ id: 2, name: "CartItem 2" },
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
			expect(result).to.have.property("CartItem 1");
			expect(result).to.have.property("CartItem 2");
			expect(result).to.have.property("CartItem 3");
			expect(result).to.have.property("CartItem 4");
			expect(result).to.have.property("CartItem 5");
			expect(result["CartItem 1"]).to.have.length(1);
		});
	});
});
