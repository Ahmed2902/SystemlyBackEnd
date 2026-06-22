import { Prisma } from "@prisma/client";
import { prisma } from "../../shared/db/prisma";
import {
  createEmptyOnboardingDraft,
  createEmptySiteDraft,
  deriveEnvelopeFromSiteDraft,
  normalizeOnboardingDraft,
  normalizeOnboardingSlug,
  projectSiteDraftToWebsiteContent,
  validatePublishableDraft,
} from "./website-setup.helpers";
import type {
  BusinessSiteDraftDto,
  OnboardingDraftDto,
  SaveWebsiteSetupInput,
  UpdateSiteDraftInput,
} from "./website-setup.schema";

type WebsiteSetupRecord = Awaited<
  ReturnType<typeof prisma.websiteSetup.findUnique>
>;

const buildErr = (
  message: string,
  statusCode: number,
  code: string,
  fieldErrors?: Record<string, string>
) => {
  const err: any = new Error(message);
  err.statusCode = statusCode;
  err.code = code;
  if (fieldErrors) {
    err.fieldErrors = fieldErrors;
  }
  return err;
};

const toJson = (value: unknown): Prisma.InputJsonValue =>
  value as Prisma.InputJsonValue;

const parseJson = <T>(value: Prisma.JsonValue | null | undefined): T =>
  value as T;

class WebsiteSetupService {
  private async getBusinessOrThrow(businessId: string) {
    const business = await prisma.business.findUnique({
      where: { id: businessId },
      include: {
        websiteContent: true,
      },
    });

    if (!business) {
      throw buildErr("Business not found", 404, "NOT_FOUND");
    }

    return business;
  }

  private buildDefaultDraftFromBusiness(
    business: Awaited<ReturnType<WebsiteSetupService["getBusinessOrThrow"]>>
  ): OnboardingDraftDto {
    const siteDraft = createEmptySiteDraft();
    siteDraft.basics.address = business.address || "";
    siteDraft.basics.category = business.vertical || "";
    siteDraft.basics.city = business.city || "";
    siteDraft.basics.name = business.name || "";
    siteDraft.basics.slug = business.slug || "";
    siteDraft.basics.whatsapp = business.phone || "";
    siteDraft.content.about = business.websiteContent?.aboutText || "";
    siteDraft.content.metaDescription =
      business.websiteContent?.metaDescription || "";
    siteDraft.content.tagline = business.websiteContent?.tagline || "";
    siteDraft.imagery.heroImage = business.coverUrl || "";
    siteDraft.presetId =
      business.websiteContent?.template === "minimal" ? "minimal" : "modern";
    siteDraft.template =
      business.websiteContent?.template === "minimal" ? "minimal" : "modern";
    siteDraft.theme.fontId =
      (business.websiteContent?.font as BusinessSiteDraftDto["theme"]["fontId"]) ||
      "geist";
    siteDraft.theme.primaryColor = business.websiteContent?.primaryColor || "";
    siteDraft.theme.secondaryColor =
      business.websiteContent?.secondaryColor || "";
    siteDraft.sections.order = Array.isArray(business.websiteContent?.sectionOrder)
      ? (business.websiteContent?.sectionOrder as string[])
      : siteDraft.sections.order;

    return deriveEnvelopeFromSiteDraft(siteDraft, {
      publishedAt: business.isActive ? new Date().toISOString() : null,
      step: 1,
      templateId: siteDraft.presetId,
      uploadStatus: siteDraft.imagery.heroImage ? "uploaded" : "idle",
    });
  }

  private toWebsiteSetupResponse(record: NonNullable<WebsiteSetupRecord>) {
    const draft = parseJson<OnboardingDraftDto>(record.draftEnvelope);
    return {
      businessId: record.businessId,
      draft,
      ok: true,
      publishedAt: record.publishedAt?.toISOString() || null,
      savedAt: record.updatedAt.toISOString(),
      version: record.version,
    };
  }

