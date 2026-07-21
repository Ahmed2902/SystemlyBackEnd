import fs from "fs";
import path from "path";
import multer from "multer";
import crypto from "crypto";

const uploadDir = path.join(process.cwd(), "uploads");

(function ensureUploadsDir() {
  try {
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
  } catch {
    // Ignore startup cleanup/creation errors.
  }
})();

function safeOriginalExtension(originalName: string) {
  const ext = path.extname(originalName || "").toLowerCase();

  const allowed = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif"]);

  return allowed.has(ext) ? ext : "";
}

const storage = multer.diskStorage({
  destination: (_req: any, _file: any, cb: (error: Error | null, destination: string) => void) => {
    cb(null, uploadDir);
  },

  filename: (_req: any, file: any, cb: (error: Error | null, filename: string) => void) => {
    const ext = safeOriginalExtension(file.originalname);
    cb(null, `${Date.now()}-${crypto.randomUUID()}${ext}`);
  },
});

const imageFileFilter = (_req: any, file: any, cb: (error: Error | null, acceptFile?: boolean) => void) => {
  if (!file.mimetype || !file.mimetype.startsWith("image/")) {
    return cb(new Error("Only image files are allowed"));
  }

  cb(null, true);
};

const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
  fileFilter: imageFileFilter,
});

export const uploadSingle = upload.single("file");

export const uploadArray = (field = "files", maxCount = 10) =>
  upload.array(field, maxCount);

export default upload;
