import crypto from "node:crypto";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { ApplicationError } from "../errors/application-error";

export const ALLOWED_IMAGE_CONTENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export type ImageContentType = (typeof ALLOWED_IMAGE_CONTENT_TYPES)[number];

export type MediaUploadTicket = Readonly<{
  objectPath: string;
  uploadUrl: string;
  token: string;
  expiresInSeconds: number;
  maxBytes: number;
  contentType: ImageContentType;
}>;

export type VerifiedImageObject = Readonly<{
  objectPath: string;
  contentType: ImageContentType;
  size: number;
}>;

type FileInfo = Readonly<{
  size?: number | null;
  contentType?: string | null;
  metadata?: Readonly<Record<string, unknown>> | null;
}>;

export interface MediaStorageAdapter {
  createSignedUploadUrl(objectPath: string): Promise<{
    signedUrl: string;
    token: string;
  }>;
  getFileInfo(objectPath: string): Promise<FileInfo>;
  getPublicUrl(objectPath: string): string;
  createSignedReadUrl(
    objectPath: string,
    expiresInSeconds: number,
  ): Promise<string>;
  deleteObject(objectPath: string): Promise<void>;
}

export function mediaError(
  message: string,
  code: string,
  statusCode = 502,
) {
  return new ApplicationError(code, statusCode, message, {
    expose: statusCode < 500,
  });
}

export function isAbsoluteMediaUrl(value: string) {
  return /^https?:\/\//i.test(value);
}

export function normalizeMediaPath(value: string) {
  const normalized = path.posix.normalize(
    value.trim().replaceAll("\\", "/"),
  );
  if (
    !normalized ||
    normalized === "." ||
    normalized.startsWith("/") ||
    normalized.startsWith("../") ||
    normalized.includes("/../")
  ) {
    throw mediaError("Invalid media object path.", "INVALID_MEDIA_PATH", 400);
  }
  return normalized;
}

export function normalizeMediaFolder(value: string) {
  return normalizeMediaPath(value).replace(/\/+$/, "");
}

export function assertMediaPathInFolder(
  objectPath: string,
  folder: string,
) {
  const normalizedPath = normalizeMediaPath(objectPath);
  const normalizedFolder = normalizeMediaFolder(folder);
  if (!normalizedPath.startsWith(`${normalizedFolder}/`)) {
    throw mediaError(
      "Media path does not belong to this resource.",
      "INVALID_MEDIA_PATH",
      400,
    );
  }
  return normalizedPath;
}

export function parseImageContentType(value: string): ImageContentType {
  if (
    ALLOWED_IMAGE_CONTENT_TYPES.includes(value as ImageContentType)
  ) {
    return value as ImageContentType;
  }
  throw mediaError(
    "Only JPG, PNG, and WebP images are allowed.",
    "INVALID_FILE_TYPE",
    400,
  );
}

function extensionFor(contentType: ImageContentType) {
  if (contentType === "image/png") return ".png";
  if (contentType === "image/webp") return ".webp";
  return ".jpg";
}

export function createImageObjectPath(
  folder: string,
  contentType: string,
) {
  const parsedContentType = parseImageContentType(contentType);
  return path.posix.join(
    normalizeMediaFolder(folder),
    `${crypto.randomUUID()}${extensionFor(parsedContentType)}`,
  );
}

function contentTypeFromInfo(info: FileInfo): ImageContentType | null {
  const metadata = info.metadata ?? {};
  const candidates = [
    info.contentType,
    metadata.mimetype,
    metadata.mimeType,
    metadata.contentType,
  ];
  const value = candidates.find(
    (candidate): candidate is string =>
      typeof candidate === "string" && candidate.length > 0,
  );
  return value &&
    ALLOWED_IMAGE_CONTENT_TYPES.includes(value as ImageContentType)
    ? (value as ImageContentType)
    : null;
}

function sizeFromInfo(info: FileInfo) {
  const candidate = info.size ?? info.metadata?.size;
  const size = typeof candidate === "string" ? Number(candidate) : candidate;
  return typeof size === "number" && Number.isFinite(size) ? size : null;
}

