(function ensureUploadsDir() {
	try {
		const fs = require("fs");
		const path = require("path");
		const dir = path.join(process.cwd(), "uploads");
		if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
	} catch (e) {
		// ignore
	}
})();

import multer from "multer";
import path from "path";

const uploadDir = path.join(process.cwd(), "uploads");

const storage = multer.diskStorage({
	destination: (_req, _file, cb) => cb(null, uploadDir),
	filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});

const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

export const uploadSingle = upload.single("file");
export const uploadArray = (field = "files", maxCount = 10) => upload.array(field, maxCount);

