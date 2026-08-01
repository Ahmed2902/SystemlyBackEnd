import { completeOnboardingSchema } from "../src/modules/onboarding/onboarding.schema";

function inputForRole(
  role: "Staff" | "Receptionist",
  serviceClientIds?: string[],
) {
  return {
    vertical: "salon" as const,
    templateId: "aura-wellness",
    name: "Test Salon",
    slug: `test-salon-${role.toLowerCase()}`,
    phone: "+201000000000",
    primaryColor: "#000000",
    sectionOrder: ["hero", "services"],
    showTeam: true,
    showFaq: true,
    services: [
      {
        clientId: "service-1",
        name: "Consultation",
        priceEgp: 100,
        durationMin: 30,
      },
    ],
    staff: [
      {
        clientId: "staff-1",
        name: "Alex",
        role,
        ...(serviceClientIds === undefined ? {} : { serviceClientIds }),
        availability: [],
      },
    ],
    faqs: [],
  };
}

describe("complete onboarding staff assignments", () => {
  test("allows receptionists without service assignments and defaults the list", () => {
    const parsed = completeOnboardingSchema.safeParse(
      inputForRole("Receptionist"),
    );

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.staff[0].serviceClientIds).toEqual([]);
    }
  });

  test("requires a service assignment for service providers", () => {
    const parsed = completeOnboardingSchema.safeParse(inputForRole("Staff"));

    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ path: ["staff", 0, "serviceClientIds"] }),
        ]),
      );
    }
  });

  test("allows service providers with at least one service assignment", () => {
    const parsed = completeOnboardingSchema.safeParse(
      inputForRole("Staff", ["service-1"]),
    );

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.staff[0].serviceClientIds).toEqual(["service-1"]);
    }
  });
});
