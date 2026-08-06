import {
  confirmPublicImageUpload,
  createPublicImageUploadTicket,
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
  createUploadTicket(
    userId: string,
    kind: OnboardingMediaKind,
    contentType: string,
  ) {
    return createPublicImageUploadTicket({
      folder: onboardingFolder(userId, kind),
      contentType,
      maxBytes: PUBLIC_MEDIA_LIMITS.onboardingBytes,
    });
  }

  confirm(
    userId: string,
    kind: OnboardingMediaKind,
    objectPath: string,
  ) {
    return confirmPublicImageUpload({
      folder: onboardingFolder(userId, kind),
      objectPath,
      maxBytes: PUBLIC_MEDIA_LIMITS.onboardingBytes,
    });
  }
}

export default new OnboardingMediaService();
