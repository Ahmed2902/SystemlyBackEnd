import crypto from "crypto";
import path from "path";
import { prisma } from "../../shared/db/prisma";
import Supabase from "../../shared/services/Supabase.Service";
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

const extensionFor = (contentType: string) => {
  if (contentType === "image/png") return ".png";
  if (contentType === "image/webp") return ".webp";
  return ".jpg";
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
        phone: input.phone.trim(),
        address: cleanNullable(input.address),
        city: cleanNullable(input.city),
        timezone: input.timezone.trim(),
        language: input.language,
      },
      select: {
        id: true,
        name: true,
        phone: true,
        address: true,
        city: true,
        timezone: true,
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

  async createBrandingUploadTicket(
    businessId: string,
    kind: "logo" | "cover",
    contentType: string,
  ) {
    const filePath = path.posix.join(
      "businesses",
      businessId,
      "branding",
      kind,
      `${crypto.randomUUID()}${extensionFor(contentType)}`,
    );
    const ticket = await Supabase.getUploadUrl(filePath, contentType);
    return { ...ticket, publicId: filePath };
  }

  async confirmBranding(
    businessId: string,
    kind: "logo" | "cover",
    publicId: string,
    publicUrl: string,
  ) {
    const expectedPrefix = `businesses/${businessId}/branding/${kind}/`;
    if (!publicId.startsWith(expectedPrefix)) {
      throw buildError("Invalid branding image path", 400, "INVALID_IMAGE_PATH");
    }

    const previous = await prisma.photo.findMany({
      where: { businessId, kind: "business_brand", type: kind },
      select: { publicId: true },
    });

    const result = await prisma.$transaction(async (tx) => {
      await tx.photo.deleteMany({
        where: { businessId, kind: "business_brand", type: kind },
      });
      const photo = await tx.photo.create({
        data: {
          businessId,
          url: publicUrl,
          publicId,
          kind: "business_brand",
          type: kind,
        },
      });
      const business = await tx.business.update({
        where: { id: businessId },
        data: kind === "logo" ? { logoUrl: publicUrl } : { coverUrl: publicUrl },
        select: { id: true, logoUrl: true, coverUrl: true },
      });
      return { photo, business };
    });

    await Promise.all(
      previous
        .map((photo) => photo.publicId)
        .filter((value): value is string => Boolean(value))
        .map((value) => Supabase.deleteFile(value)),
    );

    return result;
  }

  async removeBranding(businessId: string, kind: "logo" | "cover") {
    const photos = await prisma.photo.findMany({
      where: { businessId, kind: "business_brand", type: kind },
      select: { publicId: true },
    });

    const business = await prisma.$transaction(async (tx) => {
      await tx.photo.deleteMany({
        where: { businessId, kind: "business_brand", type: kind },
      });
      return tx.business.update({
        where: { id: businessId },
        data: kind === "logo" ? { logoUrl: null } : { coverUrl: null },
        select: { id: true, logoUrl: true, coverUrl: true },
      });
    });

    await Promise.all(
      photos
        .map((photo) => photo.publicId)
        .filter((value): value is string => Boolean(value))
        .map((value) => Supabase.deleteFile(value)),
    );

    return business;
  }
}

export default new SettingsService();
