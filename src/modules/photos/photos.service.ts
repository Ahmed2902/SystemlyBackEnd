import { prisma } from "../../shared/db/prisma";
import cloudinary from "../../shared/services/cloudinary.service";

export const uploadLogo = async (businessId: string, file: any) => {
  const res = await cloudinary.uploadFile(file.path);
  const updated = await prisma.business.update({
    where: { id: businessId },
    data: { logoUrl: res.url },
  });
  return updated;
};

export const uploadCover = async (businessId: string, file: any) => {
  const res = await cloudinary.uploadFile(file.path);
  const updated = await prisma.business.update({
    where: { id: businessId },
    data: { coverUrl: res.url },
  });
  return updated;
};

// Gallery endpoints require a Photo model to persist items. For now return TODO.
export const uploadGallery = async (_businessId: string, _file: any) => {
  // TODO: implement gallery model and persist uploaded urls
  return {
    message: "NOT_IMPLEMENTED",
    todo: "Add Photo model and persist gallery entries",
  };
};

export const deleteGallery = async (_id: string) => {
  // TODO: implement deletion once Photo model exists
  return {
    message: "NOT_IMPLEMENTED",
    todo: "Delete gallery photo by id after adding Photo model",
  };
};

export default { uploadLogo, uploadCover, uploadGallery, deleteGallery };
