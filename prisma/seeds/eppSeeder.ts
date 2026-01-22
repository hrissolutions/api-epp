import { PrismaClient, ProductStatus } from "../../generated/prisma";

const prisma = new PrismaClient();

export async function seedEPP() {
	console.log("🌱 Starting EPP data seeding...");

	try {
		// ==========================================
		// 1. SEED VENDOR
		// ==========================================
		console.log("🏢 Creating vendor...");

		const vendor = await prisma.vendor.upsert({
			where: { code: "UZARO" },
			update: {},
			create: {
				name: "Uzaro Solutions Tech Inc",
				code: "UZARO",
				description:
					"Leading technology solutions provider specializing in enterprise products and services",
				contactName: "John Doe",
				email: "contact@uzarotech.com",
				phone: "+63 912 345 6789",
				website: "https://uzarotech.com",
				isActive: true,
			},
		});

		console.log(`✅ Vendor created: ${vendor.name} (${vendor.id})`);

		// ==========================================
		// 2. SEED CATEGORIES (Self-referencing hierarchy)
		// ==========================================
		console.log("📂 Creating categories...");

		// Parent Categories (Level 1)
		const electronicsCategory = await prisma.category.upsert({
			where: { slug: "electronics" },
			update: {},
			create: {
				name: "Electronics",
				slug: "electronics",
				description: "Electronic devices and gadgets",
				isActive: true,
			},
		});

		const appliancesCategory = await prisma.category.upsert({
			where: { slug: "appliances" },
			update: {},
			create: {
				name: "Appliances",
				slug: "appliances",
				description: "Home and kitchen appliances",
				isActive: true,
			},
		});

		// Child Categories (Level 2) - Electronics sub-categories
		const smartphonesCategory = await prisma.category.upsert({
			where: { slug: "smartphones" },
			update: {},
			create: {
				name: "Smartphones",
				slug: "smartphones",
				description: "Mobile phones and smartphones",
				parentId: electronicsCategory.id,
				isActive: true,
			},
		});

		const laptopsCategory = await prisma.category.upsert({
			where: { slug: "laptops" },
			update: {},
			create: {
				name: "Laptops",
				slug: "laptops",
				description: "Laptops and notebooks",
				parentId: electronicsCategory.id,
				isActive: true,
			},
		});

		const accessoriesCategory = await prisma.category.upsert({
			where: { slug: "accessories" },
			update: {},
			create: {
				name: "Accessories",
				slug: "accessories",
				description: "Electronic accessories and peripherals",
				parentId: electronicsCategory.id,
				isActive: true,
			},
		});

		// Child Categories (Level 2) - Appliances sub-categories
		const kitchenCategory = await prisma.category.upsert({
			where: { slug: "kitchen-appliances" },
			update: {},
			create: {
				name: "Kitchen Appliances",
				slug: "kitchen-appliances",
				description: "Kitchen and cooking appliances",
				parentId: appliancesCategory.id,
				isActive: true,
			},
		});

		// Grandchild Categories (Level 3) - Accessories sub-categories
		const chargersCablesCategory = await prisma.category.upsert({
			where: { slug: "chargers-cables" },
			update: {},
			create: {
				name: "Chargers & Cables",
				slug: "chargers-cables",
				description: "Charging accessories and cables",
				parentId: accessoriesCategory.id,
				isActive: true,
			},
		});

		console.log("✅ Categories created with hierarchy:");
		console.log("   📁 Electronics");
		console.log("      └── 📁 Smartphones");
		console.log("      └── 📁 Laptops");
		console.log("      └── 📁 Accessories");
		console.log("            └── 📁 Chargers & Cables");
		console.log("   📁 Appliances");
		console.log("      └── 📁 Kitchen Appliances");

		// ==========================================
		// 3. SEED PRODUCTS
		// ==========================================
		console.log("📦 Creating products...");

		const products = [
			// ==========================================
			// SMARTPHONES
			// ==========================================
			{
				sku: "UZARO-SMT-001",
				name: "iPhone 15 Pro Max 256GB",
				description:
					"Apple's latest flagship smartphone featuring A17 Pro chip, 48MP camera system, and titanium design",
				categoryId: smartphonesCategory.id,
				vendorId: vendor.id,
				retailPrice: 79990,
				sellingPrice: 74990,
				costPrice: 65000,
				stockQuantity: 50,
				lowStockThreshold: 10,
				imageUrl: "https://images.unsplash.com/photo-1695048133142-1a20484d2569?w=800&q=80",
				images: [
					{
						type: "COVER",
						name: "Cover Image",
						url: "https://images.unsplash.com/photo-1695048133142-1a20484d2569?w=800&q=80",
					},
					{
						type: "GALLERY",
						name: "Side View",
						url: "https://images.unsplash.com/photo-1510557880182-3d4d3cba35a5?w=800&q=80",
					},
				],
				specifications: {
					brand: "Apple",
					model: "iPhone 15 Pro Max",
					storage: "256GB",
					display: "6.7-inch Super Retina XDR",
					processor: "A17 Pro",
					camera: "48MP Main + 12MP Ultra Wide + 12MP Telephoto",
					battery: "4,422 mAh",
					os: "iOS 17",
				},
				isActive: true,
				isFeatured: true,
				isAvailable: true,
				status: ProductStatus.APPROVED,
			},
			{
				sku: "UZARO-SMT-002",
				name: "Samsung Galaxy S24 Ultra",
				description:
					"Samsung's premium flagship with S Pen, 200MP camera, and Galaxy AI features",
				categoryId: smartphonesCategory.id,
				vendorId: vendor.id,
				retailPrice: 74990,
				sellingPrice: 69990,
				costPrice: 60000,
				stockQuantity: 45,
				lowStockThreshold: 10,
				imageUrl: "https://images.unsplash.com/photo-1610945415295-d9bbf067e59c?w=800&q=80",
				images: [
					{
						type: "COVER",
						name: "Cover Image",
						url: "https://images.unsplash.com/photo-1610945415295-d9bbf067e59c?w=800&q=80",
					},
					{
						type: "GALLERY",
						name: "Back View",
						url: "https://images.unsplash.com/photo-1585060544812-6b45742d762f?w=800&q=80",
					},
				],
				specifications: {
					brand: "Samsung",
					model: "Galaxy S24 Ultra",
					storage: "256GB",
					display: "6.8-inch Dynamic AMOLED 2X",
					processor: "Snapdragon 8 Gen 3",
					camera: "200MP Main + 12MP Ultra Wide + 50MP Telephoto + 10MP Telephoto",
					battery: "5,000 mAh",
					os: "Android 14",
				},
				isActive: true,
				isFeatured: true,
				isAvailable: true,
				status: ProductStatus.APPROVED,
			},
			{
				sku: "UZARO-SMT-003",
				name: "Google Pixel 8 Pro",
				description:
					"Google's AI-powered smartphone with Tensor G3 chip and advanced computational photography",
				categoryId: smartphonesCategory.id,
				vendorId: vendor.id,
				retailPrice: 54990,
				sellingPrice: 49990,
				costPrice: 42000,
				stockQuantity: 30,
				lowStockThreshold: 8,
				imageUrl: "https://images.unsplash.com/photo-1598327105666-5b89351aff97?w=800&q=80",
				images: [
					{
						type: "COVER",
						name: "Cover Image",
						url: "https://images.unsplash.com/photo-1598327105666-5b89351aff97?w=800&q=80",
					},
				],
				specifications: {
					brand: "Google",
					model: "Pixel 8 Pro",
					storage: "128GB",
					display: "6.7-inch LTPO OLED",
					processor: "Google Tensor G3",
					camera: "50MP Main + 48MP Ultra Wide + 48MP Telephoto",
					battery: "5,050 mAh",
					os: "Android 14",
				},
				isActive: true,
				isFeatured: false,
				isAvailable: true,
				status: ProductStatus.APPROVED,
			},
			{
				sku: "UZARO-SMT-004",
				name: "OnePlus 12 5G",
				description:
					"Flagship killer with Snapdragon 8 Gen 3, Hasselblad cameras, and 100W charging",
				categoryId: smartphonesCategory.id,
				vendorId: vendor.id,
				retailPrice: 44990,
				sellingPrice: 41990,
				costPrice: 35000,
				stockQuantity: 40,
				lowStockThreshold: 10,
				imageUrl: "https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=800&q=80",
				images: [
					{
						type: "COVER",
						name: "Cover Image",
						url: "https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=800&q=80",
					},
				],
				specifications: {
					brand: "OnePlus",
					model: "12 5G",
					storage: "256GB",
					display: "6.82-inch LTPO AMOLED",
					processor: "Snapdragon 8 Gen 3",
					camera: "50MP Main + 64MP Periscope + 48MP Ultra Wide",
					battery: "5,400 mAh",
					charging: "100W SuperVOOC",
				},
				isActive: true,
				isFeatured: false,
				isAvailable: true,
				status: ProductStatus.APPROVED,
			},

			// ==========================================
			// LAPTOPS
			// ==========================================
			{
				sku: "UZARO-LAP-001",
				name: "MacBook Pro 14-inch M3 Pro",
				description:
					"Powerful laptop with M3 Pro chip, 18GB unified memory, and 512GB SSD for professionals",
				categoryId: laptopsCategory.id,
				vendorId: vendor.id,
				retailPrice: 129990,
				sellingPrice: 119990,
				costPrice: 100000,
				stockQuantity: 25,
				lowStockThreshold: 5,
				imageUrl: "https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=800&q=80",
				images: [
					{
						type: "COVER",
						name: "Cover Image",
						url: "https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=800&q=80",
					},
					{
						type: "GALLERY",
						name: "Open View",
						url: "https://images.unsplash.com/photo-1611186871348-b1ce696e52c9?w=800&q=80",
					},
				],
				specifications: {
					brand: "Apple",
					model: "MacBook Pro 14-inch",
					processor: "Apple M3 Pro",
					memory: "18GB Unified Memory",
					storage: "512GB SSD",
					display: "14.2-inch Liquid Retina XDR",
					battery: "Up to 17 hours",
					os: "macOS Sonoma",
				},
				isActive: true,
				isFeatured: true,
				isAvailable: true,
				status: ProductStatus.APPROVED,
			},
			{
				sku: "UZARO-LAP-002",
				name: "Dell XPS 15 (2024)",
				description:
					"Premium Windows laptop with Intel Core Ultra 7, 16GB RAM, and stunning OLED display",
				categoryId: laptopsCategory.id,
				vendorId: vendor.id,
				retailPrice: 99990,
				sellingPrice: 94990,
				costPrice: 80000,
				stockQuantity: 20,
				lowStockThreshold: 5,
				imageUrl: "https://images.unsplash.com/photo-1593642632559-0c6d3fc62b89?w=800&q=80",
				images: [
					{
						type: "COVER",
						name: "Cover Image",
						url: "https://images.unsplash.com/photo-1593642632559-0c6d3fc62b89?w=800&q=80",
					},
					{
						type: "GALLERY",
						name: "Side View",
						url: "https://images.unsplash.com/photo-1496181133206-80ce9b88a853?w=800&q=80",
					},
				],
				specifications: {
					brand: "Dell",
					model: "XPS 15 9530",
					processor: "Intel Core Ultra 7 155H",
					memory: "16GB DDR5",
					storage: "512GB NVMe SSD",
					display: "15.6-inch 3.5K OLED",
					battery: "Up to 13 hours",
					os: "Windows 11 Pro",
				},
				isActive: true,
				isFeatured: true,
				isAvailable: true,
				status: ProductStatus.APPROVED,
			},
			{
				sku: "UZARO-LAP-003",
				name: "ASUS ROG Zephyrus G16",
				description:
					"High-performance gaming laptop with RTX 4070, Intel Core i9, and 240Hz display",
				categoryId: laptopsCategory.id,
				vendorId: vendor.id,
				retailPrice: 119990,
				sellingPrice: 109990,
				costPrice: 90000,
				stockQuantity: 15,
				lowStockThreshold: 3,
				imageUrl: "https://images.unsplash.com/photo-1603302576837-37561b2e2302?w=800&q=80",
				images: [
					{
						type: "COVER",
						name: "Cover Image",
						url: "https://images.unsplash.com/photo-1603302576837-37561b2e2302?w=800&q=80",
					},
				],
				specifications: {
					brand: "ASUS",
					model: "ROG Zephyrus G16 GU605",
					processor: "Intel Core i9-14900HX",
					memory: "32GB DDR5",
					storage: "1TB NVMe SSD",
					graphics: "NVIDIA GeForce RTX 4070",
					display: "16-inch QHD+ 240Hz",
					os: "Windows 11 Home",
				},
				isActive: true,
				isFeatured: false,
				isAvailable: true,
				status: ProductStatus.APPROVED,
			},
			{
				sku: "UZARO-LAP-004",
				name: "Lenovo ThinkPad X1 Carbon Gen 11",
				description:
					"Ultra-light business laptop with Intel vPro, 14-inch 2.8K OLED, and all-day battery",
				categoryId: laptopsCategory.id,
				vendorId: vendor.id,
				retailPrice: 109990,
				sellingPrice: 99990,
				costPrice: 85000,
				stockQuantity: 18,
				lowStockThreshold: 4,
				imageUrl: "https://images.unsplash.com/photo-1588872657578-7efd1f1555ed?w=800&q=80",
				images: [
					{
						type: "COVER",
						name: "Cover Image",
						url: "https://images.unsplash.com/photo-1588872657578-7efd1f1555ed?w=800&q=80",
					},
				],
				specifications: {
					brand: "Lenovo",
					model: "ThinkPad X1 Carbon Gen 11",
					processor: "Intel Core i7-1365U vPro",
					memory: "16GB LPDDR5",
					storage: "512GB SSD",
					display: "14-inch 2.8K OLED",
					weight: "1.12 kg",
					os: "Windows 11 Pro",
				},
				isActive: true,
				isFeatured: false,
				isAvailable: true,
				status: ProductStatus.APPROVED,
			},

			// ==========================================
			// ACCESSORIES - Chargers & Cables
			// ==========================================
			{
				sku: "UZARO-ACC-001",
				name: "Apple 20W USB-C Power Adapter",
				description:
					"Fast charging power adapter compatible with iPhone, iPad, and Apple Watch",
				categoryId: chargersCablesCategory.id,
				vendorId: vendor.id,
				retailPrice: 1190,
				sellingPrice: 999,
				costPrice: 700,
				stockQuantity: 200,
				lowStockThreshold: 50,
				imageUrl: "https://images.unsplash.com/photo-1583394838336-acd977736f90?w=800&q=80",
				images: [
					{
						type: "COVER",
						name: "Cover Image",
						url: "https://images.unsplash.com/photo-1583394838336-acd977736f90?w=800&q=80",
					},
				],
				specifications: {
					brand: "Apple",
					model: "20W USB-C Power Adapter",
					output: "20W",
					inputVoltage: "100-240V",
					connector: "USB-C",
				},
				isActive: true,
				isFeatured: false,
				isAvailable: true,
				status: ProductStatus.APPROVED,
			},
			{
				sku: "UZARO-ACC-002",
				name: "Anker 737 Power Bank 24000mAh",
				description:
					"High-capacity power bank with 140W output, perfect for laptops and smartphones",
				categoryId: chargersCablesCategory.id,
				vendorId: vendor.id,
				retailPrice: 8990,
				sellingPrice: 7990,
				costPrice: 5500,
				stockQuantity: 80,
				lowStockThreshold: 20,
				imageUrl: "https://images.unsplash.com/photo-1609091839311-d5365f9ff1c5?w=800&q=80",
				images: [
					{
						type: "COVER",
						name: "Cover Image",
						url: "https://images.unsplash.com/photo-1609091839311-d5365f9ff1c5?w=800&q=80",
					},
				],
				specifications: {
					brand: "Anker",
					model: "737 PowerCore 24K",
					capacity: "24,000mAh",
					output: "140W Max",
					ports: "2x USB-C, 1x USB-A",
					weight: "632g",
				},
				isActive: true,
				isFeatured: false,
				isAvailable: true,
				status: ProductStatus.APPROVED,
			},

			// ==========================================
			// ACCESSORIES - Audio
			// ==========================================
			{
				sku: "UZARO-ACC-003",
				name: "Sony WH-1000XM5 Headphones",
				description:
					"Industry-leading noise canceling wireless headphones with exceptional sound quality",
				categoryId: accessoriesCategory.id,
				vendorId: vendor.id,
				retailPrice: 19990,
				sellingPrice: 17990,
				costPrice: 14000,
				stockQuantity: 60,
				lowStockThreshold: 15,
				imageUrl: "https://images.unsplash.com/photo-1546435770-a3e426bf472b?w=800&q=80",
				images: [
					{
						type: "COVER",
						name: "Cover Image",
						url: "https://images.unsplash.com/photo-1546435770-a3e426bf472b?w=800&q=80",
					},
					{
						type: "GALLERY",
						name: "Folded View",
						url: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800&q=80",
					},
				],
				specifications: {
					brand: "Sony",
					model: "WH-1000XM5",
					type: "Over-ear Wireless",
					noiseCanceling: "Yes - Industry Leading",
					batteryLife: "Up to 30 hours",
					driver: "30mm",
					weight: "250g",
				},
				isActive: true,
				isFeatured: true,
				isAvailable: true,
				status: ProductStatus.APPROVED,
			},
			{
				sku: "UZARO-ACC-004",
				name: "Apple AirPods Pro (2nd Gen)",
				description: "Active Noise Cancellation, Adaptive Audio, and USB-C charging case",
				categoryId: accessoriesCategory.id,
				vendorId: vendor.id,
				retailPrice: 14990,
				sellingPrice: 13490,
				costPrice: 10000,
				stockQuantity: 100,
				lowStockThreshold: 25,
				imageUrl: "https://images.unsplash.com/photo-1600294037681-c80b4cb5b434?w=800&q=80",
				images: [
					{
						type: "COVER",
						name: "Cover Image",
						url: "https://images.unsplash.com/photo-1600294037681-c80b4cb5b434?w=800&q=80",
					},
				],
				specifications: {
					brand: "Apple",
					model: "AirPods Pro 2nd Gen",
					type: "In-ear Wireless",
					noiseCanceling: "Active Noise Cancellation",
					batteryLife: "Up to 6 hours (30 hours with case)",
					charging: "USB-C, MagSafe, Qi",
					features: "Adaptive Audio, Conversation Awareness",
				},
				isActive: true,
				isFeatured: true,
				isAvailable: true,
				status: ProductStatus.APPROVED,
			},
			{
				sku: "UZARO-ACC-005",
				name: "Logitech MX Master 3S Mouse",
				description:
					"Advanced wireless mouse with 8K DPI sensor, quiet clicks, and MagSpeed scroll wheel",
				categoryId: accessoriesCategory.id,
				vendorId: vendor.id,
				retailPrice: 5990,
				sellingPrice: 5290,
				costPrice: 3800,
				stockQuantity: 75,
				lowStockThreshold: 20,
				imageUrl: "https://images.unsplash.com/photo-1527864550417-7fd91fc51a46?w=800&q=80",
				images: [
					{
						type: "COVER",
						name: "Cover Image",
						url: "https://images.unsplash.com/photo-1527864550417-7fd91fc51a46?w=800&q=80",
					},
				],
				specifications: {
					brand: "Logitech",
					model: "MX Master 3S",
					sensor: "8000 DPI",
					connectivity: "Bluetooth, USB Receiver",
					battery: "Up to 70 days",
					buttons: "7 programmable buttons",
				},
				isActive: true,
				isFeatured: false,
				isAvailable: true,
				status: ProductStatus.APPROVED,
			},

			// ==========================================
			// KITCHEN APPLIANCES
			// ==========================================
			{
				sku: "UZARO-KIT-001",
				name: "Instant Pot Duo Plus 6-Quart",
				description:
					"9-in-1 electric pressure cooker with stainless steel inner pot and 15 one-touch programs",
				categoryId: kitchenCategory.id,
				vendorId: vendor.id,
				retailPrice: 6990,
				sellingPrice: 5990,
				costPrice: 4000,
				stockQuantity: 40,
				lowStockThreshold: 10,
				imageUrl: "https://images.unsplash.com/photo-1585515320310-259814833e62?w=800&q=80",
				images: [
					{
						type: "COVER",
						name: "Cover Image",
						url: "https://images.unsplash.com/photo-1585515320310-259814833e62?w=800&q=80",
					},
				],
				specifications: {
					brand: "Instant Pot",
					model: "Duo Plus 6-Quart",
					capacity: "6 Quart (5.7L)",
					functions:
						"Pressure Cooker, Slow Cooker, Rice Cooker, Steamer, Sauté, Sous Vide, Yogurt Maker, Sterilizer, Warmer",
					power: "1000W",
					material: "Stainless Steel",
				},
				isActive: true,
				isFeatured: false,
				isAvailable: true,
				status: ProductStatus.APPROVED,
			},
			{
				sku: "UZARO-KIT-002",
				name: "Ninja Professional Blender",
				description:
					"1100-watt professional blender with Total Crushing Technology for ice and frozen fruits",
				categoryId: kitchenCategory.id,
				vendorId: vendor.id,
				retailPrice: 5490,
				sellingPrice: 4790,
				costPrice: 3200,
				stockQuantity: 35,
				lowStockThreshold: 8,
				imageUrl: "https://images.unsplash.com/photo-1570222094114-d054a817e56b?w=800&q=80",
				images: [
					{
						type: "COVER",
						name: "Cover Image",
						url: "https://images.unsplash.com/photo-1570222094114-d054a817e56b?w=800&q=80",
					},
				],
				specifications: {
					brand: "Ninja",
					model: "BL610",
					power: "1100W",
					capacity: "72 oz",
					blades: "Total Crushing Technology",
					speeds: "3 speeds + pulse",
				},
				isActive: true,
				isFeatured: false,
				isAvailable: true,
				status: ProductStatus.APPROVED,
			},
			{
				sku: "UZARO-KIT-003",
				name: "Breville Barista Express Espresso",
				description:
					"Semi-automatic espresso machine with integrated grinder for fresh espresso",
				categoryId: kitchenCategory.id,
				vendorId: vendor.id,
				retailPrice: 34990,
				sellingPrice: 31990,
				costPrice: 25000,
				stockQuantity: 15,
				lowStockThreshold: 3,
				imageUrl: "https://images.unsplash.com/photo-1517668808822-9ebb02f2a0e6?w=800&q=80",
				images: [
					{
						type: "COVER",
						name: "Cover Image",
						url: "https://images.unsplash.com/photo-1517668808822-9ebb02f2a0e6?w=800&q=80",
					},
					{
						type: "DETAIL",
						name: "Grinder",
						url: "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=800&q=80",
					},
				],
				specifications: {
					brand: "Breville",
					model: "Barista Express BES870XL",
					pumpPressure: "15 bar Italian pump",
					grinder: "Integrated conical burr grinder",
					waterTank: "67 oz",
					steamWand: "Professional steam wand",
				},
				isActive: true,
				isFeatured: true,
				isAvailable: true,
				status: ProductStatus.APPROVED,
			},
			{
				sku: "UZARO-KIT-004",
				name: "KitchenAid Stand Mixer",
				description:
					"Artisan Series 5-Quart tilt-head stand mixer with 10 speeds and multiple attachments",
				categoryId: kitchenCategory.id,
				vendorId: vendor.id,
				retailPrice: 24990,
				sellingPrice: 22490,
				costPrice: 18000,
				stockQuantity: 25,
				lowStockThreshold: 5,
				imageUrl: "https://images.unsplash.com/photo-1594631252845-29fc4cc8cde9?w=800&q=80",
				images: [
					{
						type: "COVER",
						name: "Cover Image",
						url: "https://images.unsplash.com/photo-1594631252845-29fc4cc8cde9?w=800&q=80",
					},
				],
				specifications: {
					brand: "KitchenAid",
					model: "Artisan Series KSM150PS",
					capacity: "5 Quart",
					motor: "325W",
					speeds: "10 speeds",
					attachments: "Flat beater, dough hook, wire whip",
					color: "Empire Red",
				},
				isActive: true,
				isFeatured: true,
				isAvailable: true,
				status: ProductStatus.APPROVED,
			},

			// ==========================================
			// PENDING PRODUCTS (for testing workflow)
			// ==========================================
			{
				sku: "UZARO-SMT-005",
				name: "Xiaomi 14 Ultra",
				description:
					"Premium flagship with Leica optics, Snapdragon 8 Gen 3, and 90W HyperCharge",
				categoryId: smartphonesCategory.id,
				vendorId: vendor.id,
				retailPrice: 59990,
				sellingPrice: 54990,
				costPrice: 45000,
				stockQuantity: 25,
				lowStockThreshold: 5,
				imageUrl: "https://images.unsplash.com/photo-1592899677977-9c10ca588bbd?w=800&q=80",
				images: [
					{
						type: "COVER",
						name: "Cover Image",
						url: "https://images.unsplash.com/photo-1592899677977-9c10ca588bbd?w=800&q=80",
					},
				],
				specifications: {
					brand: "Xiaomi",
					model: "14 Ultra",
					storage: "512GB",
					display: "6.73-inch LTPO AMOLED",
					processor: "Snapdragon 8 Gen 3",
					camera: "Leica 50MP Main + 50MP Ultra Wide + 50MP Telephoto",
					battery: "5,000 mAh",
					charging: "90W HyperCharge",
				},
				isActive: true,
				isFeatured: false,
				isAvailable: true,
				status: ProductStatus.PENDING,
			},
			{
				sku: "UZARO-LAP-005",
				name: "HP Spectre x360 14",
				description:
					"Premium 2-in-1 convertible laptop with Intel Core Ultra 7 and 3K OLED touchscreen",
				categoryId: laptopsCategory.id,
				vendorId: vendor.id,
				retailPrice: 94990,
				sellingPrice: 89990,
				costPrice: 75000,
				stockQuantity: 12,
				lowStockThreshold: 3,
				imageUrl: "https://images.unsplash.com/photo-1587614382346-4ec70e388b28?w=800&q=80",
				images: [
					{
						type: "COVER",
						name: "Cover Image",
						url: "https://images.unsplash.com/photo-1587614382346-4ec70e388b28?w=800&q=80",
					},
				],
				specifications: {
					brand: "HP",
					model: "Spectre x360 14-eu0000",
					processor: "Intel Core Ultra 7 155H",
					memory: "16GB LPDDR5",
					storage: "1TB NVMe SSD",
					display: "14-inch 3K OLED Touch",
					battery: "Up to 15 hours",
					os: "Windows 11 Home",
				},
				isActive: true,
				isFeatured: false,
				isAvailable: true,
				status: ProductStatus.PENDING,
			},
		];

		for (const productData of products) {
			await prisma.product.upsert({
				where: { sku: productData.sku },
				update: {},
				create: productData,
			});
		}

		console.log(`✅ ${products.length} products created`);

		// ==========================================
		// SUMMARY
		// ==========================================
		console.log("\n📊 EPP Seeding Summary:");
		console.log("   🏢 Vendors: 1");
		console.log("   📂 Categories: 7 (with hierarchy)");
		console.log(`   📦 Products: ${products.length}`);
		console.log("\n🎉 EPP seeding completed successfully!");
	} catch (error) {
		console.error("❌ Error during EPP seeding:", error);
		throw error;
	}
}
