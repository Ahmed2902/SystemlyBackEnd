import { prisma } from "../../shared/db/prisma";
import {
  confirmPublicImageUpload,
  createPublicImageUploadTicket,
  deletePublicMediaQuietly,
  getPublicMediaUrl,
  PUBLIC_MEDIA_LIMITS,
} from "../../shared/services/public-media.service";

export type BusinessMediaKind = "logo" | "cover" | "gallery";

const buildError = (message: string, statusCode: number, code: string) => {
  const error = new Error(message) as Error & {
    statusCode: number;
    code: string;
  };
  error.statusCode = statusCode;
  error.code = code;
  return error;
};

function mediaFolder(businessId: string, kind: BusinessMediaKind) {
  return `businesses/${businessId}/${kind}`;
}

function sizeLimit(kind: BusinessMediaKind) {
  return kind === "gallery"
    ? PUBLIC_MEDIA_LIMITS.galleryBytes
    : PUBLIC_MEDIA_LIMITS.brandingBytes;
}

export async function createUploadTicket(
  businessId: string,
  kind: BusinessMediaKind,
  contentType: string,
) {
  const ticket = await createPublicImageUploadTicket({
    folder: mediaFolder(businessId, kind),
    contentType,
    maxBytes: sizeLimit(kind),
  });
  return {
    ...ticket,
    publicId: ticket.objectPath,
    publicUrl: getPublicMediaUrl(ticket.objectPath),
  };
}

export async function confirmUpload(input: {
  businessId: string;
  kind: BusinessMediaKind;
  objectPath: string;
}) {
  const { businessId, kind, objectPath } = input;
  const uploaded = await confirmPublicImageUpload({
    folder: mediaFolder(businessId, kind),
    objectPath,
    maxBytes: sizeLimit(kind),
  });

  if (kind === "gallery") {
    const position = await prisma.photo.count({
      where: { businessId, kind: "gallery" },
    });
    try {
      return await prisma.photo.create({
        data: {
          businessId,
          url: uploaded.publicUrl,
          publicId: uploaded.objectPath,
          kind: "gallery",
          position,
        },
      });
    } catch (error) {
      await deletePublicMediaQuietly(uploaded.objectPath);
      throw error;
    }
  }

  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { id: true },
  });
  if (!business) {
    await deletePublicMediaQuietly(uploaded.objectPath);
    throw buildError("Business not found", 404, "NOT_FOUND");
  }

  const previous = await prisma.photo.findMany({
    where: { businessId, kind: "business_brand", type: kind },
    select: { publicId: true },
  });

  try {
    const result = await prisma.$transaction(async (tx) => {
      await tx.photo.deleteMany({
        where: { businessId, kind: "business_brand", type: kind },
      });
      const photo = await tx.photo.create({
        data: {
          businessId,
          url: uploaded.publicUrl,
          publicId: uploaded.objectPath,
          kind: "business_brand",
          type: kind,
        },
      });
      const updatedBusiness = await tx.business.update({
        where: { id: businessId },
        data:
          kind === "logo"
            ? { logoUrl: uploaded.publicUrl }
            : { coverUrl: uploaded.publicUrl },
        select: { id: true, logoUrl: true, coverUrl: true },
      });
      return { photo, business: updatedBusiness };
    });

    await Promise.all(
      previous
        .map((photo) => photo.publicId)
        .filter((value): value is string => Boolean(value))
        .map(deletePublicMediaQuietly),
    );
    return result;
  } catch (error) {
    await deletePublicMediaQuietly(uploaded.objectPath);
    throw error;
  }
}

export async function removeBranding(
  businessId: string,
  kind: "logo" | "cover",
) {
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
      .map(deletePublicMediaQuietly),
  );
  return business;
}

export async function deleteGallery(businessId: string, id: string) {
  const photo = await prisma.photo.findFirst({
    where: { id, businessId, kind: "gallery" },
  });
  if (!photo) throw buildError("Photo not found", 404, "NOT_FOUND");

  await prisma.photo.delete({ where: { id: photo.id } });
  if (photo.publicId) await deletePublicMediaQuietly(photo.publicId);
  return { success: true };
}

export default {
  createUploadTicket,
  confirmUpload,
  removeBranding,
  deleteGallery,
};
