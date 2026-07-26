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
    const user = await prisma.businessUser.findUnique({ where: { id: userId } });
    if (!user) throw buildErr("User not found", 404, "NOT_FOUND");
    if (user.businessId) {
      throw buildErr("Business already exists for this user", 409, "CONFLICT");
    }

    const slugTaken = await prisma.business.findUnique({ where: { slug: input.slug } });
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
          timezone: input.timezone,
          language: input.language,
          isActive: true,
          logoUrl: input.logoUrl,
          coverUrl: input.heroPhotoUrl,
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

      const createdServices = await Promise.all(
        input.services.map((service) =>
          tx.service.create({
            data: {
              businessId: business.id,
              name: service.name,
              category: service.category,
              description: service.description,
              priceEgp: service.priceEgp,
              durationMin: service.durationMin,
            },
          }),
        ),
      );
      const serviceIdByClientId = new Map(
        input.services.map((service, index) => [service.clientId, createdServices[index].id]),
      );

      const createdStaff = await Promise.all(
        input.staff.map((staff) =>
          tx.staff.create({
            data: {
              businessId: business.id,
              name: staff.name,
              role: staff.role as Roles,
              jobTitle: staff.jobTitle,
              bio: staff.bio,
              yearsExperience: staff.yearsExperience,
              photoUrl: staff.photoUrl,
            },
          }),
        ),
      );

      const serviceStaffData = input.staff.flatMap((staff, index) =>
        staff.serviceClientIds
          .map((clientId) => serviceIdByClientId.get(clientId))
          .filter((id): id is string => Boolean(id))
          .map((serviceId) => ({
            staffId: createdStaff[index].id,
            serviceId,
            commissionType: CommissionType.NONE,
            commissionAmount: 0,
          })),
      );
      if (serviceStaffData.length > 0) {
        await tx.serviceStaff.createMany({ data: serviceStaffData });
      }

      const availabilityData = input.staff.flatMap((staff, index) =>
        staff.availability.map((availability) => ({
          staffId: createdStaff[index].id,
          dayOfWeek: availability.dayOfWeek,
          startTime: toTimeDate(availability.startTime),
          endTime: toTimeDate(availability.endTime),
        })),
      );
      if (availabilityData.length > 0) {
        await tx.availability.createMany({ data: availabilityData });
      }

      if (input.faqs.length > 0) {
        await tx.faq.createMany({
          data: input.faqs.map((faq, index) => ({
            businessId: business.id,
            question: faq.question,
            answer: faq.answer,
            displayOrder: index,
          })),
        });
      }

      const galleryPhotos = input.galleryPhotoUrls.map((url, index) => ({
        businessId: business.id,
        url,
        kind: "gallery",
        position: index,
      }));
      if (galleryPhotos.length > 0) {
        await tx.photo.createMany({ data: galleryPhotos });
      }

      return business;
    });
  }
}

export default new OnboardingService();
