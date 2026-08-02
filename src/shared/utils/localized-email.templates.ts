export type EmailLocale = "en" | "ar";

export function normalizeEmailLocale(value?: string | null): EmailLocale {
  return value === "ar" ? "ar" : "en";
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatDateTime(value: string | Date, locale: EmailLocale): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return escapeHtml(value);
  return new Intl.DateTimeFormat(
    locale === "ar" ? "ar-EG-u-nu-latn" : "en-EG",
    {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: "Africa/Cairo",
    },
  ).format(date);
}

function layout({
  locale,
  title,
  intro,
  body,
  actionLabel,
  actionUrl,
  footer,
}: {
  locale: EmailLocale;
  title: string;
  intro: string;
  body?: string;
  actionLabel?: string;
  actionUrl?: string;
  footer?: string;
}) {
  const rtl = locale === "ar";
  const direction = rtl ? "rtl" : "ltr";
  const align = rtl ? "right" : "left";
  return `<!doctype html>
<html lang="${locale}" dir="${direction}">
  <body style="margin:0;background:#f4f5f4;font-family:Arial,Tahoma,sans-serif;color:#161a18;direction:${direction};text-align:${align}">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f5f4;padding:32px 16px">
      <tr><td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border:1px solid #e0e3e1;border-radius:16px;overflow:hidden">
          <tr><td style="padding:24px 30px;border-bottom:1px solid #e8ebe9;font-size:22px;font-weight:700">Systemly</td></tr>
          <tr><td style="padding:34px 30px">
            <h1 style="margin:0 0 16px;font-size:26px;line-height:1.35">${escapeHtml(title)}</h1>
            <p style="margin:0 0 16px;font-size:16px;line-height:1.8">${escapeHtml(intro)}</p>
            ${body ? `<div style="margin:18px 0;font-size:15px;line-height:1.8;color:#404743">${body}</div>` : ""}
            ${actionLabel && actionUrl ? `<p style="margin:28px 0"><a href="${escapeHtml(actionUrl)}" style="display:inline-block;background:#151917;color:#ffffff;text-decoration:none;border-radius:10px;padding:13px 22px;font-weight:700">${escapeHtml(actionLabel)}</a></p>` : ""}
            ${footer ? `<p style="margin:24px 0 0;font-size:13px;line-height:1.7;color:#68706c">${escapeHtml(footer)}</p>` : ""}
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

export function verificationEmailContent(input: {
  locale: EmailLocale;
  name: string;
  verificationUrl: string;
}) {
  const { locale, name, verificationUrl } = input;
  if (locale === "ar") {
    return {
      subject: "فعّل بريدك الإلكتروني لبدء استخدام Systemly",
      html: layout({
        locale,
        title: `مرحبًا ${name || "بك"}`,
        intro: "فعّل بريدك الإلكتروني لإكمال إنشاء حسابك والبدء في إعداد نشاطك.",
        actionLabel: "تفعيل البريد الإلكتروني",
        actionUrl: verificationUrl,
        footer: "تنتهي صلاحية الرابط تلقائيًا. تجاهل هذه الرسالة إذا لم تنشئ هذا الحساب.",
      }),
    };
  }
  return {
    subject: "Verify your email to start using Systemly",
    html: layout({
      locale,
      title: `Welcome, ${name || "there"}`,
      intro: "Verify your email address to finish creating your account and start setting up your business.",
      actionLabel: "Verify email",
      actionUrl: verificationUrl,
      footer: "This link expires automatically. Ignore this email if you did not create the account.",
    }),
  };
}

export function welcomeEmailContent(input: {
  locale: EmailLocale;
  name: string;
  dashboardUrl: string;
}) {
  const { locale, name, dashboardUrl } = input;
  return locale === "ar"
    ? {
        subject: "حسابك في Systemly جاهز",
        html: layout({
          locale,
          title: `أهلًا ${name || "بك"}`,
          intro: "تم تفعيل حسابك. يمكنك الآن إعداد نشاطك أو فتح نظام الإدارة ومتابعة العمل.",
          actionLabel: "فتح Systemly",
          actionUrl: dashboardUrl,
        }),
      }
    : {
        subject: "Your Systemly account is ready",
        html: layout({
          locale,
          title: `Welcome, ${name || "there"}`,
          intro: "Your account is active. You can now set up your business or open Operations and continue working.",
          actionLabel: "Open Systemly",
          actionUrl: dashboardUrl,
        }),
      };
}

export function passwordResetEmailContent(input: {
  locale: EmailLocale;
  name: string;
  resetUrl: string;
}) {
  const { locale, name, resetUrl } = input;
  return locale === "ar"
    ? {
        subject: "إعادة تعيين كلمة مرور Systemly",
        html: layout({
          locale,
          title: `مرحبًا ${name || "بك"}`,
          intro: "وصلنا طلب لإعادة تعيين كلمة مرور حسابك.",
          actionLabel: "اختيار كلمة مرور جديدة",
          actionUrl: resetUrl,
          footer: "تجاهل الرسالة إذا لم تطلب إعادة تعيين كلمة المرور. لن تتغير كلمة المرور إلا بعد فتح الرابط.",
        }),
      }
    : {
        subject: "Reset your Systemly password",
        html: layout({
          locale,
          title: `Hello, ${name || "there"}`,
          intro: "We received a request to reset your account password.",
          actionLabel: "Choose a new password",
          actionUrl: resetUrl,
          footer: "Ignore this email if you did not request a password reset. Your password will not change until the link is opened.",
        }),
      };
}

export function appointmentConfirmationEmailContent(input: {
  locale: EmailLocale;
  name: string;
  businessName: string;
  serviceName: string;
  staffName?: string | null;
  startsAt: string | Date;
  cancelUrl?: string;
}) {
  const { locale, name, businessName, serviceName, staffName, startsAt, cancelUrl } = input;
  const rows = locale === "ar"
    ? [
        ["النشاط", businessName],
        ["الخدمة", serviceName],
        ["الموعد", formatDateTime(startsAt, locale)],
        ...(staffName ? [["الموظف", staffName]] : []),
      ]
    : [
        ["Business", businessName],
        ["Service", serviceName],
        ["Appointment", formatDateTime(startsAt, locale)],
        ...(staffName ? [["Staff", staffName]] : []),
      ];
  const body = rows
    .map(([label, value]) => `<p style="margin:6px 0"><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}</p>`)
    .join("");
  return locale === "ar"
    ? {
        subject: `تم تأكيد موعدك لدى ${businessName}`,
        html: layout({
          locale,
          title: `تم تأكيد موعدك يا ${name || "عميلنا"}`,
          intro: "تم تسجيل الموعد بنجاح. ستجد التفاصيل بالأسفل.",
          body,
          actionLabel: cancelUrl ? "إدارة الموعد" : undefined,
          actionUrl: cancelUrl,
          footer: "تواصل مع النشاط مباشرة إذا احتجت إلى تعديل الموعد.",
        }),
      }
    : {
        subject: `Your appointment at ${businessName} is confirmed`,
        html: layout({
          locale,
          title: `Your appointment is confirmed, ${name || "there"}`,
          intro: "The appointment was booked successfully. The details are below.",
          body,
          actionLabel: cancelUrl ? "Manage appointment" : undefined,
          actionUrl: cancelUrl,
          footer: "Contact the business directly if you need to change the appointment.",
        }),
      };
}

export function appointmentReminderEmailContent(input: {
  locale: EmailLocale;
  name: string;
  businessName: string;
  serviceName: string;
  staffName?: string | null;
  startsAt: string | Date;
  whenLabel?: string;
}) {
  const { locale, name, businessName, serviceName, staffName, startsAt, whenLabel } = input;
  const details = locale === "ar"
    ? `<p><strong>الخدمة:</strong> ${escapeHtml(serviceName)}</p><p><strong>الموعد:</strong> ${escapeHtml(formatDateTime(startsAt, locale))}</p>${staffName ? `<p><strong>الموظف:</strong> ${escapeHtml(staffName)}</p>` : ""}`
    : `<p><strong>Service:</strong> ${escapeHtml(serviceName)}</p><p><strong>Time:</strong> ${escapeHtml(formatDateTime(startsAt, locale))}</p>${staffName ? `<p><strong>Staff:</strong> ${escapeHtml(staffName)}</p>` : ""}`;
  return locale === "ar"
    ? {
        subject: `تذكير بموعدك لدى ${businessName}`,
        html: layout({
          locale,
          title: `تذكير بموعدك يا ${name || "عميلنا"}`,
          intro: whenLabel ? `موعدك ${whenLabel} لدى ${businessName}.` : `لديك موعد قريب لدى ${businessName}.`,
          body: details,
        }),
      }
    : {
        subject: `Reminder: appointment at ${businessName}`,
        html: layout({
          locale,
          title: `Appointment reminder, ${name || "there"}`,
          intro: whenLabel ? `Your appointment is ${whenLabel} at ${businessName}.` : `You have an upcoming appointment at ${businessName}.`,
          body: details,
        }),
      };
}

export function staffInviteEmailContent(input: {
  locale: EmailLocale;
  inviterName?: string;
  businessName: string;
  acceptUrl: string;
}) {
  const { locale, inviterName, businessName, acceptUrl } = input;
  return locale === "ar"
    ? {
        subject: `دعوة للانضمام إلى فريق ${businessName}`,
        html: layout({
          locale,
          title: `دعوة للانضمام إلى ${businessName}`,
          intro: `${inviterName || "مالك النشاط"} أرسل لك دعوة لاستخدام نظام إدارة العمل في Systemly.`,
          actionLabel: "قبول الدعوة",
          actionUrl: acceptUrl,
          footer: "استخدم نفس البريد الإلكتروني الذي وصلت إليه الدعوة عند تسجيل الدخول.",
        }),
      }
    : {
        subject: `Invitation to join ${businessName}`,
        html: layout({
          locale,
          title: `Join ${businessName}`,
          intro: `${inviterName || "The business owner"} invited you to use the Systemly Operations workspace.`,
          actionLabel: "Accept invitation",
          actionUrl: acceptUrl,
          footer: "Sign in using the same email address that received this invitation.",
        }),
      };
}

export function subscriptionEmailContent(input: {
  locale: EmailLocale;
  subtype: string;
  name?: string;
  businessName?: string;
  planName?: string;
  trialEnd?: string;
  daysLeft?: number;
  expiredAt?: string;
  periodEnd?: string;
}) {
  const { locale, subtype, name, businessName = "", planName = "", trialEnd, daysLeft, expiredAt, periodEnd } = input;
  const ar = locale === "ar";
  const variants: Record<string, { subject: string; title: string; intro: string }> = ar
    ? {
        trial_started: { subject: `بدأت تجربتك لخطة ${planName}`, title: "بدأت الفترة التجريبية", intro: `تم تفعيل خطة ${planName} لنشاط ${businessName}. تنتهي التجربة في ${trialEnd || "التاريخ المحدد في حسابك"}.` },
        trial_ending: { subject: `تنتهي تجربتك قريبًا — ${businessName}`, title: "الفترة التجريبية تقترب من الانتهاء", intro: `متبقي ${daysLeft ?? 0} يوم على انتهاء تجربة خطة ${planName}.` },
        trial_expired: { subject: `انتهت الفترة التجريبية — ${businessName}`, title: "انتهت الفترة التجريبية", intro: `انتهت تجربة خطة ${planName}${expiredAt ? ` في ${expiredAt}` : ""}.` },
        subscription_activated: { subject: `تم تفعيل الاشتراك — ${businessName}`, title: "اشتراكك نشط", intro: `تم تفعيل خطة ${planName}${periodEnd ? ` حتى ${periodEnd}` : ""}.` },
        subscription_payment_failed: { subject: `تعذر دفع الاشتراك — ${businessName}`, title: "تعذر إتمام الدفع", intro: `لم نتمكن من تحصيل قيمة خطة ${planName}. راجع وسيلة الدفع للحفاظ على استمرار الخدمة.` },
      }
    : {
        trial_started: { subject: `Your ${planName} trial has started`, title: "Your trial has started", intro: `${planName} is active for ${businessName}. The trial ends on ${trialEnd || "the date shown in your account"}.` },
        trial_ending: { subject: `Your trial is ending soon — ${businessName}`, title: "Your trial is ending soon", intro: `${daysLeft ?? 0} day(s) remain in the ${planName} trial.` },
        trial_expired: { subject: `Trial ended — ${businessName}`, title: "Your trial has ended", intro: `The ${planName} trial has ended${expiredAt ? ` on ${expiredAt}` : ""}.` },
        subscription_activated: { subject: `Subscription active — ${businessName}`, title: "Your subscription is active", intro: `${planName} is active${periodEnd ? ` until ${periodEnd}` : ""}.` },
        subscription_payment_failed: { subject: `Subscription payment failed — ${businessName}`, title: "Payment could not be completed", intro: `We could not collect payment for ${planName}. Review the payment method to keep the service active.` },
      };
  const variant = variants[subtype] ?? {
    subject: ar ? `تحديث الاشتراك — ${businessName}` : `Subscription update — ${businessName}`,
    title: ar ? "تحديث على اشتراكك" : "Subscription update",
    intro: ar ? "يوجد تحديث جديد على اشتراك نشاطك." : "There is a new update to your business subscription.",
  };
  return {
    subject: variant.subject,
    html: layout({
      locale,
      title: name ? `${variant.title}، ${name}` : variant.title,
      intro: variant.intro,
    }),
  };
}
