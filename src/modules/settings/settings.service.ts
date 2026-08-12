import { prisma } from "../../shared/db/prisma";
import * as photosService from "../photos/photos.service";
import type {
  UpdateBusinessSettingsInput,
  UpdateWebsiteSettingsInput,
} from "./settings.schema";

const buildError = (message: string, statusCode: number, code: string) => {
  const error = new Error(message) as Error & {
    statusCode: number;
    code: string;
  };
  error.statusCode = statusCode;
  error.code = code;
  return error;
};

const cleanNullable = (value: string | null | undefined) => {
  if (value === undefined) return undefined;
  const normalized = value?.trim();
  return normalized ? normalized : null;
};

class SettingsService {
  async getWorkspace(businessId: string) {
    const business = await prisma.business.findUnique({
      where: { id: businessId },
      select: {
        id: true,
        name: true,
        slug: true,
        vertical: true,
        phone: true,
        address: true,
        city: true,
        logoUrl: true,
        coverUrl: true,
        timezone: true,
        language: true,
        isActive: true,
        websiteContent: true,
      },
    });
    if (!business) throw buildError("Business not found", 404, "NOT_FOUND");
    return business;
  }

  async updateBusiness(
    businessId: string,
    input: UpdateBusinessSettingsInput,
  ) {
    return prisma.business.update({
      where: { id: businessId },
      data: {
        name: input.name.trim(),
        language: input.language,
      },
      select: {
        id: true,
        name: true,
        language: true,
      },
    });
  }

  async updateWebsite(
    businessId: string,
    input: UpdateWebsiteSettingsInput,
  ) {
    const values = {
      tagline: cleanNullable(input.tagline),
      aboutText: cleanNullable(input.aboutText),
      template: cleanNullable(input.template),
      primaryColor: cleanNullable(input.primaryColor),
      secondaryColor: cleanNullable(input.secondaryColor),
      font: cleanNullable(input.font),
      showTeam: input.showTeam,
      showFaq: input.showFaq,
      showReviews: input.showReviews,
      metaTitle: cleanNullable(input.metaTitle),
      metaDescription: cleanNullable(input.metaDescription),
      instagramUrl: cleanNullable(input.instagramUrl),
      whatsappNumber: cleanNullable(input.whatsappNumber),
    };

    return prisma.websiteContent.upsert({
      where: { businessId },
      update: values,
      create: { businessId, ...values },
    });
  }

  async publish(businessId: string, isActive: boolean) {
    return prisma.business.update({
      where: { id: businessId },
      data: { isActive },
      select: { id: true, isActive: true },
    });
  }

  createBrandingUploadTicket(
    businessId: string,
    kind: "logo" | "cover",
    contentType: string,
  ) {
    return photosService.createUploadTicket(businessId, kind, contentType);
  }

  confirmBranding(
    businessId: string,
    kind: "logo" | "cover",
    objectPath: string,
  ) {
    return photosService.confirmUpload({ businessId, kind, objectPath });
  }

  removeBranding(businessId: string, kind: "logo" | "cover") {
    return photosService.removeBranding(businessId, kind);
  }
}

export default new SettingsService();