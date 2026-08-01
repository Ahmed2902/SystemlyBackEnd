import fs from "node:fs";

const path = "src/workers/email.worker.ts";
let source = fs.readFileSync(path, "utf8");

function replaceRequired(pattern, replacement, label) {
  if (!pattern.test(source)) {
    if (source.includes(replacement.trim().slice(0, 80))) {
      console.log(`${label} already applied`);
      return;
    }
    throw new Error(`Could not apply ${label}`);
  }
  source = source.replace(pattern, replacement);
  console.log(`applied ${label}`);
}

replaceRequired(
  /import \{\s*verificationEmail,[\s\S]*?subscriptionPaymentFailedEmail,\s*\} from "\.\.\/shared\/utils\/email\.templates";/,
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
  "localized email imports",
);

replaceRequired(
  /  let html = "";\n  const fromAddress = EMAIL\.FROM_EMAIL \|\| "noreply@hgezli\.com";/,
  `  let html = "";
  const fromAddress = EMAIL.FROM_EMAIL || "noreply@systemly.app";
  const requestedLocale = normalizeEmailLocale(data.locale);`,
  "worker locale",
);

replaceRequired(
  /        subject = "Verify your email to activate your Hgezli account";\n        html = verificationEmail\(\{[\s\S]*?        \}\);/,
  `        const content = verificationEmailContent({
          locale: requestedLocale,
          name: data.name || "",
          verificationUrl: data.verificationUrl,
        });
        subject = content.subject;
        html = content.html;`,
  "verification email",
);

replaceRequired(
  /        subject = "Welcome to Hgezli — your account is active";\n        html = welcomeEmail\(\{[\s\S]*?        \}\);/,
  `        const content = welcomeEmailContent({
          locale: requestedLocale,
          name: data.name || "",
          dashboardUrl: data.dashboardUrl || process.env.FRONTEND_URL || "",
        });
        subject = content.subject;
        html = content.html;`,
  "welcome email",
);

replaceRequired(
  /        subject = "Reset your Hgezli password";\n        html = passwordResetEmail\(\{[\s\S]*?        \}\);/,
  `        const content = passwordResetEmailContent({
          locale: requestedLocale,
          name: data.name || "",
          resetUrl: data.resetUrl,
        });
        subject = content.subject;
        html = content.html;`,
  "password reset email",
);

replaceRequired(
  /        if \(subtype === "reminder"\) \{[\s\S]*?        \}\n\n        \/\/ Determine recipient/,
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
        html = content.html;

        // Determine recipient`,
  "appointment emails",
);

replaceRequired(
  /      case "subscription": \{[\s\S]*?        break;\n      \}\n\n      case "invoice":/,
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
      }

      case "invoice":`,
  "subscription emails",
);

fs.writeFileSync(path, source);
console.log(`updated ${path}`);
