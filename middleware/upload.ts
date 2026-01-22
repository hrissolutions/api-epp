import multer from "multer";
import { Request } from "express";

// Configure multer for memory storage
const storage = multer.memoryStorage();

// File filter function
const fileFilter = (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
	// Check if file is an image
	if (file.mimetype.startsWith("image/")) {
		cb(null, true);
	} else {
		cb(new Error("Only image files are allowed!"));
	}
};

// Create multer instance
const upload = multer({
	storage: storage,
	fileFilter: fileFilter,
	limits: {
		fileSize: 10 * 1024 * 1024, // 10MB limit per file
		files: 10, // Maximum 10 files
	},
});

// Export different upload configurations
export const uploadSingle = upload.single("image");
export const uploadMultiple = upload.array("images", 10); // Maximum 10 images
export const uploadFields = upload.fields([
	{ name: "images", maxCount: 10 },
	{ name: "thumbnails", maxCount: 5 },
]);
export const uploadOrganizationFiles = upload.fields([
	{ name: "logo", maxCount: 1 },
	{ name: "background", maxCount: 1 },
]);

export const uploadUserFiles = upload.fields([{ name: "avatar", maxCount: 1 }]);

// New upload configuration for facility images (1-5 images)
export const uploadFacilityImages = upload.array("images", 5);

// Upload configuration for room type images (multiple images)
export const uploadRoomTypeImages = upload.array("images", 10); // Maximum 10 images for room types

export const uploadFacilityTypeImages = upload.array("images", 10); // Maximum 10 images for facility types

// Upload configuration for CSV files
export const uploadCSV = multer({
	storage: storage,
	fileFilter: (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
		// Check if file is a CSV
		if (file.mimetype === "text/csv" || file.originalname.endsWith(".csv")) {
			cb(null, true);
		} else {
			cb(new Error("Only CSV files are allowed!"));
		}
	},
	limits: {
		fileSize: 50 * 1024 * 1024, // 50MB limit for CSV files
		files: 1, // Maximum 1 CSV file
	},
}).single("file");

// Upload configuration for item images (supports multiple image types)
export const uploadItemImages = upload.fields([
	{ name: "coverImages", maxCount: 5 },
	{ name: "featuredImages", maxCount: 10 },
	{ name: "galleryImages", maxCount: 20 },
	{ name: "thumbnailImages", maxCount: 5 },
	{ name: "packagingImages", maxCount: 10 },
	{ name: "detailImages", maxCount: 20 },
	{ name: "lifestyleImages", maxCount: 10 },
	{ name: "sizeChartImages", maxCount: 5 },
	{ name: "instructionImages", maxCount: 10 },
	{ name: "images", maxCount: 20 }, // fallback for generic images
]);

// For backward compatibility
export const uploadProductImages = uploadItemImages;

// Flexible upload for submissions - accepts any field name
export const uploadSubmissionFiles = upload.any();

export default upload;
