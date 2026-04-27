import { v2 as cloudinary } from "cloudinary";
import fs from "fs";
import path from "path";
import stream from "stream";

const configured = Boolean(
  process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET
);

if (configured) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
}

const PLACEHOLDER_URL =
  "https://via.placeholder.com/800x600?text=upload+not+configured";

function bufferToStream(buffer: Buffer) {
  const readable = new stream.PassThrough();
  readable.end(buffer);
  return readable;
}

function deleteLocalFile(filePath: string) {
  try {
    const abs = path.isAbsolute(filePath)
      ? filePath
      : path.join(process.cwd(), filePath);

    if (fs.existsSync(abs)) {
      fs.unlinkSync(abs);
    }
  } catch {
    // ignore cleanup errors
  }
}

/**
 * Supports:
 * - string path
 * - multer file object (.path or .buffer)
 * - Buffer
 */
export const uploadFile = async (input: any, opts: any = {}) => {
  if (!configured) {
    const localPath =
      typeof input === "string"
        ? input
        : typeof input?.path === "string"
        ? input.path
        : null;

    if (localPath) deleteLocalFile(localPath);

    return {
      url: PLACEHOLDER_URL,
      publicId: "placeholder",
    };
  }

  try {
    // Local file path or multer disk storage
    if (
      typeof input === "string" ||
      (input && typeof input.path === "string")
    ) {
      const filePath = typeof input === "string" ? input : input.path;

      const res = await cloudinary.uploader.upload(filePath, opts);

      deleteLocalFile(filePath);

      return {
        url: res.secure_url,
        publicId: res.public_id,
      };
    }

    // Buffer / multer memory storage
    const buffer: Buffer | undefined =
      input?.buffer && Buffer.isBuffer(input.buffer)
        ? input.buffer
        : Buffer.isBuffer(input)
        ? input
        : undefined;

    if (buffer) {
      const res = await new Promise<any>((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          opts,
          (err, result) => {
            if (err) return reject(err);
            resolve(result);
          }
        );

        bufferToStream(buffer).pipe(uploadStream);
      });

      return {
        url: res.secure_url,
        publicId: res.public_id,
      };
    }

    throw new Error("Unsupported input for uploadFile");
  } catch (error) {
    throw error;
  }
};

export const deleteFile = async (publicId: string) => {
  if (!configured) return true;

  const res = await cloudinary.uploader.destroy(publicId);

  return res.result === "ok" || res.result === "not_found";
};

export default {
  uploadFile,
  deleteFile,
};
