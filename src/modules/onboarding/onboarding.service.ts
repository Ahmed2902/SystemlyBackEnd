import { prisma } from "../../shared/db/prisma";
import { CompleteOnboardingInput } from "./onboarding.schema";
import { Roles, CommissionType } from "@prisma/client";

const buildErr = (
  message: string,
  statusCode: number,
  code = "BAD_REQUEST",
) => {
  const err: any = new Error(message);
  err.statusCode = statusCode;
  err.code = code;
  return err;
};

const EPOCH_DATE = "1970-01-01";
const toTimeDate = (hhmm: string) => new Date(`${EPOCH_DATE}T${hhmm}:00.000Z`);

class OnboardingService {
  async completeOnboarding(userId: string, input: CompleteOnboardingInput) {
    const user = await prisma.businessUser.findUnique({
      where: { id: userId },
    });
    if (!user) throw buildErr("User not found", 404, "NOT_FOUND");
    if (user.businessId)
      throw buildErr("Business already exists for this user", 409, "CONFLICT");

    const slugTaken = await prisma.business.findUnique({
      where: { slug: input.slug },
    });
    if (slugTaken) throw buildErr("Slug already taken", 409, "SLUG_TAKEN");

    return prisma.$transaction(async (tx) => {
      const business = await tx.business.create({
        data: {
          name: input.name,
          slug: input.slug,
          vertical: input.vertical,
          phone: input.phone,
          city: input.city,
          address: input.address,
          isActive: true,
        },
      });

      await tx.businessUser.update({
        where: { id: userId },
        data: { businessId: business.id, role: Roles.BusinessAdmin },
      });

      await tx.websiteContent.create({
        data: {
          businessId: business.id,
          template: input.templateId,
          tagline: input.tagline,
          aboutText: input.aboutText,
          primaryColor: input.primaryColor,
          sectionOrder: input.sectionOrder,
          showTeam: input.showTeam,
          showFaq: input.showFaq,
          instagramUrl: input.instagram,
          whatsappNumber: input.whatsapp,
        },
      });

      // Services created individually — need real IDs back for staff/service correlation
      const createdServices = await Promise.all(
        input.services.map((s) =>
          tx.service.create({
            data: {
              businessId: business.id,
              name: s.name,
              category: s.category,
              priceEgp: s.priceEgp,
              durationMin: s.durationMin,
            },
          }),
        ),
      );
      const serviceIdByClientId = new Map(
        input.services.map((s, i) => [s.clientId, createdServices[i].id]),
      );

      const createdStaff = await Promise.all(
        input.staff.map((s) =>
          tx.staff.create({
            data: {
              businessId: business.id,
              name: s.name,
              role: s.role as Roles,
              photoUrl: s.photoUrl,
            },
          }),
        ),
      );

      const serviceStaffData = input.staff.flatMap((s, i) =>
        s.serviceClientIds
          .map((clientId) => serviceIdByClientId.get(clientId))
          .filter((id): id is string => Boolean(id))
          .map((serviceId) => ({
            staffId: createdStaff[i].id,
            serviceId,
            commissionType: CommissionType.NONE,
            commissionAmount: 0,
          })),
      );
      if (serviceStaffData.length > 0) {
        await tx.serviceStaff.createMany({ data: serviceStaffData });
      }

      const availabilityData = input.staff.flatMap((s, i) =>
        s.availability.map((a) => ({
          staffId: createdStaff[i].id,
          dayOfWeek: a.dayOfWeek,
          startTime: toTimeDate(a.startTime),
          endTime: toTimeDate(a.endTime),
        })),
      );
      if (availabilityData.length > 0) {
        await tx.availability.createMany({ data: availabilityData });
      }

      if (input.faqs.length > 0) {
        await tx.faq.createMany({
          data: input.faqs.map((f, i) => ({
            businessId: business.id,
            question: f.question,
            answer: f.answer,
            displayOrder: i,
          })),
        });
      }

      const photos = [
        ...(input.heroPhotoUrl
          ? [{ url: input.heroPhotoUrl, kind: "hero", position: 0 }]
          : []),
        ...input.galleryPhotoUrls.map((url, i) => ({
          url,
          kind: "gallery",
          position: i,
        })),
      ];
      if (photos.length > 0) {
        await tx.photo.createMany({
          data: photos.map((p) => ({ ...p, businessId: business.id })),
        });
      }

      return business;
    });
  }
}

export default new OnboardingService();
