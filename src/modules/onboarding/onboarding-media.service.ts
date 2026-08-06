import {
  confirmPublicImageUpload,
  createPublicImageUploadTicket,
  getPublicMediaUrl,
  PUBLIC_MEDIA_LIMITS,
} from "../../shared/services/public-media.service";

export type OnboardingMediaKind =
  | "asset"
  | "logo"
  | "hero"
  | "gallery"
  | "staff";

function onboardingFolder(userId: string, kind: OnboardingMediaKind) {
  return `onboarding/${userId}/${kind}`;
}

class OnboardingMediaService {
  async createUploadTicket(
    userId: string,
    kind: OnboardingMediaKind,
    contentType: string,
  ) {
    const ticket = await createPublicImageUploadTicket({
      folder: onboardingFolder(userId, kind),
      contentType,
      maxBytes: PUBLIC_MEDIA_LIMITS.onboardingBytes,
    });
    const publicUrl = getPublicMediaUrl(ticket.objectPath);
    return {
      ...ticket,
      publicId: ticket.objectPath,
      publicUrl,
      url: publicUrl,
    };
  }

  async confirm(
    userId: string,
    kind: OnboardingMediaKind,
    objectPath: string,
  ) {
    const uploaded = await confirmPublicImageUpload({
      folder: onboardingFolder(userId, kind),
      objectPath,
      maxBytes: PUBLIC_MEDIA_LIMITS.onboardingBytes,
    });
    return {
      ...uploaded,
      publicId: uploaded.objectPath,
      url: uploaded.publicUrl,
    };
  }
}

export default new OnboardingMediaService();
