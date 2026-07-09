import { prisma } from "../../shared/db/prisma";
import Supabase from "../../shared/services/Supabase.Service";

export const uploadLogo = async (businessId: string, file: any) => {
  const res = await Supabase.uploadFile(file.path);
  const updated = await prisma.business.update({
    where: { id: businessId },
    data: { logoUrl: res.url },
  });
  return updated;
};

export const uploadCover = async (businessId: string, file: any) => {
  const res = await Supabase.uploadFile(file.path);
  const updated = await prisma.business.update({
    where: { id: businessId },
    data: { coverUrl: res.url },
  });
  return updated;
};

// Gallery endpoints require a Photo model to persist items. For now return TODO.
export const uploadGallery = async (_businessId: string, _file: any) => {
  const businessId = _businessId;
  const file = _file;
  const upload = await Supabase.uploadFile(file.path || file.buffer || file);

  // compute position as next available
  const count = await prisma.photo.count({ where: { businessId } });

  const created = await prisma.photo.create({
    data: {
      businessId,
      url: upload.url,
      kind: "gallery",
      position: count + 1,
      // store public id if available (schema may include publicId)
      ...(upload.publicId ? { publicId: upload.publicId } : {}),
    },
  });

  return created;
};

export const deleteGallery = async (businessId: string, id: string) => {
  const photo = await prisma.photo.findUnique({ where: { id } });
  if (!photo) {
    const err: any = new Error("Photo not found");
    err.statusCode = 404;
    err.code = "NOT_FOUND";
    throw err;
  }
  if (photo.businessId !== businessId) {
    const err: any = new Error("Photo does not belong to this business");
    err.statusCode = 403;
    err.code = "FORBIDDEN";
    throw err;
  }

  // Attempt Cloudinary cleanup if publicId present
  try {
    if ((photo as any).publicId) {
      await Supabase.deleteFile((photo as any).publicId);
    }
  } catch (e) {
    // log and continue — we still delete DB row
    // eslint-disable-next-line no-console
    console.log("[Photos] Supabase delete failed", e);
  }

  await prisma.photo.delete({ where: { id } });
  return { success: true };
};

export default { uploadLogo, uploadCover, uploadGallery, deleteGallery };
