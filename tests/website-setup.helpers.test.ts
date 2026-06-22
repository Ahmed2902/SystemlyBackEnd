import {
  createEmptyOnboardingDraft,
  deriveEnvelopeFromSiteDraft,
  normalizeOnboardingDraft,
  normalizeOnboardingSlug,
  validatePublishableDraft,
} from "../src/modules/website-setup/website-setup.helpers";
import { businessSiteDraftSchema } from "../src/modules/website-setup/website-setup.schema";

describe("website setup helpers", () => {
  test("normalizes onboarding slug like the frontend rules", () => {
    expect(normalizeOnboardingSlug("  Noor Clinic!!! Cairo  ")).toBe(
      "noor-clinic-cairo"
    );
    expect(normalizeOnboardingSlug("---A__B---")).toBe("a-b");
  });

  test("normalizes onboarding draft mirrors into canonical site draft", () => {
    const draft = createEmptyOnboardingDraft();
    draft.basics.businessName = "Noor Clinic";
    draft.basics.category = "Dermatology clinic";
    draft.basics.city = "Cairo";
    draft.basics.slug = "Noor Clinic";
    draft.basics.tagline = "Modern skin care.";
    draft.basics.whatsapp = "+201001112223";
    draft.imagery.coverPhotoUrl = "https://example.com/cover.jpg";
    draft.services = [
      {
        duration: "30 min",
        id: "svc_1",
        name: "Consultation",
        price: "500",
        summary: "",
      },
    ];
    draft.staff = [
      {
        assignedServiceIds: ["svc_1"],
        hours: draft.staff[0]?.hours || {
          sat: { closed: false, start: "09:00", end: "17:00" },
          sun: { closed: false, start: "09:00", end: "17:00" },
          mon: { closed: false, start: "09:00", end: "17:00" },
          tue: { closed: false, start: "09:00", end: "17:00" },
          wed: { closed: false, start: "09:00", end: "17:00" },
          thu: { closed: false, start: "09:00", end: "17:00" },
          fri: { closed: false, start: "09:00", end: "17:00" },
        },
        id: "staff_1",
        name: "Dr Noor",
        role: "Doctor",
      },
    ];

    const normalized = normalizeOnboardingDraft(draft);

    expect(normalized.basics.slug).toBe("noor-clinic");
    expect(normalized.siteDraft.basics.name).toBe("Noor Clinic");
    expect(normalized.siteDraft.content.tagline).toBe("Modern skin care.");
    expect(normalized.siteDraft.imagery.heroImage).toBe(
      "https://example.com/cover.jpg"
    );
  });

  test("rejects duplicate ids and invalid section references", () => {
    const siteDraft = deriveEnvelopeFromSiteDraft(createEmptyOnboardingDraft().siteDraft)
      .siteDraft;
    siteDraft.services = [
      { duration: "30", id: "svc_1", name: "A", price: "", summary: "" },
      { duration: "45", id: "svc_1", name: "B", price: "", summary: "" },
    ];
    siteDraft.staff = [
      {
        assignedServiceIds: ["missing"],
        hours: {
          sat: { closed: false, start: "09:00", end: "17:00" },
          sun: { closed: false, start: "09:00", end: "17:00" },
          mon: { closed: false, start: "09:00", end: "17:00" },
          tue: { closed: false, start: "09:00", end: "17:00" },
          wed: { closed: false, start: "09:00", end: "17:00" },
          thu: { closed: false, start: "09:00", end: "17:00" },
          fri: { closed: false, start: "09:00", end: "17:00" },
        },
        id: "staff_1",
        name: "A",
        photoUrl: "",
        role: "Role",
        summary: "",
      },
    ];
    siteDraft.sections.order = ["hero", "custom-missing"];

    const parsed = businessSiteDraftSchema.safeParse(siteDraft);
    expect(parsed.success).toBe(false);
  });

  test("publish validation enforces required fields", () => {
    const result = validatePublishableDraft(createEmptyOnboardingDraft());
    expect(result.valid).toBe(false);
    expect(result.fieldErrors.slug).toBeDefined();
    expect(result.fieldErrors.services).toBeDefined();
    expect(result.fieldErrors.staff).toBeDefined();
  });
});
