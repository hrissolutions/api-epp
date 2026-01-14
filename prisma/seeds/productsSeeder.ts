import { PrismaClient } from "../../generated/prisma";

const prisma = new PrismaClient();

export async function seedProducts() {
	console.log("🌱 Starting products seeding...");

	const productsData = [
		// Electronics - Smartphones
		{
			name: "iPhone 15 Pro Max",
			description: "Latest flagship smartphone from Apple with A17 Pro chip, 256GB storage, and advanced camera system",
			category: "Electronics",
			productType: "PHYSICAL_PRODUCT",
			price: 69999,
			currency: "PHP",
			loanEligible: true,
			maxLoanTerm: 24,
			minDownPayment: 20,
			interestRate: 2.5,
			brand: "Apple",
			model: "iPhone 15 Pro Max",
			sku: "APL-IP15PM-256-TBL",
			imageUrls: [
				"https://example.com/images/iphone15pro-1.jpg",
				"https://example.com/images/iphone15pro-2.jpg"
			],
			specifications: {
				screen: "6.7-inch Super Retina XDR",
				processor: "A17 Pro chip",
				storage: "256GB",
				camera: "48MP Main + 12MP Ultra Wide + 12MP Telephoto",
				battery: "4,422 mAh",
				weight: "221g"
			},
			status: "ACTIVE",
			stockQuantity: 50,
			lowStockAlert: 10,
		},
		// Electronics - Laptops
		{
			name: "MacBook Air M2",
			description: "Powerful and portable laptop with M2 chip, perfect for work and creativity",
			category: "Electronics",
			productType: "PHYSICAL_PRODUCT",
			price: 69990,
			currency: "PHP",
			loanEligible: true,
			maxLoanTerm: 36,
			minDownPayment: 15,
			interestRate: 2.0,
			brand: "Apple",
			model: "MacBook Air M2",
			sku: "APL-MBA-M2-512-SG",
			imageUrls: [
				"https://example.com/images/macbook-air-m2-1.jpg",
				"https://example.com/images/macbook-air-m2-2.jpg"
			],
			specifications: {
				processor: "Apple M2 chip",
				memory: "16GB",
				storage: "512GB SSD",
				display: "13.6-inch Liquid Retina",
				weight: "1.24kg"
			},
			status: "ACTIVE",
			stockQuantity: 30,
			lowStockAlert: 5,
		},
		// Appliances - Refrigerator
		{
			name: "Samsung French Door Refrigerator",
			description: "Spacious 25 cu.ft refrigerator with Twin Cooling Plus technology",
			category: "Appliances",
			productType: "PHYSICAL_PRODUCT",
			price: 45999,
			currency: "PHP",
			loanEligible: true,
			maxLoanTerm: 24,
			minDownPayment: 25,
			interestRate: 3.0,
			brand: "Samsung",
			model: "RF25R5511SR",
			sku: "SAM-REF-RF25R5511SR",
			imageUrls: ["https://example.com/images/samsung-fridge.jpg"],
			specifications: {
				capacity: "25 cu.ft",
				type: "French Door",
				features: ["Twin Cooling Plus", "Ice Maker", "LED Lighting"],
				energyRating: "4 Star"
			},
			status: "ACTIVE",
			stockQuantity: 15,
			lowStockAlert: 3,
		},
		// Furniture - Sofa
		{
			name: "L-Shape Modular Sofa",
			description: "Modern and comfortable L-shape sofa with premium fabric upholstery",
			category: "Furniture",
			productType: "PHYSICAL_PRODUCT",
			price: 35000,
			currency: "PHP",
			loanEligible: true,
			maxLoanTerm: 18,
			minDownPayment: 20,
			interestRate: 2.5,
			brand: "Mandaue Foam",
			model: "L-SOFA-2024",
			sku: "MDF-LSOFA-GRY",
			imageUrls: ["https://example.com/images/l-shape-sofa.jpg"],
			specifications: {
				dimensions: "280cm x 180cm x 85cm",
				material: "Premium Fabric",
				color: "Grey",
				seatingCapacity: "5-6 persons"
			},
			status: "ACTIVE",
			stockQuantity: 8,
			lowStockAlert: 2,
		},
		// Insurance - Health
		{
			name: "Comprehensive Health Insurance",
			description: "Complete health coverage with hospitalization, outpatient, and emergency benefits",
			category: "Insurance",
			productType: "INSURANCE",
			price: 15000,
			currency: "PHP",
			loanEligible: false,
			brand: "PhilHealth Plus",
			sku: "INS-HEALTH-COMP-2024",
			imageUrls: ["https://example.com/images/health-insurance.jpg"],
			specifications: {
				coverage: "Up to 2M PHP per year",
				features: ["Hospitalization", "Outpatient", "Emergency", "Maternity"],
				ageLimit: "18-65 years"
			},
			insuranceDetails: {
				coverageAmount: 2000000,
				policyTerm: "12 months",
				renewalOptions: "Annual",
				exclusions: ["Pre-existing conditions", "Cosmetic surgery"]
			},
			status: "ACTIVE",
		},
		// Service - Gym Membership
		{
			name: "Premium Gym Membership",
			description: "12-month premium gym membership with access to all facilities and classes",
			category: "Fitness",
			productType: "SERVICE",
			price: 18000,
			currency: "PHP",
			loanEligible: true,
			maxLoanTerm: 12,
			minDownPayment: 30,
			interestRate: 1.5,
			brand: "Fitness First",
			sku: "SVC-GYM-PREM-12M",
			imageUrls: ["https://example.com/images/gym-membership.jpg"],
			specifications: {
				duration: "12 months",
				facilities: ["Gym Equipment", "Pool", "Sauna", "Group Classes"],
				locations: "All branches nationwide"
			},
			status: "ACTIVE",
		},
		// Subscription - Streaming
		{
			name: "Netflix Premium Annual Plan",
			description: "12-month Netflix Premium subscription with 4K streaming and 4 screens",
			category: "Entertainment",
			productType: "SUBSCRIPTION",
			price: 7188,
			currency: "PHP",
			loanEligible: false,
			brand: "Netflix",
			sku: "SUB-NFLX-PREM-12M",
			imageUrls: ["https://example.com/images/netflix-premium.jpg"],
			specifications: {
				resolution: "4K + HDR",
				screens: "4 simultaneous streams",
				downloads: "6 devices",
				duration: "12 months prepaid"
			},
			status: "ACTIVE",
		},
		// Voucher - Shopping
		{
			name: "SM Gift Certificate",
			description: "SM shopping voucher valid in all SM stores nationwide",
			category: "Gift Cards",
			productType: "VOUCHER",
			price: 5000,
			currency: "PHP",
			loanEligible: false,
			brand: "SM",
			sku: "VCH-SM-5000",
			imageUrls: ["https://example.com/images/sm-voucher.jpg"],
			specifications: {
				denomination: "PHP 5,000",
				validity: "12 months from purchase",
				usableAt: "All SM Malls nationwide"
			},
			status: "ACTIVE",
			stockQuantity: 100,
			lowStockAlert: 20,
		},
		// Electronics - TV
		{
			name: "LG 65\" OLED 4K Smart TV",
			description: "Premium OLED TV with stunning picture quality and smart features",
			category: "Electronics",
			productType: "PHYSICAL_PRODUCT",
			price: 89999,
			currency: "PHP",
			loanEligible: true,
			maxLoanTerm: 24,
			minDownPayment: 20,
			interestRate: 2.5,
			brand: "LG",
			model: "OLED65C3PSA",
			sku: "LG-OLED-65C3",
			imageUrls: ["https://example.com/images/lg-oled-tv.jpg"],
			specifications: {
				screenSize: "65 inches",
				resolution: "4K Ultra HD",
				displayType: "OLED",
				smartTV: "webOS",
				hdmi: "4 ports"
			},
			status: "ACTIVE",
			stockQuantity: 12,
			lowStockAlert: 3,
		},
		// Appliances - Washing Machine
		{
			name: "Whirlpool Front Load Washer",
			description: "Energy-efficient front load washing machine with 10kg capacity",
			category: "Appliances",
			productType: "PHYSICAL_PRODUCT",
			price: 28999,
			currency: "PHP",
			loanEligible: true,
			maxLoanTerm: 18,
			minDownPayment: 25,
			interestRate: 2.8,
			brand: "Whirlpool",
			model: "WFW5620HW",
			sku: "WHP-WM-FL-10KG",
			imageUrls: ["https://example.com/images/whirlpool-washer.jpg"],
			specifications: {
				capacity: "10kg",
				type: "Front Load",
				spinSpeed: "1400 RPM",
				energyRating: "5 Star"
			},
			status: "ACTIVE",
			stockQuantity: 20,
			lowStockAlert: 5,
		},
		// Out of Stock Example
		{
			name: "PlayStation 5 Console",
			description: "Next-gen gaming console with 825GB SSD",
			category: "Electronics",
			productType: "PHYSICAL_PRODUCT",
			price: 31990,
			currency: "PHP",
			loanEligible: true,
			maxLoanTerm: 12,
			minDownPayment: 30,
			interestRate: 2.0,
			brand: "Sony",
			model: "PS5",
			sku: "SNY-PS5-STD",
			imageUrls: ["https://example.com/images/ps5.jpg"],
			specifications: {
				storage: "825GB SSD",
				resolution: "4K at 120Hz",
				rayTracing: "Yes"
			},
			status: "OUT_OF_STOCK",
			stockQuantity: 0,
			lowStockAlert: 5,
		},
	];

	try {
		// Clear existing products (optional - remove if you want to keep existing data)
		console.log("🗑️  Clearing existing products...");
		await prisma.product.deleteMany({});

		// Create products
		console.log("📝 Creating product records...");
		for (const product of productsData) {
			await prisma.product.create({
				data: product,
			});
		}

		console.log(`✅ Successfully created ${productsData.length} product records`);

		// Display summary by type
		const physicalCount = productsData.filter((p) => p.productType === "PHYSICAL_PRODUCT").length;
		const insuranceCount = productsData.filter((p) => p.productType === "INSURANCE").length;
		const serviceCount = productsData.filter((p) => p.productType === "SERVICE").length;
		const subscriptionCount = productsData.filter((p) => p.productType === "SUBSCRIPTION").length;
		const voucherCount = productsData.filter((p) => p.productType === "VOUCHER").length;

		console.log("\n📊 Products Summary:");
		console.log(`   📦 Physical Products: ${physicalCount}`);
		console.log(`   🏥 Insurance: ${insuranceCount}`);
		console.log(`   🛠️  Services: ${serviceCount}`);
		console.log(`   📺 Subscriptions: ${subscriptionCount}`);
		console.log(`   🎁 Vouchers: ${voucherCount}`);
		console.log(`   📈 Total: ${productsData.length}`);

		console.log("\n🎉 Products seeding completed successfully!");
	} catch (error) {
		console.error("❌ Error during products seeding:", error);
		throw error;
	}
}
