import { Resend } from "resend";
import { EMAIL } from "../shared/config/config";

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  idempotencyKey: string;
}

export interface EmailProvider {
  send(message: EmailMessage): Promise<{ id: string | null }>;
}

export class ResendEmailProvider implements EmailProvider {
  private readonly client: Resend;
  private readonly from: string;

  constructor(
    apiKey = EMAIL.RESEND_API_KEY,
    from = EMAIL.FROM_EMAIL,
  ) {
    if (!apiKey) {
      throw new Error("RESEND_API_KEY is required to send email");
    }
    if (!from) {
      throw new Error("EMAIL_FROM is required to send email");
    }

    this.client = new Resend(apiKey);
    this.from = from;
  }

  async send(message: EmailMessage): Promise<{ id: string | null }> {
    const { data, error } = await this.client.emails.send(
      {
        from: this.from,
        to: message.to,
        subject: message.subject,
        html: message.html,
      },
      { idempotencyKey: message.idempotencyKey },
    );

    if (error) {
      throw new Error(`Resend delivery failed: ${error.message}`);
    }

    return { id: data?.id ?? null };
  }
}
