import { v2 as cloudinary } from "cloudinary";
import fs from "fs";

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

/**
 * Upload a local file path to Cloudinary. If Cloudinary is not configured,
 * returns a placeholder URL and does not throw — TODO: implement provider selection.
 */
export const uploadFile = async (filePath: string, opts: any = {}) => {
  if (!configured) {
    // TODO: replace placeholder with real upload once Cloudinary credentials are set
    return {
      url: "https://via.placeholder.com/800x600?text=upload+not+configured",
      publicId: "placeholder",
    };
  }
  try {
    const res = await cloudinary.uploader.upload(filePath, opts);
    // remove local temp file
    try {
      import { v2 as cloudinary } from "cloudinary";
      import fs from "fs";
      import stream from "stream";
      import path from "path";

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

      const PLACEHOLDER_URL = "https://via.placeholder.com/800x600?text=upload+not+configured";

      function bufferToStream(buffer: Buffer) {
        const readable = new stream.PassThrough();
        readable.end(buffer);
        return readable;
      }

      /**
       * Upload a file to Cloudinary. Supports:
       * - local file path (string)
       * - multer file object with `.path` or `.buffer`
       * - Buffer
       *
       * If Cloudinary is not configured, returns a placeholder url and cleans up
       * any local temp file if provided.
       */
      export const uploadFile = async (input: any, opts: any = {}) => {
        if (!configured) {
          // delete local tmp file if present
          try {
            const filePath = typeof input === "string" ? input : input?.path;
            if (filePath && typeof filePath === "string") {
              // only unlink if it seems to be a local path under project
              const abs = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
              if (abs.startsWith(process.cwd())) {
                try {
                  fs.unlinkSync(abs);
                } catch (e) {
                  // ignore
                }
              }
            }
          } catch (e) {
            // ignore cleanup errors
          }
          return { url: PLACEHOLDER_URL, publicId: "placeholder" };
        }

        // Actual Cloudinary upload
        try {
          // Case: local file path
          if (typeof input === "string" || (input && typeof input.path === "string")) {
            const filePath = typeof input === "string" ? input : input.path;
            const res = await cloudinary.uploader.upload(filePath, opts);
            // remove local temp file if it looks local
            try {
              const abs = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
              if (abs.startsWith(process.cwd())) fs.unlinkSync(abs);
            } catch (e) {
              // ignore unlink errors
            }
            return { url: res.secure_url || res.url, publicId: res.public_id || res.publicId };
          }

          // Case: multer in-memory buffer or raw Buffer
          const buffer: Buffer | undefined = input?.buffer && Buffer.isBuffer(input.buffer)
            ? input.buffer
            : Buffer.isBuffer(input)
            ? input
            : undefined;

          if (buffer) {
            const uploadFromBuffer = (buf: Buffer) =>
              new Promise<any>((resolve, reject) => {
                const uploadStream = cloudinary.uploader.upload_stream(opts, (err: any, result: any) => {
                  if (err) return reject(err);
                  resolve(result);
                });
                bufferToStream(buf).pipe(uploadStream);
              });

            const res = await uploadFromBuffer(buffer);
            return { url: res.secure_url || res.url, publicId: res.public_id || res.publicId };
          }

          throw new Error("Unsupported input for uploadFile");
        } catch (err) {
          throw err;
        }
      };

      export const deleteFile = async (publicId: string) => {
        if (!configured) {
          return true;
        }
        try {
          const res = await cloudinary.uploader.destroy(publicId);
          return res && (res.result === "ok" || res.result === "not_found");
        } catch (err) {
          throw err;
        }
      };

      export default { uploadFile, deleteFile };
