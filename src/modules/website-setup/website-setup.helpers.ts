import type { BusinessSiteDraftDto, OnboardingDraftDto } from "./website-setup.schema";

const TEMPLATE_TO_RUNTIME_TEMPLATE: Record<OnboardingDraftDto["templateId"], BusinessSiteDraftDto["template"]> =
  {
    modern: "modern",
    "calm-clinic": "modern",
    "salon-editorial": "modern",
    minimal: "minimal",
  };

export const normalizeOnboardingSlug = (input: string) => {
  if (!input || typeof input !== "string") return "";
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/g, "");
};

const createDefaultDayHours = () => ({
  closed: false,
  start: "09:00",
  end: "17:00",
});

export const createDefaultWeeklyHours = (): OnboardingDraftDto["staff"][number]["hours"] => ({
  sat: createDefaultDayHours(),
  sun: createDefaultDayHours(),
  mon: createDefaultDayHours(),
  tue: createDefaultDayHours(),
  wed: createDefaultDayHours(),
  thu: createDefaultDayHours(),
  fri: createDefaultDayHours(),
});

export const createEmptySiteDraft = (): BusinessSiteDraftDto => ({
  basics: {
    address: "",
    category: "",
    city: "",
    name: "",
    slug: "",
    whatsapp: "",
  },
  content: {
    about: "",
    amenities: [],
    announcementBar: "",
    bookingCta: "",
    customSections: [],
    faq: [],
    heroSubtitle: "",
    heroTitle: "",
    metaDescription: "",
    policies: [],
    stats: [],
    tagline: "",
    testimonials: [],
    trustHighlights: [],
  },
  imagery: {
    alt: "",
    eyebrow: "",
    heroImage: "",
    heroNote: "",
    previewImage: "",
    previewNote: "",
    tags: [],
  },
  presetId: "modern",
  sections: {
    hidden: [],
    order: ["hero", "services", "testimonials", "faq", "team", "booking"],
  },
  services: [],
  staff: [],
  template: "modern",
  theme: {
    fontId: "geist",
    primaryColor: "",
    secondaryColor: "",
  },
});

export const createEmptyOnboardingDraft = (): OnboardingDraftDto => ({
  basics: {
    businessName: "",
    category: "",
    city: "",
    slug: "",
    tagline: "",
    whatsapp: "",
  },
  imagery: {
    coverPhotoUrl: "",
    uploadStatus: "idle",
  },
  publishedAt: null,
  services: [],
  siteDraft: createEmptySiteDraft(),
  staff: [],
  step: 1,
  templateId: "modern",
});

const mapTemplateIdToTemplate = (
  templateId: OnboardingDraftDto["templateId"]
): BusinessSiteDraftDto["template"] => TEMPLATE_TO_RUNTIME_TEMPLATE[templateId];

export const deriveSiteDraftFromEnvelope = (
  draft: OnboardingDraftDto
): BusinessSiteDraftDto => {
  const existing = draft.siteDraft || createEmptySiteDraft();
  const existingStaffById = new Map(existing.staff.map((item) => [item.id, item]));

  return {
    ...existing,
    basics: {
      ...existing.basics,
      category: draft.basics.category || existing.basics.category,
      city: draft.basics.city || existing.basics.city,
      name: draft.basics.businessName || existing.basics.name,
      slug: normalizeOnboardingSlug(draft.basics.slug || existing.basics.slug),
      whatsapp: draft.basics.whatsapp || existing.basics.whatsapp,
    },
    content: {
      ...existing.content,
      tagline: draft.basics.tagline || existing.content.tagline,
    },
    imagery: {
      ...existing.imagery,
      heroImage: draft.imagery.coverPhotoUrl || existing.imagery.heroImage,
    },
    presetId: draft.templateId,
    services: draft.services.map((service) => ({ ...service })),
    staff: draft.staff.map((member) => {
      const current = existingStaffById.get(member.id);
      return {
        assignedServiceIds: [...member.assignedServiceIds],
        hours: member.hours,
        id: member.id,
        name: member.name,
        photoUrl: current?.photoUrl || "",
        role: member.role,
        summary: current?.summary || "",
      };
    }),
    template: mapTemplateIdToTemplate(draft.templateId),
  };
};

