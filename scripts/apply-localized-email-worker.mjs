import fs from "node:fs";

const path = "src/workers/email.worker.ts";
let source = fs.readFileSync(path, "utf8");

function replaceOnce(before, after) {
  const index = source.indexOf(before);
  if (index < 0) throw new Error(`Pattern not found: ${before.slice(0, 160)}`);
  if (source.indexOf(before, index + before.length) >= 0) {
    throw new Error(`Pattern appears more than once: ${before.slice(0, 120)}`);
  }
  source = source.slice(0, index) + after + source.slice(index + before.length);
}

replaceOnce(
`import {
  verificationEmail,
  welcomeEmail,
  passwordResetEmail,
  appointmentConfirmationEmail,
  appointmentReminderEmail,
  staffInviteEmail,
  trialStartedEmail,
  trialEndingEmail,
  trialExpiredEmail,
  subscriptionActivatedEmail,
  subscriptionPaymentFailedEmail,
} from "../shared/utils/email.templates";`,
`import {
  appointmentConfirmationEmailContent,
  appointmentReminderEmailContent,
  normalizeEmailLocale,
  passwordResetEmailContent,
  staffInviteEmailContent,
  subscriptionEmailContent,
  verificationEmailContent,
  welcomeEmailContent,
} from "../shared/utils/localized-email.templates";`,
);

replaceOnce(
`  let html = "";
  const fromAddress = EMAIL.FROM_EMAIL || "noreply@hgezli.com";`,
`  let html = "";
  const fromAddress = EMAIL.FROM_EMAIL || "noreply@systemly.app";
  const requestedLocale = normalizeEmailLocale(data.locale);`,
);

replaceOnce(
`        subject = "Verify your email to activate your Hgezli account";
        html = verificationEmail({
          name: data.name || "there",
          verificationUrl: data.verificationUrl,
        });`,
`        const content = verificationEmailContent({
          locale: requestedLocale,
          name: data.name || "",
          verificationUrl: data.verificationUrl,
        });
        subject = content.subject;
        html = content.html;`,
);

replaceOnce(
`        subject = "Welcome to Hgezli — your account is active";
        html = welcomeEmail({
          name: data.name || "there",
          dashboardUrl: data.dashboardUrl || process.env.FRONTEND_URL || "",
          websiteUrl: data.websiteUrl || process.env.FRONTEND_URL || "",
        });`,
`        const content = welcomeEmailContent({
          locale: requestedLocale,
          name: data.name || "",
          dashboardUrl: data.dashboardUrl || process.env.FRONTEND_URL || "",
        });
        subject = content.subject;
        html = content.html;`,
);

replaceOnce(
`        subject = "Reset your Hgezli password";
        html = passwordResetEmail({
          name: data.name || "there",
          resetUrl: data.resetUrl,
        });`,
`        const content = passwordResetEmailContent({
          locale: requestedLocale,
          name: data.name || "",
          resetUrl: data.resetUrl,
        });
        subject = content.subject;
        html = content.html;`,
);

replaceOnce(
`        if (subtype === "reminder") {
          subject = \`Reminder: appointment at \${businessName}\`;
          html = appointmentReminderEmail({
            name,
            businessName,
            serviceName,
            staffName,
            startsAt,
            whenLabel: data.whenLabel,
          });
        } else {
          subject = \`Your appointment at \${businessName}\`;
          html = appointmentConfirmationEmail({
            name,
            businessName,
            serviceName,
            staffName,
            startsAt,
            cancelUrl: data.cancelUrl,
          });
        }`,
`        const appointmentLocale = normalizeEmailLocale(
          data.locale ?? appt?.business?.language,
        );
        const content =
          subtype === "reminder"
            ? appointmentReminderEmailContent({
                locale: appointmentLocale,
                name,
                businessName,
                serviceName,
                staffName,
                startsAt,
                whenLabel: data.whenLabel,
              })
            : appointmentConfirmationEmailContent({
                locale: appointmentLocale,
                name,
                businessName,
                serviceName,
                staffName,
                startsAt,
                cancelUrl: data.cancelUrl,
              });
        subject = content.subject;
        html = content.html;`,
);

replaceOnce(
`      case "subscription": {
        const subtype = data.subtype || "default";
        if (subtype === "staff_invite") {
          subject = \`${data.businessName || "Hgezli"}: Invitation to join\`;
          html = staffInviteEmail({
            inviterName: data.inviterName,
            businessName: data.businessName,
            acceptUrl: data.acceptUrl,
          });
        } else if (subtype === "trial_started") {
          subject = \`Your ${data.planName} trial has started\`;
          html = trialStartedEmail({
            name: data.name || "there",
            businessName: data.businessName || "",
            planName: data.planName || "",
            trialEnd: data.trialEnd || "",
          });
        } else if (subtype === "trial_ending") {
          subject = \`Trial ending in ${data.daysLeft} day(s) — ${data.businessName}\`;
          html = trialEndingEmail({
            name: data.name || "there",
            businessName: data.businessName || "",
            planName: data.planName || "",
            trialEnd: data.trialEnd || "",
            daysLeft: data.daysLeft || 0,
          });
        } else if (subtype === "trial_expired") {
          subject = \`Trial ended — ${data.businessName}\`;
          html = trialExpiredEmail({
            name: data.name || "there",
            businessName: data.businessName || "",
            planName: data.planName || "",
            expiredAt: data.expiredAt || "",
          });
        } else if (subtype === "subscription_activated") {
          subject = \`Subscription active — ${data.businessName}\`;
          html = subscriptionActivatedEmail({
            name: data.name || "there",
            businessName: data.businessName || "",
            planName: data.planName || "",
            periodEnd: data.periodEnd || "",
          });
        } else if (subtype === "subscription_payment_failed") {
          subject = \`Payment failed — ${data.businessName}\`;
          html = subscriptionPaymentFailedEmail({
            name: data.name || "there",
            businessName: data.businessName || "",
            planName: data.planName || "",
          });
        }
        break;
      }`,
`      case "subscription": {
        const subtype = data.subtype || "default";
        const locale = normalizeEmailLocale(data.locale);
        const content =
          subtype === "staff_invite"
            ? staffInviteEmailContent({
                locale,
                inviterName: data.inviterName,
                businessName: data.businessName || "Systemly",
                acceptUrl: data.acceptUrl,
              })
            : subscriptionEmailContent({
                locale,
                subtype,
                name: data.name,
                businessName: data.businessName,
                planName: data.planName,
                trialEnd: data.trialEnd,
                daysLeft: data.daysLeft,
                expiredAt: data.expiredAt,
                periodEnd: data.periodEnd,
              });
        subject = content.subject;
        html = content.html;
        break;
      }`,
);

fs.writeFileSync(path, source);
console.log(`updated ${path}`);
