import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";
import crypto from "crypto";

const configured = Boolean(
  process.env.SUPABASE_URL &&
  process.env.SUPABASE_SERVICE_ROLE_KEY &&
  process.env.SUPABASE_STORAGE_BUCKET,
);

const supabase = configured
  ? createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )
  : null;

const BUCKET_NAME = process.env.SUPABASE_STORAGE_BUCKET || "uploads";

const PLACEHOLDER_URL =
  "https://via.placeholder.com/800x600?text=upload+not+configured";

type UploadFileOptions = {
  folder?: string;

  /**
   * Backward compatibility with your older call:
   * Supabase.uploadFile(file, { path: "appointments" })
   */
  path?: string;

  contentType?: string;
  upsert?: boolean;
};

function deleteLocalFile(filePath: string) {
  try {
    const abs = path.isAbsolute(filePath)
      ? filePath
      : path.join(process.cwd(), filePath);

    if (fs.existsSync(abs)) {
      fs.unlinkSync(abs);
    }
  } catch {
    // Ignore cleanup errors.
  }
}

function generateUniqueFileName(originalName?: string): string {
  const id = crypto.randomUUID();

  if (!originalName) {
    return id;
  }

  const ext = path.extname(originalName).toLowerCase();
  return `${id}${ext}`;
}

function normalizeFolder(folder?: string) {
  if (!folder) return "";

  return folder.replace(/^\/+/, "").replace(/\/+$/, "").trim();
}

function getInputOriginalName(input: any): string | undefined {
  if (input?.originalname) return input.originalname;

  if (typeof input === "string") {
    return path.basename(input);
  }

  if (typeof input?.path === "string") {
    return path.basename(input.path);
  }

  return undefined;
}

function getInputContentType(input: any, fallback?: string): string {
  if (fallback && fallback.trim()) {
    return fallback;
  }

  if (input?.mimetype && String(input.mimetype).trim()) {
    return String(input.mimetype);
  }

  if (input?.type && String(input.type).trim()) {
    return String(input.type);
  }

  return "application/octet-stream";
}

async function readInputAsBuffer(input: any) {
  let fileBody: Buffer;
  let localFilePathToDelete: string | null = null;

  if (typeof input === "string") {
    localFilePathToDelete = input;
    fileBody = fs.readFileSync(input);
    return { fileBody, localFilePathToDelete };
  }

  if (input && typeof input.path === "string") {
    localFilePathToDelete = input.path;
    fileBody = fs.readFileSync(input.path);
    return { fileBody, localFilePathToDelete };
  }

  if (input?.buffer && Buffer.isBuffer(input.buffer)) {
    fileBody = input.buffer;
    return { fileBody, localFilePathToDelete };
  }

  if (Buffer.isBuffer(input)) {
    fileBody = input;
    return { fileBody, localFilePathToDelete };
  }

  throw new Error("Unsupported input format for uploadFile");
}

export const uploadFile = async (input: any, opts: UploadFileOptions = {}) => {
  const localPath =
    typeof input === "string"
      ? input
      : typeof input?.path === "string"
        ? input.path
        : null;

  if (!configured || !supabase) {
    if (localPath) {
      deleteLocalFile(localPath);
    }

    return {
      url: PLACEHOLDER_URL,
      publicId: "placeholder",
    };
  }

  const { fileBody, localFilePathToDelete } = await readInputAsBuffer(input);

  const originalName = getInputOriginalName(input);
  const fileName = generateUniqueFileName(originalName);

  const folder = normalizeFolder(opts.folder ?? opts.path);
  const storagePath = folder ? `${folder}/${fileName}` : fileName;

  const contentType = getInputContentType(input, opts.contentType);

  const { data, error } = await supabase.storage
    .from(BUCKET_NAME)
    .upload(storagePath, fileBody, {
      upsert: opts.upsert ?? true,
      contentType,
    });

  if (localFilePathToDelete) {
    deleteLocalFile(localFilePathToDelete);
  }

  if (error) {
    throw error;
  }

  const { data: urlData } = supabase.storage
    .from(BUCKET_NAME)
    .getPublicUrl(data.path);

  return {
    url: urlData.publicUrl,
    publicId: data.path,
  };
};

export const deleteFile = async (publicId: string) => {
  if (!configured || !supabase || publicId === "placeholder") {
    return true;
  }

  const { data, error } = await supabase.storage
    .from(BUCKET_NAME)
    .remove([publicId]);

  if (error) {
    console.error("Supabase file deletion failed:", error.message);
    return false;
  }

  return Boolean(data && data.length > 0);
};

export const getUploadUrl = async (filePath: string, contentType: string) => {
  if (!configured || !supabase) {
    throw new Error("Supabase is not configured");
  }

  const { data, error } = await supabase.storage
    .from(BUCKET_NAME)
    .createSignedUploadUrl(filePath);

  if (error) {
    throw error;
  }

  const { data: urlData } = supabase.storage
    .from(BUCKET_NAME)
    .getPublicUrl(filePath);

  return {
    uploadUrl: data.signedUrl,
    publicUrl: urlData.publicUrl,
    contentType,
  };
};

export const getPublicUrl = (filePath: string): string => {
  if (!configured || !supabase) return PLACEHOLDER_URL;
  const { data } = supabase.storage.from(BUCKET_NAME).getPublicUrl(filePath);
  return data.publicUrl;
};

export default {
  uploadFile,
  deleteFile,
  getUploadUrl,
  getPublicUrl,
};
