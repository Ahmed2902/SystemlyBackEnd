import { environment } from "../config/environment";
import {
  createSupabaseClient,
  createSupabaseStorageAdapter,
  createUploadTicket,
  createUploadTicketForPath,
  deleteObjectQuietly,
  isAbsoluteMediaUrl,
  mediaError,
  normalizeMediaPath,
  type MediaStorageAdapter,
  verifyImageUpload,
} from "./media-storage.shared";

export const PUBLIC_MEDIA_LIMITS = {
  brandingBytes: 8 * 1024 * 1024,
  galleryBytes: 8 * 1024 * 1024,
  staffBytes: 8 * 1024 * 1024,
  onboardingBytes: 8 * 1024 * 1024,
} as const;

let productionAdapter: MediaStorageAdapter | null = null;
let testAdapter: MediaStorageAdapter | null = null;

function adapter() {
  if (testAdapter) return testAdapter;
  if (productionAdapter) return productionAdapter;

  const url = environment.SUPABASE_URL?.trim();
  const serviceRoleKey = environment.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const bucket = environment.SUPABASE_PUBLIC_MEDIA_BUCKET?.trim();
  if (!url || !serviceRoleKey || !bucket) {
    throw mediaError(
      "Supabase public media storage is not configured.",
      "PUBLIC_MEDIA_NOT_CONFIGURED",
      503,
    );
  }

  productionAdapter = createSupabaseStorageAdapter(
    createSupabaseClient(url, serviceRoleKey),
    bucket,
  );
  return productionAdapter;
}

export function setPublicMediaAdapterForTests(
  next: MediaStorageAdapter | null,
) {
  testAdapter = next;
}

export function createPublicImageUploadTicket(input: {
  folder: string;
  contentType: string;
  maxBytes: number;
}) {
  return createUploadTicket(adapter(), input);
}

export function createPublicImageUploadTicketForPath(input: {
  objectPath: string;
  contentType: string;
  maxBytes: number;
}) {
  return createUploadTicketForPath(adapter(), input);
}

export async function confirmPublicImageUpload(input: {
  folder: string;
  objectPath: string;
  maxBytes: number;
}) {
  const verified = await verifyImageUpload(adapter(), input);
  return {
    ...verified,
    publicUrl: adapter().getPublicUrl(verified.objectPath),
  };
}

export function getPublicMediaUrl(
  storedValue: string | null | undefined,
) {
  if (!storedValue) return null;
  if (isAbsoluteMediaUrl(storedValue)) return storedValue;
  return adapter().getPublicUrl(normalizeMediaPath(storedValue));
}

export async function deletePublicMedia(objectPath: string) {
  await adapter().deleteObject(normalizeMediaPath(objectPath));
}

export function deletePublicMediaQuietly(objectPath: string) {
  return deleteObjectQuietly(adapter(), objectPath);
}
