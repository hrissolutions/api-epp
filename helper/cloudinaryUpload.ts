import { v2 as cloudinary } from "cloudinary";

// Configure Cloudinary
cloudinary.config({
	cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
	api_key: process.env.CLOUDINARY_API_KEY,
	api_secret: process.env.CLOUDINARY_API_SECRET,
});

export interface UploadResult {
	success: boolean;
	secureUrl?: string;
	publicId?: string;
	error?: string;
}

/**
 * Upload multiple images to Cloudinary
 * @param files Array of Multer files
 * @param options Upload options including folder path
 * @returns Array of upload results
 */
export async function uploadMultipleToCloudinary(
	files: Express.Multer.File[],
	options: { folder?: string } = {},
): Promise<UploadResult[]> {
	const results: UploadResult[] = [];

	for (const file of files) {
		try {
			// Convert buffer to base64
			const base64Image = file.buffer.toString("base64");
			const dataUri = `data:${file.mimetype};base64,${base64Image}`;

			// Upload to Cloudinary
			const uploadResult = await cloudinary.uploader.upload(dataUri, {
				folder: options.folder || "uploads",
				resource_type: "image",
				format: "jpg",
				quality: "auto",
			});

			results.push({
				success: true,
				secureUrl: uploadResult.secure_url,
				publicId: uploadResult.public_id,
			});
		} catch (error: any) {
			results.push({
				success: false,
				error: error.message || "Upload failed",
			});
		}
	}

	return results;
}

/**
 * Delete an image from Cloudinary by public ID
 * @param publicId Cloudinary public ID
 * @returns Success status
 */
export async function deleteFromCloudinary(publicId: string): Promise<boolean> {
	try {
		await cloudinary.uploader.destroy(publicId);
		return true;
	} catch (error) {
		return false;
	}
}

/**
 * Delete multiple images from Cloudinary
 * @param publicIds Array of Cloudinary public IDs
 * @returns Array of deletion results
 */
export async function deleteMultipleFromCloudinary(
	publicIds: string[],
): Promise<boolean[]> {
	const results = await Promise.all(
		publicIds.map((publicId) => deleteFromCloudinary(publicId)),
	);
	return results;
}