  private assertVersion(
    existing: WebsiteSetupRecord,
    expectedVersion: number
  ) {
    if (!existing && expectedVersion !== 0) {
      throw buildErr(
        "Website setup version conflict.",
        409,
        "VERSION_CONFLICT"
      );
    }

    if (existing && existing.version !== expectedVersion) {
      throw buildErr(
        "Website setup version conflict.",
        409,
        "VERSION_CONFLICT"
      );
    }
  }

  async getWebsiteSetup(businessId: string) {
    const [business, existing] = await Promise.all([
      this.getBusinessOrThrow(businessId),
      prisma.websiteSetup.findUnique({ where: { businessId } }),
    ]);

    if (!existing) {
      const draft = this.buildDefaultDraftFromBusiness(business);
      return {
        businessId,
        draft,
        ok: true,
        publishedAt: null,
        savedAt: null,
        version: 0,
      };
    }

    return this.toWebsiteSetupResponse(existing);
  }

  async checkSlugAvailability(businessId: string, slug: string) {
    const normalizedSlug = normalizeOnboardingSlug(slug);
    const business = await this.getBusinessOrThrow(businessId);

    if (!normalizedSlug) {
      return {
        available: false,
        ok: true,
        reason: "invalid",
        slug: normalizedSlug,
      };
    }

    if (business.slug === normalizedSlug) {
      return { available: true, ok: true, slug: normalizedSlug };
    }

    const existing = await prisma.business.findUnique({
      where: { slug: normalizedSlug },
      select: { id: true },
    });

    if (existing && existing.id !== businessId) {
      return {
        available: false,
        ok: true,
        reason: "taken",
        slug: normalizedSlug,
      };
    }

    return { available: true, ok: true, slug: normalizedSlug };
  }

  async saveWebsiteSetup(
    businessId: string,
    ownerUserId: string,
    payload: SaveWebsiteSetupInput
  ) {
    await this.getBusinessOrThrow(businessId);
    const existing = await prisma.websiteSetup.findUnique({ where: { businessId } });
    this.assertVersion(existing, payload.expectedVersion);

    const normalizedDraft = normalizeOnboardingDraft(payload.draft);
    const version = (existing?.version || 0) + 1;

    const saved = existing
      ? await prisma.websiteSetup.update({
          where: { businessId },
          data: {
            draftEnvelope: toJson(normalizedDraft),
            ownerUserId,
            siteDraft: toJson(normalizedDraft.siteDraft),
            step: normalizedDraft.step,
            templateId: normalizedDraft.templateId,
            version,
          },
        })
      : await prisma.websiteSetup.create({
          data: {
            businessId,
            draftEnvelope: toJson(normalizedDraft),
            ownerUserId,
            publishedAt: normalizedDraft.publishedAt
              ? new Date(normalizedDraft.publishedAt)
              : null,
            siteDraft: toJson(normalizedDraft.siteDraft),
            step: normalizedDraft.step,
            templateId: normalizedDraft.templateId,
            version,
          },
        });

    return this.toWebsiteSetupResponse(saved);
  }

  async updateSiteDraft(
    businessId: string,
    ownerUserId: string,
    payload: UpdateSiteDraftInput
  ) {
    await this.getBusinessOrThrow(businessId);
    const existing = await prisma.websiteSetup.findUnique({ where: { businessId } });
    this.assertVersion(existing, payload.expectedVersion);

    const previousEnvelope = existing
      ? parseJson<OnboardingDraftDto>(existing.draftEnvelope)
      : createEmptyOnboardingDraft();

    const envelope = deriveEnvelopeFromSiteDraft(payload.draft, {
      publishedAt: existing?.publishedAt?.toISOString() || null,
      step: existing?.step || previousEnvelope.step || 1,
      templateId: payload.draft.presetId,
      uploadStatus: previousEnvelope.imagery.uploadStatus,
    });

    const version = (existing?.version || 0) + 1;

    const saved = existing
      ? await prisma.websiteSetup.update({
          where: { businessId },
          data: {
            draftEnvelope: toJson(envelope),
            ownerUserId,
            siteDraft: toJson(payload.draft),
            step: envelope.step,
            templateId: envelope.templateId,
            version,
          },
        })
      : await prisma.websiteSetup.create({
          data: {
            businessId,
            draftEnvelope: toJson(envelope),
            ownerUserId,
            siteDraft: toJson(payload.draft),
            step: envelope.step,
            templateId: envelope.templateId,
            version,
          },
        });

    return {
      businessId: saved.businessId,
      draft: parseJson<BusinessSiteDraftDto>(saved.siteDraft),
      ok: true,
      savedAt: saved.updatedAt.toISOString(),
      version: saved.version,
    };
  }

