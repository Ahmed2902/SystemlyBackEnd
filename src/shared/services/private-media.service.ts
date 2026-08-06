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

export const PRIVATE_MEDIA_LIMITS = {
  appointmentBytes: 12 * 1024 * 1024,
  readUrlTtlSeconds: 60 * 60,
} as const;

let productionAdapter: MediaStorageAdapter | null = null;
let testAdapter: MediaStorageAdapter | null = null;

function adapter() {
  if (testAdapter) return testAdapter;
  if (productionAdapter) return productionAdapter;

  const url = environment.SUPABASE_URL?.trim();
  const serviceRoleKey = environment.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const bucket = environment.SUPABASE_PRIVATE_MEDIA_BUCKET?.trim();
  if (!url || !serviceRoleKey || !bucket) {
    throw mediaError(
      "Supabase private media storage is not configured.",
      "PRIVATE_MEDIA_NOT_CONFIGURED",
      503,
    );
  }

  productionAdapter = createSupabaseStorageAdapter(
    createSupabaseClient(url, serviceRoleKey),
    bucket,
  );
  return productionAdapter;
}

export function setPrivateMediaAdapterForTests(
  next: MediaStorageAdapter | null,
) {
  testAdapter = next;
}

export function createPrivateImageUploadTicket(input: {
  folder: string;
  contentType: string;
  maxBytes: number;
}) {
  return createUploadTicket(adapter(), input);
}

export function createPrivateImageUploadTicketForPath(input: {
  objectPath: string;
  contentType: string;
  maxBytes: number;
}) {
  return createUploadTicketForPath(adapter(), input);
}

export function confirmPrivateImageUpload(input: {
  folder: string;
  objectPath: string;
  maxBytes: number;
}) {
  return verifyImageUpload(adapter(), input);
}

export async function getPrivateMediaUrl(
  storedValue: string | null | undefined,
  expiresInSeconds = PRIVATE_MEDIA_LIMITS.readUrlTtlSeconds,
) {
  if (!storedValue) return null;
  if (isAbsoluteMediaUrl(storedValue)) return storedValue;
  return adapter().createSignedReadUrl(
    normalizeMediaPath(storedValue),
    expiresInSeconds,
  );
}

export async function deletePrivateMedia(objectPath: string) {
  await adapter().deleteObject(normalizeMediaPath(objectPath));
}

export function deletePrivateMediaQuietly(objectPath: string) {
  return deleteObjectQuietly(adapter(), objectPath);
}
