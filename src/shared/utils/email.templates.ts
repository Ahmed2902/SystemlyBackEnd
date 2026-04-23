export const verificationEmail = ({
  name,
  verificationUrl,
}: {
  name: string;
  verificationUrl: string;
}) => {
  const safeName = name || "there";
  return `
  <!doctype html>
  <html>
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    </head>
    <body style="background:#ffffff;color:#111;font-family:Arial,Helvetica,sans-serif;margin:0;padding:0;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td align="center">
            <table width="600" cellpadding="24" cellspacing="0" style="border-collapse:collapse;">
              <tr>
                <td style="text-align:left;">
                  <h2 style="margin:0 0 8px 0;color:#111;">Verify your email to activate your Hgezli account</h2>
                  <p style="margin:0 0 18px 0;color:#333;">Hi ${safeName},</p>
                  <p style="margin:0 0 18px 0;color:#333;">Thank you for creating an account on Hgezli. To activate your account and publish your business website, please verify your email by clicking the button below.</p>
                  <div style="margin:20px 0;text-align:center;">
                    <a href="${verificationUrl}" style="background-color:#1a56db;color:#ffffff;padding:12px 20px;border-radius:6px;text-decoration:none;display:inline-block;font-weight:600;">Verify your email</a>
                  </div>
                  <p style="margin:0 0 12px 0;color:#666;font-size:13px;">If the button above does not work, copy and paste the following link into your browser:</p>
                  <p style="word-break:break-all;color:#1a56db;font-size:13px;margin:0 0 18px 0;">${verificationUrl}</p>
                  <p style="margin:0;color:#999;font-size:12px;">This link expires in 24 hours. If you did not sign up for a Hgezli account, you can safely ignore this email.</p>
                </td>
              </tr>
              <tr>
                <td style="text-align:center;color:#aaa;font-size:12px;">Hgezli &bull; Building better service websites for Egyptian businesses</td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
  </html>
  `;
};

export const welcomeEmail = ({
  name,
  dashboardUrl,
  websiteUrl,
}: {
  name: string;
  dashboardUrl: string;
  websiteUrl: string;
}) => {
  const safeName = name || "there";
  return `
  <!doctype html>
  <html>
    <body style="background:#fff;color:#111;font-family:Arial,Helvetica,sans-serif;margin:0;padding:24px;">
      <div style="max-width:600px;margin:0 auto;">
        <h2 style="color:#111;margin-top:0;">Welcome to Hgezli, ${safeName}!</h2>
        <p style="color:#333;">Congratulations — your account is active and your website is live at <a href="${websiteUrl}" style="color:#1a56db">${websiteUrl}</a>.</p>
        <p style="color:#333;">You can manage bookings and settings from your dashboard.</p>
        <p style="text-align:center;margin:24px 0;"><a href="${dashboardUrl}" style="background:#1a56db;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;">Go to dashboard</a></p>
        <p style="color:#999;font-size:13px;margin-top:12px;">If you have any questions, reply to this email and we'll help.</p>
      </div>
    </body>
  </html>
  `;
};

export const passwordResetEmail = ({
  name,
  resetUrl,
}: {
  name: string;
  resetUrl: string;
}) => {
  const safeName = name || "there";
  return `
  <!doctype html>
  <html>
    <body style="background:#fff;color:#111;font-family:Arial,Helvetica,sans-serif;margin:0;padding:24px;">
      <div style="max-width:600px;margin:0 auto;">
        <h2 style="color:#111;margin-top:0;">Reset your Hgezli password</h2>
        <p style="color:#333;">Hi ${safeName},</p>
        <p style="color:#333;">We received a request to reset your password. Click the button below to choose a new one. This link expires in 1 hour.</p>
        <p style="text-align:center;margin:24px 0;"><a href="${resetUrl}" style="background:#1a56db;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;">Reset password</a></p>
        <p style="color:#333;">If you did not request a password reset, you can safely ignore this email and your password will remain unchanged.</p>
      </div>
    </body>
  </html>
  `;
};

export default { verificationEmail, welcomeEmail, passwordResetEmail };

