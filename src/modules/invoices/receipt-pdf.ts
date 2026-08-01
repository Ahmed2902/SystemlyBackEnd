import path from "node:path";

export type ReceiptLocale = "en" | "ar";

const RECEIPT_WIDTH = 226.77;
const RECEIPT_MARGIN = 18;
const CONTENT_WIDTH = RECEIPT_WIDTH - RECEIPT_MARGIN * 2;

const copy = {
  en: {
    title: "PAYMENT RECEIPT",
    receipt: "Receipt",
    issued: "Issued",
    paid: "Paid",
    customer: "Customer",
    phone: "Phone",
    items: "ITEMS",
    qty: "Qty",
    subtotal: "Subtotal",
    discount: "Discount",
    tax: "Tax",
    total: "TOTAL",
    paymentMethod: "Payment method",
    paymentReference: "Payment reference",
    cashier: "Cashier",
    notes: "Notes",
    thanks: "Thank you",
    return: "We look forward to serving you again.",
    notRecorded: "Not recorded",
    cash: "Cash",
    card: "Card",
    bankTransfer: "Bank transfer",
    mobileWallet: "Mobile wallet",
    telephone: "Tel.",
  },
  ar: {
    title: "إيصال دفع",
    receipt: "رقم الإيصال",
    issued: "تاريخ الإصدار",
    paid: "تاريخ الدفع",
    customer: "العميل",
    phone: "الهاتف",
    items: "البنود",
    qty: "الكمية",
    subtotal: "المجموع قبل الخصم",
    discount: "الخصم",
    tax: "الضريبة",
    total: "الإجمالي",
    paymentMethod: "طريقة الدفع",
    paymentReference: "مرجع الدفع",
    cashier: "الموظف",
    notes: "ملاحظات",
    thanks: "شكرًا لك",
    return: "نتطلع لخدمتك مرة أخرى.",
    notRecorded: "غير مسجل",
    cash: "نقدي",
    card: "بطاقة",
    bankTransfer: "تحويل بنكي",
    mobileWallet: "محفظة إلكترونية",
    telephone: "هاتف",
  },
} as const;

function receiptHeight(invoice: any) {
  const itemLines = invoice.lineItems.reduce((total: number, item: any) => {
    const descriptionLines = Math.max(1, Math.ceil(String(item.description).length / 25));
    return total + descriptionLines;
  }, 0);
  const optionalRows =
    Number(invoice.discountCents > 0) +
    Number(invoice.taxCents > 0) +
    Number(Boolean(invoice.paymentReference)) +
    Number(Boolean(invoice.notes));
  return Math.max(500, 395 + itemLines * 19 + optionalRows * 21);
}

function separator(doc: any, y: number) {
  doc
    .save()
    .lineWidth(0.7)
    .dash(2, { space: 3 })
    .strokeColor("#374151")
    .moveTo(RECEIPT_MARGIN, y)
    .lineTo(RECEIPT_WIDTH - RECEIPT_MARGIN, y)
    .stroke()
    .undash()
    .restore();
}

function localeTag(locale: ReceiptLocale) {
  return locale === "ar" ? "ar-EG-u-nu-latn" : "en-EG";
}

