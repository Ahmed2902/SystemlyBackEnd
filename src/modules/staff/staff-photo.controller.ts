import crypto from "crypto";
import path from "path";
import type { NextFunction, Request, Response } from "express";
import Supabase from "../../shared/services/Supabase.Service";
import { prisma } from "../../shared/db/prisma";
import { fail, ok } from "../../shared/utils/response.util";

const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function extensionFor(contentType: string) {
  if (contentType === "image/png") return ".png";
  if (contentType === "image/webp") return ".webp";
  return ".jpg";
}

class StaffPhotoController {
  async presign(req: Request, res: Response, next: NextFunction) {
    try {
      const businessId = req.user?.businessId;
      if (!businessId) return fail(res, "Business id missing", 403, "FORBIDDEN");
      const staffId = String(req.params.id);
      const contentType = String(req.body?.contentType ?? "");
      if (!ALLOWED_IMAGE_TYPES.has(contentType)) {
        return fail(res, "Only JPG, PNG, and WebP images are allowed", 400, "INVALID_FILE_TYPE");
      }

      const staff = await prisma.staff.findFirst({
        where: { id: staffId, businessId },
        select: { id: true },
      });
      if (!staff) return fail(res, "Staff member not found", 404, "NOT_FOUND");

      const filePath = path.posix.join(
        "businesses",
        businessId,
        "staff",
        staffId,
        `${crypto.randomUUID()}${extensionFor(contentType)}`,
      );
      const ticket = await Supabase.getUploadUrl(filePath, contentType);
      return ok(res, { ...ticket, publicId: filePath });
    } catch (error) {
      return next(error);
    }
  }

  async confirm(req: Request, res: Response, next: NextFunction) {
    try {
      const businessId = req.user?.businessId;
      if (!businessId) return fail(res, "Business id missing", 403, "FORBIDDEN");
      const staffId = String(req.params.id);
      const publicId = String(req.body?.publicId ?? "");
      const publicUrl = String(req.body?.publicUrl ?? "");
      if (!publicId || !publicUrl) {
        return fail(res, "publicId and publicUrl are required", 400, "BAD_REQUEST");
      }
      const expectedPrefix = `businesses/${businessId}/staff/${staffId}/`;
      if (!publicId.startsWith(expectedPrefix)) {
        return fail(res, "Invalid staff photo path", 400, "INVALID_PHOTO_PATH");
      }

      const staff = await prisma.staff.findFirst({
        where: { id: staffId, businessId },
        select: { id: true },
      });
      if (!staff) return fail(res, "Staff member not found", 404, "NOT_FOUND");

      const previous = await prisma.photo.findMany({
        where: { businessId, kind: "staff", type: staffId },
        select: { id: true, publicId: true },
      });

      const result = await prisma.$transaction(async (tx) => {
        await tx.photo.deleteMany({
          where: { businessId, kind: "staff", type: staffId },
        });
        const photo = await tx.photo.create({
          data: {
            businessId,
            url: publicUrl,
            publicId,
            kind: "staff",
            type: staffId,
          },
        });
        const updated = await tx.staff.update({
          where: { id: staffId },
          data: { photoUrl: publicUrl },
          select: { id: true, photoUrl: true },
        });
        return { photo, staff: updated };
      });

      await Promise.all(
        previous
          .map((photo) => photo.publicId)
          .filter((value): value is string => Boolean(value))
          .map((value) => Supabase.deleteFile(value)),
      );

      return ok(res, result);
    } catch (error) {
      return next(error);
    }
  }

  async remove(req: Request, res: Response, next: NextFunction) {
    try {
      const businessId = req.user?.businessId;
      if (!businessId) return fail(res, "Business id missing", 403, "FORBIDDEN");
      const staffId = String(req.params.id);
      const staff = await prisma.staff.findFirst({
        where: { id: staffId, businessId },
        select: { id: true },
      });
      if (!staff) return fail(res, "Staff member not found", 404, "NOT_FOUND");

      const photos = await prisma.photo.findMany({
        where: { businessId, kind: "staff", type: staffId },
        select: { publicId: true },
      });
      await prisma.$transaction([
        prisma.staff.update({ where: { id: staffId }, data: { photoUrl: null } }),
        prisma.photo.deleteMany({ where: { businessId, kind: "staff", type: staffId } }),
      ]);
      await Promise.all(
        photos
          .map((photo) => photo.publicId)
          .filter((value): value is string => Boolean(value))
          .map((value) => Supabase.deleteFile(value)),
      );
      return ok(res, { id: staffId, photoUrl: null });
    } catch (error) {
      return next(error);
    }
  }
}

export default new StaffPhotoController();