export const appointmentConfirmationEmail = ({
  name,
  businessName,
  serviceName,
  staffName,
  startsAt,
  cancelUrl,
}: {
  name: string;
  businessName: string;
  serviceName: string;
  staffName?: string | null;
  startsAt: string;
  cancelUrl?: string | null;
}) => {
  const safeName = name || "there";
  const safeStaff = staffName || "Staff";
  return `
  <!doctype html>
  <html>
    <body style="background:#fff;color:#111;font-family:Arial,Helvetica,sans-serif;margin:0;padding:24px;">
      <div style="max-width:600px;margin:0 auto;">
        <h2 style="color:#111;margin-top:0;">Appointment confirmation</h2>
        <p style="color:#333;">Hi ${safeName},</p>
        <p style="color:#333;">This is a confirmation for your upcoming appointment at <strong>${businessName}</strong>.</p>
        <ul style="color:#333;"><li>Service: ${serviceName}</li><li>With: ${safeStaff}</li><li>When: ${startsAt}</li></ul>
        ${
          cancelUrl
            ? `<p style="text-align:center;margin:24px 0;"><a href="${cancelUrl}" style="background:#e53e3e;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;">Cancel appointment</a></p>`
            : ""
        }
        <p style="color:#999;font-size:13px;margin-top:12px;">If you have any questions, reply to this email and we'll help.</p>
      </div>
    </body>
  </html>
  `;
};

export const appointmentReminderEmail = ({
  name,
  businessName,
  serviceName,
  staffName,
  startsAt,
  whenLabel,
}: {
  name: string;
  businessName: string;
  serviceName: string;
  staffName?: string | null;
  startsAt: string;
  whenLabel?: string;
}) => {
  const safeName = name || "there";
  const safeStaff = staffName || "Staff";
  return `
  <!doctype html>
  <html>
    <body style="background:#fff;color:#111;font-family:Arial,Helvetica,sans-serif;margin:0;padding:24px;">
      <div style="max-width:600px;margin:0 auto;">
        <h2 style="color:#111;margin-top:0;">Appointment reminder${
          whenLabel ? ` — ${whenLabel}` : ""
        }</h2>
        <p style="color:#333;">Hi ${safeName},</p>
        <p style="color:#333;">This is a reminder for your upcoming appointment at <strong>${businessName}</strong>.</p>
        <ul style="color:#333;"><li>Service: ${serviceName}</li><li>With: ${safeStaff}</li><li>When: ${startsAt}</li></ul>
        <p style="color:#999;font-size:13px;margin-top:12px;">If you need to change or cancel, please contact the business.</p>
      </div>
    </body>
  </html>
  `;
};

export const staffInviteEmail = ({
  inviterName,
  businessName,
  acceptUrl,
}: {
  inviterName?: string | null;
  businessName?: string | null;
  acceptUrl: string;
}) => {
  const inviter = inviterName || "Someone";
  const biz = businessName || "your business";
  return `
  <!doctype html>
  <html>
    <body style="background:#fff;color:#111;font-family:Arial,Helvetica,sans-serif;margin:0;padding:24px;">
      <div style="max-width:600px;margin:0 auto;">
        <h2 style="color:#111;margin-top:0;">You've been invited to join ${biz} on Hgezli</h2>
        <p style="color:#333;">Hi there,</p>
        <p style="color:#333;">${inviter} has invited you to join <strong>${biz}</strong> on Hgezli. Click the button below to accept the invitation and join the team.</p>
        <p style="text-align:center;margin:24px 0;"><a href="${acceptUrl}" style="background:#1a56db;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;">Accept invitation</a></p>
        <p style="color:#999;font-size:13px;margin-top:12px;">If you did not expect this invitation, you can ignore this email.</p>
      </div>
    </body>
  </html>
  `;
};