function formatMoney(cents: number, currency: string, locale: ReceiptLocale) {
  const amount = new Intl.NumberFormat(localeTag(locale), {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
  if ((currency || "EGP") === "EGP") {
    return locale === "ar" ? `${amount} ج.م.` : `EGP ${amount}`;
  }
  return `${amount} ${currency}`;
}

function formatDate(value: Date, timezone: string, locale: ReceiptLocale, withTime = false) {
  return new Intl.DateTimeFormat(localeTag(locale), {
    timeZone: timezone || "Africa/Cairo",
    day: "numeric",
    month: "short",
    year: "numeric",
    ...(withTime ? { hour: "numeric", minute: "2-digit", hour12: true } : {}),
  }).format(value);
}

function paymentMethodLabel(method: unknown, locale: ReceiptLocale) {
  const labels = copy[locale];
  const value = String(method ?? "");
  const map: Record<string, string> = {
    CASH: labels.cash,
    CARD: labels.card,
    BANK_TRANSFER: labels.bankTransfer,
    MOBILE_WALLET: labels.mobileWallet,
  };
  return map[value] ?? (value ? value.replace(/_/g, " ") : labels.notRecorded);
}

function resolveFont(weight: 400 | 700) {
  const filename = `noto-sans-arabic-arabic-${weight}-normal.woff2`;
  return require.resolve(
    path.posix.join("@fontsource/noto-sans-arabic/files", filename),
  );
}

function row(
  doc: any,
  label: string,
  value: string,
  y: number,
  locale: ReceiptLocale,
  options: { bold?: boolean; size?: number } = {},
) {
  const rtl = locale === "ar";
  const labelWidth = 74;
  const valueWidth = CONTENT_WIDTH - labelWidth;
  const font = options.bold ? "ReceiptBold" : "ReceiptRegular";
  doc.font(font).fontSize(options.size ?? 8.5).fillColor("#374151");
  if (rtl) {
    doc.text(value, RECEIPT_MARGIN, y, { width: valueWidth, align: "right" });
    doc.font("ReceiptBold").text(label, RECEIPT_MARGIN + valueWidth, y, {
      width: labelWidth,
      align: "right",
    });
  } else {
    doc.font("ReceiptBold").text(label, RECEIPT_MARGIN, y, {
      width: labelWidth,
      align: "left",
    });
    doc.font(font).text(value, RECEIPT_MARGIN + labelWidth, y, {
      width: valueWidth,
      align: "right",
    });
  }
  return Math.max(doc.y, y + 13);
}

export function createReceiptDocument(invoice: any, locale: ReceiptLocale) {
  const PDFDocument = require("pdfkit");
  const labels = copy[locale];
  const rtl = locale === "ar";
  const doc = new PDFDocument({
    size: [RECEIPT_WIDTH, receiptHeight(invoice)],
    margin: RECEIPT_MARGIN,
    autoFirstPage: true,
    info: {
      Title: `${labels.title} ${invoice.invoiceNumber}`,
      Author: invoice.business.name,
    },
  });

  doc.registerFont("ReceiptRegular", resolveFont(400));
  doc.registerFont("ReceiptBold", resolveFont(700));

  const timezone = invoice.business.timezone || "Africa/Cairo";
  const currency = invoice.currency || "EGP";
  let y = RECEIPT_MARGIN;

  doc
    .fillColor("#111827")
    .font("ReceiptBold")
    .fontSize(16)
    .text(invoice.business.name, RECEIPT_MARGIN, y, {
      width: CONTENT_WIDTH,
      align: "center",
    });
  y = doc.y + 5;

  doc.font("ReceiptRegular").fontSize(8.5).fillColor("#4b5563");
  const businessAddress = [invoice.business.address, invoice.business.city]
    .filter(Boolean)
    .join(locale === "ar" ? "، " : ", ");
  if (businessAddress) {
    doc.text(businessAddress, RECEIPT_MARGIN, y, {
      width: CONTENT_WIDTH,
      align: "center",
    });
    y = doc.y + 2;
  }
  if (invoice.business.phone) {
    doc.text(`${labels.telephone}: ${invoice.business.phone}`, RECEIPT_MARGIN, y, {
      width: CONTENT_WIDTH,
      align: "center",
    });
    y = doc.y + 8;
  } else {
    y += 6;
  }

  separator(doc, y);
  y += 11;
  doc
    .font("ReceiptBold")
    .fontSize(13)
    .fillColor("#111827")
    .text(labels.title, RECEIPT_MARGIN, y, {
      width: CONTENT_WIDTH,
      align: "center",
      characterSpacing: rtl ? 0 : 1.1,
    });
  y = doc.y + 10;
  separator(doc, y);
  y += 10;

  y = row(doc, labels.receipt, invoice.invoiceNumber, y, locale);
  y = row(doc, labels.issued, formatDate(new Date(invoice.issuedAt), timezone, locale, true), y + 3, locale);
  if (invoice.paidAt) {
    y = row(doc, labels.paid, formatDate(new Date(invoice.paidAt), timezone, locale, true), y + 3, locale);
  }
  y = row(doc, labels.customer, invoice.customer.name, y + 3, locale);
  if (invoice.customer.phone) {
    y = row(doc, labels.phone, invoice.customer.phone, y + 3, locale);
  }

  y += 7;
  separator(doc, y);
  y += 10;
  doc.font("ReceiptBold").fontSize(9).fillColor("#111827").text(labels.items, RECEIPT_MARGIN, y, {
    width: CONTENT_WIDTH,
    align: rtl ? "right" : "left",
  });
  y = doc.y + 8;

  for (const item of invoice.lineItems) {
    const itemTotal = item.totalCents ?? item.unitPriceCents * item.quantity;
    doc.font("ReceiptRegular").fontSize(8.5).fillColor("#111827");
    doc.text(item.description, RECEIPT_MARGIN, y, {
      width: CONTENT_WIDTH - 66,
      align: rtl ? "right" : "left",
    });
    const descriptionBottom = doc.y;
    doc.font("ReceiptBold").text(formatMoney(itemTotal, currency, locale), RECEIPT_WIDTH - RECEIPT_MARGIN - 64, y, {
      width: 64,
      align: "right",
    });
    y = Math.max(descriptionBottom, doc.y) + 2;
    doc.font("ReceiptRegular").fontSize(7.5).fillColor("#6b7280").text(
      `${labels.qty}: ${item.quantity} × ${formatMoney(item.unitPriceCents, currency, locale)}`,
      RECEIPT_MARGIN,
      y,
      { width: CONTENT_WIDTH, align: rtl ? "right" : "left" },
    );
    y = doc.y + 6;
  }

  separator(doc, y);
  y += 10;
  y = row(doc, labels.subtotal, formatMoney(invoice.subtotalCents, currency, locale), y, locale);
  if (invoice.discountCents > 0) {
    y = row(doc, labels.discount, `-${formatMoney(invoice.discountCents, currency, locale)}`, y + 3, locale);
  }
  if (invoice.taxCents > 0) {
    y = row(doc, labels.tax, formatMoney(invoice.taxCents, currency, locale), y + 3, locale);
  }
  y += 5;
  doc
    .save()
    .rect(RECEIPT_MARGIN, y, CONTENT_WIDTH, 30)
    .fill("#111827")
    .restore();
  doc.font("ReceiptBold").fontSize(10).fillColor("#ffffff");
  doc.text(labels.total, RECEIPT_MARGIN + 8, y + 9, {
    width: CONTENT_WIDTH / 2 - 8,
    align: rtl ? "right" : "left",
  });
  doc.text(formatMoney(invoice.totalCents, currency, locale), RECEIPT_MARGIN + CONTENT_WIDTH / 2, y + 9, {
    width: CONTENT_WIDTH / 2 - 8,
    align: "right",
  });
  y += 42;

  y = row(doc, labels.paymentMethod, paymentMethodLabel(invoice.paymentMethod, locale), y, locale);
  if (invoice.paymentReference) {
    y = row(doc, labels.paymentReference, invoice.paymentReference, y + 3, locale);
  }
  if (invoice.paidBy?.name) {
    y = row(doc, labels.cashier, invoice.paidBy.name, y + 3, locale);
  }
  if (invoice.notes) {
    y += 8;
    doc.font("ReceiptBold").fontSize(8.5).fillColor("#374151").text(labels.notes, RECEIPT_MARGIN, y, {
      width: CONTENT_WIDTH,
      align: rtl ? "right" : "left",
    });
    y = doc.y + 3;
    doc.font("ReceiptRegular").fontSize(8).fillColor("#4b5563").text(invoice.notes, RECEIPT_MARGIN, y, {
      width: CONTENT_WIDTH,
      align: rtl ? "right" : "left",
    });
    y = doc.y + 8;
  }

  separator(doc, y);
  y += 12;
  doc.font("ReceiptBold").fontSize(10).fillColor("#111827").text(labels.thanks, RECEIPT_MARGIN, y, {
    width: CONTENT_WIDTH,
    align: "center",
  });
  y = doc.y + 4;
  doc.font("ReceiptRegular").fontSize(8).fillColor("#6b7280").text(labels.return, RECEIPT_MARGIN, y, {
    width: CONTENT_WIDTH,
    align: "center",
  });

  return doc;
}
