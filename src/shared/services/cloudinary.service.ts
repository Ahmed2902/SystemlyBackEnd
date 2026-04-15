import { v2 as cloudinary } from "cloudinary";
import fs from "fs";

const configured = Boolean(
	process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET
);

if (configured) {
	cloudinary.config({
		cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
		api_key: process.env.CLOUDINARY_API_KEY,
		api_secret: process.env.CLOUDINARY_API_SECRET,
	});
}

/**
 * Upload a local file path to Cloudinary. If Cloudinary is not configured,
 * returns a placeholder URL and does not throw — TODO: implement provider selection.
 */
export const uploadFile = async (filePath: string, opts: any = {}) => {
	if (!configured) {
		// TODO: replace placeholder with real upload once Cloudinary credentials are set
		return { url: "https://via.placeholder.com/800x600?text=upload+not+configured", publicId: "placeholder" };
	}
	try {
		const res = await cloudinary.uploader.upload(filePath, opts);
		// remove local temp file
		try {
			fs.unlinkSync(filePath);
		} catch (e) {
			// ignore
		}
		return { url: res.secure_url, publicId: res.public_id };
	} catch (err) {
		// bubble up error
		throw err;
	}
};

export default { uploadFile };
