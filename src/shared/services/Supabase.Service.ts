import {
  createPrivateImageUploadTicketForPath,
  deletePrivateMedia,
  PRIVATE_MEDIA_LIMITS,
} from "./private-media.service";
import {
  createPublicImageUploadTicketForPath,
  deletePublicMedia,
  getPublicMediaUrl,
  PUBLIC_MEDIA_LIMITS,
} from "./public-media.service";

function isPrivateObjectPath(objectPath: string) {
  return (
    objectPath.startsWith("appointments/") ||
    objectPath.includes("/appointments/")
  );
}

/**
 * Temporary compatibility facade for legacy appointment-photo methods.
 * New module code should import public-media.service or private-media.service
 * directly. No multipart or container-local upload behavior remains here.
 */
class SupabaseStorageFacade {
  getUploadUrl(objectPath: string, contentType: string) {
    if (isPrivateObjectPath(objectPath)) {
      return createPrivateImageUploadTicketForPath({
        objectPath,
        contentType,
        maxBytes: PRIVATE_MEDIA_LIMITS.appointmentBytes,
      });
    }
    return createPublicImageUploadTicketForPath({
      objectPath,
      contentType,
      maxBytes: PUBLIC_MEDIA_LIMITS.galleryBytes,
    });
  }

  getPublicUrl(objectPath: string) {
    return isPrivateObjectPath(objectPath)
      ? objectPath
      : (getPublicMediaUrl(objectPath) ?? objectPath);
  }

  deleteFile(objectPath: string) {
    return isPrivateObjectPath(objectPath)
      ? deletePrivateMedia(objectPath)
      : deletePublicMedia(objectPath);
  }
}

export default new SupabaseStorageFacade();
