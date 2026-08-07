import { prisma } from "../../shared/db/prisma";
import {
  confirmPublicImageUpload,
  createPublicImageUploadTicket,
  deletePublicMediaQuietly,
  getPublicMediaUrl,
  PUBLIC_MEDIA_LIMITS,
} from "../../shared/services/public-media.service";
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

function staffPhotoFolder(businessId: string, staffId: string) {
  return `businesses/${businessId}/staff/${staffId}`;
}

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

  replaceAvailability(
    staffId: string,
    user: AuthUser,
    entries: AvailabilityEntry[],
  ) {
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

  async presignPhoto(
    staffId: string,
    businessId: string,
    contentType: string,
  ) {
    const ticket = await createPublicImageUploadTicket({
      folder: staffPhotoFolder(businessId, staffId),
      contentType,
      maxBytes: PUBLIC_MEDIA_LIMITS.staffBytes,
    });
    return {
      ...ticket,
      publicId: ticket.objectPath,
      publicUrl: getPublicMediaUrl(ticket.objectPath),
    };
  }

  async confirmPhoto(
    staffId: string,
    businessId: string,
    objectPath: string,
    _ignoredClientUrl?: string,
  ) {
    const uploaded = await confirmPublicImageUpload({
      folder: staffPhotoFolder(businessId, staffId),
      objectPath,
      maxBytes: PUBLIC_MEDIA_LIMITS.staffBytes,
    });
    const previous = await prisma.photo.findMany({
      where: { businessId, kind: "staff", type: staffId },
      select: { publicId: true },
    });

    try {
      const result = await prisma.$transaction(async (tx) => {
        await tx.photo.deleteMany({
          where: { businessId, kind: "staff", type: staffId },
        });
        const photo = await tx.photo.create({
          data: {
            businessId,
            url: uploaded.publicUrl,
            publicId: uploaded.objectPath,
            kind: "staff",
            type: staffId,
          },
        });
        const updated = await tx.staff.update({
          where: { id: staffId },
          data: { photoUrl: uploaded.publicUrl },
          select: { id: true, photoUrl: true },
        });
        return { photo, staff: updated };
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

  async removePhoto(staffId: string, businessId: string) {
    const photos = await prisma.photo.findMany({
      where: { businessId, kind: "staff", type: staffId },
      select: { publicId: true },
    });

    await prisma.$transaction([
      prisma.staff.update({
        where: { id: staffId },
        data: { photoUrl: null },
      }),
      prisma.photo.deleteMany({
        where: { businessId, kind: "staff", type: staffId },
      }),
    ]);

    await Promise.all(
      photos
        .map((photo) => photo.publicId)
        .filter((value): value is string => Boolean(value))
        .map(deletePublicMediaQuietly),
    );

    return { id: staffId, photoUrl: null };
  }
}

export default new StaffCommandService();
