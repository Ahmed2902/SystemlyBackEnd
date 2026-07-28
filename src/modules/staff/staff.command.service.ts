import crypto from "crypto";
import path from "path";
import { prisma } from "../../shared/db/prisma";
import Supabase from "../../shared/services/Supabase.Service";
import type {
  AssignServiceInput,
  AvailabilityEntry,
  AvailabilityOverrideInput,
  CreateInviteInput,
  StaffBreakInput,
  StaffCreateInput,
  StaffTimeOffInput,
  StaffUpdateInput,
  UpdateServiceStaffInput,
} from "./staff.schema";
import staffInviteService from "./staff-invite.service";
import staffService from "./staff.service";
import staffWorkspaceService from "./staff.workspace.service";

type AuthUser = NonNullable<Express.Request["user"]>;

const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

const buildError = (message: string, statusCode: number, code: string) => {
  const error = new Error(message) as Error & { statusCode: number; code: string };
  error.statusCode = statusCode;
  error.code = code;
  return error;
};

const extensionFor = (contentType: string) => {
  if (contentType === "image/png") return ".png";
  if (contentType === "image/webp") return ".webp";
  return ".jpg";
};

class StaffCommandService {
  createStaff(user: AuthUser, payload: StaffCreateInput) {
    return staffWorkspaceService.createStaff(user, payload);
  }

  updateStaff(staffId: string, user: AuthUser, payload: StaffUpdateInput) {
    return staffWorkspaceService.updateStaff(staffId, user, payload);
  }

  deactivateStaff(staffId: string, user: AuthUser) {
    return staffWorkspaceService.deactivateStaff(staffId, user);
  }

  replaceAvailability(staffId: string, user: AuthUser, entries: AvailabilityEntry[]) {
    return staffWorkspaceService.replaceAvailability(staffId, user, entries);
  }

  createBreak(staffId: string, user: AuthUser, input: StaffBreakInput) {
    return staffWorkspaceService.createBreak(staffId, user, input);
  }

  deleteBreak(staffId: string, breakId: string, user: AuthUser) {
    return staffWorkspaceService.deleteBreak(staffId, breakId, user);
  }

  createTimeOff(staffId: string, user: AuthUser, input: StaffTimeOffInput) {
    return staffWorkspaceService.createTimeOff(staffId, user, input);
  }

  deleteTimeOff(staffId: string, timeOffId: string, user: AuthUser) {
    return staffWorkspaceService.deleteTimeOff(staffId, timeOffId, user);
  }

  assignService(staffId: string, payload: AssignServiceInput) {
    return staffService.assignService(staffId, payload);
  }

  updateServiceStaff(
    staffId: string,
    serviceId: string,
    payload: UpdateServiceStaffInput,
  ) {
    return staffService.updateServiceStaff(staffId, serviceId, payload);
  }

  unassignService(staffId: string, serviceId: string) {
    return staffService.unassignService(staffId, serviceId);
  }

  addOverride(staffId: string, payload: AvailabilityOverrideInput) {
    return staffService.addOverride(staffId, payload);
  }

  deleteOverride(overrideId: string) {
    return staffService.deleteOverride(overrideId);
  }

  createInvite(businessId: string, input: CreateInviteInput) {
    return staffInviteService.create(businessId, input);
  }

  acceptInvite(token: string, userId: string) {
    return staffInviteService.accept(token, userId);
  }

  createStaffBreak(
    businessId: string,
    payload: {
      staffId: string;
      breakDate: string;
      startTime: string;
      endTime: string;
      label?: string;
    },
  ) {
    return staffService.createStaffBreak(businessId, payload);
  }

  removeStaffBreak(businessId: string, breakId: string) {
    return staffService.removeStaffBreak(businessId, breakId);
  }

  async presignPhoto(staffId: string, businessId: string, contentType: string) {
    if (!ALLOWED_IMAGE_TYPES.has(contentType)) {
      throw buildError(
        "Only JPG, PNG, and WebP images are allowed",
        400,
        "INVALID_FILE_TYPE",
      );
    }

    const staff = await prisma.staff.findFirst({
      where: { id: staffId, businessId },
      select: { id: true },
    });
    if (!staff) throw buildError("Staff member not found", 404, "NOT_FOUND");

    const filePath = path.posix.join(
      "businesses",
      businessId,
      "staff",
      staffId,
      `${crypto.randomUUID()}${extensionFor(contentType)}`,
    );
    const ticket = await Supabase.getUploadUrl(filePath, contentType);
    return { ...ticket, publicId: filePath };
  }

  async confirmPhoto(
    staffId: string,
    businessId: string,
    publicId: string,
    publicUrl: string,
  ) {
    if (!publicId || !publicUrl) {
      throw buildError("publicId and publicUrl are required", 400, "BAD_REQUEST");
    }
    const expectedPrefix = `businesses/${businessId}/staff/${staffId}/`;
    if (!publicId.startsWith(expectedPrefix)) {
      throw buildError("Invalid staff photo path", 400, "INVALID_PHOTO_PATH");
    }

    const staff = await prisma.staff.findFirst({
      where: { id: staffId, businessId },
      select: { id: true },
    });
    if (!staff) throw buildError("Staff member not found", 404, "NOT_FOUND");

    const previous = await prisma.photo.findMany({
      where: { businessId, kind: "staff", type: staffId },
      select: { publicId: true },
    });

    const result = await prisma.$transaction(async (tx) => {
      await tx.photo.deleteMany({ where: { businessId, kind: "staff", type: staffId } });
      const photo = await tx.photo.create({
        data: { businessId, url: publicUrl, publicId, kind: "staff", type: staffId },
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

    return result;
  }

  async removePhoto(staffId: string, businessId: string) {
    const staff = await prisma.staff.findFirst({
      where: { id: staffId, businessId },
      select: { id: true },
    });
    if (!staff) throw buildError("Staff member not found", 404, "NOT_FOUND");

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

    return { id: staffId, photoUrl: null };
  }
}

export default new StaffCommandService();
