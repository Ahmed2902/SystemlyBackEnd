import { businessSiteDraftSchema } from "./website-setup.schema";

const defaultHours = () =>
  Object.fromEntries(
    ["sat", "sun", "mon", "tue", "wed", "thu", "fri"].map((day) => [
      day,
      { closed: true, start: "09:00", end: "17:00" },
    ]),
  );

export function createEmptyOnboardingDraft(): any {
  return {
    basics: {
      businessName: "",
      category: "",
      city: "",
      slug: "",
      tagline: "",
      whatsapp: "",
    },
    imagery: { coverPhotoUrl: "", logoUrl: "", galleryPhotoUrls: [] },
    services: [],
    staff: [
      {
        id: "",
        name: "",
        role: "",
        assignedServiceIds: [],
        hours: defaultHours(),
      },
    ],
    siteDraft: {
      basics: { name: "", slug: "", city: "" },
      content: { tagline: "" },
      imagery: { heroImage: "" },
      services: [],
      staff: [],
      sections: { order: ["hero", "about", "services", "contact"] },
    },
  };
}

export function deriveEnvelopeFromSiteDraft(siteDraft: any) {
  return { siteDraft };
}

export function normalizeOnboardingSlug(value: string) {
  return String(value ?? "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function normalizeOnboardingDraft(draft: any) {
  const slug = normalizeOnboardingSlug(
    draft.basics?.slug ?? draft.basics?.businessName ?? "",
  );
  const siteDraft = {
    ...draft.siteDraft,
    basics: {
      ...draft.siteDraft?.basics,
      name: draft.basics?.businessName ?? "",
      slug,
      city: draft.basics?.city ?? "",
    },
    content: {
      ...draft.siteDraft?.content,
      tagline: draft.basics?.tagline ?? "",
    },
    imagery: {
      ...draft.siteDraft?.imagery,
      heroImage: draft.imagery?.coverPhotoUrl ?? "",
    },
    services: draft.services ?? [],
    staff: draft.staff ?? [],
  };
  return { ...draft, basics: { ...draft.basics, slug }, siteDraft };
}

export function validatePublishableDraft(draft: any) {
  const fieldErrors: Record<string, string> = {};
  const normalized = normalizeOnboardingDraft(draft);
  if (!normalized.siteDraft.basics.slug)
    fieldErrors.slug = "A slug is required";
  if (!normalized.services?.length)
    fieldErrors.services = "Add at least one service";
  if (
    !normalized.staff?.length ||
    normalized.staff.every((member: any) => !member.name?.trim())
  )
    fieldErrors.staff = "Add at least one staff member";
  const parsed = businessSiteDraftSchema.safeParse(normalized.siteDraft);
  if (!parsed.success && !fieldErrors.services)
    fieldErrors.services = "Review services and staff assignments";
  return { valid: Object.keys(fieldErrors).length === 0, fieldErrors };
}
