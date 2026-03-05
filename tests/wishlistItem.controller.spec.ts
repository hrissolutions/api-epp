import { controller } from "../app/wishlistItem/wishlistItem.controller";
import { groupDataByField } from "../helper/dataGrouping";
import { expect } from "chai";
import { Request, Response, NextFunction } from "express";
import { PrismaClient, Prisma } from "../generated/prisma";

const TEST_TIMEOUT = 5000;

describe("WishlistItem Controller", () => {
	let wishlistItemController: any;
	let req: Partial<Request>;
	let res: Response;
	let next: NextFunction;
	let prisma: any;
	let sentData: any;
	let statusCode: number;
	const mockWishlistItem = {
		id: "507f1f77bcf86cd799439026",
		employeeId: "507f1f77bcf86cd799439050",
		itemId: "507f1f77bcf86cd799439051",
		type: "email",
		createdAt: new Date(),
	};

	const mockWishlistItems = [
		{
			id: "507f1f77bcf86cd799439026",
			employeeId: "507f1f77bcf86cd799439050",
			itemId: "507f1f77bcf86cd799439051",
			type: "email",
			createdAt: new Date(),
		},
		{
			id: "507f1f77bcf86cd799439027",
			employeeId: "507f1f77bcf86cd799439052",
			itemId: "507f1f77bcf86cd799439053",
			type: "sms",
			createdAt: new Date(),
		},
		{
			id: "507f1f77bcf86cd799439028",
			employeeId: "507f1f77bcf86cd799439054",
			itemId: "507f1f77bcf86cd799439055",
			type: "email",
			createdAt: new Date(),
		},
		{
			id: "507f1f77bcf86cd799439029",
			employeeId: "507f1f77bcf86cd799439056",
			itemId: "507f1f77bcf86cd799439057",
			type: null,
			createdAt: new Date(),
		},
	];

	beforeEach(() => {
		prisma = {
			wishlistItem: {
				findMany: async (_params: Prisma.WishlistItemFindManyArgs) => {
					if (req.query?.groupBy) {
						return mockWishlistItems;
					}
					return [mockWishlistItem];
				},
				count: async (_params: Prisma.WishlistItemCountArgs) => {
					if (req.query?.groupBy) {
						return mockWishlistItems.length;
					}
					return 1;
				},
				findFirst: async (params: Prisma.WishlistItemFindFirstArgs) =>
					params.where?.id === mockWishlistItem.id ? mockWishlistItem : null,
				findUnique: async (params: Prisma.WishlistItemFindUniqueArgs) =>
					params.where?.id === mockWishlistItem.id ? mockWishlistItem : null,
				create: async (params: Prisma.WishlistItemCreateArgs) => ({
					...mockWishlistItem,
					...params.data,
				}),
				update: async (params: Prisma.WishlistItemUpdateArgs) => ({
					...mockWishlistItem,
					...params.data,
				}),
				delete: async (params: Prisma.WishlistItemDeleteArgs) => ({
					...mockWishlistItem,
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

		wishlistItemController = controller(prisma as PrismaClient);
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
			originalUrl: "/api/wishlistItem",
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
		it("should return paginated wishlistItems", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = {
				page: "1",
				limit: "10",
				document: "true",
				count: "true",
				pagination: "true",
			};
			await wishlistItemController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
			expect(sentData).to.have.property("data");
		});

		it("should group wishlistItems by type field", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { groupBy: "type", document: "true", count: "true", pagination: "true" };
			await wishlistItemController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
			expect(sentData.data).to.have.property("wishlistItems");
			expect(sentData.data).to.have.property("groupedBy", "type");
			expect(sentData.data.wishlistItems).to.have.property("email");
			expect(sentData.data.wishlistItems).to.have.property("sms");
			expect(sentData.data.wishlistItems).to.have.property("unassigned");
		});

		it("should group wishlistItems by employeeId field", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = {
				groupBy: "employeeId",
				document: "true",
				count: "true",
				pagination: "true",
			};
			await wishlistItemController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
			expect(sentData.data).to.have.property("wishlistItems");
			expect(sentData.data).to.have.property("groupedBy", "employeeId");
		});

		it("should handle wishlistItems with null values in grouping field", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { groupBy: "type", document: "true", count: "true", pagination: "true" };
			await wishlistItemController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData.data.wishlistItems).to.have.property("unassigned");
			expect(sentData.data.wishlistItems.unassigned).to.be.an("array");
			expect(sentData.data.wishlistItems.unassigned.length).to.be.greaterThan(0);
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
			await wishlistItemController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
			expect(sentData.data).to.have.property("wishlistItems");
			expect(sentData.data.wishlistItems).to.be.an("array");
			expect(sentData.data).to.not.have.property("groupedBy");
		});

		it("should handle empty groupBy parameter", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { groupBy: "", document: "true", count: "true", pagination: "true" };
			await wishlistItemController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should combine grouping with other query parameters", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = {
				groupBy: "type",
				page: "1",
				limit: "10",
				sort: "employeeId",
				document: "true",
				count: "true",
				pagination: "true",
			};
			await wishlistItemController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
			expect(sentData.data).to.have.property("wishlistItems");
			expect(sentData.data).to.have.property("groupedBy", "type");
		});

		it("should handle query validation failure", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { page: "invalid", document: "true", count: "true", pagination: "true" };
			await wishlistItemController.getAll(req as Request, res, next);
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

			prisma.wishlistItem.findMany = async () => {
				const error = new Error("Database connection failed") as any;
				error.name = "PrismaClientKnownRequestError";
				error.code = "P1001";
				throw error;
			};

			await wishlistItemController.getAll(req as Request, res, next);
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

			prisma.wishlistItem.findMany = async () => {
				throw new Error("Internal server error");
			};

			await wishlistItemController.getAll(req as Request, res, next);
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
				filter: "employeeId:507f1f77bcf86cd799439050",
			};
			await wishlistItemController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle pagination parameters", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = {
				page: "2",
				limit: "5",
				sort: "employeeId",
				order: "asc",
				document: "true",
				count: "true",
				pagination: "true",
			};
			await wishlistItemController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle field selection", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = {
				fields: "employeeId,itemId",
				document: "true",
				count: "true",
				pagination: "true",
			};
			await wishlistItemController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle documents parameter", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { document: "true", count: "true", pagination: "true" };
			await wishlistItemController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle count parameter", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { document: "true", count: "true", pagination: "true" };
			await wishlistItemController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle pagination parameter", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { document: "true", count: "true", pagination: "true" };
			await wishlistItemController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
		});
	});

	describe(".getById()", () => {
		it("should return a wishlistItem", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: mockWishlistItem.id };
			await wishlistItemController.getById(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
			expect(sentData).to.have.property("data");
			expect(sentData.data).to.deep.include({ id: mockWishlistItem.id });
		});

		it("should handle invalid ID format", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: "invalid-id" };
			await wishlistItemController.getById(req as Request, res, next);
			// No ObjectId validation - findFirst returns null → 404
			expect(statusCode).to.equal(404);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle non-existent wishlistItem", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: "507f1f77bcf86cd799439099" };
			await wishlistItemController.getById(req as Request, res, next);
			expect(statusCode).to.equal(404);
			expect(sentData).to.have.property("status", "error");
			expect(sentData).to.have.property("code", 404);
		});

		it("should handle Prisma errors", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: mockWishlistItem.id };

			prisma.wishlistItem.findFirst = async () => {
				const error = new Error("Database connection failed") as any;
				error.name = "PrismaClientKnownRequestError";
				error.code = "P1001";
				throw error;
			};

			await wishlistItemController.getById(req as Request, res, next);
			expect(statusCode).to.equal(500);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle internal errors", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: mockWishlistItem.id };

			prisma.wishlistItem.findFirst = async () => {
				throw new Error("Internal server error");
			};

			await wishlistItemController.getById(req as Request, res, next);
			expect(statusCode).to.equal(500);
			expect(sentData).to.have.property("status", "error");
		});
	});

	describe(".create()", () => {
		it("should create a new wishlistItem", async function () {
			this.timeout(TEST_TIMEOUT);
			const createData = {
				employeeId: "507f1f77bcf86cd799439060",
				itemId: "507f1f77bcf86cd799439061",
			};
			req.body = createData;
			await wishlistItemController.create(req as Request, res, next);
			expect(statusCode).to.equal(201);
			expect(sentData).to.have.property("status", "success");
			expect(sentData).to.have.property("data");
			expect(sentData.data).to.have.property("id");
		});

		it("should create a new wishlistItem with different items", async function () {
			this.timeout(TEST_TIMEOUT);
			const createData = {
				employeeId: "507f1f77bcf86cd799439062",
				itemId: "507f1f77bcf86cd799439063",
			};
			req.body = createData;
			await wishlistItemController.create(req as Request, res, next);
			expect(statusCode).to.equal(201);
			expect(sentData).to.have.property("status", "success");
			expect(sentData).to.have.property("data");
			expect(sentData.data).to.have.property("id");
		});

		it("should handle form data (multipart/form-data)", async function () {
			this.timeout(TEST_TIMEOUT);
			const createData = {
				employeeId: "507f1f77bcf86cd799439064",
				itemId: "507f1f77bcf86cd799439065",
			};
			req.body = createData;
			(req as any).get = (header: string) => {
				if (header === "Content-Type") {
					return "multipart/form-data";
				}
				return undefined;
			};
			await wishlistItemController.create(req as Request, res, next);
			expect(statusCode).to.equal(201);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle form data (application/x-www-form-urlencoded)", async function () {
			this.timeout(TEST_TIMEOUT);
			const createData = {
				employeeId: "507f1f77bcf86cd799439066",
				itemId: "507f1f77bcf86cd799439067",
			};
			req.body = createData;
			(req as any).get = (header: string) => {
				if (header === "Content-Type") {
					return "application/x-www-form-urlencoded";
				}
				return undefined;
			};
			await wishlistItemController.create(req as Request, res, next);
			expect(statusCode).to.equal(201);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle validation errors", async function () {
			this.timeout(TEST_TIMEOUT);
			// Invalid ObjectId format for employeeId
			const createData = {
				employeeId: "not-a-valid-objectid",
				itemId: "also-not-valid",
			};
			req.body = createData;
			await wishlistItemController.create(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle missing required fields", async function () {
			this.timeout(TEST_TIMEOUT);
			// Missing itemId
			const createData = {
				employeeId: "507f1f77bcf86cd799439068",
			};
			req.body = createData;
			await wishlistItemController.create(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle Prisma errors", async function () {
			this.timeout(TEST_TIMEOUT);
			const createData = {
				employeeId: "507f1f77bcf86cd799439060",
				itemId: "507f1f77bcf86cd799439061",
			};
			req.body = createData;

			prisma.wishlistItem.create = async () => {
				const error = new Error("Database connection failed") as any;
				error.name = "PrismaClientKnownRequestError";
				error.code = "P1001";
				throw error;
			};

			await wishlistItemController.create(req as Request, res, next);
			expect(statusCode).to.equal(500);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle internal errors", async function () {
			this.timeout(TEST_TIMEOUT);
			const createData = {
				employeeId: "507f1f77bcf86cd799439060",
				itemId: "507f1f77bcf86cd799439061",
			};
			req.body = createData;

			prisma.wishlistItem.create = async () => {
				throw new Error("Internal server error");
			};

			await wishlistItemController.create(req as Request, res, next);
			expect(statusCode).to.equal(500);
			expect(sentData).to.have.property("status", "error");
		});
	});

	describe(".update()", () => {
		it("should update wishlistItem details", async function () {
			this.timeout(TEST_TIMEOUT);
			const updateData = {
				employeeId: "507f1f77bcf86cd799439070",
			};
			req.params = { id: mockWishlistItem.id };
			req.body = updateData;
			await wishlistItemController.update(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
			expect(sentData).to.have.property("data");
			expect(sentData.data).to.have.property("wishlistItem");
			expect(sentData.data.wishlistItem).to.have.property("id");
		});

		it("should update wishlistItem itemId field", async function () {
			this.timeout(TEST_TIMEOUT);
			const updateData = {
				itemId: "507f1f77bcf86cd799439071",
			};
			req.params = { id: mockWishlistItem.id };
			req.body = updateData;
			await wishlistItemController.update(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
			expect(sentData).to.have.property("data");
			expect(sentData.data).to.have.property("wishlistItem");
			expect(sentData.data.wishlistItem).to.have.property("id");
		});

		it("should update multiple wishlistItem fields", async function () {
			this.timeout(TEST_TIMEOUT);
			const updateData = {
				employeeId: "507f1f77bcf86cd799439072",
				itemId: "507f1f77bcf86cd799439073",
			};
			req.params = { id: mockWishlistItem.id };
			req.body = updateData;
			await wishlistItemController.update(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
			expect(sentData).to.have.property("data");
			expect(sentData.data).to.have.property("wishlistItem");
			expect(sentData.data.wishlistItem).to.have.property("id");
		});

		it("should handle form data (multipart/form-data)", async function () {
			this.timeout(TEST_TIMEOUT);
			const updateData = {
				employeeId: "507f1f77bcf86cd799439074",
			};
			req.params = { id: mockWishlistItem.id };
			req.body = updateData;
			(req as any).get = (header: string) => {
				if (header === "Content-Type") {
					return "multipart/form-data";
				}
				return undefined;
			};
			await wishlistItemController.update(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle form data (application/x-www-form-urlencoded)", async function () {
			this.timeout(TEST_TIMEOUT);
			const updateData = {
				itemId: "507f1f77bcf86cd799439075",
			};
			req.params = { id: mockWishlistItem.id };
			req.body = updateData;
			(req as any).get = (header: string) => {
				if (header === "Content-Type") {
					return "application/x-www-form-urlencoded";
				}
				return undefined;
			};
			await wishlistItemController.update(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle invalid ID format", async function () {
			this.timeout(TEST_TIMEOUT);
			const updateData = {
				employeeId: "507f1f77bcf86cd799439076",
			};
			req.params = { id: "invalid-id" };
			req.body = updateData;
			await wishlistItemController.update(req as Request, res, next);
			// No ObjectId validation - findFirst returns null → 404
			expect(statusCode).to.equal(404);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle validation errors", async function () {
			this.timeout(TEST_TIMEOUT);
			const updateData = {
				employeeId: "not-a-valid-objectid",
			};
			req.params = { id: mockWishlistItem.id };
			req.body = updateData;
			await wishlistItemController.update(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle non-existent wishlistItem update", async function () {
			this.timeout(TEST_TIMEOUT);
			const updateData = {
				employeeId: "507f1f77bcf86cd799439077",
			};
			req.params = { id: "507f1f77bcf86cd799439099" };
			req.body = updateData;
			await wishlistItemController.update(req as Request, res, next);
			expect(statusCode).to.equal(404);
			expect(sentData).to.have.property("status", "error");
			expect(sentData).to.have.property("code", 404);
		});

		it("should handle Prisma errors", async function () {
			this.timeout(TEST_TIMEOUT);
			const updateData = {
				employeeId: "507f1f77bcf86cd799439078",
			};
			req.params = { id: mockWishlistItem.id };
			req.body = updateData;

			prisma.wishlistItem.update = async () => {
				const error = new Error("Database connection failed") as any;
				error.name = "PrismaClientKnownRequestError";
				error.code = "P1001";
				throw error;
			};

			await wishlistItemController.update(req as Request, res, next);
			expect(statusCode).to.equal(500);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle internal errors", async function () {
			this.timeout(TEST_TIMEOUT);
			const updateData = {
				employeeId: "507f1f77bcf86cd799439079",
			};
			req.params = { id: mockWishlistItem.id };
			req.body = updateData;

			prisma.wishlistItem.update = async () => {
				throw new Error("Internal server error");
			};

			await wishlistItemController.update(req as Request, res, next);
			expect(statusCode).to.equal(500);
			expect(sentData).to.have.property("status", "error");
		});
	});

	describe(".remove()", () => {
		it("should delete a wishlistItem", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: mockWishlistItem.id };
			await wishlistItemController.remove(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle invalid ID format", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: "invalid-id" };
			await wishlistItemController.remove(req as Request, res, next);
			// No ObjectId validation - findFirst returns null → 404
			expect(statusCode).to.equal(404);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle non-existent wishlistItem deletion", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: "507f1f77bcf86cd799439099" };
			await wishlistItemController.remove(req as Request, res, next);
			expect(statusCode).to.equal(404);
			expect(sentData).to.have.property("status", "error");
			expect(sentData).to.have.property("code", 404);
		});

		it("should handle Prisma errors", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: mockWishlistItem.id };

			prisma.wishlistItem.delete = async () => {
				const error = new Error("Database connection failed") as any;
				error.name = "PrismaClientKnownRequestError";
				error.code = "P1001";
				throw error;
			};

			await wishlistItemController.remove(req as Request, res, next);
			expect(statusCode).to.equal(500);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle internal errors", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: mockWishlistItem.id };

			prisma.wishlistItem.delete = async () => {
				throw new Error("Internal server error");
			};

			await wishlistItemController.remove(req as Request, res, next);
			expect(statusCode).to.equal(500);
			expect(sentData).to.have.property("status", "error");
		});
	});

	describe("Edge Cases and Integration", () => {
		it("should handle empty request body", async function () {
			this.timeout(TEST_TIMEOUT);
			req.body = {};
			await wishlistItemController.create(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle null request body", async function () {
			this.timeout(TEST_TIMEOUT);
			req.body = null;
			await wishlistItemController.create(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle undefined request body", async function () {
			this.timeout(TEST_TIMEOUT);
			req.body = undefined;
			await wishlistItemController.create(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle valid wishlistItem creation", async function () {
			this.timeout(TEST_TIMEOUT);
			const createData = {
				employeeId: "507f1f77bcf86cd799439080",
				itemId: "507f1f77bcf86cd799439081",
			};
			req.body = createData;
			await wishlistItemController.create(req as Request, res, next);
			expect(statusCode).to.equal(201);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle concurrent requests", async function () {
			this.timeout(TEST_TIMEOUT);
			const createData = {
				employeeId: "507f1f77bcf86cd799439082",
				itemId: "507f1f77bcf86cd799439083",
			};
			req.body = createData;

			const promises = Array(5)
				.fill(null)
				.map(() => wishlistItemController.create(req as Request, res, next));

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
			await wishlistItemController.getAll(req as Request, res, next);
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
			await wishlistItemController.getAll(req as Request, res, next);
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
			await wishlistItemController.getAll(req as Request, res, next);
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
			await wishlistItemController.getAll(req as Request, res, next);
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
			await wishlistItemController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle empty string values", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { page: "", limit: "", sort: "", order: "" };
			await wishlistItemController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle whitespace-only values", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { page: "   ", limit: "   ", sort: "   " };
			await wishlistItemController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle missing required fields in update", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: mockWishlistItem.id };
			req.body = {};
			await wishlistItemController.update(req as Request, res, next);
			// Empty body → "No update fields provided" → 400
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle partial updates correctly", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: mockWishlistItem.id };
			req.body = { itemId: "507f1f77bcf86cd799439084" };
			await wishlistItemController.update(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
		});
	});
});

describe("Data Grouping Helper", () => {
	const testData = [
		{ id: 1, name: "WishlistItem 1", type: "email", category: "marketing" },
		{ id: 2, name: "WishlistItem 2", type: "sms", category: "notification" },
		{ id: 3, name: "WishlistItem 3", type: "email", category: "marketing" },
		{ id: 4, name: "WishlistItem 4", type: null, category: "general" },
		{ id: 5, name: "WishlistItem 5", type: "push", category: "notification" },
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
				{ id: 1, name: "WishlistItem 1", type: "email" },
				{ id: 2, name: "WishlistItem 2" },
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
			expect(result).to.have.property("WishlistItem 1");
			expect(result).to.have.property("WishlistItem 2");
			expect(result).to.have.property("WishlistItem 3");
			expect(result).to.have.property("WishlistItem 4");
			expect(result).to.have.property("WishlistItem 5");
			expect(result["WishlistItem 1"]).to.have.length(1);
		});
	});
});
