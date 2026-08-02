import {
  registerBodySchema,
  updatePreferredLanguageBodySchema,
} from "../src/modules/auth/auth.schema";
import { createReceiptDocument } from "../src/modules/invoices/receipt-pdf";
import {
  appointmentConfirmationEmailContent,
  passwordResetEmailContent,
  verificationEmailContent,
} from "../src/shared/utils/localized-email.templates";

function pdfBytes(document: NodeJS.ReadableStream & { end: () => void }) {
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    document.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    document.on("error", reject);
    document.on("end", () => resolve(Buffer.concat(chunks)));
    document.end();
  });
}

const receiptFixture = {
  invoiceNumber: "INV-2026-0001",
  issuedAt: new Date("2026-08-02T10:00:00.000Z"),
  paidAt: new Date("2026-08-02T10:05:00.000Z"),
  currency: "EGP",
  subtotalCents: 125000,
  discountCents: 0,
  taxCents: 0,
  totalCents: 125000,
  paymentMethod: "CASH",
  paymentReference: null,
  notes: "شكراً لزيارتكم",
  business: {
    name: "عيادة النور",
    address: "مدينة نصر",
    city: "القاهرة",
    phone: "01012345678",
    timezone: "Africa/Cairo",
  },
  customer: {
    name: "أحمد حسن",
    phone: "01112345678",
  },
  paidBy: { name: "سارة محمد" },
  lineItems: [
    {
      id: "line-1",
      description: "استشارة طبية",
      quantity: 1,
      unitPriceCents: 125000,
      totalCents: 125000,
    },
  ],
};

describe("platform language contracts", () => {
  it("keeps registration backward-compatible and accepts Arabic preference", () => {
    const base = {
      name: "Ahmed Hassan",
      email: "AHMED@example.com",
      password: "securePass123",
      phone: "01012345678",
    };

    expect(registerBodySchema.parse(base).preferredLanguage).toBeUndefined();
    expect(
      registerBodySchema.parse({ ...base, preferredLanguage: "ar" })
        .preferredLanguage,
    ).toBe("ar");
    expect(() =>
      registerBodySchema.parse({ ...base, preferredLanguage: "fr" }),
    ).toThrow();
  });

  it("accepts only supported authenticated preferences", () => {
    expect(
      updatePreferredLanguageBodySchema.parse({ preferredLanguage: "en" }),
    ).toEqual({ preferredLanguage: "en" });
    expect(() =>
      updatePreferredLanguageBodySchema.parse({ preferredLanguage: "fr" }),
    ).toThrow();
  });
});

describe("localized backend output", () => {
  it("renders natural RTL Arabic account emails", () => {
    const verification = verificationEmailContent({
      locale: "ar",
      name: "أحمد",
      verificationUrl: "https://systemly.app/verify-email?token=test",
    });
    const reset = passwordResetEmailContent({
      locale: "ar",
      name: "أحمد",
      resetUrl: "https://systemly.app/reset-password?token=test",
    });

    expect(verification.subject).toContain("فعّل بريدك الإلكتروني");
    expect(verification.html).toContain('lang="ar" dir="rtl"');
    expect(verification.html).toContain("تفعيل البريد الإلكتروني");
    expect(reset.subject).toContain("إعادة تعيين كلمة مرور");
    expect(reset.html).not.toContain("Hgezli");
  });

  it("keeps Latin digits in Arabic appointment communication", () => {
    const content = appointmentConfirmationEmailContent({
      locale: "ar",
      name: "أحمد",
      businessName: "عيادة النور",
      serviceName: "استشارة",
      startsAt: "2026-08-02T10:30:00.000Z",
    });

    expect(content.html).toMatch(/[0-9]/);
    expect(content.html).not.toMatch(/[٠-٩]/);
    expect(content.subject).toContain("تم تأكيد موعدك");
  });

  it("generates an English receipt PDF with multilingual business data", async () => {
    const receipt = await pdfBytes(createReceiptDocument(receiptFixture));

    expect(receipt.subarray(0, 4).toString()).toBe("%PDF");
    expect(receipt.length).toBeGreaterThan(1000);
  });
});
