import { Resend } from "resend";
// @ts-ignore legacy Brevo package has no complete bundled types
import SibApiV3Sdk from "sib-api-v3-sdk";
import { EMAIL } from "../config/config";

export type EmailProviderName = "resend" | "brevo";

export type TransactionalEmail = {
  to: string | string[];
  subject: string;
  html: string;
  from?: string;
};

export type EmailDeliveryResult = {
  provider: EmailProviderName;
  messageId?: string;
};

let resendClient: Resend | null = null;
let brevoClient: any | null = null;

function configuredProvider(): EmailProviderName {
  const requested = process.env.EMAIL_PROVIDER?.trim().toLowerCase();
  if (requested === "resend" || requested === "brevo") return requested;
  if (EMAIL.RESEND_API_KEY) return "resend";
  if (EMAIL.BREVO_API_KEY) return "brevo";
  throw new Error(
    "No transactional email provider configured. Set EMAIL_PROVIDER and its API key.",
  );
}

function sender(from?: string) {
  return from || EMAIL.FROM_EMAIL || "Hgezli <noreply@hgezli.com>";
}

async function sendWithResend(email: TransactionalEmail): Promise<EmailDeliveryResult> {
  if (!EMAIL.RESEND_API_KEY) throw new Error("Missing RESEND_API_KEY");
  resendClient ??= new Resend(EMAIL.RESEND_API_KEY);
  const response = await resendClient.emails.send({
    from: sender(email.from),
    to: Array.isArray(email.to) ? email.to : [email.to],
    subject: email.subject,
    html: email.html,
  });
  if (response.error) throw new Error(response.error.message);
  return { provider: "resend", messageId: response.data?.id };
}

function getBrevoClient() {
  if (!EMAIL.BREVO_API_KEY) throw new Error("Missing BREVO_API_KEY");
  if (!brevoClient) {
    const client = SibApiV3Sdk.ApiClient.instance;
    client.authentications["api-key"].apiKey = EMAIL.BREVO_API_KEY;
    brevoClient = new SibApiV3Sdk.TransactionalEmailsApi();
  }
  return brevoClient;
}

function brevoSender(value: string) {
  const match = /^(.*?)\s*<([^>]+)>$/.exec(value.trim());
  return match
    ? { name: match[1].trim() || "Hgezli", email: match[2].trim() }
    : { email: value.trim() };
}

async function sendWithBrevo(email: TransactionalEmail): Promise<EmailDeliveryResult> {
  const response = await getBrevoClient().sendTransacEmail({
    sender: brevoSender(sender(email.from)),
    to: (Array.isArray(email.to) ? email.to : [email.to]).map((address) => ({
      email: address,
    })),
    subject: email.subject,
    htmlContent: email.html,
  });
  return {
    provider: "brevo",
    messageId: response?.messageId || response?.body?.messageId,
  };
}

export async function sendTransactionalEmail(
  email: TransactionalEmail,
): Promise<EmailDeliveryResult> {
  const provider = configuredProvider();
  return provider === "resend" ? sendWithResend(email) : sendWithBrevo(email);
}

export function getConfiguredEmailProvider() {
  return configuredProvider();
}
