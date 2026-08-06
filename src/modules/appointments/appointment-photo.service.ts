import { isModuleEnabled } from "../../shared/config/verticals.config";
import { prisma } from "../../shared/db/prisma";
import {
  confirmPrivateImageUpload,
  createPrivateImageUploadTicket,
  deletePrivateMediaQuietly,
  getPrivateMediaUrl,
  PRIVATE_MEDIA_LIMITS,
} from "../../shared/services/private-media.service";
import {
  getOwnedAppointmentOrThrow,
  invalidStateError,
  notFoundError,
} from "./appointments.helper";

export type AppointmentPhotoType = "before" | "after" | "progress";

function photoFolder(
  businessId: string,
  appointmentId: string,
  type: AppointmentPhotoType,
) {
  return `businesses/${businessId}/appointments/${appointmentId}/${type}`;
}

async function getPhotoAppointment(
  appointmentId: string,
  businessId: string,
) {
  const appointment = await getOwnedAppointmentOrThrow(
    prisma,
    appointmentId,
    businessId,
    { business: true },
  );
  if (
    !isModuleEnabled(
      appointment.business.vertical ?? "",
      "appointmentPhotos",
    )
  ) {
    throw invalidStateError(
      "Appointment photos are not enabled for this business",
      "MODULE_DISABLED",
    );
  }
  return appointment;
}

async function presentPhoto<T extends { photo: { url: string } }>(row: T) {
  return {
    ...row,
    photo: {
      ...row.photo,
      url: (await getPrivateMediaUrl(row.photo.url)) ?? row.photo.url,
    },
  };
}

class AppointmentPhotoService {
  async createUploadTicket(input: {
    appointmentId: string;
    businessId: string;
    contentType: string;
    type: AppointmentPhotoType;
  }) {
    await getPhotoAppointment(input.appointmentId, input.businessId);
    return createPrivateImageUploadTicket({
      folder: photoFolder(
        input.businessId,
        input.appointmentId,
        input.type,
      ),
      contentType: input.contentType,
      maxBytes: PRIVATE_MEDIA_LIMITS.appointmentBytes,
    });
  }

  async confirm(input: {
    appointmentId: string;
    businessId: string;
    objectPath: string;
    type: AppointmentPhotoType;
  }) {
    await getPhotoAppointment(input.appointmentId, input.businessId);
    const uploaded = await confirmPrivateImageUpload({
      folder: photoFolder(
        input.businessId,
        input.appointmentId,
        input.type,
      ),
      objectPath: input.objectPath,
      maxBytes: PRIVATE_MEDIA_LIMITS.appointmentBytes,
    });

    try {
      const row = await prisma.$transaction(async (tx) => {
        const photo = await tx.photo.create({
          data: {
            businessId: input.businessId,
            url: uploaded.objectPath,
            publicId: uploaded.objectPath,
            kind: "appointment",
            type: input.type,
          },
        });
        return tx.appointmentPhoto.create({
          data: {
            appointmentId: input.appointmentId,
            photoId: photo.id,
            type: input.type,
          },
          include: { photo: true },
        });
      });
      return presentPhoto(row);
    } catch (error) {
      await deletePrivateMediaQuietly(uploaded.objectPath);
      throw error;
    }
  }

  async list(appointmentId: string, businessId: string) {
    await getPhotoAppointment(appointmentId, businessId);
    const rows = await prisma.appointmentPhoto.findMany({
      where: { appointmentId, appointment: { businessId } },
      include: { photo: true },
      orderBy: { createdAt: "asc" },
    });
    return Promise.all(rows.map(presentPhoto));
  }

  async delete(input: {
    appointmentId: string;
    businessId: string;
    appointmentPhotoId: string;
  }) {
    await getPhotoAppointment(input.appointmentId, input.businessId);
    const row = await prisma.appointmentPhoto.findFirst({
      where: {
        id: input.appointmentPhotoId,
        appointmentId: input.appointmentId,
        appointment: { businessId: input.businessId },
      },
      include: { photo: true },
    });
    if (!row) throw notFoundError("Appointment photo not found");

    await prisma.$transaction(async (tx) => {
      await tx.appointmentPhoto.delete({ where: { id: row.id } });
      await tx.photo.delete({ where: { id: row.photoId } });
    });
    if (row.photo.publicId) {
      await deletePrivateMediaQuietly(row.photo.publicId);
    }
    return { success: true };
  }

  async presentAppointment<T extends {
    appointmentPhotos?: Array<{ photo: { url: string } }>;
  }>(appointment: T) {
    if (!appointment.appointmentPhotos) return appointment;
    return {
      ...appointment,
      appointmentPhotos: await Promise.all(
        appointment.appointmentPhotos.map(presentPhoto),
      ),
    };
  }
}

export default new AppointmentPhotoService();