export function createSupabaseStorageAdapter(
  client: SupabaseClient,
  bucketName: string,
): MediaStorageAdapter {
  const bucket = client.storage.from(bucketName);
  return {
    async createSignedUploadUrl(objectPath) {
      const { data, error } = await bucket.createSignedUploadUrl(objectPath, {
        upsert: false,
      });
      if (error || !data?.signedUrl || !data.token) {
        throw mediaError(
          error?.message || "Could not create a media upload URL.",
          "STORAGE_UPLOAD_TICKET_FAILED",
        );
      }
      return { signedUrl: data.signedUrl, token: data.token };
    },
    async getFileInfo(objectPath) {
      const { data, error } = await bucket.info(objectPath);
      if (error || !data) {
        throw mediaError(
          error?.message || "Uploaded media object was not found.",
          "STORAGE_OBJECT_NOT_FOUND",
          400,
        );
      }
      return data as FileInfo;
    },
    getPublicUrl(objectPath) {
      return bucket.getPublicUrl(objectPath).data.publicUrl;
    },
    async createSignedReadUrl(objectPath, expiresInSeconds) {
      const { data, error } = await bucket.createSignedUrl(
        objectPath,
        expiresInSeconds,
      );
      if (error || !data?.signedUrl) {
        throw mediaError(
          error?.message || "Could not create a media read URL.",
          "STORAGE_READ_URL_FAILED",
        );
      }
      return data.signedUrl;
    },
    async deleteObject(objectPath) {
      const { error } = await bucket.remove([objectPath]);
      if (error) {
        throw mediaError(error.message, "STORAGE_DELETE_FAILED");
      }
    },
  };
}

export function createSupabaseClient(url: string, serviceRoleKey: string) {
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function createUploadTicketForPath(
  adapter: MediaStorageAdapter,
  input: {
    objectPath: string;
    contentType: string;
    maxBytes: number;
  },
): Promise<MediaUploadTicket> {
  if (!Number.isSafeInteger(input.maxBytes) || input.maxBytes <= 0) {
    throw mediaError("Invalid upload size limit.", "INVALID_UPLOAD_LIMIT", 500);
  }
  const objectPath = normalizeMediaPath(input.objectPath);
  const contentType = parseImageContentType(input.contentType);
  const signed = await adapter.createSignedUploadUrl(objectPath);
  return {
    objectPath,
    uploadUrl: signed.signedUrl,
    token: signed.token,
    expiresInSeconds: 7_200,
    maxBytes: input.maxBytes,
    contentType,
  };
}

export function createUploadTicket(
  adapter: MediaStorageAdapter,
  input: {
    folder: string;
    contentType: string;
    maxBytes: number;
  },
) {
  return createUploadTicketForPath(adapter, {
    objectPath: createImageObjectPath(input.folder, input.contentType),
    contentType: input.contentType,
    maxBytes: input.maxBytes,
  });
}

export async function verifyImageUpload(
  adapter: MediaStorageAdapter,
  input: {
    folder: string;
    objectPath: string;
    maxBytes: number;
  },
): Promise<VerifiedImageObject> {
  const objectPath = assertMediaPathInFolder(
    input.objectPath,
    input.folder,
  );
  const info = await adapter.getFileInfo(objectPath);
  const contentType = contentTypeFromInfo(info);
  const size = sizeFromInfo(info);

  if (!contentType) {
    await deleteObjectQuietly(adapter, objectPath);
    throw mediaError(
      "Uploaded object is not an allowed image type.",
      "INVALID_UPLOADED_FILE_TYPE",
      400,
    );
  }
  if (size === null || size <= 0 || size > input.maxBytes) {
    await deleteObjectQuietly(adapter, objectPath);
    throw mediaError(
      `Uploaded image must be between 1 byte and ${input.maxBytes} bytes.`,
      "INVALID_UPLOADED_FILE_SIZE",
      400,
    );
  }

  return { objectPath, contentType, size };
}

export async function deleteObjectQuietly(
  adapter: MediaStorageAdapter,
  objectPath: string,
) {
  try {
    await adapter.deleteObject(normalizeMediaPath(objectPath));
  } catch {
    // Cleanup must not hide the original validation or database error.
  }
}
