import type { MediaStorageAdapter } from "../src/shared/services/media-storage.shared";
import {
  confirmPrivateImageUpload,
  createPrivateImageUploadTicket,
  getPrivateMediaUrl,
  setPrivateMediaAdapterForTests,
} from "../src/shared/services/private-media.service";
import {
  confirmPublicImageUpload,
  createPublicImageUploadTicket,
  setPublicMediaAdapterForTests,
} from "../src/shared/services/public-media.service";

function adapter(overrides: Partial<MediaStorageAdapter> = {}): MediaStorageAdapter {
  return {
    createSignedUploadUrl: jest.fn(async (objectPath: string) => ({
      signedUrl: `https://upload.example/${objectPath}`,
      token: "upload-token",
    })),
    getFileInfo: jest.fn(async () => ({
      size: 1024,
      contentType: "image/jpeg",
    })),
    getPublicUrl: jest.fn(
      (objectPath: string) => `https://public.example/${objectPath}`,
    ),
    createSignedReadUrl: jest.fn(
      async (objectPath: string) => `https://private.example/${objectPath}`,
    ),
    deleteObject: jest.fn(async () => undefined),
    ...overrides,
  };
}

afterEach(() => {
  setPublicMediaAdapterForTests(null);
  setPrivateMediaAdapterForTests(null);
});

describe("shared media storage", () => {
  test("generates a server-owned public path and stable public URL", async () => {
    const fake = adapter();
    setPublicMediaAdapterForTests(fake);

    const ticket = await createPublicImageUploadTicket({
      folder: "businesses/business-1/gallery",
      contentType: "image/jpeg",
      maxBytes: 2048,
    });
    expect(ticket.objectPath).toMatch(
      /^businesses\/business-1\/gallery\/[0-9a-f-]+\.jpg$/,
    );

    const confirmed = await confirmPublicImageUpload({
      folder: "businesses/business-1/gallery",
      objectPath: ticket.objectPath,
      maxBytes: 2048,
    });
    expect(confirmed.publicUrl).toBe(
      `https://public.example/${ticket.objectPath}`,
    );
  });

  test("uses signed reads for private appointment media", async () => {
    const fake = adapter();
    setPrivateMediaAdapterForTests(fake);

    const ticket = await createPrivateImageUploadTicket({
      folder: "businesses/business-1/appointments/appointment-1/before",
      contentType: "image/png",
      maxBytes: 2048,
    });
    await confirmPrivateImageUpload({
      folder: "businesses/business-1/appointments/appointment-1/before",
      objectPath: ticket.objectPath,
      maxBytes: 2048,
    });

    expect(await getPrivateMediaUrl(ticket.objectPath)).toBe(
      `https://private.example/${ticket.objectPath}`,
    );
  });

  test("rejects a confirmation path outside the owned folder", async () => {
    setPublicMediaAdapterForTests(adapter());
    await expect(
      confirmPublicImageUpload({
        folder: "businesses/business-1/gallery",
        objectPath: "businesses/business-2/gallery/stolen.jpg",
        maxBytes: 2048,
      }),
    ).rejects.toMatchObject({ code: "INVALID_MEDIA_PATH" });
  });

  test("deletes an oversized uploaded object", async () => {
    const fake = adapter({
      getFileInfo: jest.fn(async () => ({
        size: 4096,
        contentType: "image/jpeg",
      })),
    });
    setPrivateMediaAdapterForTests(fake);

    await expect(
      confirmPrivateImageUpload({
        folder: "businesses/business-1/appointments/appointment-1/progress",
        objectPath:
          "businesses/business-1/appointments/appointment-1/progress/file.jpg",
        maxBytes: 2048,
      }),
    ).rejects.toMatchObject({ code: "INVALID_UPLOADED_FILE_SIZE" });
    expect(fake.deleteObject).toHaveBeenCalled();
  });
});