  async publishWebsiteSetup(
    businessId: string,
    ownerUserId: string,
    payload: SaveWebsiteSetupInput
  ) {
    await this.getBusinessOrThrow(businessId);
    const existing = await prisma.websiteSetup.findUnique({ where: { businessId } });
    this.assertVersion(existing, payload.expectedVersion);

    const normalizedDraft = normalizeOnboardingDraft(payload.draft);
    const publishValidation = validatePublishableDraft(normalizedDraft);
    if (!publishValidation.valid) {
      throw buildErr(
        "Website setup is not ready to publish.",
        422,
        "PUBLISH_VALIDATION_FAILED",
        publishValidation.fieldErrors
      );
    }

    const slugOwner = await prisma.business.findUnique({
      where: { slug: normalizedDraft.basics.slug },
      select: { id: true },
    });

    if (slugOwner && slugOwner.id !== businessId) {
      throw buildErr("Slug is already taken.", 409, "SLUG_TAKEN", {
        slug: "This page link is already used by another business.",
      });
    }

    const publishedAt = new Date();
    const publishedDraft: OnboardingDraftDto = {
      ...normalizedDraft,
      publishedAt: publishedAt.toISOString(),
      siteDraft: {
        ...normalizedDraft.siteDraft,
        basics: {
          ...normalizedDraft.siteDraft.basics,
          slug: normalizedDraft.basics.slug,
        },
      },
    };

    const websiteContentProjection = projectSiteDraftToWebsiteContent(
      publishedDraft.siteDraft
    );
    const version = (existing?.version || 0) + 1;

    const saved = await prisma.$transaction(async (tx) => {
      await tx.business.update({
        where: { id: businessId },
        data: {
          city: publishedDraft.basics.city || null,
          coverUrl: publishedDraft.siteDraft.imagery.heroImage || null,
          isActive: true,
          name: publishedDraft.basics.businessName,
          phone: publishedDraft.basics.whatsapp,
          slug: publishedDraft.basics.slug,
          vertical: publishedDraft.basics.category || null,
        },
      });

      const existingWebsiteContent = await tx.websiteContent.findUnique({
        where: { businessId },
      });

      if (existingWebsiteContent) {
        await tx.websiteContent.update({
          where: { businessId },
          data: websiteContentProjection,
        });
      } else {
        await tx.websiteContent.create({
          data: {
            businessId,
            ...websiteContentProjection,
          },
        });
      }

      if (existing) {
        return tx.websiteSetup.update({
          where: { businessId },
          data: {
            draftEnvelope: toJson(publishedDraft),
            ownerUserId,
            publishedAt,
            siteDraft: toJson(publishedDraft.siteDraft),
            step: publishedDraft.step,
            templateId: publishedDraft.templateId,
            version,
          },
        });
      }

      return tx.websiteSetup.create({
        data: {
          businessId,
          draftEnvelope: toJson(publishedDraft),
          ownerUserId,
          publishedAt,
          siteDraft: toJson(publishedDraft.siteDraft),
          step: publishedDraft.step,
          templateId: publishedDraft.templateId,
          version,
        },
      });
    });

    return {
      businessId,
      draft: parseJson<OnboardingDraftDto>(saved.draftEnvelope),
      ok: true,
      publicUrl: `/${publishedDraft.basics.slug}`,
      publishedAt: publishedAt.toISOString(),
      version: saved.version,
    };
  }
}

const websiteSetupService = new WebsiteSetupService();
export default websiteSetupService;
