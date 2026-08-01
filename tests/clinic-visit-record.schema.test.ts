import {
  finishAppointmentSchema,
  updateAppointmentSchema,
} from "../src/modules/appointments/appointments.schema";

describe("clinic visit record schemas", () => {
  it("normalizes the new text field names for appointment updates", () => {
    const parsed = updateAppointmentSchema.parse({
      segments: [
        {
          serviceId: "6df7316a-6574-46e2-a71c-b9cabbd1ac09",
          staffId: "39e354a2-aa1b-4617-9e31-7e237e0e1284",
          startsAt: "2026-08-01T09:00:00.000Z",
          endsAt: "2026-08-01T09:30:00.000Z",
        },
      ],
      clinical: {
        diagnosisAssessment: "Contact dermatitis",
        clinicalSessionNotes: "Mild inflammation observed.",
        planAndPrescription: "Apply cream twice daily for seven days.",
      },
    });

    expect(parsed.clinical).toEqual({
      diagnosis: "Contact dermatitis",
      notes: "Mild inflammation observed.",
      prescriptionJson: "Apply cream twice daily for seven days.",
    });
  });

  it("keeps the deployed legacy payload compatible during rollout", () => {
    const parsed = finishAppointmentSchema.parse({
      clinical: {
        diagnosis: "Acne vulgaris",
        notes: "Follow-up in four weeks.",
        prescriptionJson: {
          medication: "Topical retinoid",
          frequency: "Once nightly",
        },
      },
    });

    expect(parsed.clinical).toEqual({
      diagnosis: "Acne vulgaris",
      notes: "Follow-up in four weeks.",
      prescriptionJson: JSON.stringify(
        {
          medication: "Topical retinoid",
          frequency: "Once nightly",
        },
        null,
        2,
      ),
    });
  });
});