export const trialStartedEmail = ({
  name,
  businessName,
  planName,
  trialEnd,
}: {
  name: string;
  businessName: string;
  planName: string;
  trialEnd: string;
}) => {
  const safeName = name || "there";
  return `
  <!doctype html>
  <html>
    <body style="background:#fff;color:#111;font-family:Arial,Helvetica,sans-serif;margin:0;padding:24px;">
      <div style="max-width:600px;margin:0 auto;">
        <h2 style="color:#111;margin-top:0;">Your ${planName} trial has started</h2>
        <p style="color:#333;">Hi ${safeName},</p>
        <p style="color:#333;">Your free 14-day trial for <strong>${businessName}</strong> is active until <strong>${trialEnd}</strong>.</p>
        <p style="color:#333;">No payment details were required. To keep using the plan after the trial, upgrade from the dashboard.</p>
      </div>
    </body>
  </html>
  `;
};

export const trialEndingEmail = ({
  name,
  businessName,
  planName,
  trialEnd,
  daysLeft,
}: {
  name: string;
  businessName: string;
  planName: string;
  trialEnd: string;
  daysLeft: number;
}) => {
  const safeName = name || "there";
  return `
  <!doctype html>
  <html>
    <body style="background:#fff;color:#111;font-family:Arial,Helvetica,sans-serif;margin:0;padding:24px;">
      <div style="max-width:600px;margin:0 auto;">
        <h2 style="color:#111;margin-top:0;">Your trial ends in ${daysLeft} day(s)</h2>
        <p style="color:#333;">Hi ${safeName},</p>
        <p style="color:#333;">Your free trial for <strong>${businessName}</strong> on the <strong>${planName}</strong> plan ends on <strong>${trialEnd}</strong>.</p>
        <p style="color:#333;">To avoid interruption, please choose a paid plan from your dashboard before the trial ends.</p>
      </div>
    </body>
  </html>
  `;
};

export const trialExpiredEmail = ({
  name,
  businessName,
  planName,
  expiredAt,
}: {
  name: string;
  businessName: string;
  planName: string;
  expiredAt: string;
}) => {
  const safeName = name || "there";
  return `
  <!doctype html>
  <html>
    <body style="background:#fff;color:#111;font-family:Arial,Helvetica,sans-serif;margin:0;padding:24px;">
      <div style="max-width:600px;margin:0 auto;">
        <h2 style="color:#111;margin-top:0;">Your trial has ended</h2>
        <p style="color:#333;">Hi ${safeName},</p>
        <p style="color:#333;">Your free trial for <strong>${businessName}</strong> ended on <strong>${expiredAt}</strong>. To continue using premium features, please upgrade to a paid plan.</p>
      </div>
    </body>
  </html>
  `;
};

export const subscriptionActivatedEmail = ({
  name,
  businessName,
  planName,
  periodEnd,
}: {
  name: string;
  businessName: string;
  planName: string;
  periodEnd: string;
}) => {
  const safeName = name || "there";
  return `
  <!doctype html>
  <html>
    <body style="background:#fff;color:#111;font-family:Arial,Helvetica,sans-serif;margin:0;padding:24px;">
      <div style="max-width:600px;margin:0 auto;">
        <h2 style="color:#111;margin-top:0;">Subscription activated</h2>
        <p style="color:#333;">Hi ${safeName},</p>
        <p style="color:#333;">Your subscription for <strong>${businessName}</strong> on the <strong>${planName}</strong> plan is now active until <strong>${periodEnd}</strong>.</p>
      </div>
    </body>
  </html>
  `;
};

export const subscriptionPaymentFailedEmail = ({
  name,
  businessName,
  planName,
}: {
  name: string;
  businessName: string;
  planName: string;
}) => {
  const safeName = name || "there";
  return `
  <!doctype html>
  <html>
    <body style="background:#fff;color:#111;font-family:Arial,Helvetica,sans-serif;margin:0;padding:24px;">
      <div style="max-width:600px;margin:0 auto;">
        <h2 style="color:#111;margin-top:0;">Payment failed</h2>
        <p style="color:#333;">Hi ${safeName},</p>
        <p style="color:#333;">We were unable to process payment for <strong>${businessName}</strong> on the <strong>${planName}</strong> plan. Please update your payment details from the dashboard to avoid interruption.</p>
      </div>
    </body>
  </html>
  `;
};