export const deriveEnvelopeFromSiteDraft = (
  siteDraft: BusinessSiteDraftDto,
  options?: {
    publishedAt?: string | null;
    step?: number;
    templateId?: OnboardingDraftDto["templateId"];
    uploadStatus?: OnboardingDraftDto["imagery"]["uploadStatus"];
  }
): OnboardingDraftDto => ({
  basics: {
    businessName: siteDraft.basics.name,
    category: siteDraft.basics.category,
    city: siteDraft.basics.city,
    slug: normalizeOnboardingSlug(siteDraft.basics.slug),
    tagline: siteDraft.content.tagline,
    whatsapp: siteDraft.basics.whatsapp,
  },
  imagery: {
    coverPhotoUrl: siteDraft.imagery.heroImage,
    uploadStatus:
      options?.uploadStatus || (siteDraft.imagery.heroImage ? "uploaded" : "idle"),
  },
  publishedAt: options?.publishedAt ?? null,
  services: siteDraft.services.map((service) => ({ ...service })),
  siteDraft,
  staff: siteDraft.staff.map((member) => ({
    assignedServiceIds: [...member.assignedServiceIds],
    hours: member.hours,
    id: member.id,
    name: member.name,
    role: member.role,
  })),
  step: Math.max(1, Math.min(6, options?.step ?? 1)),
  templateId: options?.templateId || siteDraft.presetId,
});

export const normalizeOnboardingDraft = (
  draft: OnboardingDraftDto
): OnboardingDraftDto => {
  const siteDraft = deriveSiteDraftFromEnvelope({
    ...draft,
    basics: {
      ...draft.basics,
      slug: normalizeOnboardingSlug(draft.basics.slug),
    },
  });

  return deriveEnvelopeFromSiteDraft(siteDraft, {
    publishedAt: draft.publishedAt,
    step: draft.step,
    templateId: draft.templateId,
    uploadStatus: draft.imagery.uploadStatus,
  });
};

export const projectSiteDraftToWebsiteContent = (siteDraft: BusinessSiteDraftDto) => {
  const hidden = new Set(siteDraft.sections.hidden);
  return {
    aboutText: siteDraft.content.about || null,
    font: siteDraft.theme.fontId || null,
    metaDescription: siteDraft.content.metaDescription || null,
    metaTitle:
      siteDraft.content.heroTitle || siteDraft.basics.name || siteDraft.content.tagline || null,
    primaryColor: siteDraft.theme.primaryColor || null,
    secondaryColor: siteDraft.theme.secondaryColor || null,
    sectionOrder: siteDraft.sections.order,
    showFaq: !hidden.has("faq"),
    showReviews:
      !hidden.has("testimonials") && siteDraft.content.testimonials.length > 0,
    showTeam: !hidden.has("team"),
    tagline: siteDraft.content.tagline || null,
    template: siteDraft.template || null,
  };
};

export const validatePublishableDraft = (draft: OnboardingDraftDto) => {
  const fieldErrors: Record<string, string> = {};
  const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

  if (!draft.basics.businessName.trim()) {
    fieldErrors.businessName = "Business name is required.";
  }
  if (!draft.basics.category.trim()) {
    fieldErrors.category = "Category is required.";
  }
  if (!draft.basics.city.trim()) {
    fieldErrors.city = "City is required.";
  }
  if (!draft.basics.slug.trim()) {
    fieldErrors.slug = "Slug is required.";
  } else if (!slugRegex.test(draft.basics.slug)) {
    fieldErrors.slug = "Slug format is invalid.";
  }
  if (!draft.basics.tagline.trim()) {
    fieldErrors.tagline = "Tagline is required.";
  }
  if (!draft.basics.whatsapp.trim()) {
    fieldErrors.whatsapp = "WhatsApp is required.";
  }
  if (draft.services.length === 0) {
    fieldErrors.services = "At least one service is required.";
  }
  if (
    draft.services.some(
      (service) => !service.name.trim() || !service.duration.trim()
    )
  ) {
    fieldErrors.services = "Every service must include a name and duration.";
  }
  if (draft.staff.length === 0) {
    fieldErrors.staff = "At least one staff member is required.";
  }
  if (
    draft.staff.some(
      (member) =>
        !member.name.trim() || member.assignedServiceIds.length === 0
    )
  ) {
    fieldErrors.staff =
      "Every staff member must have a name and at least one assigned service.";
  }

  return {
    fieldErrors,
    valid: Object.keys(fieldErrors).length === 0,
  };
};
