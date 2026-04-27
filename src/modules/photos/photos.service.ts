import { prisma } from "../../shared/db/prisma";
import cloudinary from "../../shared/services/cloudinary.service";

class PhotosService {
  async uploadLogo(businessId: string, file: any) {
    const res = await cloudinary.uploadFile(file?.path || file);
    const updated = await prisma.business.update({
      where: { id: businessId },
      data: { logoUrl: res.url },
    });
    return updated;
  }

  async uploadCover(businessId: string, file: any) {
    const res = await cloudinary.uploadFile(file?.path || file);
    const updated = await prisma.business.update({
      where: { id: businessId },
      data: { coverUrl: res.url },
    });
    return updated;
  }

  async uploadGallery(_businessId: string, _file: any) {
    const res = await cloudinary.uploadFile(_file?.path || _file);
    const photo = await prisma.photo.create({
      data: {
        businessId: _businessId,
        url: res.url,
        publicId: res.publicId,
      },
    });
    return photo;
  }

  async deleteGallery(_id: string) {
    const existing = await prisma.photo.findUnique({ where: { id: _id } });
    if (!existing) {
      const err: any = new Error("Photo not found");
      err.statusCode = 404;
      err.code = "NOT_FOUND";
      throw err;
    }

    try {
      await cloudinary.deleteFile(existing.publicId);
    } catch (err) {
      console.error("Failed to delete Cloudinary file", existing.publicId, err);
    }

    await prisma.photo.delete({ where: { id: _id } });
    return { success: true };
  }
}

export default new PhotosService();
