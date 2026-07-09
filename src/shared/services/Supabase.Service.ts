import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";
import crypto from "crypto";

const configured = Boolean(
  process.env.SUPABASE_URL &&
  process.env.SUPABASE_SERVICE_ROLE_KEY &&
  process.env.SUPABASE_STORAGE_BUCKET,
);

// Always use the Service Role Key on the backend so your backend can bypass user-level RLS policies.
const supabase = configured
  ? createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )
  : null;

const BUCKET_NAME = process.env.SUPABASE_STORAGE_BUCKET || "uploads";
const PLACEHOLDER_URL =
  "https://via.placeholder.com/800x600?text=upload+not+configured";

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
 * Generates a unique filename while preserving extension if possible
 */
function generateUniqueFileName(originalName?: string): string {
  const uuid = crypto.randomUUID();
  if (originalName) {
    const ext = path.extname(originalName);
    return `${uuid}${ext}`;
  }
  return uuid;
}

/**
 * Supports:
 * - string path (local file path)
 * - multer file object (.path or .buffer)
 * - Buffer
 */
/**
 * Supports:
 * - string path (local absolute file path)
 * - multer disk storage object (.path)
 * - multer memory storage object (.buffer)
 * - Raw Buffer object
 */
export const uploadFile = async (input: any, opts: any = {}) => {
  if (!configured || !supabase) {
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
    let fileBody: Buffer;
    let localFilePathToDelete: string | null = null;
    let originalName: string | undefined = input?.originalname;

    // 1. Parse the input source into a standard Buffer payload
    if (
      typeof input === "string" ||
      (input && typeof input.path === "string")
    ) {
      const filePath = typeof input === "string" ? input : input.path;
      localFilePathToDelete = filePath;
      originalName =
        typeof input === "string" ? path.basename(input) : input.originalname;

      fileBody = fs.readFileSync(filePath);
    } else {
      const buffer: Buffer | undefined =
        input?.buffer && Buffer.isBuffer(input.buffer)
          ? input.buffer
          : Buffer.isBuffer(input)
            ? input
            : undefined;

      if (!buffer) {
        throw new Error("Unsupported input format for uploadFile");
      }
      fileBody = buffer;
    }

    // 2. Determine target unique filename inside your bucket
    const fileName = generateUniqueFileName(originalName);
    const storagePath = opts.path ? `${opts.path}/${fileName}` : fileName;

    // 3. Robust Content-Type verification to prevent 415 header crashes
    let detectedMimeType: string = "application/octet-stream"; // Safe default binary fallback

    if (
      input &&
      typeof input.mimetype === "string" &&
      input.mimetype.trim() !== ""
    ) {
      detectedMimeType = input.mimetype;
    } else if (
      input &&
      typeof input.type === "string" &&
      input.type.trim() !== ""
    ) {
      detectedMimeType = input.type;
    }

    // 4. Upload payload to Supabase Storage
    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(storagePath, fileBody, {
        upsert: true,
        contentType: detectedMimeType,
        ...opts,
      });

    // Clean up local system file immediately if uploaded via temporary disk storage
    if (localFilePathToDelete) {
      deleteLocalFile(localFilePathToDelete);
    }

    if (error) throw error;

    // 5. Construct and extract the Public URL
    const { data: urlData } = supabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(data.path);

    return {
      url: urlData.publicUrl,
      publicId: data.path, // Full file reference used by deleteFile logic later
    };
  } catch (error) {
    throw error;
  }
};

export const deleteFile = async (publicId: string) => {
  if (!configured || !supabase || publicId === "placeholder") return true;

  // Supabase remove expects an array of paths
  const { data, error } = await supabase.storage
    .from(BUCKET_NAME)
    .remove([publicId]);

  if (error) {
    console.error("Supabase file deletion failed:", error.message);
    return false;
  }

  // Returns true if files were removed successfully
  return data && data.length > 0;
};

export const getUploadUrl = async (filePath: string, contentType: string) => {
  if (!configured || !supabase) {
    throw new Error("Supabase is not configured");
  }

  // Generates a secure, temporary signed upload URL valid for 60 seconds
  const { data, error } = await supabase.storage
    .from(BUCKET_NAME)
    .createSignedUploadUrl(filePath);

  if (error) throw error;

  // Get the public URL that this file will have once uploaded
  const { data: urlData } = supabase.storage
    .from(BUCKET_NAME)
    .getPublicUrl(filePath);

  return {
    uploadUrl: data.signedUrl, // The frontend will PUT binary data directly to this
    publicUrl: urlData.publicUrl, // The permanent image address
  };
};

export default {
  uploadFile,
  deleteFile,
  getUploadUrl,
};
