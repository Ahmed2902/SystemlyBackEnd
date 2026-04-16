import fs from "fs";
import path from "path";
import multer from "multer";
import type { Request } from "express";

(function ensureUploadsDir() {
  try {
    const dir = path.join(process.cwd(), "uploads");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  } catch (e) {
    // ignore
  }
})();

const uploadDir = path.join(process.cwd(), "uploads");

const storage = multer.diskStorage({
  destination: (req: Request, _file: any, cb: (error: Error | null, destination: string) => void) => cb(null, uploadDir),
  filename: (req: Request, file: any, cb: (error: Error | null, filename: string) => void) => cb(null, `${Date.now()}-${file.originalname}`),
});

const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

export const uploadSingle = upload.single("file");
export const uploadArray = (field = "files", maxCount = 10) => upload.array(field, maxCount);
