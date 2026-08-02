const RECEIPT_WIDTH = 226.77;
const RECEIPT_MARGIN = 18;
const CONTENT_WIDTH = RECEIPT_WIDTH - RECEIPT_MARGIN * 2;
const RECEIPT_LOCALE = "en-EG";

const RECEIPT_COPY = {
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
} as const;

function receiptHeight(invoice: any) {
  const itemLines = invoice.lineItems.reduce((total: number, item: any) => {
    const descriptionLines = Math.max(
      1,
      Math.ceil(String(item.description).length / 25),
    );
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

function formatMoney(cents: number, currency: string) {
  const normalizedCurrency = currency || "EGP";
  const amount = new Intl.NumberFormat(RECEIPT_LOCALE, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);

  return normalizedCurrency === "EGP"
    ? `EGP ${amount}`
    : `${amount} ${normalizedCurrency}`;
}

function formatDate(value: Date, timezone: string, withTime = false) {
  return new Intl.DateTimeFormat(RECEIPT_LOCALE, {
    timeZone: timezone || "Africa/Cairo",
    day: "numeric",
    month: "short",
    year: "numeric",
    ...(withTime
      ? { hour: "numeric", minute: "2-digit", hour12: true }
      : {}),
  }).format(value);
}

function paymentMethodLabel(method: unknown) {
  const value = String(method ?? "");
  const labels: Record<string, string> = {
    CASH: RECEIPT_COPY.cash,
    CARD: RECEIPT_COPY.card,
    BANK_TRANSFER: RECEIPT_COPY.bankTransfer,
    MOBILE_WALLET: RECEIPT_COPY.mobileWallet,
  };

  return (
    labels[value] ??
    (value ? value.replace(/_/g, " ") : RECEIPT_COPY.notRecorded)
  );
}

function row(
  doc: any,
  label: string,
  value: string,
  y: number,
  options: { bold?: boolean; size?: number } = {},
) {
  const labelWidth = 74;
  const valueWidth = CONTENT_WIDTH - labelWidth;
  const font = options.bold ? "Helvetica-Bold" : "Helvetica";

  doc.font(font).fontSize(options.size ?? 8.5).fillColor("#374151");
  doc.font("Helvetica-Bold").text(label, RECEIPT_MARGIN, y, {
    width: labelWidth,
    align: "left",
  });
  doc.font(font).text(value, RECEIPT_MARGIN + labelWidth, y, {
    width: valueWidth,
    align: "right",
  });

  return Math.max(doc.y, y + 13);
}

export function createReceiptDocument(invoice: any) {
  const PDFDocument = require("pdfkit");
  const doc = new PDFDocument({
    size: [RECEIPT_WIDTH, receiptHeight(invoice)],
    margin: RECEIPT_MARGIN,
    autoFirstPage: true,
    info: {
      Title: `${RECEIPT_COPY.title} ${invoice.invoiceNumber}`,
      Author: invoice.business.name,
    },
  });

  const timezone = invoice.business.timezone || "Africa/Cairo";
  const currency = invoice.currency || "EGP";
  let y = RECEIPT_MARGIN;

  doc
    .fillColor("#111827")
    .font("Helvetica-Bold")
    .fontSize(16)
    .text(invoice.business.name, RECEIPT_MARGIN, y, {
      width: CONTENT_WIDTH,
      align: "center",
    });
  y = doc.y + 5;

  doc.font("Helvetica").fontSize(8.5).fillColor("#4b5563");
  const businessAddress = [invoice.business.address, invoice.business.city]
    .filter(Boolean)
    .join(", ");
  if (businessAddress) {
    doc.text(businessAddress, RECEIPT_MARGIN, y, {
      width: CONTENT_WIDTH,
      align: "center",
    });
    y = doc.y + 2;
  }
  if (invoice.business.phone) {
    doc.text(
      `${RECEIPT_COPY.telephone}: ${invoice.business.phone}`,
      RECEIPT_MARGIN,
      y,
      {
        width: CONTENT_WIDTH,
        align: "center",
      },
    );
    y = doc.y + 8;
  } else {
    y += 6;
  }

  separator(doc, y);
  y += 11;
  doc
    .font("Helvetica-Bold")
    .fontSize(13)
    .fillColor("#111827")
    .text(RECEIPT_COPY.title, RECEIPT_MARGIN, y, {
      width: CONTENT_WIDTH,
      align: "center",
      characterSpacing: 1.1,
    });
  y = doc.y + 10;
  separator(doc, y);
  y += 10;

  y = row(doc, RECEIPT_COPY.receipt, invoice.invoiceNumber, y);
  y = row(
    doc,
    RECEIPT_COPY.issued,
    formatDate(new Date(invoice.issuedAt), timezone, true),
    y + 3,
  );
  if (invoice.paidAt) {
    y = row(
      doc,
      RECEIPT_COPY.paid,
      formatDate(new Date(invoice.paidAt), timezone, true),
      y + 3,
    );
  }
  y = row(doc, RECEIPT_COPY.customer, invoice.customer.name, y + 3);
  if (invoice.customer.phone) {
    y = row(doc, RECEIPT_COPY.phone, invoice.customer.phone, y + 3);
  }

  y += 7;
  separator(doc, y);
  y += 10;
  doc
    .font("Helvetica-Bold")
    .fontSize(9)
    .fillColor("#111827")
    .text(RECEIPT_COPY.items, RECEIPT_MARGIN, y, {
      width: CONTENT_WIDTH,
      align: "left",
    });
  y = doc.y + 8;

  for (const item of invoice.lineItems) {
    const itemTotal =
      item.totalCents ?? item.unitPriceCents * item.quantity;
    doc.font("Helvetica").fontSize(8.5).fillColor("#111827");
    doc.text(item.description, RECEIPT_MARGIN, y, {
      width: CONTENT_WIDTH - 66,
      align: "left",
    });
    const descriptionBottom = doc.y;
    doc
      .font("Helvetica-Bold")
      .text(
        formatMoney(itemTotal, currency),
        RECEIPT_WIDTH - RECEIPT_MARGIN - 64,
        y,
        {
          width: 64,
          align: "right",
        },
      );
    y = Math.max(descriptionBottom, doc.y) + 2;
    doc
      .font("Helvetica")
      .fontSize(7.5)
      .fillColor("#6b7280")
      .text(
        `${RECEIPT_COPY.qty}: ${item.quantity} × ${formatMoney(
          item.unitPriceCents,
          currency,
        )}`,
        RECEIPT_MARGIN,
        y,
        { width: CONTENT_WIDTH, align: "left" },
      );
    y = doc.y + 6;
  }

  separator(doc, y);
  y += 10;
  y = row(
    doc,
    RECEIPT_COPY.subtotal,
    formatMoney(invoice.subtotalCents, currency),
    y,
  );
  if (invoice.discountCents > 0) {
    y = row(
      doc,
      RECEIPT_COPY.discount,
      `-${formatMoney(invoice.discountCents, currency)}`,
      y + 3,
    );
  }
  if (invoice.taxCents > 0) {
    y = row(
      doc,
      RECEIPT_COPY.tax,
      formatMoney(invoice.taxCents, currency),
      y + 3,
    );
  }
  y += 5;
  doc
    .save()
    .rect(RECEIPT_MARGIN, y, CONTENT_WIDTH, 30)
    .fill("#111827")
    .restore();
  doc.font("Helvetica-Bold").fontSize(10).fillColor("#ffffff");
  doc.text(RECEIPT_COPY.total, RECEIPT_MARGIN + 8, y + 9, {
    width: CONTENT_WIDTH / 2 - 8,
    align: "left",
  });
  doc.text(
    formatMoney(invoice.totalCents, currency),
    RECEIPT_MARGIN + CONTENT_WIDTH / 2,
    y + 9,
    {
      width: CONTENT_WIDTH / 2 - 8,
      align: "right",
    },
  );
  y += 42;

  y = row(
    doc,
    RECEIPT_COPY.paymentMethod,
    paymentMethodLabel(invoice.paymentMethod),
    y,
  );
  if (invoice.paymentReference) {
    y = row(
      doc,
      RECEIPT_COPY.paymentReference,
      invoice.paymentReference,
      y + 3,
    );
  }
  if (invoice.paidBy?.name) {
    y = row(doc, RECEIPT_COPY.cashier, invoice.paidBy.name, y + 3);
  }
  if (invoice.notes) {
    y += 8;
    doc
      .font("Helvetica-Bold")
      .fontSize(8.5)
      .fillColor("#374151")
      .text(RECEIPT_COPY.notes, RECEIPT_MARGIN, y, {
        width: CONTENT_WIDTH,
        align: "left",
      });
    y = doc.y + 3;
    doc
      .font("Helvetica")
      .fontSize(8)
      .fillColor("#4b5563")
      .text(invoice.notes, RECEIPT_MARGIN, y, {
        width: CONTENT_WIDTH,
        align: "left",
      });
    y = doc.y + 8;
  }

  separator(doc, y);
  y += 12;
  doc
    .font("Helvetica-Bold")
    .fontSize(10)
    .fillColor("#111827")
    .text(RECEIPT_COPY.thanks, RECEIPT_MARGIN, y, {
      width: CONTENT_WIDTH,
      align: "center",
    });
  y = doc.y + 4;
  doc
    .font("Helvetica")
    .fontSize(8)
    .fillColor("#6b7280")
    .text(RECEIPT_COPY.return, RECEIPT_MARGIN, y, {
      width: CONTENT_WIDTH,
      align: "center",
    });

  return doc;
}
