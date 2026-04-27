import {
  uploadGallery,
  deleteGallery,
} from "../src/modules/photos/photos.service";
import cloudinary from "../src/shared/services/cloudinary.service";
import { prisma } from "../src/shared/db/prisma";

jest.mock("../src/shared/services/cloudinary.service", () => ({
  uploadFile: jest.fn(),
  deleteFile: jest.fn(),
}));

jest.mock("../src/shared/db/prisma", () => ({
  prisma: {
    photo: {
      create: jest.fn(),
      findUnique: jest.fn(),
      delete: jest.fn(),
    },
  },
}));

describe("photos.service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("uploadGallery persists photo", async () => {
    const mockRes = { url: "https://img", publicId: "pub1" };
    (cloudinary.uploadFile as jest.Mock).mockResolvedValue(mockRes);
    (prisma.photo.create as jest.Mock).mockResolvedValue({
      id: "p1",
      url: mockRes.url,
    });

    const fakeFile: any = { path: "/tmp/file.jpg" };
    const photo = await uploadGallery("b1", fakeFile);

    expect(cloudinary.uploadFile).toHaveBeenCalledWith(fakeFile.path);
    expect(prisma.photo.create).toHaveBeenCalledWith({
      data: { businessId: "b1", url: mockRes.url, publicId: mockRes.publicId },
    });
    expect(photo).toEqual({ id: "p1", url: mockRes.url });
  });

  test("deleteGallery deletes cloudinary and db record", async () => {
    (prisma.photo.findUnique as jest.Mock).mockResolvedValue({
      id: "p1",
      publicId: "pub1",
    });
    (cloudinary.deleteFile as jest.Mock).mockResolvedValue(true);
    (prisma.photo.delete as jest.Mock).mockResolvedValue({});

    const res = await deleteGallery("p1");
    expect(prisma.photo.findUnique).toHaveBeenCalledWith({
      where: { id: "p1" },
    });
    expect(cloudinary.deleteFile).toHaveBeenCalledWith("pub1");
    expect(prisma.photo.delete).toHaveBeenCalledWith({ where: { id: "p1" } });
    expect(res).toEqual({ success: true });
  });
});
